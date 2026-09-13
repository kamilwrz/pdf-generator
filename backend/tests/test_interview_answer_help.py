"""Answer assistance is scoped, checked, resumable and explicitly confirmed."""
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from app.main import app
from app.core.security import get_current_user
from app.models.models import InterviewSession, AiCreditReservation, Pdf
from app.services import interview_service as service
from app.services.ai_assistant_service import AIServiceError
from app.services.entitlements import set_user_plan
from test_interviews import environment, create, confirm, version  # noqa: F401


def prepared(client, db, *, include_profile=False, **question_updates):
    session = confirm(client, create(client, include_profile=include_profile, cv_data={
        'name': 'Synthetic Candidate', 'experience': [
            {'title': 'Analityk', 'company': 'Sample', 'bullets': ['Porównywałam raporty z dokumentami źródłowymi.']},
            {'title': 'Other role', 'company': 'Other', 'bullets': ['OTHER_ROLE_PRIVATE_TOOL']}],
        'education': [{'school': 'UNRELATED_SCHOOL'}],
    }))
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state.update(phase='question', question={
        'id': 'help-question', 'entry_id': '/experience/0', 'topic': 'process', 'angle': 'approach',
        'text': 'Jak wyglądało sprawdzanie raportu?', 'context': 'Analityk · Sample', 'reason': 'Przebieg zadania',
        **question_updates}, offer={'description': 'OFFER_ONLY_TECHNOLOGY'})
    service.update_session(db, row, row.revision, state)
    return client.get(f"/ai/interviews/{row.id}").json()


def help_request(client, session, **updates):
    return client.post(f"/ai/interviews/{session['id']}/answer-help", json={
        **version(session, session['profile_revision']), 'question_id': session['question']['id'],
        'draft': '', **updates})


def proposals(session, *, options=False):
    if options:
        return {'mode': 'options', 'draft': '', 'evidence_refs': [], 'options': [
            {'id': 'collect', 'text': 'Zbieranie dokumentów do sprawdzenia'},
            {'id': 'compare', 'text': 'Porównywanie informacji w dokumentach'},
            {'id': 'summarise', 'text': 'Przygotowywanie zestawienia rozbieżności'}]}
    facts = session.get('evidence_profile', {}).get('facts', [])
    ref = next(fact['id'] for fact in facts if fact['path'] == '/experience/0/bullets/0')
    return {'mode': 'draft', 'draft': 'Porównywałam raporty z dokumentami źródłowymi.',
            'options': [], 'evidence_refs': [ref]}


def provider_results(proposal, **verification):
    return [(proposal, {'cost_pln_estimate': .03}),
            ({'draft_supported': True, 'rejected_option_ids': [], **verification}, {'cost_pln_estimate': .02})]


def submit(client, session, **updates):
    return client.post(f"/ai/interviews/{session['id']}/answers", json={
        **version(session, session['profile_revision']), 'question_id': session['question']['id'],
        'answer': 'Sprawdzałam raporty.', 'status': 'answered', **updates})


def test_help_has_no_evidence_or_question_progress_side_effect_and_replays_free(environment):
    client, db, user, _ = environment
    service.put_profile(db, user.id, 0, [{'id': 'other-person', 'text': 'OTHER_PERSON_PRIVATE_FACT'}])
    session = prepared(client, db)
    before = deepcopy(db.get(InterviewSession, session['id']).state)
    account = service.profile_payload(db, user.id)
    assert session['question']['answer_help_available'] is True
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        response = help_request(client, session)
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved['answer_help']['based_on_draft'] == ''
        assert saved['answer_help']['mode'] == 'draft'
        assert saved['profile_revision'] == session['profile_revision']
        current = db.get(InterviewSession, session['id'], populate_existing=True).state
        assert {key: value for key, value in current.items() if key not in {'answer_help', 'usage'}} == {
            key: value for key, value in before.items() if key != 'usage'}
        assert service.profile_payload(db, user.id) == account
        bodies = [json.loads(call.args[1]) for call in provider.call_args_list]
        for body in bodies:
            payload = json.dumps(body)
            for private in ['OTHER_ROLE_PRIVATE_TOOL', 'UNRELATED_SCHOOL', 'OFFER_ONLY_TECHNOLOGY', 'OTHER_PERSON_PRIVATE_FACT']:
                assert private not in payload
        assert help_request(client, saved).json() == saved
        assert help_request(client, session).json() == saved
        assert provider.call_count == 2
    credits = client.get(f"/ai/interviews/{session['id']}/credits").json()
    assert credits['credits_charged'] > 0
    assert [item['operation'] for item in credits['requests']] == ['answer-help']
    assert [stage['operation'] for stage in credits['requests'][0]['stages']] == ['answer-help', 'answer-help-verify']
    assert db.query(AiCreditReservation).count() == 2


