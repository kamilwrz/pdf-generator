"""Controlled candidate facts, adaptive discovery and explicit preview decisions."""
from copy import deepcopy
import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models.models import InterviewSession, AiCreditReservation
from app.services import interview_service as service
from app.services.interview_discovery import update_discovery_budget, next_entry, scoped_question
from app.services.interview_quality import apply_discovery_review, literal_answer_status
from app.services.interview_editorial import prepare_editorial_draft
from app.services.cv_data import normalize_cv_data
from test_interviews import environment, create, confirm, version
from test_interview_editorial import setup_answer, generate, draft_for_answer, USAGE, VERIFIED
from test_interviews import editorial


CV = {'name': 'Anna Nowak', 'experience': [{'title': 'Specjalistka', 'company': 'MEN',
       'bullets': ['Zbieranie uwag od departamentów bez przygotowywania stanowiska merytorycznego.']}],
      'education': [{'school': 'KSAP'}], 'skills': ['Excel'],
      'custom_sections': [{'title': 'Wolontariat', 'items': [{'title': 'Warsztaty'}]}],
      'languages': [{'name': 'English', 'level': 'B2'}]}


def planning():
    profile = {'facts': service.source_facts(CV, 'test')}
    state = {'mode': 'enrich', 'answers': [], 'question_limit': 8}
    return state, profile, update_discovery_budget(state, profile)


def answer_for(entry, text='Z właściwymi instytucjami.', status='answered', index=0):
    return {'question': {'id': f'q{index}', 'entry_id': entry['id'], 'topic': f'institutions-{index}',
                        'text': 'Z którymi instytucjami uzgadniałaś dokumenty?', 'angle': 'collaboration',
                        'context': entry['label'], 'reason': 'Ustalenie partnerów uzgodnień.', 'follow_up_to': None},
            'status': status, 'answer': text}


def test_work_precedes_education_volunteering_and_tools_with_a_finite_plan():
    state, _, entries = planning()
    assert [e['kind'] for e in entries] == ['experience', 'custom_sections', 'skills', 'education']
    assert entries[-1]['question_count'] == 1
    assert state['discovery_main_limit'] == 8 and state['question_limit'] == 10


@pytest.mark.parametrize('status', ['partial', 'off_topic', 'contradictory'])
def test_incomplete_answers_get_one_probe_not_another_main_question(status):
    state, profile, entries = planning()
    original = answer_for(entries[0])
    state['answers'] = [original]
    apply_discovery_review(state, profile, entries, {'answer_assessment': {
        'question_id': 'q0', 'status': status, 'missing_detail': 'Nazwa jednej instytucji.'}})
    entries = update_discovery_budget(state, profile)
    selected = next_entry(entries, state['answers'])
    assert selected['follow_up_required']
    candidate = {**original['question'], 'text': 'Podaj nazwę jednej z tych instytucji.', 'follow_up_to': 'q0'}
    candidate.pop('id')
    question = scoped_question(candidate, selected, entries, state['answers'], service.is_fresh_question)
    assert question['follow_up_to'] == 'q0'
    assert question['text'] == candidate['text']
    state['answers'].append({'question': {**question, 'id': 'probe'}, 'status': 'answered', 'answer': 'Departament Prawny.'})
    selected = next_entry(update_discovery_budget(state, profile), state['answers'])
    assert not selected['allow_follow_up']
    assert original['answer'] == 'Z właściwymi instytucjami.'


@pytest.mark.parametrize('text', ['Telefonicznie.', 'Udzielałam informacji przez telefon.', 'dzwonilam do interesantow'])
def test_formal_colloquial_and_short_answers_have_the_same_scheduling_effect(text):
    state, profile, entries = planning()
    state['answers'] = [answer_for(entries[0], text)]
    apply_discovery_review(state, profile, entries, {'answer_assessment': {
        'question_id': 'q0', 'status': 'concrete', 'missing_detail': ''}})
    selected = next_entry(update_discovery_budget(state, profile), state['answers'])
    assert not selected['allow_follow_up'] and not selected['follow_up_required']
    assert state['answers'][0]['answer'] == text


