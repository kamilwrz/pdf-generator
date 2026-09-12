"""Offer-driven interview scheduling and safe reuse of paid analyses."""
from collections import Counter
from datetime import datetime, timedelta
import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from app.models.models import AiCreditReservation, InterviewSession
from app.services import interview_service as service
from app.services.interview_job_analysis import (
    analysis_signature, load_owned_analysis, requirement_topics, requirement_facts,
)
from app.services.interview_discovery import update_discovery_budget, next_entry, scoped_question
from test_interviews import environment, create, confirm, version


REQUIREMENTS = [
    {'text': 'SQL', 'status': 'matched', 'evidence_refs': []},
    {'text': 'Reporting', 'status': 'partial', 'evidence_refs': []},
    {'text': 'Python', 'status': 'unknown', 'evidence_refs': []},
]


def test_requirement_topics_preserve_stable_ids_rank_and_missing_facets():
    requirements = [
        {'id': 'optional', 'text': 'Python', 'status': 'unknown', 'kind': 'preferred', 'weight': 3},
        {'id': 'core', 'text': ' SQL reporting ', 'status': 'partial', 'kind': 'required', 'weight': 3},
        {'id': 'domain', 'text': 'Banking', 'status': 'matched', 'kind': 'required', 'weight': 2},
        {'id': 'repeat', 'text': 'SQL  reporting', 'status': 'partial'},
    ]
    priorities = [{'requirement_id': 'core', 'description': 'Clarify the report validation method.'}]
    gaps = [{'requirement_id': 'core', 'description': 'Clarify the report validation method.'},
            {'requirement_id': 'domain', 'description': 'Do not repeat confirmed banking experience.'}]
    topics = requirement_topics(requirements, priorities=priorities, evidence_gaps=gaps)
    assert [topic['text'] for topic in topics] == ['SQL reporting', 'Python', 'Banking']
    assert topics[0]['missing_detail'] == priorities[0]['description']
    assert topics[2]['missing_detail'] == ''
    assert topics[0]['kind'] == 'required' and topics[0]['weight'] == 3
    reordered = requirement_topics(list(reversed(requirements[:3])))
    assert {topic['text']: topic['id'] for topic in topics} == {topic['text']: topic['id'] for topic in reordered}
    assert [topic['text'] for topic in requirement_topics(REQUIREMENTS)] == ['SQL', 'Reporting', 'Python']


def test_central_responsibility_precedes_peripheral_required_criterion():
    requirements = [
        {'text': 'Occasional travel', 'status': 'unknown', 'kind': 'required', 'weight': 1},
        {'text': 'Report validation', 'status': 'partial', 'kind': 'responsibility', 'weight': 3},
        {'text': 'SQL', 'status': 'partial', 'kind': 'required', 'weight': 3},
    ]
    assert [topic['text'] for topic in requirement_topics(requirements)] == [
        'SQL', 'Report validation', 'Occasional travel',
    ]


def test_cached_canonical_evidence_rebinds_only_exact_current_profile_record():
    path = '/experience/0/bullets/0'
    text = 'Porównuję raporty w SQL.'
    topics = requirement_topics([
        {'text': 'SQL reporting', 'status': 'partial', 'evidence_refs': [f'cv:{path}', 'canvas:other']},
    ], evidence_catalog={f'cv:{path}': text, 'canvas:other': text})
    current = {'id': 'confirmed-one', 'path': path, 'text': text, 'kind': 'fact'}
    other_role = {**current, 'id': 'different-role', 'path': '/experience/1/bullets/0'}
    profile = {'facts': [other_role, current]}
    assert requirement_facts(topics[0], profile) == [current]
    assert requirement_facts(topics[0], {'facts': [other_role]}) == []
    assert requirement_facts(topics[0], {'facts': [{**current, 'text': 'Nie porównuję raportów w SQL.'}]}) == []
    assert requirement_facts(topics[0], {'facts': [{**current, 'text': 'Porównuję raporty.'}]}) == []
    assert requirement_facts(topics[0], {'facts': [current, {**current, 'id': 'ambiguous-copy'}]}) == []
    assert requirement_facts(topics[0], {'facts': [{**current, 'text': 'Porównuję\nraporty w SQL.'}]})[0]['id'] == current['id']


