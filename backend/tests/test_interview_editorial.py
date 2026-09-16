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
from app.services import interview_editorial as editorial_service
from app.services.cv_editorial_policy import STYLE_REVIEW_POLICY
from app.services.interview_editorial import apply_editorial_review, prepare_editorial_draft
from app.services.job_matching_policy import TAILORED_DRAFT_POLICY, TAILORED_EDITORIAL_POLICY
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
    draft_context, style_context = [json.loads(call.args[1]) for call in calls[:2]]
    assert style_context['task'].count(STYLE_REVIEW_POLICY) == 1
    assert style_context['editable_paths'] == ['/summary']
    # Tailoring must reach both writing stages, while facts remain the only
    # candidate evidence supplied to the final independent verification.
    assert (TAILORED_DRAFT_POLICY in draft_context['task']) is (mode == 'tailor')
    assert (TAILORED_EDITORIAL_POLICY in style_context['task']) is (mode == 'tailor')
    if mode == 'tailor':
        assert draft_context['job_analysis'] == session['requirements']
        assert draft_context['interview_answers'] == session['answers']
    checked = json.loads(calls[-1].args[1])
    assert checked['draft'] == [{**draft['fields'][0], 'value': PROFESSIONAL}]
    assert next(f for f in checked['profile'] if f['id'] == 'answer-q')['text'] == RAW
    saved = result.json()
    assert saved['phase'] == 'preview'
    assert saved['preview']['cv_data']['summary'] == PROFESSIONAL
    assert any(PROFESSIONAL in str(element) for element in saved['preview']['elements'])
    assert saved['preview']['changes'][0]['evidence_refs'] == ['answer-q']
    assert saved['preview']['pipeline_version'] == 7
    assert saved['usage']['cost_pln_estimate'] == pytest.approx(.03)
    assert saved['answers'] == session['answers']
    assert 'generation_attempt' not in saved
    assert service.interview_profile(db, db.get(InterviewSession, session['id'], populate_existing=True)) == before
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 3