def test_confirmation_records_provenance_once_but_does_not_change_fact_source(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        saved = help_request(client, session).json()
        for flags in ({'suggestion_id': saved['answer_help']['id']}, {'confirm_suggestion': True},
                      {'suggestion_id': 'wrong', 'confirm_suggestion': True}):
            assert submit(client, saved, **flags).status_code == 422
        flags = {'suggestion_id': saved['answer_help']['id'], 'confirm_suggestion': True}
        result = submit(client, saved, **flags)
        assert result.status_code == 200, result.text
        answer = result.json()['answers'][-1]
        assert answer['ai_assistance'] == {
            'suggestion_id': flags['suggestion_id'], 'mode': 'draft', 'confirmed': True}
        fact = result.json()['evidence_profile']['facts'][-1]
        assert fact['text'] == 'Sprawdzałam raporty.'
        assert fact['source'] == f"interview:{session['id']}"
        assert result.json()['answer_help'] is None
        assert submit(client, saved, **flags).json() == result.json()
        assert submit(client, saved, suggestion_id='wrong', confirm_suggestion=True).status_code == 422
        assert provider.call_count == 2


@pytest.mark.parametrize('status', ['unknown', 'skipped', 'no_experience'])
def test_alternative_answers_do_not_accept_help_or_charge_again(environment, status):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        saved = help_request(client, session).json()
        assert submit(client, saved, answer='', status=status,
                      suggestion_id=saved['answer_help']['id'], confirm_suggestion=True).status_code == 422
        result = submit(client, saved, answer='', status=status)
        assert result.status_code == 200
        assert 'ai_assistance' not in result.json()['answers'][-1]
        assert result.json()['answer_help'] is None
        assert provider.call_count == 2


@pytest.mark.parametrize('question', [
    {'clarification': True}, {'angle': 'proficiency'}, {'angle': 'outcome'}, {'angle': 'contribution'},
    {'text': 'Ile raportów sprawdzano?'}, {'text': 'When did you start this job?'},
    {'entry_id': 'general:experience'}, {'entry_id': '/languages/0'}, {'entry_id': None},
])
def test_exact_or_unsupported_questions_never_call_ai(environment, question):
    client, db, _, _ = environment
    session = prepared(client, db, **question)
    assert session['question']['answer_help_available'] is False
    with patch.object(service, '_gpt') as provider:
        assert help_request(client, session).status_code == 422
        provider.assert_not_called()


@pytest.mark.parametrize('damage', ['number', 'reference', 'duplicate', 'mixed_mode', 'placeholder'])
def test_malformed_proposals_stop_before_independent_verification(environment, damage):
    client, db, _, _ = environment
    session = prepared(client, db)
    proposal = proposals(session)
    if damage == 'number': proposal['draft'] += ' Wynik wzrósł o 80%.'
    elif damage == 'reference': proposal['evidence_refs'] = ['another-role-fact']
    elif damage == 'duplicate': proposal['evidence_refs'] *= 2
    elif damage == 'mixed_mode': proposal['options'] = [{'id': 'x', 'text': 'Some activity'}]
    else: proposal['draft'] += ' [uzupełnij]'
    with patch.object(service, '_gpt', return_value=(proposal, {'cost_pln_estimate': .03})) as provider:
        response = help_request(client, session)
        assert response.status_code >= 400, response.text
        assert provider.call_count == 1
    current = client.get(f"/ai/interviews/{session['id']}").json()
    assert current['answer_help'] is None
    assert current['answers'] == session['answers']
    assert current['evidence_profile'] == session['evidence_profile']


@pytest.mark.parametrize('options,rejected,expected', [(False, [], 'guidance'), (True, ['compare'], 'options'),
                                                     (True, ['collect', 'compare', 'summarise'], 'guidance')])
def test_semantic_rejection_returns_safe_subset_or_guidance_without_regeneration(environment, options, rejected, expected):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=provider_results(
            proposals(session, options=options), draft_supported=False, rejected_option_ids=rejected)) as provider:
        response = help_request(client, session)
        assert response.status_code == 200, response.text
        help_ = response.json()['answer_help']
        assert help_['mode'] == expected
        assert not help_['draft']
        assert all(option['id'] not in rejected for option in help_['options'])
        assert provider.call_count == 2