def test_cached_note_fragment_returns_complete_current_note_with_qualifiers():
    notes = 'Tworzyłam raporty w SQL. Tylko na praktykach i pod opieką mentora.'
    topics = requirement_topics([
        {'text': 'SQL reporting', 'status': 'partial', 'evidence_refs': ['note:1', 'note:2']},
    ], evidence_catalog={'note:1': 'Tworzyłam raporty w SQL.', 'note:2': 'Tylko na praktykach i pod opieką mentora.'},
       candidate_notes=notes)
    whole = {'id': 'note-confirmed', 'text': notes, 'path': '', 'kind': 'fact'}
    fragment = {**whole, 'id': 'unsafe-fragment', 'text': 'Tworzyłam raporty w SQL.'}
    assert requirement_facts(topics[0], {'facts': [whole, fragment]}) == [whole]
    assert len(topics[0]['source_evidence']) == 1
    assert requirement_facts(topics[0], {'facts': [fragment]}) == []
    assert requirement_facts(topics[0], {'facts': [{**whole, 'text': notes + ' Nie używałam SQL komercyjnie.'}]}) == []


def test_cached_analysis_cannot_promote_prose_or_canvas_text_to_facts():
    topic = requirement_topics([
        {'id': 'sql', 'text': 'SQL', 'status': 'partial', 'evidence_refs': ['canvas:same', 'cv:/summary', 'note:1']},
    ], evidence_catalog={'canvas:same': 'SQL', 'note:1': 'Invented analysis statement'},
       candidate_notes='Actual note',
       evidence_gaps=[{'requirement_id': 'sql', 'description': 'SQL'}])[0]
    assert topic['source_evidence'] == []
    assert requirement_facts(topic, {'facts': [{'id': 'real-skill', 'path': '/skills/0', 'text': 'SQL', 'kind': 'fact'}]}) == []
    assert requirement_facts(topic, {'facts': [{'id': 'canvas:same', 'path': '/skills/0', 'text': 'Unrelated skill', 'kind': 'fact'}]}) == []
    assert requirement_facts(requirement_topics(REQUIREMENTS)[1], {'facts': []}) == []


@pytest.mark.parametrize('status, expected', [('partial', ['fact']), ('unknown', ['fact']), ('gap', ['gap'])])
def test_requirement_context_preserves_gap_and_framing_semantics(status, expected):
    facts = [{'id': kind, 'path': '', 'text': 'Reviewed statement', 'kind': kind}
             for kind in ('fact', 'gap', 'framing')]
    topic = requirement_topics([{'text': 'Requirement', 'status': status,
                                 'evidence_refs': ['fact', 'gap', 'framing', 'absent']}])[0]
    assert [fact['id'] for fact in requirement_facts(topic, {'facts': facts})] == expected


def test_two_questions_per_unresolved_requirement_without_third_followup():
    state = {'mode': 'tailor', 'job_analysis_ready': True, 'requirements': requirement_topics(REQUIREMENTS),
             'question_limit': 5, 'answers': []}
    counts = Counter()
    while True:
        entries = update_discovery_budget(state, {'facts': []})
        selected = next_entry(entries, state['answers'])
        if not selected:
            break
        assert selected['label'] != 'SQL'
        assert selected['allow_follow_up'] is False
        question = scoped_question(None, selected, entries, state['answers'], lambda *_: True)
        question['id'] = str(len(state['answers']))
        state['answers'].append({'question': question, 'answer': 'Example at Acme', 'status': 'answered'})
        counts[selected['label']] += 1
    assert counts == {'Reporting': 2, 'Python': 2}
    assert state['discovery_complete'] is True
    assert state['question_limit'] == 4
    assert state['planned_question_count'] == 4
    assert update_discovery_budget(state, {'facts': []}) == entries


