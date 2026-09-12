"""Source switching, read-only CV fields, retained notes and deletion epochs."""
from copy import deepcopy
from unittest.mock import patch

from app.crud.cv_import_snapshots import create_snapshot
from app.models.models import Pdf
from app.services import interview_service as service
from test_interviews import environment  # noqa: F401


def choose(client, revision, source_id, kind='document'):
    return client.put('/career-profile/source', json={'revision': revision, 'kind': kind, 'id': source_id})


def test_switch_refresh_notes_and_clear_without_ai(environment):
    client, db, user, _ = environment
    a = Pdf(owner_id=user.id, title='First CV', cv_data={'name': 'Anna', 'skills': ['SQL']})
    b = Pdf(owner_id=user.id, title='Second CV', cv_data={'name': 'Anna', 'skills': ['Python']})
    db.add_all([a, b]); db.commit()
    notes = [{'id': 'note', 'text': 'Keep this wording', 'kind': 'framing', 'path': '/title', 'source': 'manual'},
             {'id': 'answer-q1', 'text': 'No management experience', 'kind': 'gap', 'source': 'interview:saved', 'question': 'Have you managed a team?'}]
    service.put_profile(db, user.id, 0, notes)
    with patch.object(service, '_gpt') as provider:
        first = choose(client, 1, a.id).json()
        assert first['source_binding'] == {'kind': 'document', 'id': a.id}
        assert {f['text'] for f in first['facts']} == {'Anna', 'SQL', 'Keep this wording', 'No management experience'}
        assert all(f['path'] == '' for f in first['facts'] if f['id'] in {'note', 'answer-q1'})
        assert client.get('/career-profile').json()['revision'] == first['revision']
        second = choose(client, first['revision'], b.id).json()
        assert 'SQL' not in {f['text'] for f in second['facts']}
        assert 'Python' in {f['text'] for f in second['facts']}
        assert next(f for f in second['facts'] if f['id'] == 'note')['kind'] == 'framing'
        b.cv_data = {'name': 'Anna', 'skills': ['Rust']}; db.commit()
        refreshed = client.get('/career-profile').json()
        assert refreshed['revision'] == second['revision'] + 1
        assert 'Rust' in {f['text'] for f in refreshed['facts']}
        assert client.put('/career-profile', json={'revision': second['revision'], 'facts': second['facts']}).status_code == 409
        assert client.delete(f"/career-profile?revision={refreshed['revision']}").status_code == 200
        cleared = client.get('/career-profile').json()
        assert cleared['facts'] == [] and cleared['source_binding'] is None
        provider.assert_not_called()


def test_cv_fields_cannot_be_edited_and_note_meaning_survives(environment):
    client, db, user, _ = environment
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    db.add(doc); db.commit()
    service.put_profile(db, user.id, 0, [{'id': 'gap', 'text': 'No SQL experience', 'kind': 'gap', 'source': 'manual'}])
    profile = choose(client, 1, doc.id).json()
    altered = deepcopy(profile['facts']); altered[0]['text'] = 'Someone else'
    assert client.put('/career-profile', json={'revision': profile['revision'], 'facts': altered}).status_code == 409
    altered = deepcopy(profile['facts']); altered[-1].update(text='No SQL work experience', kind='fact')
    saved = client.put('/career-profile', json={'revision': profile['revision'], 'facts': altered})
    assert saved.status_code == 200, saved.text
    assert saved.json()['facts'][-1]['kind'] == 'gap'
    assert saved.json()['facts'][-1]['text'] == 'No SQL work experience'
    assert db.get(Pdf, doc.id).cv_data == {'name': 'Anna'}


def test_unavailable_foreign_and_import_sources(environment):
    client, db, user, other = environment
    foreign = Pdf(owner_id=other.id, title='Private', cv_data={'name': 'Other'})
    db.add(foreign); db.commit()
    assert choose(client, 0, foreign.id).status_code == 422
    imported = create_snapshot(db, owner_id=user.id, filename='CV.pdf', size_bytes=1)
    imported.status = 'succeeded'; imported.cv_data = {'name': 'Anna'}; db.commit()
    selected = choose(client, 0, imported.id, 'import').json()
    assert selected['source_available'] is True
    assert choose(client, 0, imported.id, 'import').status_code == 409
    imported.status = 'deleted'; db.commit()
    missing = client.get('/career-profile').json()
    assert missing['source_available'] is False
    assert missing['source_binding'] == {'kind': 'import', 'id': imported.id}
    assert missing['facts'] == []
    assert choose(client, missing['revision'], imported.id, 'import').status_code == 422


