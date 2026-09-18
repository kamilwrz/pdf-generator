"""Read-only context for guided tailoring drafts and their saved interviews."""
from uuid import NAMESPACE_URL, uuid5

from app.models.models import CvImportSnapshot, InterviewSession, Pdf
from app.services.interviews.history import _text, _timestamp, interview_summaries


def flow_session_id(owner_id, flow_id):
    """Return the interview's existing idempotent identity without creating it."""
    return str(uuid5(NAMESPACE_URL, f"interview:{owner_id}:tailor-{flow_id}"))


def tailoring_summaries(db, owner_id, rows):
    """Describe a bounded page using owned saved data, without writes or AI.

    Resolve sessions and source metadata in batches, independently checking
    ownership of every referenced record. Interview snapshots retain candidate
    context after a source disappears. Unstarted drafts use the current source.
    Only the selected advert input is exposed; its text is an excerpt, never an
    inferred job title. Activity includes answers saved after intake was locked.
    """
    session_ids = {row.id: flow_session_id(owner_id, row.id) for row in rows}
    sessions = db.query(InterviewSession).filter(
        InterviewSession.owner_id == owner_id, InterviewSession.id.in_(session_ids.values()),
    ).all() if rows else []
    histories = {item['id']: item for item in interview_summaries(db, owner_id, sessions)}
    drafts = [row for row in rows if session_ids[row.id] not in histories]
    document_ids = {row.state.get('source_id') for row in drafts if row.state.get('source_kind') == 'document'} - {None}
    import_ids = {row.state.get('source_id') for row in drafts if row.state.get('source_kind') == 'import'} - {None}
    documents = {row.id: row for row in db.query(Pdf.id, Pdf.title, Pdf.cv_data).filter(
        Pdf.owner_id == owner_id, Pdf.id.in_(document_ids),
    ).all()} if document_ids else {}
    imports = {row.id: row for row in db.query(CvImportSnapshot.id, CvImportSnapshot.source_filename, CvImportSnapshot.cv_data).filter(
        CvImportSnapshot.owner_id == owner_id, CvImportSnapshot.id.in_(import_ids),
        CvImportSnapshot.deleted_at.is_(None), CvImportSnapshot.status == 'succeeded',
    ).all()} if import_ids else {}
    result = []
    for row in rows:
        state = row.state
        history = histories.get(session_ids[row.id])
        if history:
            summary = dict(history)
            # The result link is available only after the shared history lookup
            # has checked that the generated document still belongs to the user.
            if summary['document_id']:
                summary['phase'] = 'completed'
        else:
            source = (documents if state.get('source_kind') == 'document' else imports).get(state.get('source_id'))
            data = (source.cv_data or {}) if source else {}
            summary = {
                'mode': 'tailor',
                'phase': 'interrupted' if state.get('locked') else state.get('step', 'source'),
                'source_title': _text((source.title if state.get('source_kind') == 'document' else source.source_filename) if source else ''),
                'candidate_name': _text(data.get('name')), 'target_role': _text(data.get('title')),
                'offer_title': '', 'offer_company': '', 'offer_excerpt': '',
                'document_id': None, 'document_title': '', 'answer_count': None if state.get('locked') else 0, 'last_question': '',
                'language': state.get('language'),
            }
        # Pasted drafts and URL-only sessions may not have parsed offer metadata.
        # Never expose the inactive text/link draft as the selected application.
        is_url = state.get('offer_kind') == 'url'
        if not summary['offer_excerpt'] and not is_url:
            summary['offer_excerpt'] = _text(state.get('job_description'), 240)
        summary['offer_url'] = _text(state.get('job_offer_url'), 2048) if is_url else ''
        summary.update(
            id=row.id, started=bool(state.get('locked')), created_at=_timestamp(row.created_at),
            updated_at=max(_timestamp(row.updated_at), summary.get('updated_at', '')),
        )
        result.append(summary)
    return sorted(result, key=lambda item: (item['updated_at'], item['created_at'], item['id']), reverse=True)
