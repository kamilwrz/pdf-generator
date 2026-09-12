"""Synthetic evidence and layout fixtures; no live provider or personal data."""
from copy import deepcopy
from unittest.mock import patch

import pytest

from app.models.models import InterviewSession, AiCreditReservation
from app.services import interview_service as service
from app.services.interview_fit import initialise_fit, _stop
from app.services.interview_credits import interview_credit_usage
from app.schemas.interview_schema import PreviewFitWrite
from test_interviews import environment, create, confirm, version

LONG = 'Przygotowywanie raportów oraz porządkowanie dokumentacji i kontrolowanie terminów.'
SHORT = 'Przygotowywanie raportów, porządkowanie dokumentacji i kontrola terminów.'


def prepared(client, db):
    session = confirm(client, create(client, include_profile=False, cv_data={'name': 'Test Candidate', 'summary': LONG}))
    row = db.get(InterviewSession, session['id'])
    profile = service.interview_profile(db, row)
    field = next(f for f in profile['facts'] if f['path'] == '/summary')
    changes = [{'path': '/summary', 'value': LONG, 'evidence_refs': [field['id']]}]
    elements = [
        {'element_id': 'name', 'category': 'text', 'content': 'Test Candidate', 'top': 80, 'left': 60, 'page': 1, 'fontSize': 20, 'flowRole': 'masthead'},
        {'element_id': 'summary', 'category': 'textarea', 'content': LONG, 'top': 66, 'left': 60, 'width': 450, 'height': 100, 'page': 2, 'fontSize': 10, 'lineHeight': 13},
    ]
    state = deepcopy(row.state)
    state.update(phase='preview', template_id='linden', generation_attempt={'id': 'fit-attempt', 'version': 5},
                 preview={'cv_data': {'name': 'Test Candidate', 'summary': LONG}, 'changes': changes,
                          'elements': elements, 'pages': 2, 'profile_revision': profile['revision'], 'remaining_gaps': []})
    initialise_fit(state)
    row.state = state
    db.commit()
    return service.session_payload(row)


def post(client, session, **changes):
    body = {**version(session, session['profile_revision']), 'action': 'shorten',
            'elements': session['preview']['elements'], 'spacing_px': session['spacing_px'],
            'target_pages': 1, 'required_reduction': .28, 'editable_height': 500, **changes}
    return client.post(f"/ai/interviews/{session['id']}/preview-fit", json=body)