@pytest.mark.parametrize('fields', [
    [],
    [{'path': '/name', 'value': 'Inna osoba'}],
    [{'path': '/summary', 'value': PROFESSIONAL}] * 2,
    [{'path': '/summary', 'value': ''}],
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
    client, db, user, _ = environment
    session = setup_answer(client, db)
    outputs = [(draft_for_answer(), USAGE), (editorial(draft_for_answer()), USAGE), (VERIFIED, USAGE)]
    with patch.object(service, '_gpt', side_effect=outputs), patch.object(interviews, 'generate_resume', side_effect=HTTPException(422, {'message': 'Sprawdź szablon.'})):
        result = generate(client, session)
    assert result.status_code == 200 and result.json()['phase'] == 'review'
    resumed = result.json()
    if changed_profile:
        profile = client.get('/career-profile').json()
        # This test changes confirmed evidence directly; profile UI eligibility
        # is covered independently by test_interview_sources.
        service.put_profile(db, user.id, 2, profile['facts'])
    with patch.object(service, '_gpt', side_effect=outputs) as provider:
        result = generate(client, resumed, 3 if changed_profile else 2)
    assert result.status_code == 200, result.text
    assert provider.call_count == (3 if changed_profile else 0)
    assert result.json()['preview']['recovered_previous_attempt'] is not changed_profile


@pytest.mark.parametrize('previous_version', [2, 5, 6])
def test_upgraded_policy_does_not_replay_completed_older_generation_stages(environment, previous_version):
    """Unfinished older attempts restart under the complete language contract."""
    client, db, user, _ = environment
    session = setup_answer(client, db)
    outputs = [(draft_for_answer(), USAGE), (editorial(draft_for_answer()), USAGE), (VERIFIED, USAGE)]
    # Keep every paid stage cached by failing only deterministic assembly. This
    # recreates an old attempt identity without depending on obsolete prompts.
    with patch.object(editorial_service, 'PIPELINE_VERSION', previous_version), \
         patch.object(service, '_gpt', side_effect=outputs), \
         patch.object(interviews, 'generate_resume', side_effect=HTTPException(422, {'message': 'Sprawdź szablon.'})):
        legacy = generate(client, session)
    assert legacy.status_code == 200 and legacy.json()['phase'] == 'review'
    row = db.get(InterviewSession, session['id'], populate_existing=True)
    assert row.state['generation_attempt']['version'] == previous_version
    before = deepcopy(service.interview_profile(db, row))
    with patch.object(service, '_gpt', side_effect=outputs) as provider:
        upgraded = generate(client, legacy.json())
    assert upgraded.status_code == 200, upgraded.text
    assert provider.call_count == 3
    assert upgraded.json()['preview']['pipeline_version'] == 7
    assert upgraded.json()['preview']['recovered_previous_attempt'] is False
    assert upgraded.json()['answers'] == session['answers']
    assert service.interview_profile(db, db.get(InterviewSession, session['id'], populate_existing=True)) == before
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 6


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
    row.state = {**row.state, 'question_limit': 2, 'discovery_limit': 2}
    db.commit()
    # Ask about a concrete detail introduced by RAW. Repeating the already
    # answered ownership question now correctly triggers the diversity fallback.
    followup = {'topic': 'testy', 'text': 'Co obejmował raport przekazywany opiekunowi?', 'reason': 'Doprecyzujmy treść raportu.', 'context': 'Projekt', 'follow_up_to': 'q'}
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


@pytest.mark.parametrize('before,after', [
    ('Testowałem 4 scenariusze w 2024.', 'Testowałem scenariusze w 2024.'),
    ('Angielski C1', 'Angielski C2'),
    ('Testowałem wersję v2.', 'Testowałem wersję v3.'),
])
def test_editorial_preserves_metrics_levels_and_version_numbers(before, after):
    # Digits embedded in levels or versions are facts even without a word
    # boundary before them; a different year cannot replace a missing metric.
    draft = {'fields': [{'path': '/summary', 'value': before, 'evidence_refs': ['a']}], 'remaining_gaps': []}
    assert apply_editorial_review(draft, {'fields': [{'path': '/summary', 'value': after}]}) == draft


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


@pytest.mark.parametrize('mode', ['create', 'enrich', 'tailor'])
@pytest.mark.parametrize('replacement', [
    'Wspierałem zespół w testowaniu 40 scenariuszy.',
    'Wspierałem zespół w testowaniu 4 scenariuszy w Kubernetes.',
    'Wspierałem zespół w testowaniu 4 scenariuszy [wynik].',
    ' ',
])
def test_rejected_style_patch_keeps_draft_and_finishes_verification(environment, mode, replacement):
    """One unusable wording change must not discard the paid draft or raw answers."""
    client, db, user, _ = environment
    session = setup_answer(client, db, mode=mode, job_description='Tester' if mode == 'tailor' else '')
    draft = draft_for_answer()
    review = {'fields': [{'path': '/summary', 'value': replacement}]}
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (review, USAGE), (VERIFIED, USAGE)]) as provider:
        result = generate(client, session)
    assert result.status_code == 200, result.text
    checked = json.loads(provider.call_args_list[-1].args[1])
    assert checked['draft'] == draft['fields']
    saved = result.json()
    assert saved['phase'] == 'preview'
    assert saved['preview']['cv_data']['summary'] == RAW
    assert saved['answers'] == session['answers']
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 3


