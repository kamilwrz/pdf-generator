"""Record coverage, resumed histories and hostile/repetitive provider proposals."""
from collections import Counter
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from app.models.models import InterviewSession
from app.schemas.interview_schema import Discovery, provider_schema
from app.services import interview_service as service
from app.services.cv_data import normalize_cv_data
from app.services.interview_discovery import (
    discovery_entries, entry_answers, next_entry, scoped_question, update_discovery_budget,
)
from test_interviews import environment, create, confirm, version


CV = {
    'name': 'Anna Nowak',
    'experience': [
        {'title': 'Developer', 'company': 'Acme', 'bullets': ['Tworzenie raportów.']},
        {'title': 'Analyst', 'company': 'Beacon', 'bullets': ['Analiza danych.']},
    ],
    'custom_sections': [{'title': 'Projekty', 'kind': 'projects', 'items': [
        {'title': 'Atlas', 'bullets': ['Aplikacja do nauki.']},
        {'title': 'Orion', 'bullets': ['Wyszukiwarka.']},
    ]}],
    'skills': [{'category': 'Narzędzia', 'items': ['Python', 'SQL']}],
    'languages': [{'name': 'English', 'level': 'B2'}, {'name': 'German', 'level': ''}],
}


def profile():
    return {'facts': service.source_facts(CV, 'document:1')}


def saved(entry, index, *, status='answered', follow_up_to=None):
    return {'question': {'id': f'q{index}', 'entry_id': entry['id'], 'topic': f'new-topic-{index}',
                         'text': f'Unikalne pytanie {index}?', 'context': entry['label'],
                         'follow_up_to': follow_up_to}, 'answer': 'Przykład własnego działania.', 'status': status}


def test_each_project_is_a_record_and_language_with_level_is_already_complete():
    entries = discovery_entries(profile(), [])
    assert [entry['id'] for entry in entries] == [
        '/custom_sections/0/items/0', '/custom_sections/0/items/1', '/experience/0', '/experience/1',
        '/languages/1', '/skills/0',
    ]
    assert entries[0]['label'] == 'Atlas'
    assert entries[-1]['label'] == 'Narzędzia'


def test_two_questions_per_record_then_next_even_when_every_topic_is_different():
    entries, answers, seen = discovery_entries(profile(), []), [], []
    while selected := next_entry(entries, answers):
        assert len(answers) < 20
        seen.append(selected['id'])
        answers.append(saved(selected, len(answers)))
    assert Counter(seen) == {entry['id']: entry['question_count'] for entry in entries}
    assert seen[:4] == ['/custom_sections/0/items/0'] * 2 + ['/custom_sections/0/items/1'] * 2


def test_one_follow_up_consumes_third_slot_and_cannot_form_a_chain():
    entries = discovery_entries(profile(), [])
    first = next_entry(entries, [])
    answers = [saved(first, 0)]
    selected = next_entry(entries, answers)
    candidate = {'entry_id': first['id'], 'topic': 'new-topic-0', 'text': 'Jakie zadanie wykonałaś osobiście?',
                 'context': 'Atlas', 'reason': 'Osobisty wkład.', 'follow_up_to': 'q0'}
    question = scoped_question(candidate, selected, entries, answers, service.is_fresh_question)
    assert question['follow_up_to'] == 'q0'
    answers.append({'question': {**question, 'id': 'child'}, 'answer': 'Testowanie.', 'status': 'answered'})
    selected = next_entry(entries, answers)
    assert selected['id'] == first['id'] and not selected['allow_follow_up']
    chain = scoped_question({**candidate, 'text': 'Co jeszcze testowałaś?', 'follow_up_to': 'child'}, selected, entries, answers, service.is_fresh_question)
    assert chain['follow_up_to'] is None
    answers.append({'question': {**chain, 'id': 'last'}, 'answer': 'Sprawdzenie formularza.', 'status': 'answered'})
    assert next_entry(entries, answers)['id'] == entries[1]['id']


@pytest.mark.parametrize('status', ['unknown', 'skipped', 'no_experience'])
def test_declining_an_entry_moves_on_without_reopening_it(status):
    entries = discovery_entries(profile(), [])
    assert next_entry(entries, [saved(entries[0], 0, status=status)])['id'] == entries[1]['id']