def test_verification_failure_reuses_generated_draft_on_explicit_retry(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    proposal = proposals(session)
    failure = AIServiceError('temporary', reservation_outcome='release', user_message='Retry')
    with patch.object(service, '_gpt', side_effect=[(proposal, {'cost_pln_estimate': .03}), failure,
            ({'draft_supported': True, 'rejected_option_ids': []}, {'cost_pln_estimate': .02})]) as provider:
        assert help_request(client, session).status_code >= 400
        resumed = client.get(f"/ai/interviews/{session['id']}").json()
        assert resumed['answer_help'] is None
        result = help_request(client, resumed)
        assert result.status_code == 200, result.text
        assert provider.call_count == 3
        assert json.loads(provider.call_args_list[2].args[1]).get('proposal') == proposal


def test_stale_or_foreign_requests_fail_before_charging_and_midflight_changes_do_not_publish(environment):
    client, db, user, other = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt') as provider:
        for change in ({'revision': session['revision'] + 1}, {'profile_revision': 99},
                       {'question_id': 'old-question'}, {'evidence_scope': 'profile'}):
            assert help_request(client, session, **change).status_code >= 400
        app.dependency_overrides[get_current_user] = lambda: other
        assert help_request(client, session).status_code == 404
        app.dependency_overrides[get_current_user] = lambda: user
        provider.assert_not_called()
    proposal = proposals(session)
    def change_question(*args, **kwargs):
        row = db.get(InterviewSession, session['id'], populate_existing=True)
        state = deepcopy(row.state)
        state['question']['id'] = 'new-question'
        service.update_session(db, row, row.revision, state)
        return proposal, {'cost_pln_estimate': .03}
    with patch.object(service, '_gpt', side_effect=change_question) as provider:
        assert help_request(client, session).status_code == 409
        assert provider.call_count == 1
    assert client.get(f"/ai/interviews/{session['id']}").json()['answer_help'] is None


def test_free_accounts_keep_cached_help_but_cannot_start_paid_help(environment):
    client, db, user, _ = environment
    session = prepared(client, db)
    set_user_plan(db, user.id, 'free')
    with patch.object(service, '_gpt') as provider:
        assert help_request(client, session).status_code == 403
        provider.assert_not_called()
    set_user_plan(db, user.id, 'pro')
    resumed = client.get(f"/ai/interviews/{session['id']}").json()
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        saved = help_request(client, resumed).json()
        set_user_plan(db, user.id, 'free')
        assert help_request(client, saved).json() == saved
        assert provider.call_count == 2


def test_changed_draft_creates_new_help_but_unbound_note_never_enters_role_context(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state['session_profile']['facts'].append({'id': 'legacy-note', 'text': 'UNBOUND_PRIVATE_TOOL',
        'context': 'Analityk · Sample', 'kind': 'fact', 'path': '', 'source': 'manual'})
    row.state = state
    db.commit()
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session)) * 2) as provider:
        saved = help_request(client, session, draft='Sprawdzanie raportów').json()
        assert saved['answer_help']['based_on_draft'] == 'Sprawdzanie raportów'
        assert help_request(client, session, draft='A changed old request').status_code == 409
        newer = help_request(client, saved, draft='Porównywanie raportów').json()
        assert newer['answer_help']['id'] != saved['answer_help']['id']
        assert all('UNBOUND_PRIVATE_TOOL' not in call.args[1] for call in provider.call_args_list)
        assert provider.call_count == 4