def test_scope_completion_needs_current_own_evidence_and_reopens_after_an_edit():
    state, profile, entries = planning()
    entry = entries[0]
    review = {'entry_id': entry['id'], 'evidence_refs': [entry['facts'][-1]['id']], 'reason': 'Opis podaje zadanie i ograniczenie odpowiedzialności.'}
    apply_discovery_review(state, profile, entries, {'completed_scopes': [{**review, 'evidence_refs': ['invented']}]})
    assert not state['scope_reviews']
    apply_discovery_review(state, profile, entries, {'completed_scopes': [review]})
    assert next_entry(update_discovery_budget(state, profile), state['answers'])['id'] != entry['id']
    original = deepcopy(state)
    update_discovery_budget(state, profile)
    assert state == original
    next(f for f in profile['facts'] if f['id'] == review['evidence_refs'][0])['text'] = 'Zmieniona informacja.'
    assert next_entry(update_discovery_budget(state, profile), state['answers'])['id'] == entry['id']


def test_provider_cannot_close_a_scope_with_an_incomplete_answer_or_assess_another_answer():
    state, profile, entries = planning()
    state['answers'] = [answer_for(entries[0])]
    output = {'answer_assessment': {'question_id': 'q0', 'status': 'partial', 'missing_detail': 'Instytucja'},
              'completed_scopes': [{'entry_id': entries[0]['id'], 'evidence_refs': [entries[0]['facts'][0]['id']], 'reason': 'Complete'}]}
    apply_discovery_review(state, profile, entries, output)
    assert state['scope_reviews'] == []
    apply_discovery_review(state, profile, entries, {'answer_assessment': {**output['answer_assessment'], 'question_id': 'other', 'status': 'concrete'}})
    assert state['answers'][0]['assessment']['status'] == 'partial'


@pytest.mark.parametrize('text', ['nie pamiętam', 'Nie wiem.', "I don't remember."])
def test_typed_unknown_is_history_only_and_never_becomes_a_fact(environment, text):
    client, db, _, _ = environment
    session = confirm(client, create(client, include_profile=False, cv_data=CV))
    row = db.get(InterviewSession, session['id'])
    entries = update_discovery_budget(row.state, session['evidence_profile'])
    question = answer_for(entries[0])['question']
    row.state = {**row.state, 'question': question, 'phase': 'question'}
    db.commit()
    with patch.object(service, '_gpt') as provider:
        response = client.post(f"/ai/interviews/{row.id}/answers", json={**version(session, session['profile_revision']),
            'question_id': 'q0', 'answer': text, 'status': 'answered'})
        provider.assert_not_called()
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved['answers'][-1]['answer'] == text and saved['answers'][-1]['answer_meaning'] == 'unknown'
    assert saved['evidence_profile']['facts'] == session['evidence_profile']['facts']


def test_partial_uncertainty_keeps_usable_facts():
    assert literal_answer_status('Nie pamiętam liczby spraw, ale odpowiadałam telefonicznie.', 'answered') == 'answered'
    assert literal_answer_status('Nie przygotowywałam stanowiska merytorycznego.', 'answered') == 'answered'
    assert literal_answer_status('Nie mam takiego doświadczenia.', 'answered') == 'no_experience'
    assert literal_answer_status('Nie dotyczy.', 'answered') == 'skipped'


def test_followups_stop_at_ten_and_source_growth_cannot_extend_the_round():
    state = {'mode': 'enrich', 'answers': [], 'question_limit': 8}
    profile = {'facts': service.source_facts({'name': 'Anna', 'experience': [
        {'title': f'Role {i}'} for i in range(8)]}, 'test')}
    while True:
        entries = update_discovery_budget(state, profile)
        if state['discovery_round_complete']:
            break
        selected = next_entry(entries, state['answers'])
        question = answer_for(selected, index=len(state['answers']))['question']
        if selected['follow_up_required']:
            question['follow_up_to'] = selected['last_answer']['question']['id']
        state['answers'].append({'question': question, 'status': 'answered', 'answer': 'Szczegół.',
                                 'assessment': {'status': 'concrete' if question['follow_up_to'] else 'partial', 'missing_detail': 'Zadanie'}})
    assert len(state['answers']) == 10
    assert sum(not a['question']['follow_up_to'] for a in state['answers']) <= 8
    profile['facts'].extend(service.source_facts({'education': [{'school': 'UW'}]}, 'new'))
    update_discovery_budget(state, profile)
    assert state['question_limit'] == 10 and state['discovery_round_complete']
    assert not state['discovery_complete']