def test_legacy_history_uses_record_identity_instead_of_model_topics():
    entries = discovery_entries(profile(), [])
    answers = [saved(entries[0], i) for i in range(5)]
    for answer in answers:
        answer['question'].pop('entry_id')
        answer['question']['context'] = 'Projekty · Atlas — wkład'
    assert len(entry_answers(entries[0], entries, answers)) == 5
    assert next_entry(entries, answers)['id'] == entries[1]['id']
    # Verification questions have their own independent five-question budget.
    clarification = saved(entries[1], 6)
    clarification['question']['clarification'] = True
    assert entry_answers(entries[1], entries, [clarification]) == []


@pytest.mark.parametrize('spoof_id', [False, True])
def test_wrong_project_is_replaced_locally_even_with_a_spoofed_scope(spoof_id):
    entries = discovery_entries(profile(), [])
    history = [saved(entries[0], i) for i in range(2)]
    selected = next_entry(entries, history)
    candidate = {'entry_id': selected['id'] if spoof_id else entries[0]['id'], 'topic': 'another-name',
                 'text': 'Jak wdrożyłaś Atlas?', 'context': 'Atlas', 'reason': 'Wynik.', 'follow_up_to': None}
    result = scoped_question(candidate, selected, entries, history, service.is_fresh_question)
    assert result['entry_id'] == selected['id'] and 'Orion' in result['text'] and 'Atlas' not in result['text']


def test_empty_and_repeated_proposals_do_not_end_other_entries():
    entries = discovery_entries(profile(), [])
    history = [saved(entries[0], 0)]
    selected = next_entry(entries, history)
    for candidate in (None, {**history[0]['question'], 'topic': 'renamed'}):
        result = scoped_question(candidate, selected, entries, history, service.is_fresh_question)
        assert result['entry_id'] == entries[0]['id']
        assert result['text'] != history[0]['question']['text']


def test_budget_covers_records_without_resetting_on_resume_or_answer_facts():
    facts = profile()
    state = {'answers': [], 'question_limit': 5}
    entries = update_discovery_budget(state, facts)
    assert state['question_limit'] == 14
    original = deepcopy(state)
    update_discovery_budget(state, facts)
    assert state == original
    state['answers'] = [saved(entries[0], 0)]
    facts['facts'].append({'id': 'answer-q0', 'text': 'Nowa odpowiedź', 'context': 'Atlas', 'path': '', 'kind': 'fact'})
    update_discovery_budget(state, facts)
    assert state['discovery_entry_ids'] == original['discovery_entry_ids']
    assert state['question_limit'] == 14
    many = {'facts': service.source_facts({'experience': [{'title': f'Role {i}'} for i in range(30)]}, 'document:2')}
    update_discovery_budget(state, many)
    assert state['question_limit'] == 50


def test_planned_count_includes_optional_followups_and_shrinks_when_an_entry_closes():
    state = {'mode': 'enrich', 'answers': [], 'question_limit': 8}
    entries = update_discovery_budget(state, profile())
    assert state['planned_question_count'] == 14

    state['answers'] = [saved(entries[0], 0)]
    update_discovery_budget(state, profile())
    assert state['planned_question_count'] == 14

    state['answers'] = [saved(entries[0], 0, status='skipped')]
    update_discovery_budget(state, profile())
    assert state['planned_question_count'] == 12


def test_planned_count_reserves_the_shared_answer_ceiling_for_clarifications():
    cv = {'name': 'Anna Nowak', 'experience': [{'title': f'Role {index}'} for index in range(17)]}
    facts = {'facts': service.source_facts(cv, 'document:1')}
    clarification = {'question': {'id': 'clarification', 'clarification': True}, 'answer': '', 'status': 'skipped'}
    state = {'mode': 'enrich', 'answers': [clarification], 'question_limit': 50}
    update_discovery_budget(state, facts)
    assert state['planned_question_count'] == 49

    entries = discovery_entries(facts, [])
    state['answers'] = [saved(entries[0], index) for index in range(49)] + [clarification]
    update_discovery_budget(state, facts)
    assert state['discovery_complete'] is True
    assert state['discovery_exhausted'] is True


def test_clarification_capacity_does_not_replace_an_ordinary_question_slot():
    state = {'mode': 'enrich', 'answers': [], 'question_limit': 8}
    update_discovery_budget(state, profile())
    assert state['planned_question_count'] == 14
    assert state['question_limit'] == 14

    state['answers'].append({
        'question': {'id': 'clarification', 'clarification': True},
        'answer': '', 'status': 'skipped',
    })
    update_discovery_budget(state, profile())
    assert state['planned_question_count'] == 14
    assert state['question_limit'] == 15