def test_editorial_fallback_preserves_valid_siblings_citations_and_inputs():
    draft = {'fields': [
        {'path': '/name', 'value': 'Anna Nowak', 'evidence_refs': ['name']},
        {'path': '/summary', 'value': 'Testowałam 4 scenariusze.', 'evidence_refs': ['a']},
        {'path': '/experience/0/bullets/0', 'value': 'robiłam raporty', 'evidence_refs': ['b']},
    ], 'remaining_gaps': ['Rezultat']}
    review = {'fields': [
        {'path': '/experience/0/bullets/0', 'value': 'Przygotowywałam raporty.'},
        {'path': '/summary', 'value': 'Testowałam 40 scenariuszy.'},
    ]}
    before_draft, before_review = deepcopy(draft), deepcopy(review)
    result = apply_editorial_review(draft, review)
    assert result['fields'][:2] == draft['fields'][:2]
    assert result['fields'][2] == {**draft['fields'][2], 'value': 'Przygotowywałam raporty.'}
    assert result['remaining_gaps'] == draft['remaining_gaps']
    assert (draft, review) == (before_draft, before_review)


def test_retained_draft_is_not_trusted_when_verifier_rejects_it(environment):
    client, db, _, _ = environment
    session = setup_answer(client, db)
    draft = draft_for_answer()
    draft['fields'][0]['value'] = 'Samodzielnie testowałem 4 scenariusze.'
    style = {'fields': [{'path': '/summary', 'value': 'Samodzielnie testowałem 40 scenariuszy.'}]}
    rejected = {'unsupported_paths': ['/summary'], 'reasons': ['Niepotwierdzona samodzielność.']}
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (style, USAGE), (rejected, USAGE)]) as provider:
        result = generate(client, session)
    assert result.status_code == 200, result.text
    assert json.loads(provider.call_args_list[-1].args[1])['draft'] == draft['fields']
    assert result.json()['phase'] == 'clarification'
    assert not result.json()['preview']['changes']
    assert 'Samodzielnie' not in str(result.json()['preview']['cv_data'])


def test_editorial_fallback_is_replayed_after_verification_failure(environment):
    client, db, user, _ = environment
    session = setup_answer(client, db)
    style = {'fields': [{'path': '/summary', 'value': 'Testowałem 40 scenariuszy.'}]}
    with patch.object(service, '_gpt', side_effect=[
        (draft_for_answer(), USAGE), (style, USAGE),
        service.AIServiceError('Unavailable', reservation_outcome='release'),
    ]):
        assert generate(client, session).status_code == 500
    resumed = client.get(f"/ai/interviews/{session['id']}").json()
    with patch.object(service, '_gpt', return_value=(VERIFIED, USAGE)) as provider:
        result = generate(client, resumed)
    assert result.status_code == 200, result.text
    assert provider.call_count == 1
    assert provider.call_args.kwargs['response_schema']['name'] == 'verification'
    assert json.loads(provider.call_args.args[1])['draft'] == draft_for_answer()['fields']
    assert result.json()['preview']['cv_data']['summary'] == RAW
    assert result.json()['answers'] == session['answers']
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 3


AML_PARTS = [
    'Ocena profilu działalności, struktury własnościowej i beneficjentów rzeczywistych.',
    'Analiza wyników screeningu sankcji i PEP.',
    'Przekazywanie spraw wymagających wyjaśnienia do przełożonego, bez podejmowania decyzji o eskalacji.',
]
AML_LONG = ' '.join(AML_PARTS)
AML_PATH = '/experience/0/bullets/0'


def aml_fixture(client, db):
    """Create source-bound AML evidence without promoting model output to facts."""
    session = confirm(client, create(client, cv_data={
        'name': 'Anna Nowak', 'experience': [{'title': 'Analityk AML', 'company': 'Bank',
            'bullets': [AML_LONG, 'Porządkowanie dokumentacji.']}],
    }))
    profile = service.interview_profile(db, db.get(InterviewSession, session['id']))
    draft = {'fields': [{'path': fact['path'], 'value': fact['text'], 'evidence_refs': [fact['id']]}
                        for fact in profile['facts'] if '/bullets/' in fact.get('path', '')], 'remaining_gaps': []}
    repair = editorial(draft)
    repair['fields'][0].update(value=AML_PARTS[0], additional_points=AML_PARTS[1:])
    issue = {'path': AML_PATH, 'quote': AML_LONG, 'reason': 'Trzy niezależne etapy w jednym punkcie.'}
    return session, profile, draft, repair, issue


