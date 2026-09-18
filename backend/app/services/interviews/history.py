"""Small, owner-scoped history summaries built from saved data without AI calls."""
from datetime import timezone

from app.models.models import CvImportSnapshot, Pdf


def _text(value, limit=180):
    text = ' '.join(value.split()) if isinstance(value, str) else ''
    return text if len(text) <= limit else text[:limit - 1].rstrip() + '…'


def _timestamp(value):
    # Database timestamps are naive UTC. Include the offset so browsers do not
    # interpret the same activity as different instants in their local timezone.
    return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()


def interview_summaries(db, owner_id, rows):
    """Describe a page of owned sessions, including legacy and deleted sources.

    Only titles of related documents/imports are batch-loaded, with ownership
    checked independently of IDs in historical JSON. Source snapshots provide
    context when the original disappears. No history, evidence or database state
    is changed; offer excerpts remain quoted source data, never inferred titles.
    """
    document_ids = {row.state.get(key) for row in rows for key in ('source_document_id', 'document_id')} - {None}
    import_ids = {row.state.get('source_import_id') for row in rows} - {None}
    documents = dict(db.query(Pdf.id, Pdf.title).filter(Pdf.owner_id == owner_id, Pdf.id.in_(document_ids)).all()) if document_ids else {}
    imports = dict(db.query(CvImportSnapshot.id, CvImportSnapshot.source_filename).filter(
        CvImportSnapshot.owner_id == owner_id, CvImportSnapshot.id.in_(import_ids), CvImportSnapshot.deleted_at.is_(None),
    ).all()) if import_ids else {}
    result = []
    for row in rows:
        state = row.state
        source = state.get('source_cv_data') or {}
        offer = state.get('offer') or {}
        answers = state.get('answers') or []
        question = state.get('question') or (answers[-1].get('question') if answers else {}) or {}
        document_id = state.get('document_id')
        result.append({
            'id': row.id, 'mode': state['mode'], 'phase': state['phase'],
            'created_at': _timestamp(row.created_at), 'updated_at': _timestamp(row.updated_at),
            'document_id': document_id if document_id in documents else None,
            'document_title': _text(documents.get(document_id)),
            'source_title': _text(documents.get(state.get('source_document_id')) or imports.get(state.get('source_import_id'))),
            'candidate_name': _text(source.get('name')), 'target_role': _text(source.get('title')),
            'offer_title': _text(offer.get('title')), 'offer_company': _text(offer.get('company')),
            'offer_excerpt': _text(offer.get('description'), 240) if state['mode'] == 'tailor' else '',
            'answer_count': len(answers), 'last_question': _text(question.get('text'), 240),
            'language': state.get('language'),
        })
    return result