@pytest.mark.parametrize('status', ['no_experience', 'unknown', 'skipped'])
def test_declining_a_requirement_does_not_reopen_it(status):
    state = {'mode': 'tailor', 'job_analysis_ready': True, 'requirements': requirement_topics(REQUIREMENTS),
             'question_limit': 5, 'answers': []}
    entries = update_discovery_budget(state, {'facts': []})
    chosen = next_entry(entries, [])
    state['answers'] = [{'question': {'id': 'one', 'entry_id': chosen['id']}, 'status': status, 'answer': ''}]
    update_discovery_budget(state, {'facts': []})
    assert next_entry(entries, state['answers'])['label'] == 'Python'


def test_missing_analysis_cannot_mark_discovery_complete():
    state = {'mode': 'tailor', 'job_analysis_ready': False, 'question_limit': 5, 'answers': []}
    assert update_discovery_budget(state, {'facts': []}) == []
    assert state['discovery_complete'] is False
    assert state['planned_question_count'] is None


def test_partial_requirement_scope_keeps_only_referenced_confirmed_facts():
    facts = service.source_facts({'experience': [{'title': 'Analityk', 'company': 'Acme',
                                                'bullets': ['Porównuję raporty w SQL.']}]}, 'document:1')
    relevant = next(fact for fact in facts if fact['text'] == 'Porównuję raporty w SQL.')
    state = {'mode': 'tailor', 'job_analysis_ready': True, 'question_limit': 5, 'answers': [],
             'requirements': requirement_topics([{'text': 'SQL reporting and data quality', 'status': 'partial',
                                                   'evidence_refs': [relevant['id'], 'missing-reference']}])}
    entries = update_discovery_budget(state, {'facts': facts})
    assert entries[0]['facts'] == [relevant]
    assert entries[0]['status'] == 'partial'


def test_direct_interview_analyses_once_and_passes_cv_and_profile_to_questions(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, mode='tailor', job_description='SQL and Python'))
    facts = client.get('/career-profile').json()['facts']
    analysis = {'requirements': [{'text': 'Python', 'status': 'unknown', 'evidence_refs': []},
                                 {'text': 'SQL', 'status': 'partial', 'evidence_refs': [facts[0]['id']]}]}
    with patch.object(service, '_gpt', side_effect=[(analysis, {'cost_pln_estimate': .01}),
                                                  ({'questions': [], 'requirements': []}, {'cost_pln_estimate': .01})]) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, 1))
        assert response.status_code == 200, response.text
        session = response.json()
        assert len(session['requirements']) == 2
        assert session['question_limit'] == 4
        assert session['planned_question_count'] == 4
        context = json.loads(provider.call_args_list[1].args[1])
        assert context['source_cv_data']['name'] == 'Anna Nowak'
        assert context['profile'] == facts
        assert context['question_scope']['kind'] == 'requirement'
        assert provider.call_args_list[0].args[0] == service.SYSTEM
        assert provider.call_args_list[1].args[0] == service.SYSTEM + service.QUESTION_POLICY
        assert 'question_guidance' in context
    response = client.post(f"/ai/interviews/{session['id']}/answers", json={**version(session, 1),
        'question_id': session['question']['id'], 'answer': 'I wrote scripts at Acme.', 'status': 'answered'})
    assert response.status_code == 200, response.text
    session = response.json()
    with patch.object(service, '_gpt', return_value=({'questions': [], 'requirements': []}, {'cost_pln_estimate': .01})) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        assert provider.call_count == 1
        assert response.json()['question']['entry_id'] == session['answers'][0]['question']['entry_id']


def test_direct_analysis_without_real_requirements_proceeds_to_review(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, mode='tailor', job_description='Friendly office and free coffee.'))
    with patch.object(service, '_gpt', return_value=({'requirements': []},
                                                    {'cost_pln_estimate': .01})) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next",
                               json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload['phase'] == 'review'
        assert payload['requirements'] == [] and payload['question'] is None
        assert payload['question_limit'] == 0 and payload['planned_question_count'] == 0
        assert payload['discovery_complete'] is True
        assert provider.call_count == 1