def test_aml_readability_repair_is_bounded_verified_and_preserves_evidence(environment):
    client, db, user, _ = environment
    session, profile, draft, repair, issue = aml_fixture(client, db)
    snapshot = deepcopy(profile)
    outputs = [(draft, USAGE), (editorial(draft), USAGE),
               ({**VERIFIED, 'quality_issues': [issue]}, USAGE), (repair, USAGE), (VERIFIED, USAGE)]
    with patch.object(service, '_gpt', side_effect=outputs) as provider:
        result = generate(client, session, 1)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['preview']['cv_data']['experience'][0]['bullets'] == [AML_PARTS[0], 'Porządkowanie dokumentacji.', *AML_PARTS[1:]]
    checked = json.loads(provider.call_args_list[-1].args[1])
    assert checked['editorial_splits'][0]['paths'] == [AML_PATH, '/experience/0/bullets/2', '/experience/0/bullets/3']
    refs = draft['fields'][0]['evidence_refs']
    assert all(f['evidence_refs'] == refs for f in checked['draft'] if f['path'] in checked['editorial_splits'][0]['paths'])
    assert saved['usage']['cost_pln_estimate'] == pytest.approx(.05)
    assert service.interview_profile(db, db.get(InterviewSession, session['id'], populate_existing=True)) == snapshot
    receipt = client.get(f"/ai/interviews/{session['id']}/credits").json()
    assert len(receipt['requests']) == 1 and len(receipt['requests'][0]['stages']) == 5
    assert [stage['operation'] for stage in receipt['requests'][0]['stages']][-2:] == ['editorial-repair', 'verify-repair']
    assert db.query(AiCreditReservation).filter_by(user_id=user.id, status='settled').count() == 5


def test_quality_gate_stops_after_one_failed_repair_and_keeps_answers(environment):
    client, db, _, _ = environment
    session, _, draft, _, issue = aml_fixture(client, db)
    rejected = {**VERIFIED, 'quality_issues': [issue]}
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (editorial(draft), USAGE),
                      (rejected, USAGE), (editorial(draft), USAGE), (rejected, USAGE)]) as provider:
        result = generate(client, session, 1)
    assert result.status_code == 422, result.text
    assert provider.call_count == 5
    current = client.get(f"/ai/interviews/{session['id']}").json()
    assert current['preview'] is None and current['answers'] == session['answers']
    assert 'generation_attempt' not in current


def test_completed_quality_repair_replays_after_final_verification_failure(environment):
    client, db, _, _ = environment
    session, _, draft, repair, issue = aml_fixture(client, db)
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (editorial(draft), USAGE),
                      ({**VERIFIED, 'quality_issues': [issue]}, USAGE), (repair, USAGE),
                      service.AIServiceError('Unavailable', reservation_outcome='release')]):
        assert generate(client, session, 1).status_code == 500
    resumed = client.get(f"/ai/interviews/{session['id']}").json()
    with patch.object(service, '_gpt', return_value=(VERIFIED, USAGE)) as provider:
        result = generate(client, resumed, 1)
    assert result.status_code == 200, result.text
    assert provider.call_count == 1
    assert result.json()['usage']['cost_pln_estimate'] == pytest.approx(.05)


def test_split_rejection_restores_whole_original_without_partial_claims():
    from app.services.interview_recovery import assemble_reviewed_draft
    profile = {'facts': [
        {'id': 'name', 'kind': 'fact', 'path': '/name', 'text': 'Anna Nowak'},
        {'id': 'aml', 'kind': 'fact', 'path': AML_PATH, 'text': AML_LONG},
    ]}
    draft = {'fields': [{'path': AML_PATH, 'value': AML_LONG, 'evidence_refs': ['aml']}], 'remaining_gaps': []}
    review = {'fields': [{'path': AML_PATH, 'value': AML_PARTS[0], 'additional_points': AML_PARTS[1:]}]}
    split = apply_editorial_review(draft, review, profile)
    cv, changes, notes = assemble_reviewed_draft(split, {'unsupported_paths': ['/experience/0/bullets/1']}, profile, 'pl')
    assert cv['experience'][0]['bullets'] == [AML_LONG]
    assert changes == [] and len(notes) == 3
    assert draft['fields'][0]['value'] == AML_LONG


