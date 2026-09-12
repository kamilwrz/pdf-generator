"""Offer-driven interview scheduling and safe reuse of paid analyses."""
from collections import Counter
from datetime import datetime, timedelta
import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from app.models.models import AiCreditReservation, InterviewSession
from app.services import interview_service as service
from app.services.interview_job_analysis import analysis_signature, load_owned_analysis, requirement_topics
from app.services.interview_discovery import update_discovery_budget, next_entry, scoped_question
from test_interviews import environment, create, confirm, version


REQUIREMENTS = [
    {'text': 'SQL', 'status': 'matched', 'evidence_refs': []},
    {'text': 'Reporting', 'status': 'partial', 'evidence_refs': []},
    {'text': 'Python', 'status': 'unknown', 'evidence_refs': []},
]


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
        context = json.loads(provider.call_args_list[1].args[1])
        assert context['source_cv_data']['name'] == 'Anna Nowak'
        assert context['profile'] == facts
        assert context['question_scope']['kind'] == 'requirement'
    response = client.post(f"/ai/interviews/{session['id']}/answers", json={**version(session, 1),
        'question_id': session['question']['id'], 'answer': 'I wrote scripts at Acme.', 'status': 'answered'})
    assert response.status_code == 200, response.text
    session = response.json()
    with patch.object(service, '_gpt', return_value=({'questions': [], 'requirements': []}, {'cost_pln_estimate': .01})) as provider:
        response = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session['profile_revision']))
        assert response.status_code == 200, response.text
        assert provider.call_count == 1
        assert response.json()['question']['entry_id'] == session['answers'][0]['question']['entry_id']


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
