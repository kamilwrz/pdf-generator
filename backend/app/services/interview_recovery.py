"""Recover usable interview previews without applying rejected model claims."""
from collections import Counter
import re

from fastapi import HTTPException
from pydantic import ValidationError

from app.models.models import AiCreditReservation
from app.schemas.interview_schema import Draft, Verification
from app.services import interview_service as service
from app.services.cv_data import CvDataValidationError


def previous_rejected_result(db, row, profile_revision):
    """Reuse the immediately preceding paid attempt for an unchanged profile.

    Older releases discarded the draft from session state but retained both
    settled provider responses. Session/profile revisions and owner-scoped
    keys bind this recovery to that exact attempt. An edited source/profile,
    missing response or unrelated operation cannot reuse an old draft.
    """
    if row.state.get("phase") != "review" or not row.state.get("generation_feedback") or row.state.get("preview"):
        return None
    responses = []
    for operation, schema in (("preview", Draft), ("verify", Verification)):
        key = f"interview:{row.id}:{row.revision - 1}:{profile_revision}:{operation}"
        reservation = db.query(AiCreditReservation).filter_by(
            user_id=row.owner_id, idempotency_key=key, status="settled",
        ).first()
        payload = reservation.response_json if reservation else None
        if not isinstance(payload, dict):
            return None
        try:
            output = schema.model_validate(payload.get("output")).model_dump()
        except ValidationError:
            return None
        responses.append({"output": output, "usage": payload.get("usage") or {}})
    return tuple(responses)


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
