"""Synthetic editorial fixtures test boundaries and billing, not live model quality."""
from copy import deepcopy
import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api.routes import interviews
from app.models.models import AiCreditReservation, InterviewSession
from app.schemas.interview_schema import Discovery, EditorialReview, provider_schema
from app.services import interview_service as service
from app.services.interview_editorial import apply_editorial_review, prepare_editorial_draft
from test_interviews import environment, create, confirm, version, editorial

USAGE = {'cost_pln_estimate': .01}
VERIFIED = {'unsupported_paths': [], 'reasons': []}
RAW = 'pomagalem zespołowi testować 4 scenariusze, raport szedł do opiekuna'
PROFESSIONAL = 'Wspierałem zespół w testowaniu 4 scenariuszy i przekazywałem raport opiekunowi.'


def setup_answer(client, db, **options):
    """Submit an ordinary colloquial answer through the real free persistence path."""
    session = confirm(client, create(client, **options))
    row = db.get(InterviewSession, session['id'])
    row.state = {**row.state, 'phase': 'question', 'question': {
        'id': 'q', 'topic': 'testy', 'text': 'Jaki był Twój wkład w testowanie?',
        'reason': 'Opiszemy zakres pracy.', 'context': 'Projekt testowy',
    }}
    db.commit()
    response = client.post(f"/ai/interviews/{row.id}/answers", json={
        **version(session, 1), 'question_id': 'q', 'answer': RAW, 'status': 'answered',
    })
    assert response.status_code == 200, response.text
    return response.json()


def draft_for_answer():
    return {'fields': [{'path': '/summary', 'value': RAW, 'evidence_refs': ['answer-q']}], 'remaining_gaps': []}


def generate(client, session, profile_revision=2):
    return client.post(f"/ai/interviews/{session['id']}/preview", json={
        **version(session, profile_revision), 'template_id': 'linden',
    })


@pytest.mark.parametrize('mode', ['create', 'enrich', 'tailor'])
@pytest.mark.parametrize('isolated', [False, True])
def test_pipeline_checks_edited_text_against_unchanged_raw_answers(environment, mode, isolated):
    client, db, user, _ = environment
    session = setup_answer(client, db, mode=mode, include_profile=not isolated, job_description='Tester' if mode == 'tailor' else '')
    before = deepcopy(service.interview_profile(db, db.get(InterviewSession, session['id'])))
    draft = draft_for_answer()
    style = {'fields': [{'path': '/summary', 'value': PROFESSIONAL}]}
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (style, USAGE), (VERIFIED, USAGE)]) as provider:
        result = generate(client, session)
    assert result.status_code == 200, result.text
    calls = provider.call_args_list
    assert [c.kwargs['response_schema']['name'] for c in calls] == ['draft', 'editorialreview', 'verification']
    assert [c.kwargs['action'] for c in calls] == ['improve', 'language', 'improve']
    checked = json.loads(calls[-1].args[1])
    assert checked['draft'] == [{**draft['fields'][0], 'value': PROFESSIONAL}]
    assert next(f for f in checked['profile'] if f['id'] == 'answer-q')['text'] == RAW
    saved = result.json()
    assert saved['phase'] == 'preview'
    assert saved['preview']['cv_data']['summary'] == PROFESSIONAL
    assert any(PROFESSIONAL in str(element) for element in saved['preview']['elements'])
    assert saved['preview']['changes'][0]['evidence_refs'] == ['answer-q']
    assert saved['preview']['pipeline_version'] == 2
    assert saved['usage']['cost_pln_estimate'] == pytest.approx(.03)
    assert saved['answers'] == session['answers']
    assert 'generation_attempt' not in saved
    assert service.interview_profile(db, db.get(InterviewSession, session['id'], populate_existing=True)) == before
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 3