def test_direct_analysis_cannot_use_approved_framing_as_competency_evidence(environment):
    client, _, _, _ = environment
    session = create(client, mode='tailor', job_description='SQL reporting')
    framing = {'id': 'approved-wording', 'text': 'Wspieram przygotowanie raportów.',
               'path': '', 'kind': 'framing', 'context': 'Preferred wording'}
    session = confirm(client, session, facts=[*session['proposed_facts'], framing])
    analysis = {'requirements': [{'text': 'SQL reporting', 'status': 'matched',
                                 'evidence_refs': [framing['id']]}]}
    with patch.object(service, '_gpt', side_effect=[(analysis, {'cost_pln_estimate': .01}),
                                                  ({'questions': [], 'requirements': []},
                                                   {'cost_pln_estimate': .01})]) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next",
                               json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        assert response.json()['requirements'][0]['status'] == 'unknown'
        context = json.loads(provider.call_args.args[1])
        assert context['question_scope']['facts'] == []
        assert context['question_scope']['status'] == 'unknown'
        assert provider.call_count == 2


def test_direct_analysis_passes_ranked_requirement_and_missing_facet_to_question(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client, mode='tailor', job_description='Validate SQL reports; occasional travel.',
                                     cv_data={'name': 'Anna Nowak', 'title': 'Analyst', 'summary': 'I prepare SQL reports.'}))
    facts = client.get('/career-profile').json()['facts']
    relevant = next(fact for fact in facts if fact['path'] == '/summary')
    analysis = {'requirements': [
        {'text': 'Occasional travel', 'status': 'unknown', 'kind': 'required', 'weight': 1,
         'missing_detail': 'Availability for occasional travel.', 'evidence_refs': []},
        {'text': 'SQL report validation', 'status': 'partial', 'kind': 'responsibility', 'weight': 3,
         'missing_detail': 'Clarify whether and how report data was checked.', 'evidence_refs': [relevant['id']]},
    ]}
    with patch.object(service, '_gpt', side_effect=[(analysis, {'cost_pln_estimate': .01}),
                                                  ({'questions': [], 'requirements': []},
                                                   {'cost_pln_estimate': .01})]) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next",
                               json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        context = json.loads(provider.call_args.args[1])
        scope = context['question_scope']
        assert scope['label'] == 'SQL report validation'
        assert scope['requirement_kind'] == 'responsibility' and scope['weight'] == 3
        assert scope['missing_detail'] == 'Clarify whether and how report data was checked.'
        assert scope['facts'] == [relevant]
        assert provider.call_count == 2


def test_reused_analysis_is_owned_bound_to_inputs_and_free_to_load(environment):
    client, db, user, other = environment
    cv = {'name': 'Anna Nowak', 'title': 'Developer'}
    data = {'signature': analysis_signature(cv, '', '', 'Developer'),
            'offer': {'description': 'Developer', 'source': 'manual'}, 'requirements': REQUIREMENTS}
    receipt = AiCreditReservation(id='receipt', user_id=user.id, period_key='2026-09', action='position_rating',
        idempotency_key='analysis-one', request_hash='a' * 64, reserved_credits=1, charged_credits=1,
        status='settled', response_json={'_interview_analysis': data}, created_at=datetime.now(),
        expires_at=datetime.now() + timedelta(hours=1))
    db.add(receipt); db.commit()
    with patch.object(service, '_gpt') as provider:
        session = create(client, mode='tailor', job_description='Developer', analysis_key='analysis-one')
        assert session['job_analysis_ready'] is True
        assert len(session['requirements']) == 3
        provider.assert_not_called()
    assert db.query(InterviewSession).count() == 1
    for owner, snapshot, text in [(other.id, cv, 'Developer'), (user.id, {**cv, 'title': 'Designer'}, 'Developer'), (user.id, cv, 'Different job')]:
        with pytest.raises(HTTPException) as error:
            load_owned_analysis(db, owner, 'analysis-one', snapshot, '', '', text)
        assert error.value.status_code == 409
    assert receipt.charged_credits == 1