def test_linked_clarification_keeps_its_id_without_colliding_with_source(environment):
    client, db, user, _ = environment
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    db.add(doc); db.commit()
    profile = choose(client, 0, doc.id).json()
    answer = {**profile['facts'][0], 'text': 'Anna Maria', 'question': 'What is your full name?', 'source': 'interview:saved'}
    service.put_profile(db, user.id, profile['revision'], [answer])
    refreshed = client.get('/career-profile').json()
    assert len(refreshed['facts']) == 2
    assert next(f for f in refreshed['facts'] if f['id'] == answer['id'])['text'] == 'Anna Maria'
    assert client.get('/career-profile').json()['revision'] == refreshed['revision']


def test_bound_profile_interview_answers_remain_resumable(environment):
    from app.models.models import InterviewSession
    from test_interviews import create, confirm, version
    client, db, user, _ = environment
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    db.add(doc); db.commit()
    profile = choose(client, 0, doc.id).json()
    session = confirm(client, create(client, source_document_id=doc.id, cv_data={}), profile['revision'], profile['facts'])
    profile = client.get('/career-profile').json()
    row = db.get(InterviewSession, session['id'])
    state = {**row.state, 'phase': 'question', 'question': {'id': 'q1', 'topic': 'reporting', 'text': 'What did you improve?', 'reason': 'Impact', 'context': 'Reporting'}}
    service.update_session(db, row, row.revision, state)
    session = client.get(f'/ai/interviews/{row.id}').json()
    result = client.post(f'/ai/interviews/{row.id}/answers', json={**version(session, profile['revision']), 'question_id': 'q1', 'answer': 'I automated reporting.', 'status': 'answered'})
    assert result.status_code == 200, result.text
    refreshed = client.get('/career-profile').json()
    assert refreshed['revision'] == result.json()['profile_revision']
    assert next(f for f in refreshed['facts'] if f['id'] == 'answer-q1')['text'] == 'I automated reporting.'
    assert client.get('/career-profile').json() == refreshed


def test_source_binding_migration_keeps_existing_facts():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, inspect
    path = Path(__file__).parents[1] / 'alembic/versions/20260912_0018_profile_source.py'
    spec = importlib.util.spec_from_file_location('profile_source_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE career_profiles (owner_id INTEGER PRIMARY KEY, facts JSON NOT NULL)')
        connection.exec_driver_sql("INSERT INTO career_profiles VALUES (1, '[]')")
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.upgrade()
            assert 'source_binding' in {c['name'] for c in inspect(connection).get_columns('career_profiles')}
            assert connection.exec_driver_sql('SELECT source_binding FROM career_profiles').scalar() is None
            migration.downgrade()
            assert 'source_binding' not in {c['name'] for c in inspect(connection).get_columns('career_profiles')}
            assert connection.exec_driver_sql('SELECT facts FROM career_profiles').scalar() == '[]'
    engine.dispose()


def test_oversized_source_remains_recoverable_and_keeps_notes(environment):
    client, db, user, _ = environment
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    replacement = Pdf(owner_id=user.id, title='Other CV', cv_data={'name': 'Anna'})
    db.add_all([doc, replacement]); db.commit()
    service.put_profile(db, user.id, 0, [{'id': 'note', 'text': 'Preserved note', 'source': 'manual'}])
    selected = choose(client, 1, doc.id).json()
    doc.cv_data = {'name': 'Anna', 'summary': 'a' * 4001}; db.commit()
    unavailable = client.get('/career-profile').json()
    assert unavailable['source_available'] is False
    assert unavailable['facts'][0]['text'] == 'Preserved note'
    assert choose(client, unavailable['revision'], doc.id).status_code == 422
    assert choose(client, unavailable['revision'], replacement.id).status_code == 200


def test_source_switch_retains_legacy_intake_notes_but_replaces_imported_fields(environment):
    client, db, user, _ = environment
    doc = Pdf(owner_id=user.id, title='CV', cv_data={'name': 'Anna'})
    db.add(doc); db.commit()
    service.put_profile(db, user.id, 0, [
        {'id': 'intake-note', 'text': 'Additional user text', 'path': '', 'source': 'document:42'},
        {'id': 'src-unknown', 'text': 'An old imported field', 'path': '', 'source': 'document:42'},
    ])
    profile = choose(client, 1, doc.id).json()
    assert {fact['text'] for fact in profile['facts']} == {'Anna', 'Additional user text'}
    note = next(fact for fact in profile['facts'] if fact['id'] == 'intake-note')
    assert note['source'] == 'document:42' and note['kind'] == 'fact'


