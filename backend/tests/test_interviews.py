"""Interview state, factual grounding, isolation and restart regression tests."""
from copy import deepcopy
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.dependencies import get_db
from app.core.security import get_current_user
from app.models.database import Base
from app.models.models import User, InterviewSession, CareerProfile, Pdf
from app.services import interview_service as service
from app.services.cv_data import normalize_cv_data
from app.services.entitlements import seed_plans, set_user_plan
from app.services.account_data_service import build_account_export, delete_account_data


@pytest.fixture
def environment():
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    user = User(username='interview-owner', email='owner@example.com', hashed_password='test', is_active=True)
    other = User(username='another-owner', email='another@example.com', hashed_password='test', is_active=True)
    db.add_all([user, other]); db.commit()
    seed_plans(db)
    set_user_plan(db, user.id, 'pro')
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    yield TestClient(app), db, user, other
    app.dependency_overrides.clear()
    db.close(); engine.dispose()


def create(client, **kwargs):
    response = client.post('/ai/interviews', headers={'Idempotency-Key': 'test-start'}, json={
        'mode': 'create', 'include_profile': True, 'cv_data': {'name': 'Anna Nowak', 'title': 'Developer'}, **kwargs,
    })
    assert response.status_code == 201, response.text
    return response.json()


def version(session, profile=0):
    return {'revision': session['revision'], 'profile_revision': profile, 'evidence_scope': session.get('evidence_scope', 'profile')}


def confirm(client, session, profile=0, facts=None):
    result = client.post(f"/ai/interviews/{session['id']}/confirm", json={
        **version(session, profile), 'facts': facts if facts is not None else session['proposed_facts'],
    })
    assert result.status_code == 200, result.text
    return result.json()['session']


def test_source_roundtrip_preserves_canonical_fields():
    cv = normalize_cv_data({'name': 'Anna', 'skills': ['Python'], 'experience': [{'title': 'Dev', 'company': 'ABC', 'city': 'Warszawa', 'period': '2020–2024', 'bullets': ['Skróciłam raportowanie o 20%.']}], 'education': [{'school': 'UW', 'degree': 'Mgr', 'city': 'Warszawa', 'period': '2019', 'description': 'Informatyka'}]})
    facts = service.source_facts(cv, 'document:1')
    restored = normalize_cv_data(service.base_cv({'facts': facts}))
    for key in ('name', 'skills', 'experience', 'education'):
        assert restored[key] == cv[key]