def test_cached_analysis_context_rebinds_after_confirmation_without_paid_reanalysis(environment):
    client, db, user, _ = environment
    cv = {'name': 'Anna Nowak', 'title': 'Developer',
          'experience': [{'title': 'Analyst', 'company': 'Acme', 'bullets': ['I validate SQL reports.']}]}
    notes = 'I prepare reports. Only during supervised training.'
    requirement = {'id': 'reporting', 'text': 'SQL reporting and validation', 'match_status': 'partial',
                   'kind': 'required', 'weight': 3,
                   'evidence_refs': ['cv:/experience/0/bullets/0', 'note:1']}
    data = {'signature': analysis_signature(cv, notes, '', 'SQL reporting'),
            'offer': {'description': 'SQL reporting', 'source': 'manual'},
            'requirements': [requirement],
            'evidence_catalog': {'cv:/experience/0/bullets/0': 'I validate SQL reports.',
                                 'note:1': 'I prepare reports.'},
            'evidence_gaps': [{'requirement_id': 'reporting', 'description': 'Clarify the validation method.'}]}
    receipt = AiCreditReservation(id='bound-receipt', user_id=user.id, period_key='2026-09', action='position_rating',
        idempotency_key='bound-analysis', request_hash='b' * 64, reserved_credits=1, charged_credits=1,
        status='settled', response_json={'_interview_analysis': data}, created_at=datetime.now(),
        expires_at=datetime.now() + timedelta(hours=1))
    db.add(receipt)
    db.commit()
    with patch.object(service, '_gpt') as provider:
        session = confirm(client, create(client, mode='tailor', cv_data=cv, candidate_notes=notes,
                                          job_description='SQL reporting', analysis_key='bound-analysis'))
        provider.assert_not_called()
    with patch.object(service, '_gpt', return_value=({'questions': [], 'requirements': []},
                                                    {'cost_pln_estimate': .01})) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next",
                               json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        assert provider.call_count == 1
        context = json.loads(provider.call_args.args[1])
        scope = context['question_scope']
        assert [fact['text'] for fact in scope['facts']] == ['I validate SQL reports.', notes]
        assert all(not fact['id'].startswith(('cv:', 'note:')) for fact in scope['facts'])
        assert scope['missing_detail'] == 'Clarify the validation method.'
    assert receipt.charged_credits == 1


def test_assistant_receipt_handoff_and_legacy_replay_never_expose_edits(environment):
    from app.main import app
    from app.core.security import verify_token
    from app.api.routes import ai_assistant as route

    client, db, user, _ = environment
    app.dependency_overrides[verify_token] = lambda: {'sub': user.username}
    cv = {'name': 'Anna Nowak', 'title': 'Developer'}
    body = {'action': 'position_rating', 'elements': [], 'cv_data': cv, 'job_description': 'Developer'}
    result = {'message': 'Analysis', 'job_requirements': [{'text': 'Python', 'match_status': 'missing'}],
              'corrections': [{'element_id': 'name', 'content': 'Invented'}], 'updated_cv_data': {'name': 'Invented'}}
    headers = {'Idempotency-Key': 'owned-analysis'}
    with patch.object(route, 'resolve_user_from_payload', return_value=user), \
         patch.object(route, 'resolve_job_offer', return_value={'description': 'Developer', 'source': 'manual'}), \
         patch.object(route, 'log_metric_event'), patch.object(route, 'analyze_action', return_value=result) as provider:
        response = client.post('/ai/assistant', json=body, headers=headers)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload['analysis_key'] == 'owned-analysis'
        assert payload['corrections'] == [] and payload['updated_cv_data'] is None
        assert '_interview_analysis' not in payload
        session = create(client, mode='tailor', job_description='Developer', analysis_key=payload['analysis_key'])
        assert session['requirements'][0]['status'] == 'unknown'
        receipt = db.query(AiCreditReservation).filter_by(idempotency_key='owned-analysis').one()
        assert receipt.response_json['_interview_analysis']['offer']['description'] == 'Developer'
        receipt.response_json = {**receipt.response_json, 'corrections': [{'element_id': 'name', 'content': 'Legacy'}], 'updated_cv_data': {'name': 'Legacy'}}
        db.commit()
        replay = client.post('/ai/assistant', json=body, headers=headers).json()
        assert replay['corrections'] == [] and replay['updated_cv_data'] is None
        assert provider.call_count == 1
        refreshed = client.post(f"/ai/interviews/{session['id']}/source", json={**version(session), 'cv_data': {**cv, 'title': 'Engineer'}})
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()['job_analysis_ready'] is False
        assert refreshed.json()['requirements'] == []
        assert refreshed.json()['planned_question_count'] is None