def test_created_enrichment_session_exposes_the_cv_based_plan_before_paid_calls(environment):
    client, _, _, _ = environment
    session = create(client, mode='enrich', include_profile=False, cv_data=CV)
    assert session['planned_question_count'] == 15
    assert session['question_limit'] == 15
    assert session['discovery_complete'] is False


def test_source_refresh_replans_enrichment_from_the_new_cv_snapshot(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, mode='enrich', include_profile=False, cv_data=CV))
    assert session['planned_question_count'] == 15

    response = client.post(f"/ai/interviews/{session['id']}/source", json={
        **version(session, session['profile_revision']),
        'cv_data': {'name': 'Anna Nowak'},
    })
    assert response.status_code == 200, response.text
    assert response.json()['planned_question_count'] == 4


@pytest.mark.parametrize('mode', ['create', 'enrich', 'tailor'])
def test_complete_flow_covers_all_entries_replays_answers_and_finishes_without_paid_loop(environment, mode):
    client, db, _, _ = environment
    session = confirm(client, create(client, mode=mode, include_profile=False, cv_data=CV,
                                     job_description='Developer' if mode == 'tailor' else ''))
    seen = []

    def repetitive_model(system, body, **kwargs):
        if 'question_scope' not in json.loads(body):
            return {'requirements': [{'text': 'Python automation', 'status': 'unknown', 'evidence_refs': []}]}, {'cost_pln_estimate': .01}
        scope = json.loads(body)['question_scope']
        seen.append(scope['id'])
        # A pathological model keeps trying the first project under new topics.
        return {'questions': [{'entry_id': '/custom_sections/0/items/0', 'topic': f'new-topic-{len(seen)}',
                               'text': f'Atlas: kolejny szczegół {len(seen)}?', 'context': 'Atlas',
                               'reason': 'Dopytanie.', 'follow_up_to': None}], 'requirements': []}, {'cost_pln_estimate': .01}

    with patch.object(service, '_gpt', side_effect=repetitive_model) as provider:
        for _ in range(20):
            result = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision']))
            assert result.status_code == 200, result.text
            session = result.json()
            if session['discovery_complete']:
                break
            question = session['question']
            assert question['entry_id'] == seen[-1]
            body = {**version(session, session['profile_revision']), 'question_id': question['id'],
                    'answer': 'Samodzielnie sprawdzałam formularz.', 'status': 'answered'}
            result = client.post(f"/ai/interviews/{session['id']}/answers", json=body)
            assert result.status_code == 200, result.text
            session = result.json()
            assert client.post(f"/ai/interviews/{session['id']}/answers", json=body).json() == session
            session = client.get(f"/ai/interviews/{session['id']}").json()
        assert session['phase'] == 'review' and session['question'] is None and session['discovery_complete']
        # Canonical normalization flattens this skills input into Python/SQL.
        expected = discovery_entries({'facts': service.source_facts(normalize_cv_data(CV), 'test')}, [])
        assert provider.call_count == (3 if mode == 'tailor' else 11)
        if mode == 'tailor':
            assert len(seen) == 2 and len(set(seen)) == 1 and seen[0].startswith('requirement:')
        else:
            assert Counter(seen) == {entry['id']: entry['question_count'] for entry in expected}
        assert client.post(f"/ai/interviews/{session['id']}/extend", json=version(session, session['profile_revision'])).status_code == 422
    assert len(db.get(InterviewSession, session['id']).state['answers']) == (2 if mode == 'tailor' else 11)


def test_provider_requires_entry_identity_but_historical_json_remains_readable():
    old = {'topic': 'x', 'text': 'Pytanie?', 'reason': '', 'context': ''}
    assert Discovery.model_validate({'questions': [old], 'requirements': []}).questions[0].entry_id is None
    assert 'entry_id' in provider_schema(Discovery)['schema']['$defs']['Question']['required']


