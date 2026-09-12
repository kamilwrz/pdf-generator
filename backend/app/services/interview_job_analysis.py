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


def requirement_topics(requirements):
    """Give equivalent requirements stable IDs; analysis is context, never proof.

    Frozen IDs survive retries, renamed model topics and source refresh. Missing
    means no information, not confirmed lack of experience. Existing answers
    close only their own requirement; matched items never receive questions.
    """
    result, seen = [], set()
    for item in requirements[:20]:
        text = ' '.join(str(item.get('text') or '').split())[:1000]
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        status = item.get('match_status', item.get('status', 'unknown'))
        result.append({'id': 'requirement:' + hashlib.sha256(key.encode()).hexdigest()[:24],
                       'text': text, 'status': 'unknown' if status == 'missing' else status,
                       'evidence_refs': item.get('evidence_refs', [])})
    return result