@pytest.mark.parametrize('path', ['/summary', '/education/0/description', '/custom_sections/0/items/0'])
def test_only_bullet_fields_can_split(path):
    draft = {'fields': [{'path': path, 'value': AML_LONG, 'evidence_refs': ['a']}], 'remaining_gaps': []}
    with pytest.raises(ValueError):
        apply_editorial_review(draft, {'fields': [{'path': path, 'value': AML_PARTS[0], 'additional_points': AML_PARTS[1:]}]})


def test_split_cannot_remove_metrics_or_split_literal_framing():
    draft = {'fields': [{'path': AML_PATH, 'value': 'Testy 4 scenariuszy. Raport dla opiekuna.', 'evidence_refs': ['a']}], 'remaining_gaps': []}
    unsafe = {'fields': [{'path': AML_PATH, 'value': 'Testy scenariuszy.', 'additional_points': ['Raport dla opiekuna.']}]}
    assert apply_editorial_review(draft, unsafe) == draft
    literal = {'fields': [{'path': AML_PATH, 'value': 'Testy 4 scenariuszy.', 'additional_points': ['Raport dla opiekuna.']}]}
    assert apply_editorial_review(draft, literal, {'facts': [{'id': 'a', 'kind': 'framing'}]}) == draft


def test_audit_and_generation_share_readability_without_blanket_length_rules():
    from app.services.cv_audit import CV_AUDIT_POLICY
    from app.services.cv_editorial_policy import CV_READABILITY_POLICY
    assert CV_READABILITY_POLICY in CV_AUDIT_POLICY
    assert CV_READABILITY_POLICY in editorial_service.EDITORIAL_TASK
    assert CV_READABILITY_POLICY in editorial_service.QUALITY_TASK
    assert 'Do not impose a word count' in CV_READABILITY_POLICY


def test_quality_finding_must_quote_its_actual_field():
    with pytest.raises(ValueError):
        editorial_service.validate_quality_issues(draft_for_answer(),
            {'quality_issues': [{'path': '/summary', 'quote': 'Invented text', 'reason': 'Too long'}]}, {'facts': []})


def test_rejected_repair_cannot_publish_known_overloaded_source_fallback(environment):
    client, db, _, _ = environment
    session, _, draft, repair, issue = aml_fixture(client, db)
    rejected = {**VERIFIED, 'unsupported_paths': ['/experience/0/bullets/2']}
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (editorial(draft), USAGE),
                      ({**VERIFIED, 'quality_issues': [issue]}, USAGE), (repair, USAGE), (rejected, USAGE)]):
        result = generate(client, session, 1)
    assert result.status_code == 422, result.text
    assert client.get(f"/ai/interviews/{session['id']}").json()['preview'] is None


def test_source_change_during_quality_repair_blocks_publication(environment):
    client, db, user, _ = environment
    session, profile, draft, repair, issue = aml_fixture(client, db)
    outputs = iter([(draft, USAGE), (editorial(draft), USAGE),
                    ({**VERIFIED, 'quality_issues': [issue]}, USAGE), (repair, USAGE)])
    calls = []
    def provider(_system, body, **kwargs):
        calls.append(json.loads(body))
        if len(calls) == 4:
            service.put_profile(db, user.id, profile['revision'], profile['facts'])
        return next(outputs)
    with patch.object(service, '_gpt', side_effect=provider):
        result = generate(client, session, 1)
    assert result.status_code == 409, result.text
    assert len(calls) == 4
    assert client.get(f"/ai/interviews/{session['id']}").json()['preview'] is None
