"""Resolve authoritative CV fields and preserve separately editable career notes.

Source changes use the profile's existing compare-and-swap revision. Reads may
synchronise a previously chosen source, invalidating stale interview previews
without touching the CV, imports, isolated sessions or paid AI providers.
"""
from app.core.localisation import message
from app.crud.cv_import_snapshots import get_owned_snapshot
from app.models.models import Pdf
from app.services.cv_data import normalize_cv_data, CvDataValidationError
from pydantic import ValidationError
from app.services.interview_sources import has_interview_source


def is_supplemental_fact(fact):
    """Identify authored answers, notes and legacy explicit meaning overrides."""
    return bool(fact.get('question') or fact.get('kind', 'fact') != 'fact' or
                fact.get('source', 'manual') == 'manual' or
                (not fact['id'].startswith('src-') and
                 not fact.get('source', '').startswith(('document:', 'import:'))))


def supplemental_facts(facts):
    """Retain notes/answers and detach legacy field bindings from CV array indices.

    IDs, prompts, kinds and context survive. Source snapshots have src- IDs;
    legacy manual fields and explicit gap/framing overrides become notes rather
    than being deleted or attached to a different source's role at the same path.
    """
    return [{**fact, 'path': ''} for fact in facts if is_supplemental_fact(fact)]


def resolve_source(db, owner_id, binding, *, required=False):
    """Read an eligible owned source; foreign/deleted/failed sources are absent."""
    from app.services import interview_service as service
    if binding["kind"] == "document":
        row = db.query(Pdf).filter_by(id=binding["id"], owner_id=owner_id).first()
    else:
        row = get_owned_snapshot(db, owner_id=owner_id, snapshot_id=binding["id"])
        if row and row.status != "succeeded":
            row = None
    if not row or not has_interview_source(row.cv_data):
        if required:
            service.fail(message('interview_source_required'), 422)
        return [], False
    try:
        facts = service.source_facts(normalize_cv_data(row.cv_data), f"{binding['kind']}:{binding['id']}")
        if len(facts) <= 500:
            return service.validate_facts(facts), True
    except (CvDataValidationError, ValidationError):
        # Imported/legacy source content may exceed the bounded fact contract.
        # Do not expose validator payloads containing personal data in errors.
        pass
    if required:
        service.fail(message('the_profile_contains_too_much_information_or_duplicate'), 422)
    return [], False


def synchronise_source(db, owner_id, profile, binding, *, required=False):
    """Replace the source snapshot atomically, retaining notes and their semantics.

    Never choose another CV when the saved source disappears. A missing source
    removes its derived facts, retains the binding for a truthful unavailable state,
    and leaves all notes deletable. An unchanged read does not advance the revision.
    """
    from app.services import interview_service as service
    source_facts, available = resolve_source(db, owner_id, binding, required=required)
    notes = supplemental_facts(profile['facts'])
    if len(source_facts) + len(notes) > 500:
        if required:
            service.fail(message('the_profile_contains_too_much_information_or_duplicate'), 422)
        source_facts, available = [], False
    note_ids = {fact['id'] for fact in notes}
    for fact in source_facts:
        # A clarification can retain the ID of the original source field.
        # Keep that answer identity and allocate a distinct stable snapshot ID.
        attempt = 0
        original_id = fact['id']
        while fact['id'] in note_ids:
            attempt += 1
            fact['id'] = f"src-{service.digest([original_id, attempt])[:24]}"
    facts = service.validate_facts(source_facts + notes)
    if facts != profile['facts'] or binding != profile.get('source_binding'):
        profile = service.put_profile(db, owner_id, profile['revision'], facts, source_binding=binding)
    return {**profile, 'source_binding': binding, 'source_available': available}