@pytest.mark.parametrize('fields', [
    [],
    [{'path': '/name', 'value': 'Inna osoba'}],
    [{'path': '/summary', 'value': PROFESSIONAL}] * 2,
    [{'path': '/summary', 'value': 'Wspierałem zespół w testowaniu 40 scenariuszy.'}],
    [{'path': '/summary', 'value': 'Wspierałem zespół w testowaniu 4 scenariuszy w Kubernetes.'}],
    [{'path': '/summary', 'value': 'Wspierałem zespół w testowaniu 4 scenariuszy [wynik].'}],
    [{'path': '/summary', 'value': ' '}],
])
def test_invalid_editorial_response_is_atomic_and_retryable(environment, fields):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    with patch.object(service, '_gpt', side_effect=[(draft_for_answer(), USAGE), ({'fields': fields}, USAGE)]) as provider:
        result = generate(client, session)
    assert result.status_code == 500
    assert provider.call_count == 2  # Invalid style output never reaches verification.
    resumed = client.get(f"/ai/interviews/{session['id']}").json()
    assert not resumed.get('preview') and resumed['answers'] == session['answers']
    with patch.object(service, '_gpt', side_effect=[({'fields': [{'path': '/summary', 'value': PROFESSIONAL}]}, USAGE), (VERIFIED, USAGE)]) as provider:
        retry = generate(client, resumed)
    assert retry.status_code == 200, retry.text
    assert provider.call_count == 2  # The valid draft is not billed/generated again.
    assert retry.json()['preview']['recovered_previous_attempt'] is False


@pytest.mark.parametrize('failed_stage', [0, 1, 2])
def test_failure_replays_only_completed_stages_and_does_not_charge_reads(environment, failed_stage):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    outputs = [(draft_for_answer(), USAGE), (editorial(draft_for_answer()), USAGE), (VERIFIED, USAGE)]
    with patch.object(service, '_gpt', side_effect=outputs[:failed_stage] + [service.AIServiceError('Unavailable', reservation_outcome='release')]):
        result = generate(client, session)
    assert result.status_code == 500
    with patch.object(service, '_gpt') as provider:
        resumed = client.get(f"/ai/interviews/{session['id']}").json()
        provider.assert_not_called()
    with patch.object(service, '_gpt', side_effect=outputs[failed_stage:]) as provider:
        assert generate(client, session).status_code == 409
        result = generate(client, resumed)
    assert result.status_code == 200, result.text
    assert provider.call_count == 3 - failed_stage
    assert db.query(AiCreditReservation).filter_by(status='settled').count() == 3
    assert db.query(AiCreditReservation).filter_by(status='released').count() == 1


@pytest.mark.parametrize('changed_profile', [False, True])
def test_assembly_recovery_requires_complete_current_pipeline(environment, changed_profile):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    outputs = [(draft_for_answer(), USAGE), (editorial(draft_for_answer()), USAGE), (VERIFIED, USAGE)]
    with patch.object(service, '_gpt', side_effect=outputs), patch.object(interviews, 'generate_resume', side_effect=HTTPException(422, {'message': 'Sprawdź szablon.'})):
        result = generate(client, session)
    assert result.status_code == 200 and result.json()['phase'] == 'review'
    resumed = result.json()
    if changed_profile:
        profile = client.get('/career-profile').json()
        assert client.put('/career-profile', json={'revision': 2, 'facts': profile['facts']}).status_code == 200
    with patch.object(service, '_gpt', side_effect=outputs) as provider:
        result = generate(client, resumed, 3 if changed_profile else 2)
    assert result.status_code == 200, result.text
    assert provider.call_count == (3 if changed_profile else 0)
    assert result.json()['preview']['recovered_previous_attempt'] is not changed_profile


def test_source_edit_during_editorial_cannot_publish_stale_output(environment):
    client, db, user, _ = environment
    session = setup_answer(client, db)
    def provider(_system, body, **kwargs):
        name = kwargs['response_schema']['name']
        if name == 'draft':
            return draft_for_answer(), USAGE
        if name == 'editorialreview':
            profile = service.profile_payload(db, user.id)
            service.put_profile(db, user.id, profile['revision'], profile['facts'])
            return editorial(draft_for_answer()), USAGE
        return VERIFIED, USAGE
    with patch.object(service, '_gpt', side_effect=provider):
        result = generate(client, session)
    assert result.status_code == 409
    assert not client.get(f"/ai/interviews/{session['id']}").json().get('preview')