def test_profile_delete_epoch_prevents_resurrection(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    deleted = client.delete('/career-profile?revision=1')
    assert deleted.status_code == 200
    assert deleted.json()['revision'] == 2
    assert service.base_cv(service.profile_payload(db, user.id)) == {}
    assert client.put('/career-profile', json={'revision': 1, 'facts': []}).status_code == 409
    assert client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'}).status_code == 409


def test_start_is_idempotent_and_does_not_mutate_profile(environment):
    client, db, user, _ = environment
    first = create(client)
    assert create(client)['id'] == first['id']
    assert db.query(InterviewSession).count() == 1
    assert service.profile_payload(db, user.id)['facts'] == []
    changed = client.post('/ai/interviews', headers={'Idempotency-Key': 'test-start'}, json={'mode': 'enrich'})
    assert changed.status_code == 409


def test_foreign_sessions_and_sources_are_hidden(environment):
    client, db, user, other = environment
    session = create(client)
    app.dependency_overrides[get_current_user] = lambda: other
    for method in ('get', 'delete'):
        assert getattr(client, method)(f"/ai/interviews/{session['id']}").status_code == 404
    assert client.get('/ai/interviews').json()['items'] == []
    app.dependency_overrides[get_current_user] = lambda: user
    assert client.post('/ai/interviews', headers={'Idempotency-Key': 'foreign-source'}, json={'mode': 'enrich', 'source_document_id': 987}).status_code == 404


@pytest.mark.parametrize('status,pending', [('answered', True), ('no_experience', True), ('unknown', False), ('skipped', False)])
def test_answer_statuses_and_retries(environment, status, pending):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state.update(question={'id': 'q1', 'topic': 'reporting', 'text': 'Co usprawniłaś?', 'reason': 'Wpływ', 'context': 'Raportowanie'}, phase='question')
    service.update_session(db, row, row.revision, state)
    session = client.get(f"/ai/interviews/{row.id}").json()
    body = {**version(session, 1), 'question_id': 'q1', 'answer': 'Skróciłam raportowanie o 20%.' if status == 'answered' else '', 'status': status}
    response = client.post(f"/ai/interviews/{row.id}/answers", json=body)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert len(saved['answers']) == 1
    assert bool(saved['proposed_facts']) == pending
    assert client.post(f"/ai/interviews/{row.id}/answers", json=body).json()['revision'] == saved['revision']
    assert len(service.profile_payload(db, user.id)['facts']) == 2


def test_profile_conflicting_fields_require_resolution(environment):
    client, _, _, _ = environment
    session = create(client)
    facts = session['proposed_facts'] + [{'id': 'conflicting-name', 'text': 'Inna Osoba', 'path': '/name'}]
    response = client.post(f"/ai/interviews/{session['id']}/confirm", json={**version(session), 'facts': facts})
    assert response.status_code == 422
    assert client.get('/career-profile').json()['revision'] == 0


@pytest.mark.parametrize('field', [
    {'path': '/summary', 'value': 'Wynik 90%', 'evidence_refs': ['a']},
    {'path': '/name', 'value': 'Jan', 'evidence_refs': ['a']},
    {'path': '/experience/1/bullets/0', 'value': 'Wynik 20%', 'evidence_refs': ['a']},
    {'path': '/summary', 'value': 'Wynik 20%', 'evidence_refs': ['missing']},
])
def test_rejects_fake_metrics_identity_and_cross_role_evidence(field):
    profile = {'facts': [{'id': 'a', 'text': 'Wynik 20%', 'path': '/experience/0/bullets/0', 'kind': 'fact'}]}
    with pytest.raises(HTTPException):
        service.assemble_draft({'fields': [field]}, profile, 'pl')


def test_question_budget_does_not_call_provider(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state); state['question_limit'] = 0
    service.update_session(db, row, row.revision, state)
    session = client.get(f"/ai/interviews/{row.id}").json()
    with patch.object(service, '_gpt') as provider:
        result = client.post(f"/ai/interviews/{row.id}/next", json=version(session, 1))
    assert result.status_code == 200, result.text
    assert result.json()['phase'] == 'review'
    provider.assert_not_called()


def test_discovery_is_billed_once_and_replayed_after_session_write_loss(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    output = {'questions': [{'topic': 'projects', 'text': 'Jaki projekt ukończyłaś?', 'reason': 'Pokażemy własny wkład.', 'context': 'Projekt'}], 'requirements': []}
    with patch.object(service, '_gpt', return_value=(output, {'cost_pln_estimate': .01})) as provider:
        first = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1))
        assert first.status_code == 200, first.text
        replay = client.post(f"/ai/interviews/{session['id']}/next", json=version(first.json(), 1))
        assert replay.status_code == 200
        assert provider.call_count == 1


def test_export_and_account_delete_include_new_data(environment):
    client, db, user, _ = environment
    confirm(client, create(client))
    exported = build_account_export(db, user=user)
    assert len(exported['career_profile']) == 1
    assert len(exported['interviews']) == 1
    delete_account_data(db, user_id=user.id)
    assert db.query(CareerProfile).count() == 0
    assert db.query(InterviewSession).count() == 0


def test_free_can_edit_profile_but_cannot_start_interview(environment):
    client, db, user, _ = environment
    set_user_plan(db, user.id, 'free')
    assert client.put('/career-profile', json={'revision': 0, 'facts': []}).status_code == 200
    result = client.post('/ai/interviews', headers={'Idempotency-Key': 'free'}, json={'mode': 'create'})
    assert result.status_code == 403, result.text


