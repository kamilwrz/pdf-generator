"""History identity, timestamp, ownership and deletion contracts use no AI."""
from copy import deepcopy
from datetime import datetime
from unittest.mock import patch

from app.models.models import CareerProfile, CvImportSnapshot, InterviewSession, Pdf
from app.services.interviews import service
from test_interviews import environment, create


def test_history_has_saved_context_and_utc_dates_without_ai(environment):
    client, db, user, _ = environment
    session = create(client)
    source = Pdf(owner_id=user.id, title='Anna — CV bazowe')
    result = Pdf(owner_id=user.id, title='Anna — Bank A')
    db.add_all([source, result]); db.flush()
    row = db.get(InterviewSession, session['id'])
    row.created_at = datetime(2026, 9, 16, 8, 15)
    row.updated_at = datetime(2026, 9, 16, 14, 32)
    row.state = {**row.state, 'mode': 'tailor', 'source_document_id': source.id, 'document_id': result.id,
                 'offer': {'title': 'Analityk AML', 'company': 'Bank A', 'description': 'Analiza transakcji.'},
                 'answers': [{'answer': 'Private full answer', 'question': {'text': 'Jak sprawdzasz dane?'}}]}
    db.commit()
    before = deepcopy(row.state)
    with patch.object(service, '_gpt') as provider:
        response = client.get('/ai/interviews')
    assert response.status_code == 200
    item = response.json()['items'][0]
    assert item['offer_title'] == 'Analityk AML'
    assert item['offer_company'] == 'Bank A'
    assert item['source_title'] == source.title
    assert item['document_title'] == result.title
    assert item['document_id'] == result.id
    assert item['candidate_name'] == 'Anna Nowak'
    assert item['target_role'] == 'Developer'
    assert item['answer_count'] == 1
    assert item['last_question'] == 'Jak sprawdzasz dane?'
    assert item['created_at'] == '2026-09-16T08:15:00+00:00'
    assert item['updated_at'] == '2026-09-16T14:32:00+00:00'
    assert 'Private full answer' not in response.text
    assert row.state == before
    provider.assert_not_called()


def test_history_handles_import_deleted_source_and_foreign_references(environment):
    client, db, user, other = environment
    session = create(client)
    imported = CvImportSnapshot(owner_id=user.id, source_filename='Anna.pdf', source_size_bytes=120,
                                status='succeeded', created_at=datetime.utcnow())
    foreign = Pdf(owner_id=other.id, title='Foreign private title')
    db.add_all([imported, foreign]); db.flush()
    row = db.get(InterviewSession, session['id'])
    row.state = {**row.state, 'source_import_id': imported.id, 'document_id': foreign.id}
    db.commit()
    item = client.get('/ai/interviews').json()['items'][0]
    assert item['source_title'] == 'Anna.pdf'
    assert item['document_id'] is None
    assert item['document_title'] == ''
    imported.deleted_at = datetime.utcnow()
    row.state = {**row.state, 'source_document_id': foreign.id}
    db.commit()
    response = client.get('/ai/interviews')
    assert response.json()['items'][0]['source_title'] == ''
    assert response.json()['items'][0]['candidate_name'] == 'Anna Nowak'
    assert 'Foreign private title' not in response.text


def test_legacy_pasted_offer_is_bounded_and_missing_fields_stay_empty(environment):
    client, db, _, _ = environment
    session = create(client)
    row = db.get(InterviewSession, session['id'])
    row.state = {'mode': 'tailor', 'phase': 'ready', 'offer': {'description': 'Oferta ' * 300}}
    db.commit()
    item = client.get('/ai/interviews').json()['items'][0]
    assert item['offer_title'] == item['source_title'] == item['candidate_name'] == ''
    assert item['answer_count'] == 0
    assert len(item['offer_excerpt']) == 240


def test_delete_only_selected_owned_conversation_preserves_profile_and_cv(environment):
    client, db, user, other = environment
    session = create(client)
    result = Pdf(owner_id=user.id, title='Saved CV')
    profile = CareerProfile(owner_id=user.id, revision=1, facts=[{'id': 'kept', 'text': 'Saved fact'}])
    other_row = InterviewSession(id='other-session', owner_id=other.id, state={'mode': 'create', 'phase': 'ready'})
    db.add_all([result, profile, other_row]); db.flush()
    row = db.get(InterviewSession, session['id'])
    row.state = {**row.state, 'document_id': result.id}
    db.commit()
    assert client.delete('/ai/interviews/other-session').status_code == 404
    with patch.object(service, '_gpt') as provider:
        assert client.delete(f"/ai/interviews/{session['id']}").json() == {'deleted': True}
    assert client.get('/ai/interviews').json()['items'] == []
    assert db.get(Pdf, result.id) is not None
    assert db.get(CareerProfile, user.id).facts == [{'id': 'kept', 'text': 'Saved fact'}]
    assert db.get(InterviewSession, other_row.id) is not None
    provider.assert_not_called()