@pytest.mark.parametrize('unsafe', [
    'Kierowałem zespołem testującym 4 scenariusze i przekazywałem raport opiekunowi.',
    'Wdrożyłem komercyjnie system po testach 4 scenariuszy.',
    'Samodzielnie przetestowałem 4 scenariusze i zatwierdziłem raport.',
])
def test_semantic_changes_must_be_rejected_by_independent_verifier(environment, unsafe):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    style = {'fields': [{'path': '/summary', 'value': unsafe}]}
    rejected = {'unsupported_paths': ['/summary'], 'reasons': ['Zmiana odpowiedzialności.']}
    with patch.object(service, '_gpt', side_effect=[(draft_for_answer(), USAGE), (style, USAGE), (rejected, USAGE)]):
        result = generate(client, session)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['phase'] == 'clarification' and not saved['preview']['changes']
    assert unsafe not in str(saved['preview']['cv_data'])
    assert saved['pending_clarifications'][0]['suggested_text'] == unsafe


def test_editorial_keeps_order_citations_and_covers_omitted_source_prose():
    profile = {'facts': [{'id': 'old', 'kind': 'fact', 'path': '/experience/0/bullets/0', 'text': 'Nie kierowałem zespołem.'}]}
    original = {'fields': [{'path': '/summary', 'value': 'Robię raporty.', 'evidence_refs': ['a']},
                           {'path': '/name', 'value': 'Anna', 'evidence_refs': ['name']}], 'remaining_gaps': ['Rezultat']}
    draft = prepare_editorial_draft(original, profile)
    review = {'fields': [{'path': '/experience/0/bullets/0', 'value': 'Nie kierowałem zespołem.'},
                         {'path': '/summary', 'value': 'Przygotowuję raporty.'}]}
    result = apply_editorial_review(draft, review)
    assert [f['path'] for f in result['fields']] == [f['path'] for f in draft['fields']]
    assert [f['evidence_refs'] for f in result['fields']] == [['a'], ['name'], ['old']]
    assert result['fields'][1] == original['fields'][1]
    assert result['remaining_gaps'] == original['remaining_gaps']
    assert original['fields'][0]['value'] == 'Robię raporty.'
    with pytest.raises(ValueError):
        EditorialReview.model_validate({'fields': [{'path': '/summary', 'value': 'Nowe', 'evidence_refs': ['invented']}]})


def answer_history(status='answered', follow_up_to=None, clarification=False):
    return [{'question': {'id': 'parent', 'topic': 'projekt', 'text': 'Jaki był Twój wkład?',
                          'follow_up_to': follow_up_to, 'clarification': clarification},
             'status': status, 'answer': 'pomagałem przy projekcie' if status == 'answered' else ''}]


@pytest.mark.parametrize('status', ['answered', 'no_experience', 'unknown', 'skipped'])
def test_follow_up_only_targets_an_answered_original(status):
    followup = {'topic': 'projekt', 'text': 'Jakie zadanie wykonywałeś osobiście?', 'follow_up_to': 'parent'}
    assert service.is_fresh_question(followup, answer_history(status)) is (status == 'answered')
    assert not service.is_fresh_question(followup, answer_history(status, 'earlier'))
    assert not service.is_fresh_question(followup, answer_history(status, clarification=True))
    assert not service.is_fresh_question({**followup, 'follow_up_to': 'missing'}, answer_history(status))
    assert not service.is_fresh_question({**followup, 'text': 'Jaki był Twój wkład?'}, answer_history(status))
    assert not service.is_fresh_question({**followup, 'topic': 'other'}, answer_history(status))
    history = answer_history(status) + [{'question': {**followup, 'id': 'child'}, 'status': 'skipped', 'answer': ''}]
    assert not service.is_fresh_question(followup, history)
    assert not service.is_fresh_question({**followup, 'follow_up_to': None}, history)


