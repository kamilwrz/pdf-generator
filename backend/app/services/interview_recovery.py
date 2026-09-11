"""Assemble usable interview previews without applying rejected model claims."""
from collections import Counter
import re

from fastapi import HTTPException
from app.services import interview_service as service
from app.services.cv_data import CvDataValidationError


def _value_at(data, path):
    for part in path.strip('/').split('/'):
        if isinstance(data, dict):
            data = data.get(part)
        elif isinstance(data, list) and part.isdigit() and int(part) < len(data):
            data = data[int(part)]
        else:
            return None
    return data


def _dependent_scope(path):
    """Rejected record identity invalidates its generated dependent content."""
    for pattern in (
        r"^(/(?:experience|education)/\d+)/(?:title|company|city|period|degree|school)$",
        r"^(/custom_sections/\d+/items/\d+)/(?:title|subtitle|date)$",
        r"^(/custom_sections/\d+)/(?:title|kind|placement)$",
        r"^(/skills/\d+)/category$",
    ):
        match = re.match(pattern, path)
        if match:
            return match.group(1)
    return path


def assemble_reviewed_draft(raw, verification, profile, language):
    """Keep verified changes, restore original facts and omit unsupported adds.

    Semantic rejection is a property of a proposed change, not a reason to
    discard the candidate's whole interview. Deterministic checks still apply
    to every retained field and the combined document. Structural conflicts
    fall back to current confirmed content, never to old session snapshots.
    Returns normalized CV data, applied changes and content-free review notes.
    """
    fields = raw["fields"]
    base = service.base_cv(profile)
    paths = [field["path"] for field in fields]
    counts = Counter(paths)
    blocked = {path for path, count in counts.items() if count > 1}
    # Only additions may be omitted as duplicates. A model cannot use this
    # classification to delete an existing authored field or a whole record.
    duplicates = set(verification.get('duplicate_paths', []))
    for index, field in enumerate(fields):
        path = field['path']
        if _value_at(base, path) is not None or not re.search(r'/bullets/\d+$', path):
            continue
        parent = path.rsplit('/', 1)[0]
        siblings = _value_at(base, parent) or []
        def key(text):
            return ' '.join(str(text).casefold().split()).rstrip('.!')
        earlier = [f['value'] for f in fields[:index] if f['path'].rsplit('/', 1)[0] == parent]
        if path in duplicates or any(key(field['value']) == key(text) for text in [*siblings, *earlier]):
            blocked.add(path)
    for rejected in verification["unsupported_paths"]:
        rejected = rejected.strip().rstrip('/')
        matching = [path for path in paths if rejected and (path == rejected or path.startswith(rejected + '/'))]
        # A malformed verifier locator is not permission to apply unchecked
        # claims. Retain the confirmed base when the rejection is unlocatable.
        blocked.update(matching if matching else paths)
    errors = (HTTPException, CvDataValidationError, TypeError, AttributeError, IndexError)
    for field in fields:
        if field["path"] not in blocked:
            try:
                service.assemble_draft({"fields": [field]}, profile, language)
            except errors:
                blocked.add(field["path"])
    scopes = {_dependent_scope(path) for path in blocked}
    blocked.update(path for path in paths if any(path == scope or path.startswith(scope + '/') for scope in scopes))
    accepted = [field for field in fields if field["path"] not in blocked]
    try:
        cv_data, changes = service.assemble_draft({"fields": accepted}, profile, language)
    except errors:
        # Two individually valid changes can still conflict structurally.
        # Falling back to the complete confirmed base preserves user facts.
        blocked.update(paths)
        cv_data, changes = service.assemble_draft({"fields": []}, profile, language)
    notes = [{
        "path": path if service.PATH.fullmatch(path) else "",
        "action": "kept_original" if _value_at(base, path) is not None else "omitted_suggestion",
    } for path in dict.fromkeys(paths) if path in blocked]
    return cv_data, changes, notes
