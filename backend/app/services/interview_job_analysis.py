"""Reuse owned, settled job analyses as question topics, never as career evidence."""
import hashlib
import json
from copy import deepcopy

from fastapi import HTTPException
from app.core.localisation import ui_language
from app.models.models import AiCreditReservation
from app.services.cv_data import normalize_cv_data


def analysis_signature(cv_data, notes, url, description):
    """Bind cached analysis to exact candidate content and explicit offer input."""
    payload = [normalize_cv_data(cv_data), notes.strip(), url.strip(), description.strip()]
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def load_owned_analysis(db, owner_id, key, cv_data, notes, url, description):
    """Read a completed owner-scoped receipt; reject missing or stale analysis.

    The client sends only the operation key. Requirements and resolved offer
    text come from the server's settled response, not client-authored evidence.
    No provider request or second credit charge occurs here.
    """
    row = db.query(AiCreditReservation).filter_by(user_id=owner_id, idempotency_key=key,
                                                action='position_rating', status='settled').first()
    data = (row.response_json or {}).get('_interview_analysis') if row else None
    if not data or data.get('signature') != analysis_signature(cv_data, notes, url, description):
        message = ('This analysis is no longer available for this CV and job. Run the analysis again.'
                   if ui_language.get() == 'en' else 'Ta analiza nie jest już dostępna dla tego CV i oferty. Przeanalizuj ofertę ponownie.')
        raise HTTPException(status_code=409, detail={'code': 'job_analysis_stale', 'message': message})
    return deepcopy(data)


def _compact(value):
    return ' '.join(str(value or '').split())


def _source_snapshots(refs, evidence_catalog, candidate_notes):
    """Retain source provenance from a settled receipt, never its analysis prose."""
    from app.services.job_tailoring import build_evidence_catalog

    note_fragments = build_evidence_catalog([], candidate_notes) if candidate_notes else {}
    snapshots, seen = [], set()
    for ref in refs:
        content = evidence_catalog.get(ref)
        if not isinstance(content, str) or not _compact(content):
            continue
        if ref.startswith('cv:/'):
            path, text = ref.removeprefix('cv:'), _compact(content)
        elif ref.startswith('note:') and note_fragments.get(ref) == content:
            # A note fragment can omit qualifiers in adjacent sentences. Bind
            # the complete authored note so question context retains them all.
            path, text = '', _compact(candidate_notes)
        else:
            # Canvas IDs carry no canonical role/path identity. Identical text
            # in another role is not a safe way to recover that provenance.
            continue
        key = (path, text)
        if key not in seen:
            seen.add(key)
            snapshots.append({'path': path, 'text': text})
    return snapshots


def requirement_topics(requirements, *, evidence_catalog=None, candidate_notes='',
                       priorities=(), evidence_gaps=()):
    """Create stable, ranked interview topics without promoting analysis to facts.

    Optional metadata comes only from the owned, input-bound analysis receipt.
    Canonical CV paths and complete note snapshots retain source provenance for
    later matching against the currently selected, confirmed profile. Historical
    receipts without this metadata remain readable. Missing means unknown, not
    confirmed lack of experience; existing answers retain their stable topic IDs.

    Priority and gap descriptions are question-planning hypotheses, never evidence.
    This function has no database writes, provider calls or changes to career facts.
    """
    catalog = evidence_catalog if isinstance(evidence_catalog, dict) else {}
    details = {}
    for item in [*priorities, *evidence_gaps]:
        if not isinstance(item, dict):
            continue
        requirement_id = _compact(item.get('requirement_id'))
        detail = _compact(item.get('description')) or _compact(item.get('title'))
        if requirement_id and detail:
            values = details.setdefault(requirement_id, [])
            if detail.casefold() not in {value.casefold() for value in values}:
                values.append(detail[:1000])
    result, seen = [], set()
    for item in requirements[:20]:
        if not isinstance(item, dict):
            continue
        text = _compact(item.get('text'))[:1000]
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        status = item.get('match_status', item.get('status', 'unknown'))
        status = status if status in {'matched', 'partial', 'unknown', 'gap'} else 'unknown'
        kind = item.get('kind', 'required')
        kind = kind if kind in {'required', 'preferred', 'responsibility'} else 'required'
        try:
            weight = max(1, min(3, int(item.get('weight', 3))))
        except (ValueError, TypeError):
            weight = 3
        refs = list(dict.fromkeys(ref for ref in item.get('evidence_refs', []) if isinstance(ref, str)))
        missing_detail = _compact(item.get('missing_detail'))
        if not missing_detail:
            missing_detail = ' '.join(details.get(_compact(item.get('id')), []))
        result.append({'id': 'requirement:' + hashlib.sha256(key.encode()).hexdigest()[:24],
                       'text': text, 'status': status, 'kind': kind, 'weight': weight,
                       'missing_detail': '' if status == 'matched' else missing_detail[:2000],
                       'evidence_refs': refs,
                       'source_evidence': _source_snapshots(refs, catalog, candidate_notes)})
    # Selection importance owns ordering: a central duty can matter more than
    # a peripheral explicit requirement. Kind breaks equal-weight ties; stable
    # sorting preserves offer order and legacy ordering when metadata is absent.
    return sorted(result, key=lambda item: (-item['weight'], item['kind'] != 'required'))


def requirement_facts(item, profile):
    """Resolve requirement context solely to current confirmed selected-store facts.

    Direct career-profile IDs remain supported. Assistant IDs are rebound only
    when a stored source snapshot has exactly the same path and complete text;
    text is whitespace-normalized but never fuzzy-matched or negation-stripped.
    Ambiguous duplicate sources, stale snapshots and canvas-only citations stay
    unbound. Returned values are actual profile facts, never generated analysis.
    """
    allowed_kind = 'gap' if item.get('status') == 'gap' else 'fact'
    candidates = [fact for fact in profile.get('facts', []) if fact.get('kind', 'fact') == allowed_kind]
    by_id = {fact['id']: fact for fact in candidates}
    resolved, seen = [], set()

    def include(fact):
        if fact['id'] not in seen:
            seen.add(fact['id'])
            resolved.append(fact)

    for ref in item.get('evidence_refs', []):
        # Assistant namespaces must pass snapshot validation even if a manually
        # named career fact happens to reuse the same identifier.
        if ref in by_id and not ref.startswith(('cv:', 'canvas:', 'note:')):
            include(by_id[ref])
    for snapshot in item.get('source_evidence', []):
        if not isinstance(snapshot, dict) or not _compact(snapshot.get('text')):
            continue
        matches = [fact for fact in candidates
                   if fact.get('path', '') == snapshot.get('path')
                   and _compact(fact.get('text')) == _compact(snapshot['text'])]
        if len(matches) == 1:
            include(matches[0])
    return resolved
