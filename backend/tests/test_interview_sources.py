"""CV/import prerequisites are enforced before editing, session writes or AI."""
from unittest.mock import patch

import pytest

from app.crud.cv_import_snapshots import create_snapshot
from app.models.models import InterviewSession, Pdf
from app.services import interview_service as service
from test_interviews import environment, create, version


@pytest.mark.parametrize('include_profile', [False, True])
@pytest.mark.parametrize('cv_data', [{}, {'name': '  '}, {'skills': ['Python']}, {'template_id': 'linden'}])
def test_profile_and_notes_cannot_replace_a_cv_source(environment, include_profile, cv_data):
    client, db, user, _ = environment
    service.put_profile(db, user.id, 0, service.source_facts({'name': 'Account Owner'}, 'manual'))
    with patch.object(service, '_gpt') as provider:
        response = client.post('/ai/interviews', headers={'Idempotency-Key': 'empty-source'}, json={
            'mode': 'create', 'include_profile': include_profile, 'cv_data': cv_data,
            'candidate_notes': 'Anna Candidate, Python developer.',
        })
    assert response.status_code == 422
    assert response.json()['detail']['message_key'] == 'interview_source_required'
    assert db.query(InterviewSession).count() == 0
    provider.assert_not_called()


def test_available_sources_exclude_empty_foreign_failed_and_deleted_records(environment):
    client, db, user, other = environment
    ready = Pdf(owner_id=user.id, title='Ready', cv_data={'name': 'Anna'})
    db.add_all([ready, Pdf(owner_id=user.id, title='Empty', cv_data={'name': ' '}),
                Pdf(owner_id=other.id, title='Foreign', cv_data={'name': 'Other'})])
    db.commit()
    imports = []
    for status in ('succeeded', 'failed', 'processing', 'deleted'):
        row = create_snapshot(db, owner_id=user.id, filename=f'{status}.pdf', size_bytes=1)
        row.status = status
        row.cv_data = {'name': 'Anna'}
        imports.append(row)
    db.commit()
    sources = client.get('/career-profile').json()['sources']
    assert sources == {'documents': [{'id': ready.id, 'title': 'Ready'}],
                       'imports': [{'id': imports[0].id, 'filename': 'succeeded.pdf'}]}
    for row in imports[1:]:
        response = client.post('/ai/interviews', headers={'Idempotency-Key': f'import-{row.id}'}, json={
            'mode': 'create', 'source_import_id': row.id,
        })
        assert response.status_code in {404, 422}


def test_profile_editor_requires_source_but_reading_and_erasure_remain_available(environment):
    client, db, user, _ = environment
    facts = service.source_facts({'name': 'Anna'}, 'manual')
    assert client.put('/career-profile', json={'revision': 0, 'facts': facts}).status_code == 422
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    db.add(doc); db.commit()
    result = client.put('/career-profile', json={'revision': 0, 'facts': facts})
    assert result.status_code == 200
    assert result.json()['sources']['documents'][0]['id'] == doc.id
    doc.cv_data = {}; db.commit()
    assert client.get('/career-profile').json()['facts'] == result.json()['facts']
    assert client.put('/career-profile', json={'revision': 1, 'facts': facts}).status_code == 422
    assert client.delete('/career-profile?revision=1').status_code == 200


def test_old_profile_only_session_is_readable_but_cannot_resume_work(environment):
    client, db, _, _ = environment
    session = create(client)
    row = db.get(InterviewSession, session['id'])
    row.state = {**row.state, 'source_cv_data': {}}
    db.commit()
    assert client.get(f"/ai/interviews/{row.id}").json()['requires_source_choice'] is True
    with patch.object(service, '_gpt') as provider:
        result = client.post(f"/ai/interviews/{row.id}/next", json=version(session))
    assert result.status_code == 422
    provider.assert_not_called()