def test_preview_creates_a_separate_document_and_pdf_excludes_interview(environment):
    from app.api.routes import interviews
    from app.schemas.pdf_schema import PDFCreateRequest
    from app.utils.build_pdf import build_pdf_to_buffer
    from app.utils.image_src_to_path import image_src_to_local_path
    import pymupdf

    client, db, user, _ = environment
    source_data = {'name': 'Anna Nowak', 'title': 'Developer'}
    source_document = Pdf(owner_id=user.id, title='Source CV', cv_data=source_data, template_id='linden', revision=1)
    db.add(source_document); db.commit()
    session = confirm(client, create(client, source_document_id=source_document.id, cv_data={}, candidate_notes='Tworzę raporty w Pythonie.'))
    profile = service.profile_payload(db, user.id)
    ref = next(f['id'] for f in profile['facts'] if f['text'] == 'Tworzę raporty w Pythonie.')
    raw = {'fields': [{'path': '/summary', 'value': 'Tworzę raporty w Pythonie.', 'evidence_refs': [ref]}], 'remaining_gaps': []}
    with patch.object(service, '_gpt', side_effect=[(raw, {'cost_pln_estimate': .01}), ({'unsupported_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})]):
        response = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
    assert response.status_code == 200, response.text
    preview_session = response.json()
    preview = preview_session['preview']
    assert preview['cv_data']['summary'] == 'Tworzę raporty w Pythonie.'
    data = PDFCreateRequest(root=preview['elements'], pages=preview['pages'], pdf_title='Test wywiadu')
    pdf = build_pdf_to_buffer(data, data.root, image_src_to_local_path)
    with pymupdf.open(stream=pdf, filetype='pdf') as document:
        assert len(document) == preview['pages']
        assert document[0].rect.width == 595
        text = ''.join(page.get_text() for page in document)
        assert 'anna nowak' in text.casefold()
        assert 'evidence_refs' not in text and 'proposed_facts' not in text

    def save(db, *, user, username, pdf_data, idempotency_key):
        row = Pdf(owner_id=user.id, title=pdf_data.pdf_title, create_idempotency_key=idempotency_key, cv_data=pdf_data.cv_data)
        db.add(row); db.commit()
        return {'pdf_id': row.id}
    with patch.object(interviews, 'create_pdf_document', side_effect=save) as saver:
        first = client.post(f"/ai/interviews/{session['id']}/document", json=version(preview_session, 1))
        second = client.post(f"/ai/interviews/{session['id']}/document", json=version(preview_session, 1))
        assert first.status_code == second.status_code == 200, first.text
        assert first.json() == second.json()
        assert saver.call_count == 1
    assert db.query(Pdf).count() == 2
    db.refresh(source_document)
    assert source_document.cv_data == source_data and source_document.revision == 1
    assert service.profile_payload(db, user.id) == profile


def test_semantic_rejection_is_reviewable_and_allows_new_generation(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client))
    fact = next(f for f in client.get('/career-profile').json()['facts'] if f['path'] == '/title')
    draft = {'fields': [{'path': '/summary', 'value': 'Ekspert Kubernetes', 'evidence_refs': [fact['id']]}], 'remaining_gaps': []}
    with patch.object(service, '_gpt', side_effect=[(draft, {'cost_pln_estimate': .01}), ({'unsupported_paths': ['/summary'], 'reasons': ['Nie potwierdzono Kubernetes.']}, {'cost_pln_estimate': .01})]):
        response = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
    assert response.status_code == 200, response.text
    assert response.json()['preview']['review_notes'] == [{'path': '/summary', 'action': 'omitted_suggestion'}]
    assert response.json()['preview']['changes'] == []
    assert response.json()['phase'] == 'clarification'
    assert response.json()['revision'] > session['revision']


def test_changed_source_and_template_are_checked_before_charging(environment):
    client, db, user, _ = environment
    source = Pdf(owner_id=user.id, title='Source', cv_data={'name': 'Anna Nowak'}, template_id='linden', revision=1)
    db.add(source); db.commit()
    session = confirm(client, create(client, mode='tailor', source_document_id=source.id, job_description='Developer'))
    with patch.object(service, '_gpt') as provider:
        assert client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'sterling'}).status_code == 422
        source.revision = 2; db.commit()
        assert client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1)).status_code == 409
        provider.assert_not_called()


def test_unknown_template_requires_selection_and_conflicting_paths_are_rejected(environment):
    client, _, _, _ = environment
    session = create(client, template_id='retired-template')
    assert session['template_id'] is None
    facts = [{'id': 'a', 'text': 'Python', 'path': '/skills/0'}, {'id': 'b', 'text': 'Tools', 'path': '/skills/0/category'}]
    assert client.put('/career-profile', json={'revision': 0, 'facts': facts}).status_code == 422