def test_interview_source_review_replaces_old_fields_and_updates_existing_binding(environment):
    from test_interviews import create, version
    client, db, user, _ = environment
    first = Pdf(owner_id=user.id, title='Old CV', cv_data={'name': 'Anna', 'title': 'Analyst', 'skills': ['SQL']}, revision=1)
    selected = Pdf(owner_id=user.id, title='Selected CV', cv_data={'name': 'Anna', 'title': 'Senior Analyst'}, revision=1)
    db.add_all([first, selected]); db.commit()
    profile = choose(client, 0, first.id).json()
    session = create(client, source_document_id=selected.id, cv_data={})
    snapshot = session['review_source_facts']
    assert {fact['text'] for fact in snapshot} == {'Anna', 'Senior Analyst'}
    assert client.get('/career-profile').json()['source_binding']['id'] == first.id
    saved = client.post(f"/ai/interviews/{session['id']}/confirm", json={**version(session, profile['revision']), 'facts': snapshot})
    assert saved.status_code == 200, saved.text
    profile = client.get('/career-profile').json()
    assert profile['source_binding']['id'] == selected.id
    assert {fact['text'] for fact in profile['facts']} == {'Anna', 'Senior Analyst'}
    # A source refresh returns a full replacement for a source-only review.
    selected.cv_data = {'name': 'Anna', 'title': 'Lead Analyst'}; selected.revision = 2
    db.commit()
    profile = client.get('/career-profile').json()
    session = saved.json()['session']
    refreshed = client.post(f"/ai/interviews/{session['id']}/source", json=version(session, profile['revision']))
    assert refreshed.status_code == 200, refreshed.text
    updated = refreshed.json()
    assert {fact['text'] for fact in updated['review_source_facts']} == {'Anna', 'Lead Analyst'}
    assert client.post(f"/ai/interviews/{session['id']}/confirm", json={**version(updated, profile['revision']), 'facts': updated['review_source_facts']}).status_code == 200


def test_interview_can_start_from_bound_profile_and_replay_after_source_removal(environment):
    from app.models.models import InterviewSession
    client, db, user, _ = environment
    first = Pdf(owner_id=user.id, title='First', cv_data={'name': 'Anna', 'title': 'Analyst'})
    second = Pdf(owner_id=user.id, title='Second', cv_data={'name': 'Anna', 'title': 'Lead'})
    db.add_all([first, second]); db.commit()
    service.put_profile(db, user.id, 0, [{'id': 'note', 'text': 'Saved note', 'source': 'manual'}])
    profile = choose(client, 1, first.id).json()
    # The latest binding is resolved at Start, even if the selector was read earlier.
    choose(client, profile['revision'], second.id)
    body = {'mode': 'create', 'use_profile_source': True}
    with patch.object(service, '_gpt') as provider:
        response = client.post('/ai/interviews', headers={'Idempotency-Key': 'profile-source-start'}, json=body)
        assert response.status_code == 201, response.text
        session = response.json()
        assert session['evidence_scope'] == 'profile'
        assert session['source_document_id'] == second.id
        assert session['source_cv_data']['title'] == 'Lead'
        assert any(f['id'] == 'note' for f in client.get('/career-profile').json()['facts'])
        db.delete(second); db.commit()
        replay = client.post('/ai/interviews', headers={'Idempotency-Key': 'profile-source-start'}, json=body)
        assert replay.status_code == 201 and replay.json()['id'] == session['id']
        failed = client.post('/ai/interviews', headers={'Idempotency-Key': 'missing-source'}, json=body)
        assert failed.status_code == 422
        assert db.query(InterviewSession).count() == 1
        provider.assert_not_called()


def test_profile_source_requires_available_binding_and_rejects_overrides(environment):
    client, db, user, other = environment
    body = {'mode': 'create', 'use_profile_source': True}
    def start(extra=None):
        return client.post('/ai/interviews', headers={'Idempotency-Key': 'profile-validation'}, json={**body, **(extra or {})})
    service.put_profile(db, user.id, 0, [{'id': 'name', 'path': '/name', 'text': 'Notes alone'}])
    assert start().status_code == 422
    foreign = Pdf(owner_id=other.id, title='Foreign', cv_data={'name': 'Other'})
    db.add(foreign); db.commit()
    service.put_profile(db, user.id, 1, [], source_binding={'kind': 'document', 'id': foreign.id})
    assert start().status_code == 422
    imported = create_snapshot(db, owner_id=user.id, filename='Profile.pdf', size_bytes=1)
    imported.status = 'succeeded'; imported.cv_data = {'name': 'Anna', 'skills': ['Python']}; db.commit()
    profile = client.get('/career-profile').json()
    choose(client, profile['revision'], imported.id, 'import')
    for override in [{'source_document_id': foreign.id}, {'source_import_id': imported.id}, {'cv_data': {'name': 'Override'}}]:
        assert start(override).status_code == 422
    result = start()
    assert result.status_code == 201, result.text
    assert result.json()['source_import_id'] == imported.id
    assert result.json()['evidence_scope'] == 'profile'
    assert result.json()['source_cv_data']['skills'] == ['Python']