def test_follow_up_consumes_remaining_budget_and_skip_does_not_create_fact(environment):
    client, db, user, _ = environment
    session = setup_answer(client, db)
    row = db.get(InterviewSession, session['id'])
    # Apply record discovery before explicitly narrowing this test's remaining
    # round; ordinary resumes must not silently extend an unchanged queue.
    from app.services.interview_discovery import update_discovery_budget
    state = deepcopy(row.state)
    update_discovery_budget(state, service.profile_payload(db, user.id))
    row.state = state
    row.state = {**row.state, 'question_limit': 2}
    db.commit()
    followup = {'topic': 'testy', 'text': 'Jakie zadanie wykonywałeś osobiście?', 'reason': 'Doprecyzujmy wkład.', 'context': 'Projekt', 'follow_up_to': 'q'}
    profile = service.profile_payload(db, user.id)
    with patch.object(service, '_gpt', return_value=({'questions': [followup], 'requirements': []}, USAGE)):
        result = client.post(f"/ai/interviews/{row.id}/next", json=version(session, 2))
    assert result.status_code == 200, result.text
    asking = result.json()
    assert asking['question']['follow_up_to'] == 'q'
    with patch.object(service, '_gpt') as provider:
        saved = client.post(f"/ai/interviews/{row.id}/answers", json={**version(asking, 2), 'question_id': asking['question']['id'], 'status': 'skipped'})
        assert saved.status_code == 200, saved.text
        finished = client.post(f"/ai/interviews/{row.id}/next", json=version(saved.json(), 2))
        provider.assert_not_called()
    assert finished.json()['phase'] == 'review' and len(finished.json()['answers']) == 2
    assert service.profile_payload(db, user.id) == profile


def test_provider_requires_nullable_follow_up_but_legacy_questions_still_parse():
    question = {'topic': 'x', 'text': 'Co zrobiłeś?', 'reason': 'Konkret.', 'context': ''}
    assert Discovery.model_validate({'questions': [question], 'requirements': []}).questions[0].follow_up_to is None
    schema = provider_schema(Discovery)['schema']['$defs']['Question']
    assert 'follow_up_to' in schema['required']


def test_editorial_can_normalize_tool_casing_without_inventing_tools():
    draft = {'fields': [{'path': '/summary', 'value': 'robię raporty w sql i power bi', 'evidence_refs': ['a']}], 'remaining_gaps': []}
    review = {'fields': [{'path': '/summary', 'value': 'Przygotowuję raporty w SQL i Power BI.'}]}
    assert apply_editorial_review(draft, review)['fields'][0]['value'] == review['fields'][0]['value']


def test_metric_cannot_disappear_into_an_unrelated_year():
    draft = {'fields': [{'path': '/summary', 'value': 'Testowałem 4 scenariusze w 2024.', 'evidence_refs': ['a']}], 'remaining_gaps': []}
    with pytest.raises(ValueError):
        apply_editorial_review(draft, {'fields': [{'path': '/summary', 'value': 'Testowałem scenariusze w 2024.'}]})


def test_pending_unknown_outcome_cannot_be_bypassed_by_session_revision(environment):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    with patch.object(service, '_gpt', side_effect=service.AIServiceError('Unknown outcome', reservation_outcome='unknown')):
        assert generate(client, session).status_code == 500
    row = db.get(InterviewSession, session['id'], populate_existing=True)
    service.update_session(db, row, row.revision, deepcopy(row.state))
    resumed = client.get(f"/ai/interviews/{session['id']}").json()
    with patch.object(service, '_gpt') as provider:
        retry = generate(client, resumed)
        provider.assert_not_called()
    assert retry.status_code == 409
    assert db.query(AiCreditReservation).filter_by(status='pending').count() == 1