def test_deterministic_rejection_can_be_regenerated(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client))
    ref = client.get('/career-profile').json()['facts'][0]['id']
    raw = {'fields': [{'path': '/summary', 'value': 'Wzrost o 99%', 'evidence_refs': [ref]}], 'remaining_gaps': []}
    with patch.object(service, '_gpt', side_effect=[(raw, {'cost_pln_estimate': .01}), ({'unsupported_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})]):
        response = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
    assert response.status_code == 200, response.text
    assert response.json()['preview']['review_notes'] == [{'path': '/summary', 'action': 'omitted_suggestion'}]
    assert response.json()['preview']['changes'] == []
    assert response.json()['revision'] > session['revision']


@pytest.mark.parametrize('language,label', [('en', 'LANGUAGES'), ('de', 'SPRACHEN'), ('uk', 'МОВИ')])
def test_localized_headings_survive_template_normalization(language, label):
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna', 'languages': [{'name': 'English', 'level': 'B2'}]}), 'manual')}
    data, _ = service.assemble_draft({'fields': []}, profile, language)
    again = normalize_cv_data(data)
    assert again['extra_sections'][0]['title'] == label


def test_transport_limit_applies_before_profile_json_parsing(environment):
    client, _, _, _ = environment
    response = client.put('/career-profile', content=' ' * (1024 * 1024 + 1), headers={'Content-Type': 'application/json'})
    assert response.status_code == 413


def test_definitive_provider_failure_preserves_work_and_allows_retry(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client))
    with patch.object(service, '_gpt', side_effect=service.AIServiceError('Unavailable', reservation_outcome='release')):
        result = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1))
    assert result.status_code == 500
    saved = client.get(f"/ai/interviews/{session['id']}").json()
    assert saved['revision'] > session['revision'] and saved['confirmed']
    with patch.object(service, '_gpt', return_value=({'questions': [], 'requirements': []}, {'cost_pln_estimate': .01})) as provider:
        replay = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1))
        assert replay.status_code == 409
        retry = client.post(f"/ai/interviews/{session['id']}/next", json=version(saved, 1))
        assert retry.status_code == 200, retry.text
        assert provider.call_count == 1


def test_source_refresh_preserves_answers_and_requires_review(environment):
    client, db, user, _ = environment
    source = Pdf(owner_id=user.id, title='Source', cv_data={'name': 'Anna Nowak', 'title': 'Developer'}, template_id='linden', revision=1)
    db.add(source); db.commit()
    session = confirm(client, create(client, source_document_id=source.id, cv_data={}))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state['answers'] = [{'question': {'id': 'q', 'topic': 'projects'}, 'answer': 'Projekt uczelniany', 'status': 'answered'}]
    service.update_session(db, row, row.revision, state)
    session = client.get(f"/ai/interviews/{session['id']}").json()
    original_profile = service.profile_payload(db, user.id)
    source.cv_data = {'name': 'Anna Nowak', 'title': 'Senior Developer'}
    source.revision = 2; db.commit()
    with patch.object(service, '_gpt') as provider:
        result = client.post(f"/ai/interviews/{session['id']}/source", json=version(session, 1))
        provider.assert_not_called()
    assert result.status_code == 200, result.text
    updated = result.json()
    assert updated['answers'] == state['answers']
    assert updated['source_revision'] == 2 and updated['source_cv_data']['title'] == 'Senior Developer'
    assert updated['preview'] is None and not updated['confirmed']
    assert any(f['text'] == 'Senior Developer' for f in updated['proposed_facts'])
    assert service.profile_payload(db, user.id) == original_profile


@pytest.mark.parametrize('changed_profile', [False, True])
def test_legacy_rejection_recovers_paid_output_only_for_unchanged_profile(environment, changed_profile):
    from app.models.models import AiCreditReservation
    client, db, _, _ = environment
    session = confirm(client, create(client))
    ref = client.get('/career-profile').json()['facts'][0]['id']
    draft = {'fields': [{'path': '/summary', 'value': 'Wzrost o 99%', 'evidence_refs': [ref]}], 'remaining_gaps': []}
    verifier = {'unsupported_paths': ['/summary'], 'reasons': ['Technical evidence report']}
    with patch.object(service, '_gpt', side_effect=[(draft, {'cost_pln_estimate': .01}), (verifier, {'cost_pln_estimate': .01})]):
        result = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
    assert result.status_code == 200
    # Emulate the old release's persisted state without altering its revision:
    # both settled responses still belong to the preceding generation attempt.
    row = db.get(InterviewSession, session['id'])
    row.state = {**row.state, 'phase': 'review', 'preview': None, 'generation_feedback': verifier['reasons']}
    db.commit()
    saved = client.get(f"/ai/interviews/{session['id']}").json()
    profile_revision = 1
    if changed_profile:
        profile = client.get('/career-profile').json()
        assert client.put('/career-profile', json={'revision': 1, 'facts': profile['facts']}).status_code == 200
        profile_revision = 2
    with patch.object(service, '_gpt', side_effect=[(draft, {'cost_pln_estimate': .01}), (verifier, {'cost_pln_estimate': .01})]) as provider:
        result = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(saved, profile_revision), 'template_id': 'linden'})
    assert result.status_code == 200, result.text
    preview = result.json()['preview']
    assert preview['recovered_previous_attempt'] is not changed_profile
    assert provider.call_count == (2 if changed_profile else 0)
    assert db.query(AiCreditReservation).count() == (4 if changed_profile else 2)
    assert preview['changes'] == [] and preview['elements']
    assert result.json()['generation_feedback'] == []


