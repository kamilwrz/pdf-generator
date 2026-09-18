"""Tailoring list identity, free reads and owner-scoped metadata regressions."""
from copy import deepcopy
from datetime import datetime
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import event

from app.models.models import CvImportSnapshot, InterviewSession, Pdf, TailoringFlow
from app.services.tailoring.history import flow_session_id
from test_tailoring import env, create


def test_draft_summaries_use_only_selected_offer_and_actual_source(env):
    client, db, user, _, cv = env
    text_id, _, _ = create(client, cv.id, job_offer_url='https://inactive.example/private', step='offer')
    url_id, _, _ = create(client, cv.id, offer_kind='url', job_offer_url='https://jobs.example/analyst')
    empty_id = str(uuid4())
    assert client.put(f'/tailoring/{empty_id}', json={'revision': 0}).status_code == 200
    before = {row.id: deepcopy(row.state) for row in db.query(TailoringFlow).all()}
    with patch('app.services.interviews.service._gpt') as provider, patch('app.api.routes.interviews.resolve_job_offer') as resolver:
        response = client.get('/tailoring')
    assert response.status_code == 200
    items = {item['id']: item for item in response.json()['items']}
    assert items[text_id]['source_title'] == 'Source CV'
    assert items[text_id]['candidate_name'] == 'Anna Example'
    assert items[text_id]['offer_excerpt'] == 'We need a reporting analyst with SQL experience.'
    assert items[text_id]['offer_title'] == items[text_id]['offer_company'] == items[text_id]['offer_url'] == ''
    assert items[text_id]['phase'] == 'offer'
    assert items[url_id]['offer_url'] == 'https://jobs.example/analyst'
    assert items[url_id]['offer_excerpt'] == ''
    assert items[empty_id]['phase'] == 'source'
    assert items[empty_id]['candidate_name'] == items[empty_id]['source_title'] == ''
    assert items[empty_id]['answer_count'] == 0
    assert 'inactive.example' not in response.text
    assert before == {row.id: row.state for row in db.query(TailoringFlow).all()}
    provider.assert_not_called()
    resolver.assert_not_called()
    assert db.query(InterviewSession).count() == 0


def test_linked_interview_supplies_identity_phase_answers_and_latest_activity(env):
    client, db, user, other, cv = env
    flow_id, _, _ = create(client, cv.id)
    second_id, _, _ = create(client, cv.id)
    row = db.get(TailoringFlow, flow_id)
    row.created_at = datetime(2026, 9, 16, 8, 15)
    row.updated_at = datetime(2026, 9, 16, 9)
    row.state = {**row.state, 'locked': True}
    db.get(TailoringFlow, second_id).updated_at = datetime(2026, 9, 16, 12)
    result = Pdf(owner_id=user.id, title='CV for Bank A')
    foreign = Pdf(owner_id=other.id, title='Foreign private CV')
    db.add_all([result, foreign]); db.flush()
    session = InterviewSession(id=flow_session_id(user.id, flow_id), owner_id=user.id,
        created_at=datetime(2026, 9, 16, 9), updated_at=datetime(2026, 9, 16, 14, 32), state={
            'mode': 'tailor', 'phase': 'question', 'source_document_id': cv.id,
            'source_cv_data': {'name': 'Anna Example', 'title': 'Analyst'},
            'offer': {'title': 'AML Analyst', 'company': 'Bank A', 'description': 'SQL reporting'},
            'answers': [{'status': 'skipped', 'answer': 'Private answer', 'question': {'text': 'Previous question'}}],
            'question': {'text': 'Which reports do you prepare?'},
        })
    db.add(session); db.commit()
    response = client.get('/tailoring')
    item = response.json()['items'][0]
    assert item['id'] == flow_id
    assert item['offer_title'] == 'AML Analyst' and item['offer_company'] == 'Bank A'
    assert item['answer_count'] == 1 and item['phase'] == 'question'
    assert item['last_question'] == 'Which reports do you prepare?'
    assert item['created_at'] == '2026-09-16T08:15:00+00:00'
    assert item['updated_at'] == '2026-09-16T14:32:00+00:00'
    assert 'Private answer' not in response.text
    session.state = {**session.state, 'document_id': result.id, 'phase': 'completed'}; db.commit()
    item = client.get('/tailoring').json()['items'][0]
    assert item['phase'] == 'completed' and item['document_id'] == result.id
    session.state = {**session.state, 'document_id': foreign.id}; db.commit()
    response = client.get('/tailoring')
    assert response.json()['items'][0]['document_id'] is None
    assert 'Foreign private CV' not in response.text


def test_import_deleted_foreign_and_missing_sessions_remain_readable(env):
    client, db, user, other, cv = env
    imported = CvImportSnapshot(owner_id=user.id, source_filename='Anna.pdf', source_size_bytes=123,
        status='succeeded', cv_data={'name': 'Anna Import'}, created_at=datetime.utcnow())
    foreign = Pdf(owner_id=other.id, title='Private foreign source', cv_data={'name': 'Private name'})
    db.add_all([imported, foreign]); db.flush()
    row = TailoringFlow(id=str(uuid4()), owner_id=user.id, state={
        'source_kind': 'import', 'source_id': imported.id, 'job_description': 'Oferta ' * 300,
    })
    db.add(row); db.commit()
    item = client.get('/tailoring').json()['items'][0]
    assert item['source_title'] == 'Anna.pdf' and item['candidate_name'] == 'Anna Import'
    assert len(item['offer_excerpt']) == 240
    imported.deleted_at = datetime.utcnow(); db.commit()
    item = client.get('/tailoring').json()['items'][0]
    assert item['source_title'] == item['candidate_name'] == ''
    row.state = {**row.state, 'source_kind': 'document', 'source_id': foreign.id, 'locked': True}; db.commit()
    # Even a malformed cross-owner session reference must not disclose metadata.
    db.add(InterviewSession(id=flow_session_id(user.id, row.id), owner_id=other.id,
        state={'mode': 'tailor', 'phase': 'question', 'source_cv_data': {'name': 'Private name'}})); db.commit()
    response = client.get('/tailoring')
    assert response.json()['items'][0]['phase'] == 'interrupted'
    assert response.json()['items'][0]['answer_count'] is None
    assert 'Private' not in response.text


def test_list_queries_are_bounded_for_fifty_drafts(env):
    client, db, user, _, cv = env
    for _ in range(51):
        db.add(TailoringFlow(id=str(uuid4()), owner_id=user.id, state={'source_kind': 'document', 'source_id': cv.id}))
    db.commit()
    # Resolve the fixture user before counting endpoint SELECT statements.
    owner_id = user.id
    statements = []
    def count_select(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', count_select)
    try:
        response = client.get('/tailoring')
    finally:
        event.remove(db.bind, 'before_cursor_execute', count_select)
    assert owner_id and response.status_code == 200
    assert len(response.json()['items']) == 50
    assert len(statements) <= 4