def test_assessment_shares_one_paid_question_call_and_replay_is_free(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, include_profile=False, cv_data=CV))
    def model(system, body, **kwargs):
        context = json.loads(body)
        scope = context['question_scope']
        question = answer_for(scope)['question']
        question.pop('id')
        assessment = None
        if context['answers']:
            parent = context['answers'][-1]['question']
            question.update(text='Podaj nazwę jednej z tych instytucji.', topic=parent['topic'], follow_up_to=parent['id'])
            assessment = {'question_id': parent['id'], 'status': 'partial', 'missing_detail': 'Instytucja'}
        return {'questions': [question], 'requirements': [], 'answer_assessment': assessment}, USAGE
    with patch.object(service, '_gpt', side_effect=model) as provider:
        session = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision'])).json()
        question = session['question']
        session = client.post(f"/ai/interviews/{session['id']}/answers", json={**version(session, session['profile_revision']),
            'question_id': question['id'], 'answer': 'Z właściwymi instytucjami.', 'status': 'answered'}).json()
        response = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        session = response.json()
        assert session['question']['follow_up_to'] == question['id']
        assert session['answers'][-1]['assessment']['status'] == 'partial'
        client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision']))
        assert provider.call_count == 2


def test_generation_preserves_complete_skill_units_through_repeated_normalization():
    profile = {'facts': service.source_facts({'name': 'Anna', 'skills': ['Excel', 'PowerPoint']}, 'test')}
    values = ['Excel: sortowanie, filtrowanie i wykresy.',
              'PowerPoint: prezentacje dotyczące projektów, wyników analiz i współpracy międzynarodowej.']
    raw = {'fields': [{'path': f'/skills/{i}', 'value': value, 'evidence_refs': [profile['facts'][i + 1]['id']]}
                      for i, value in enumerate(values)], 'remaining_gaps': []}
    prepared = prepare_editorial_draft(raw, profile)
    cv = normalize_cv_data({'name': 'Anna', 'skills': [f['value'] for f in prepared['fields']]})
    assert len(cv['skills']) == 2 and 'wyników analiz' in cv['skills'][1]
    assert normalize_cv_data(cv)['skills'] == cv['skills']


def test_dates_cannot_be_composed_from_unrelated_numbers():
    profile = {'facts': service.source_facts({'name': 'Anna', 'education': [{'school': 'KSAP',
               'description': 'Raport z 2008 roku oraz 10 ćwiczeń.'}]}, 'test')}
    reference = next(f['id'] for f in profile['facts'] if f['path'].endswith('/description'))
    with pytest.raises(HTTPException):
        service.assemble_draft({'fields': [{'path': '/education/0/period', 'value': '2008–10', 'evidence_refs': [reference]}]}, profile, 'pl')


@pytest.mark.parametrize('isolated', [False, True])
def test_preview_correction_and_rejection_use_no_ai_and_preserve_source(environment, isolated):
    client, db, user, _ = environment
    session = setup_answer(client, db, include_profile=not isolated)
    with patch.object(service, '_gpt', side_effect=[(draft_for_answer(), USAGE), (editorial(draft_for_answer()), USAGE), (VERIFIED, USAGE)]):
        response = generate(client, session)
    assert response.status_code == 200, response.text
    session = response.json()
    source = deepcopy(session['source_cv_data'])
    count = db.query(AiCreditReservation).count()
    with patch.object(service, '_gpt') as provider:
        body = {**version(session, session['profile_revision']), 'path': '/summary', 'value': 'Wspierałam zespół w testowaniu formularzy.'}
        response = client.post(f"/ai/interviews/{session['id']}/preview-review", json=body)
        assert response.status_code == 200, response.text
        changed = response.json()
        assert changed['preview']['cv_data']['summary'] == body['value']
        assert changed['source_cv_data'] == source
        assert changed['preview']['changes'][0]['evidence_refs'][0].startswith('review-')
        assert client.post(f"/ai/interviews/{session['id']}/preview-review", json=body).status_code == 409
        response = client.post(f"/ai/interviews/{session['id']}/preview-review", json={
            **version(changed, changed['profile_revision']), 'path': '/summary', 'value': None})
        assert response.status_code == 200, response.text
        assert not response.json()['preview']['cv_data'].get('summary')
        provider.assert_not_called()
    assert db.query(AiCreditReservation).count() == count
    row = db.get(InterviewSession, session['id'], populate_existing=True)
    assert not any(f['id'].startswith('review-') for f in service.interview_profile(db, row)['facts'])