@pytest.mark.parametrize('status', ['answered', 'no_experience', 'unknown', 'skipped'])
def test_clarification_precedes_preview_and_requires_confirmation(environment, status):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    ref = client.get('/career-profile').json()['facts'][0]['id']
    draft = {'fields': [{'path': '/summary', 'value': 'Python w projekcie portalu CV', 'evidence_refs': [ref]}], 'remaining_gaps': []}
    verification = {'unsupported_paths': ['/summary'], 'reasons': ['Internal diagnostic'], 'clarifications': [{'path': '/summary', 'question': 'W którym projekcie używałaś Pythona?'}]}
    with patch.object(service, '_gpt', side_effect=[(draft, {'cost_pln_estimate': .01}), (verification, {'cost_pln_estimate': .01})]):
        session = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'}).json()
    assert session['phase'] == 'clarification' and not session['question']
    assert client.post(f"/ai/interviews/{session['id']}/document", json=version(session, 1)).status_code == 409
    with patch.object(service, '_gpt') as provider:
        result = client.post(f"/ai/interviews/{session['id']}/clarify", json=version(session, 1))
        assert result.status_code == 200, result.text
        asking = result.json()
        assert asking['question']['text'] == 'W którym projekcie używałaś Pythona?'
        saved = client.post(f"/ai/interviews/{session['id']}/answers", json={**version(asking, 1), 'question_id': asking['question']['id'], 'status': status, 'answer': 'Python był używany w projekcie uczelnianym.' if status == 'answered' else ''})
        provider.assert_not_called()
    assert saved.status_code == 200, saved.text
    saved = saved.json()
    assert len(saved['answers']) == 1
    assert service.profile_payload(db, user.id)['revision'] == 1
    if status in {'answered', 'no_experience'}:
        assert saved['phase'] == 'review' and saved['preview'] is None
        assert saved['proposed_facts'][0]['kind'] == ('fact' if status == 'answered' else 'gap')
        assert client.post(f"/ai/interviews/{session['id']}/preview", json={**version(saved, 1), 'template_id': 'linden'}).status_code == 422
        if status == 'answered':
            facts = client.get('/career-profile').json()['facts'] + saved['proposed_facts']
            confirmed = confirm(client, saved, 1, facts)
            answer_fact = saved['proposed_facts'][0]
            corrected = {'fields': [{'path': '/summary', 'value': answer_fact['text'], 'evidence_refs': [answer_fact['id']]}], 'remaining_gaps': []}
            with patch.object(service, '_gpt', side_effect=[(corrected, {'cost_pln_estimate': .01}), ({'unsupported_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})]):
                final = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(confirmed, 2), 'template_id': 'linden'})
            assert final.status_code == 200, final.text
            assert final.json()['phase'] == 'preview'
            assert final.json()['preview']['cv_data']['summary'] == answer_fact['text']

    else:
        assert saved['phase'] == 'preview' and not saved['proposed_facts']


def test_explicit_skip_shows_verified_preview_without_claiming_lack_of_experience(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    topic = 'clarify:known'
    row.state = {**row.state, 'phase': 'clarification', 'pending_clarifications': [{'topic': topic}], 'preview': {'cv_data': {'name': 'Anna Nowak'}, 'profile_revision': 1}}
    db.commit()
    result = client.post(f"/ai/interviews/{session['id']}/skip-clarifications", json=version(session, 1))
    assert result.status_code == 200, result.text
    assert result.json()['phase'] == 'preview' and not result.json()['proposed_facts']
    assert result.json()['dismissed_clarifications'] == [topic]
    assert result.json()['answers'] == []


def test_resume_repairs_legacy_loop_once_without_profile_changes_or_ai(environment):
    client, db, user, other = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    questions = [{'id': f'legacy-{i}', 'topic': f'path-{i}', 'text': 'Jak należy poprawnie opisać ten fragment dotyczący: Treść CV?',
                  'context': 'Treść CV', 'suggested_text': 'Python w portalu CV', 'clarification': True} for i in range(8)]
    state.update(phase='clarification', question=questions[0], pending_clarifications=questions[1:], preview={'cv_data': {'name': 'Anna'}})
    service.update_session(db, row, row.revision, state)
    original_revision = row.revision
    original_profile = client.get('/career-profile').json()
    with patch.object(service, 'paid_model', side_effect=AssertionError('Repair must be free')):
        app.dependency_overrides[get_current_user] = lambda: other
        assert client.get(f"/ai/interviews/{session['id']}").status_code == 404
        app.dependency_overrides[get_current_user] = lambda: user
        resumed = client.get(f"/ai/interviews/{session['id']}").json()
        assert resumed['revision'] == original_revision + 1
        assert resumed['question']['id'] == 'legacy-0' and resumed['pending_clarifications'] == []
        assert client.get(f"/ai/interviews/{session['id']}").json() == resumed
        assert client.get('/career-profile').json() == original_profile
        payload = {**version(resumed, 1), 'question_id': 'legacy-0', 'answer': '', 'status': 'unknown'}
        saved = client.post(f"/ai/interviews/{session['id']}/answers", json=payload).json()
        assert saved['phase'] == 'preview' and len(saved['answers']) == 1
        assert client.post(f"/ai/interviews/{session['id']}/answers", json=payload).json() == saved


def test_discovery_stops_repeated_wording_with_changed_topic_without_retry(environment):
    client, db, _, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state['answers'] = [{'question': {'id': 'old', 'topic': 'old-topic', 'text': 'Jakie narzędzia znasz?'}, 'answer': '', 'status': 'unknown'}]
    service.update_session(db, row, row.revision, state)
    session = client.get(f'/ai/interviews/{row.id}').json()
    output = {'output': {'questions': [{'topic': 'new-topic', 'text': 'JAKIE narzędzia   znasz!', 'context': '', 'reason': ''}], 'requirements': []}, 'usage': {}}
    with patch.object(service, 'paid_model', return_value=output) as model:
        response = client.post(f'/ai/interviews/{row.id}/next', json=version(session, 1))
    assert response.status_code == 200
    assert response.json()['phase'] == 'review' and response.json().get('question') is None
    assert model.call_count == 1


def test_active_clarification_cannot_restart_paid_generation(environment):
    client, db, _, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state.update(phase='clarification', question=None, pending_clarifications=[{
        'id': 'one', 'topic': 'one', 'text': 'Który projekt?', 'context': 'Projekt',
        'suggested_text': 'Python w portalu CV', 'clarification': True, 'record_label': 'Projekt',
    }])
    service.update_session(db, row, row.revision, state)
    session = client.get(f'/ai/interviews/{row.id}').json()
    with patch.object(service, 'paid_model', side_effect=AssertionError('Cannot restart paid work')):
        for action in ('next', 'preview'):
            body = {**version(session, 1), **({'template_id': 'linden'} if action == 'preview' else {})}
            assert client.post(f'/ai/interviews/{row.id}/{action}', json=body).status_code == 422


@pytest.mark.parametrize('mode', ['create', 'enrich', 'tailor'])
def test_selected_candidate_isolated_through_confirmation_ai_and_document(environment, mode):
    """Owner facts must never reach another candidate's provider context or PDF."""
    from app.api.routes import interviews
    client, db, user, _ = environment
    owner = service.put_profile(db, user.id, 0, service.source_facts({'name': 'Kamil Owner', 'skills': ['OwnerOnlySkill']}, 'manual'))
    source = Pdf(owner_id=user.id, title='Other CV', cv_data={'name': 'Anna Candidate', 'title': 'Designer'}, template_id='linden', revision=1)
    db.add(source); db.commit()
    result = client.post('/ai/interviews', headers={'Idempotency-Key': 'isolated'}, json={
        'mode': mode, 'source_document_id': source.id, 'job_description': 'Designer' if mode == 'tailor' else '',
    })
    assert result.status_code == 201, result.text
    session = result.json()
    assert session['evidence_scope'] == 'session' and session['evidence_profile'] == {'revision': 0, 'facts': []}
    assert 'Kamil' not in str(session) and 'OwnerOnlySkill' not in str(session)
    session = confirm(client, session)
    assert service.profile_payload(db, user.id) == owner
    # Updating an unrelated account profile cannot stale isolated evidence.
    owner = service.put_profile(db, user.id, 1, owner['facts'])
    with patch.object(service, '_gpt', return_value=({'questions': [], 'requirements': []}, {'cost_pln_estimate': .01})) as provider:
        result = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1))
        assert result.status_code == 200, result.text
        assert 'Kamil' not in provider.call_args.args[1] and 'OwnerOnlySkill' not in provider.call_args.args[1]
    session = result.json()
    with patch.object(service, '_gpt', side_effect=[({'fields': [], 'remaining_gaps': []}, {'cost_pln_estimate': .01}), ({'unsupported_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})]) as provider:
        result = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
        assert result.status_code == 200, result.text
        assert all('OwnerOnlySkill' not in call.args[1] and 'Kamil' not in call.args[1] for call in provider.call_args_list)
    session = result.json()
    assert session['preview']['cv_data']['name'] == 'Anna Candidate'
    def save(db, *, user, username, pdf_data, idempotency_key):
        assert pdf_data.cv_data['name'] == 'Anna Candidate'
        row = Pdf(owner_id=user.id, title=pdf_data.pdf_title, cv_data=pdf_data.cv_data, create_idempotency_key=idempotency_key)
        db.add(row); db.commit()
        return {'pdf_id': row.id}
    with patch.object(interviews, 'create_pdf_document', side_effect=save) as saver:
        first = client.post(f"/ai/interviews/{session['id']}/document", json=version(session, 1))
        again = client.post(f"/ai/interviews/{session['id']}/document", json=version(session, 1))
        assert first.status_code == 200 and first.json() == again.json()
        assert saver.call_count == 1
    assert service.profile_payload(db, user.id) == owner
    db.refresh(source)
    assert source.cv_data['name'] == 'Anna Candidate' and source.revision == 1


def test_isolated_answers_edits_deletions_and_stale_scope(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client, include_profile=False))
    row = db.get(InterviewSession, session['id'])
    service.update_session(db, row, row.revision, {**row.state, 'phase': 'question', 'question': {
        'id': 'q', 'text': 'Jaki projekt?', 'context': 'Projekt', 'topic': 'project', 'reason': 'CV',
    }})
    session = client.get(f"/ai/interviews/{row.id}").json()
    answer = {**version(session, 1), 'question_id': 'q', 'status': 'answered', 'answer': 'Candidate project'}
    answered = client.post(f"/ai/interviews/{row.id}/answers", json=answer).json()
    assert client.post(f"/ai/interviews/{row.id}/answers", json=answer).json()['revision'] == answered['revision']
    facts = answered['evidence_profile']['facts'] + answered['proposed_facts']
    session = confirm(client, answered, 1, facts)
    assert any(f['text'] == 'Candidate project' for f in session['evidence_profile']['facts'])
    kept = [f for f in session['evidence_profile']['facts'] if f['path'] == '/name']
    saved = confirm(client, session, 2, kept)
    assert saved['evidence_profile']['facts'] == kept
    assert client.post(f"/ai/interviews/{row.id}/confirm", json={**version(session, 2), 'facts': facts}).status_code == 409
    assert client.post(f"/ai/interviews/{row.id}/confirm", json={**version(saved, 3), 'evidence_scope': 'profile', 'facts': facts}).status_code == 409
    old_client = version(saved, 3); old_client.pop('evidence_scope')
    assert client.post(f"/ai/interviews/{row.id}/confirm", json={**old_client, 'facts': facts}).status_code == 409
    assert service.base_cv(service.interview_profile(db, service.owned_session(db, user.id, row.id))) == {'name': 'Anna Nowak'}
    assert service.profile_payload(db, user.id)['revision'] == 0
    exported = build_account_export(db, user=user)
    assert any(item['state'].get('session_profile', {}).get('facts') == kept for item in exported['interviews'])


def test_legacy_conversation_preserved_but_cannot_mix_sources(environment):
    client, db, user, _ = environment
    session = confirm(client, create(client))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state); state.pop('evidence_scope'); state.pop('session_profile')
    service.update_session(db, row, row.revision, state)
    resumed = client.get(f"/ai/interviews/{row.id}").json()
    assert resumed['requires_source_choice'] is True
    owner = service.profile_payload(db, user.id)
    with patch.object(service, '_gpt') as provider:
        for action, extra in [('next', {}), ('confirm', {'facts': []}), ('preview', {'template_id': 'linden'}), ('document', {})]:
            assert client.post(f"/ai/interviews/{row.id}/{action}", json={**version(resumed, 1), **extra}).status_code == 409
        provider.assert_not_called()
    assert service.profile_payload(db, user.id) == owner
    assert db.get(InterviewSession, row.id).state['answers'] == state['answers']


def test_source_refresh_cannot_switch_candidate(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, include_profile=False))
    response = client.post(f"/ai/interviews/{session['id']}/source", json={**version(session, 1), 'cv_data': {'name': 'Other Person'}})
    assert response.status_code == 409
    assert client.get(f"/ai/interviews/{session['id']}").json()['evidence_profile'] == session['evidence_profile']


def test_import_defaults_to_isolation_and_enforces_owner(environment):
    from app.crud.cv_import_snapshots import create_snapshot
    client, db, user, other = environment
    owner = service.put_profile(db, user.id, 0, service.source_facts({'name': 'Owner'}, 'manual'))
    imported = create_snapshot(db, owner_id=user.id, filename='Candidate.pdf', size_bytes=123)
    imported.status = 'succeeded'; imported.cv_data = {'name': 'Imported Candidate'}; db.commit()
    body = {'mode': 'create', 'source_import_id': imported.id}
    result = client.post('/ai/interviews', headers={'Idempotency-Key': 'import'}, json=body)
    assert result.status_code == 201
    session = confirm(client, result.json())
    assert service.base_cv(session['evidence_profile']) == {'name': 'Imported Candidate'}
    assert service.profile_payload(db, user.id) == owner
    assert client.post('/ai/interviews', headers={'Idempotency-Key': 'import'}, json={**body, 'include_profile': True}).status_code == 409
    app.dependency_overrides[get_current_user] = lambda: other
    set_user_plan(db, other.id, 'pro')
    assert client.post('/ai/interviews', headers={'Idempotency-Key': 'foreign-import'}, json=body).status_code == 404


def test_profile_join_requires_opt_in_and_writes_account_profile(environment):
    client, db, user, _ = environment
    owner = service.put_profile(db, user.id, 0, service.source_facts({'name': 'Anna Nowak', 'skills': ['SQL']}, 'manual'))
    result = client.post('/ai/interviews', headers={'Idempotency-Key': 'join'}, json={
        'mode': 'create', 'include_profile': True, 'cv_data': {'name': 'Anna Nowak', 'title': 'Developer'},
    })
    assert result.status_code == 201
    session = result.json()
    assert session['evidence_scope'] == 'profile'
    session = confirm(client, session, 1, owner['facts'] + session['proposed_facts'])
    saved = service.profile_payload(db, user.id)
    assert saved['revision'] == 2 and service.base_cv(saved)['title'] == 'Developer'
    assert service.base_cv(saved)['skills'] == ['SQL']


@pytest.mark.parametrize('isolated', [False, True])
def test_clarification_replaces_existing_fact_only_after_confirmation(environment, isolated):
    client, db, user, _ = environment
    session = confirm(client, create(client, include_profile=not isolated, cv_data={
        'name': 'Anna', 'experience': [{'title': 'Analyst', 'company': 'Example', 'bullets': ['Research SoF i SoW.']}],
    }))
    profile = session['evidence_profile'] if isolated else client.get('/career-profile').json()
    original = next(f for f in profile['facts'] if f['path'] == '/experience/0/bullets/0')
    draft = {'fields': [{'path': original['path'], 'value': 'Codzienny research SoF i SoW.', 'evidence_refs': [original['id']]}], 'remaining_gaps': []}
    verification = {'unsupported_paths': [original['path']], 'reasons': [], 'clarifications': [{'path': original['path'], 'question': 'Jak często wykonywałaś research?'}]}
    with patch.object(service, '_gpt', side_effect=[(draft, {'cost_pln_estimate': .01}), (verification, {'cost_pln_estimate': .01})]):
        result = client.post(f"/ai/interviews/{session['id']}/preview", json={**version(session, 1), 'template_id': 'linden'})
    assert result.status_code == 200, result.text
    asking = client.post(f"/ai/interviews/{session['id']}/clarify", json=version(result.json(), 1)).json()
    assert asking['question']['target_fact_ids'] == [original['id']]
    payload = {**version(asking, 1), 'question_id': asking['question']['id'], 'answer': 'Research SoF i SoW w wybranych sprawach.', 'status': 'answered'}
    with patch.object(service, '_gpt') as provider:
        saved = client.post(f"/ai/interviews/{session['id']}/answers", json=payload)
        assert saved.status_code == 200, saved.text
        assert client.post(f"/ai/interviews/{session['id']}/answers", json=payload).json() == saved.json()
        provider.assert_not_called()
    proposal = saved.json()['proposed_facts'][0]
    assert proposal['id'] == original['id'] and proposal['path'] == original['path']
    row = db.get(InterviewSession, session['id'], populate_existing=True)
    assert service.interview_profile(db, row)['facts'] == profile['facts']
    merged = [proposal if f['id'] == proposal['id'] else f for f in profile['facts']]
    final = confirm(client, saved.json(), 1, merged)
    row = db.get(InterviewSession, final['id'], populate_existing=True)
    assert service.base_cv(service.interview_profile(db, row))['experience'][0]['bullets'] == [payload['answer']]