def test_finish_persists_content_geometry_and_spacing_together_and_restore_is_free(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    layout = deepcopy(session['preview']['elements'])
    layout[1].update(page=1, top=140)
    with patch.object(service, '_gpt') as provider:
        result = post(client, session, action='finish', elements=layout, spacing_px={'stack': 3, 'record': 7, 'section': 15, 'after_rule': 6})
        assert result.status_code == 200, result.text
        saved = result.json()
        assert saved['preview']['pages'] == 1
        assert saved['preview']['cv_data'] == session['preview']['cv_data']
        assert saved['preview']['elements'][1]['top'] == 140
        assert saved['spacing_px']['section'] == 15
        assert saved['preview']['fit']['can_restore']
        restored = post(client, saved, action='restore').json()
        assert restored['preview']['pages'] == 2
        assert restored['preview']['elements'] == session['preview']['elements']
        assert restored['spacing_px'] == session['spacing_px']
        assert restored['preview']['fit']['status'] == 'restored'
        provider.assert_not_called()


@pytest.mark.parametrize('damage', ['remove', 'rewrite', 'hide', 'tiny', 'outside', 'duplicate'])
def test_layout_cannot_bypass_content_or_readability_checks(environment, damage):
    client, db, _, _ = environment
    session = prepared(client, db)
    layout = deepcopy(session['preview']['elements'])
    if damage == 'remove': layout.pop()
    if damage == 'rewrite': layout[1]['content'] = 'Different fact'
    if damage == 'hide': layout[1]['fixedToPage'] = True
    if damage == 'tiny': layout[1]['fontSize'] = 2
    if damage == 'outside': layout[1]['top'] = 900
    if damage == 'duplicate': layout.append(layout[1])
    assert post(client, session, action='finish', elements=layout).status_code == 422
    assert client.get(f"/ai/interviews/{session['id']}").json()['preview']['fit']['status'] == 'pending'


def test_shortening_verifies_original_evidence_and_reports_both_charges(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    before = deepcopy(session['evidence_profile'])
    outputs = [({'fields': [{'path': '/summary', 'value': SHORT}]}, {'cost_pln_estimate': .01}),
               ({'rejected_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})]
    with patch.object(service, '_gpt', side_effect=outputs) as provider:
        result = post(client, session)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['preview']['cv_data']['summary'] == SHORT
    assert saved['preview']['fit']['attempts'] == 1
    assert saved['evidence_profile'] == before
    assert saved['fit_original']['preview']['cv_data']['summary'] == LONG
    import json
    checked = json.loads(provider.call_args_list[1].args[1])
    assert checked['original_fields'][0]['value'] == LONG
    receipt = interview_credit_usage(db, db.get(InterviewSession, session['id']))
    assert [stage['operation'] for stage in receipt['requests'][0]['stages']] == ['shorten', 'fit_verify']


def test_semantic_loss_retains_previous_verified_text_and_stops(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=[
        ({'fields': [{'path': '/summary', 'value': 'Przygotowywanie raportów.'}]}, {'cost_pln_estimate': .01}),
        ({'rejected_paths': ['/summary'], 'reasons': ['Lost distinct facts']}, {'cost_pln_estimate': .01}),
    ]):
        result = post(client, session)
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['preview']['cv_data'] == session['preview']['cv_data']
    assert not saved['preview']['fit']['allow_shorten']
    with patch.object(service, '_gpt') as provider:
        post(client, saved)
        provider.assert_not_called()


def test_pending_fit_blocks_save_and_reads_do_not_run_ai(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt') as provider:
        assert client.get(f"/ai/interviews/{session['id']}").status_code == 200
        assert client.post(f"/ai/interviews/{session['id']}/document", json=version(session, session['profile_revision'])).status_code == 409
        provider.assert_not_called()


def test_verification_failure_reuses_paid_shortening_on_explicit_retry(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    with patch.object(service, '_gpt', side_effect=[
        ({'fields': [{'path': '/summary', 'value': SHORT}]}, {'cost_pln_estimate': .01}),
        service.AIServiceError('Offline', reservation_outcome='release'),
    ]):
        assert post(client, session).status_code == 500
    current = client.get(f"/ai/interviews/{session['id']}").json()
    with patch.object(service, '_gpt', return_value=({'rejected_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})) as provider:
        result = post(client, current)
    assert result.status_code == 200, result.text
    assert provider.call_count == 1
    assert result.json()['preview']['fit']['attempts'] == 1
    assert db.query(AiCreditReservation).filter_by(status='settled').count() == 2


@pytest.mark.parametrize('fit,ratio,height,reason', [
    ({'attempts': 3}, .1, 500, 'attempt_limit'),
    ({'attempts': 0}, .31, 500, 'too_much_content'),
    ({'attempts': 1, 'previous_height': 500}, .2, 490, 'no_progress'),
    ({'attempts': 1, 'previous_height': 500}, .2, 450, None),
])
def test_iteration_gates(fit, ratio, height, reason):
    request = PreviewFitWrite(revision=1, profile_revision=1, evidence_scope='session', action='shorten', required_reduction=ratio, editable_height=height)
    assert _stop({'allow_shorten': True, **fit}, request) == reason


def test_stale_revision_and_other_owner_cannot_fit(environment):
    client, db, _, other = environment
    session = prepared(client, db)
    assert post(client, session, revision=session['revision']-1).status_code == 409
    row = db.get(InterviewSession, session['id'])
    row.owner_id = other.id
    db.commit()
    assert post(client, session).status_code == 404


@pytest.mark.parametrize('ratio,limit', [(.10, 1), (.25, 2), (.30, 3)])
def test_paid_attempt_ceiling_is_persisted_across_requests(environment, ratio, limit):
    client, db, _, _ = environment
    session = prepared(client, db)
    variants = [SHORT, 'Raportowanie, porządkowanie dokumentacji i kontrola terminów.', 'Raporty, dokumentacja i kontrola terminów.']
    outputs = []
    for text in variants[:limit]:
        outputs.extend([({'fields': [{'path': '/summary', 'value': text}]}, {'cost_pln_estimate': .01}),
                        ({'rejected_paths': [], 'reasons': []}, {'cost_pln_estimate': .01})])
    def render(state, data, revision):
        elements = deepcopy(state['preview']['elements'])
        elements[1]['content'] = data['summary']
        return elements
    with patch.object(service, '_gpt', side_effect=outputs) as provider, patch('app.services.interview_fit._render', side_effect=render):
        for index in range(limit):
            result = post(client, session, required_reduction=ratio, editable_height=500-index*50)
            assert result.status_code == 200, result.text
            session = result.json()
        stopped = post(client, session, required_reduction=ratio, editable_height=300).json()
    assert provider.call_count == limit*2
    assert stopped['preview']['fit']['attempts'] == limit
    assert stopped['preview']['fit']['stop_reason'] == 'attempt_limit'


def test_document_creation_uses_the_final_layout_snapshot(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    layout = deepcopy(session['preview']['elements'])
    layout[1].update(page=1, top=140)
    fitted = post(client, session, action='finish', elements=layout, spacing_px={'section': 15}).json()
    from app.api.routes import interviews
    with patch.object(interviews, 'create_pdf_document', return_value={'pdf_id': 123}) as create_document:
        response = client.post(f"/ai/interviews/{session['id']}/document", json=version(fitted, fitted['profile_revision']))
    assert response.status_code == 200, response.text
    payload = create_document.call_args.kwargs['pdf_data']
    assert payload.pages == 1
    assert payload.spacing_px['section'] == 15
    assert payload.cv_data == fitted['preview']['cv_data']
    assert next(el for el in payload.root if el.element_id == 'summary').top == 140


def test_time_budget_stops_new_calls_but_allows_free_finish(environment):
    client, db, _, _ = environment
    session = prepared(client, db)
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state['preview']['fit']['started_at'] = '2000-01-01T00:00:00+00:00'
    row.state = state
    db.commit()
    with patch.object(service, '_gpt') as provider:
        stopped = post(client, session).json()
        assert stopped['preview']['fit']['stop_reason'] == 'time_limit'
        assert post(client, stopped, action='finish').status_code == 200
        provider.assert_not_called()