def test_confirmed_help_can_write_only_the_explicitly_selected_account_profile(environment):
    client, db, user, _ = environment
    session = prepared(client, db, include_profile=True)
    profile = service.profile_payload(db, user.id)
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session, options=True))) as provider:
        saved = help_request(client, session).json()
        assert service.profile_payload(db, user.id) == profile
        result = submit(client, saved, suggestion_id=saved['answer_help']['id'], confirm_suggestion=True)
        assert result.status_code == 200, result.text
        updated = service.profile_payload(db, user.id)
        assert updated['revision'] == profile['revision'] + 1
        assert updated['facts'][-1]['text'] == 'Sprawdzałam raporty.'
        assert updated['facts'][-1]['source'] == f"interview:{session['id']}"
        assert provider.call_count == 2


@pytest.mark.parametrize('status,allowed', [('partial', True), ('unknown', False), ('gap', False)])
def test_tailoring_requires_partial_evidence_and_never_sends_offer_as_evidence(environment, status, allowed):
    client, db, _, _ = environment
    session = prepared(client, db)
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    ref = proposals(session)['evidence_refs'][0]
    state.update(mode='tailor', job_analysis_ready=True, requirements=[{
        'id': 'requirement:reports', 'text': 'OFFER_REQUIREMENT', 'status': status, 'evidence_refs': [ref]}])
    state['question']['entry_id'] = 'requirement:reports'
    row.state = state
    db.commit()
    session = client.get(f"/ai/interviews/{session['id']}").json()
    assert session['question']['answer_help_available'] is allowed
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        result = help_request(client, session)
        assert result.status_code == (200 if allowed else 422), result.text
        for call in provider.call_args_list:
            assert 'OFFER_REQUIREMENT' not in call.args[1]
            assert 'OFFER_ONLY_TECHNOLOGY' not in call.args[1]
            assert 'OTHER_ROLE_PRIVATE_TOOL' not in call.args[1]
        assert provider.call_count == (2 if allowed else 0)


def test_changed_source_blocks_cached_help_and_assisted_submission(environment):
    client, db, user, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))):
        saved = help_request(client, session).json()
    doc = Pdf(owner_id=user.id, title='Synthetic', cv_data={'name': 'Synthetic Candidate'}, revision=2)
    db.add(doc)
    db.flush()
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state.update(source_document_id=doc.id, source_revision=1)
    row.state = state
    db.commit()
    with patch.object(service, '_gpt') as provider:
        assert help_request(client, saved).status_code == 409
        assert submit(client, saved, suggestion_id=saved['answer_help']['id'], confirm_suggestion=True).status_code == 409
        provider.assert_not_called()


def test_guidance_uses_local_text_without_an_empty_verification_charge(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    proposal = {'mode': 'guidance', 'draft': '', 'options': [], 'evidence_refs': []}
    with patch.object(service, '_gpt', return_value=(proposal, {'cost_pln_estimate': .03})) as provider:
        response = help_request(client, session)
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved['answer_help']['mode'] == 'guidance'
        assert 'answer_help_attempt' not in saved
        assert 'fingerprint' not in saved['answer_help']
        assert help_request(client, saved).json() == saved
        assert provider.call_count == 1


def test_resuming_in_another_locale_translates_guidance_without_touching_the_draft(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=provider_results(proposals(session))) as provider:
        saved = help_request(client, session).json()
        resumed = client.get(f"/ai/interviews/{session['id']}", headers={'Accept-Language': 'en'}).json()
        assert resumed['answer_help']['guidance'].startswith('Review and edit')
        assert saved['answer_help']['guidance'].startswith('Sprawdź i popraw')
        assert resumed['answer_help']['draft'] == saved['answer_help']['draft']
        assert resumed['evidence_profile'] == saved['evidence_profile']
        assert resumed['revision'] == saved['revision']
        provider.assert_called()
        assert provider.call_count == 2