def test_previous_interview_notes_do_not_double_the_same_project_budget():
    facts = profile()
    facts['facts'].append({'id': 'answer-previous-session', 'kind': 'fact', 'path': '',
                           'text': 'Testowałam formularz.', 'context': 'Atlas', 'source': 'interview:previous'})
    entries = discovery_entries(facts, [])
    assert len(entries) == 6
    assert next_entry(entries, [])['label'] == 'Atlas'
    assert 'answer-previous-session' in {f['id'] for f in entries[0]['facts']}


@pytest.mark.parametrize('language', ['pl', 'en'])
def test_question_angles_survive_resume_and_reject_renamed_repeats_without_paid_retry(environment, language):
    client, _, _, _ = environment
    session = confirm(client, create(client, mode='enrich', include_profile=False, cv_data=CV))
    captured = []

    def repeating_provider(system, body, **kwargs):
        context = json.loads(body)
        captured.append(context)
        label = context['question_scope']['label']
        question = (f'Jak sprawdzasz jakość pracy w projekcie {label}?' if len(captured) == 1
                    else f'W jaki sposób weryfikujesz jakość pracy w projekcie {label}?')
        if language == 'en':
            question = (f'How do you check the quality of work in {label}?' if len(captured) == 1
                        else f'How do you verify the quality of work in {label}?')
        return {'questions': [{'entry_id': context['question_scope']['id'], 'angle': 'quality',
                               'topic': f'renamed-{len(captured)}', 'text': question, 'context': label,
                               'reason': 'Quality check', 'follow_up_to': None}], 'requirements': []}, {'cost_pln_estimate': .01}

    headers = {'Accept-Language': language}
    with patch.object(service, '_gpt', side_effect=repeating_provider) as provider:
        result = client.post(f"/ai/interviews/{session['id']}/next", headers=headers,
                             json=version(session, session['profile_revision']))
        assert result.status_code == 200, result.text
        session = result.json()
        assert session['question']['angle'] == 'quality'
        first = session['question']
        answer = 'Porównuję raport ze źródłem; wynik już opisałam w CV. Nie mam dodatkowych liczb.'
        result = client.post(f"/ai/interviews/{session['id']}/answers", headers=headers, json={
            **version(session, session['profile_revision']), 'question_id': first['id'],
            'answer': answer, 'status': 'answered',
        })
        assert result.status_code == 200, result.text
        session = client.get(f"/ai/interviews/{session['id']}", headers=headers).json()
        assert session['answers'][0]['question']['angle'] == 'quality'
        result = client.post(f"/ai/interviews/{session['id']}/next", headers=headers,
                             json=version(session, session['profile_revision']))
        assert result.status_code == 200, result.text
        session = result.json()
        assert session['question']['angle'] != 'quality'
        assert session['question']['entry_id'] == first['entry_id']
        assert session['question']['follow_up_to'] is None
        assert 'quality' in captured[1]['question_guidance']['covered_angles']
        assert captured[1]['answers'][0]['answer'] == answer
        assert provider.call_count == 2
        # Loading an already displayed fallback must not bill another model call.
        result = client.post(f"/ai/interviews/{session['id']}/next", headers=headers,
                             json=version(session, session['profile_revision']))
        assert result.status_code == 200 and result.json()['question'] == session['question']
        assert provider.call_count == 2


def test_angle_contract_is_bounded_and_compatible_with_saved_questions():
    from pydantic import ValidationError
    from app.schemas.interview_schema import Question

    old = {'topic': 'legacy', 'text': 'Pytanie?', 'reason': '', 'context': ''}
    assert Question.model_validate(old).angle is None
    schema = provider_schema(Discovery)['schema']['$defs']['Question']
    assert 'angle' in schema['required']
    with pytest.raises(ValidationError):
        Question.model_validate({**old, 'angle': 'arbitrary-new-topic'})


def test_accepted_question_keeps_long_requirement_context_inside_question_contract():
    from app.schemas.interview_schema import Question

    entry = {'id': 'requirement:one', 'kind': 'requirement', 'label': 'a' * 1000,
             'facts': [], 'question_count': 2}
    candidate = {'entry_id': entry['id'], 'angle': 'application', 'topic': 'specific-example',
                 'text': 'Czy masz przykład takiego zadania?', 'context': '', 'reason': '', 'follow_up_to': None}
    selected = next_entry([entry], [])
    accepted = scoped_question(candidate, selected, [entry], [], service.is_fresh_question)
    assert accepted['text'] == candidate['text']
    assert accepted['context'] == entry['label'][:350]
    Question.model_validate(accepted)
