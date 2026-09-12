"""Alternate layouts keep verified CV data and remain free, owned and atomic."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.main import app
from app.core.security import get_current_user
from app.models.models import InterviewSession, AiCreditReservation
from app.services import interview_service as service
from app.services.entitlements import set_user_plan
from app.services.interview_templates import _candidate
from app.services.ai_service import generate_resume
from test_interviews import environment, version
from test_interview_fit import prepared, post


def completed(client, db):
    session = prepared(client, db)
    result = post(client, session, action='finish')
    assert result.status_code == 200, result.text
    return result.json()


def choices(client, session, **updates):
    return client.post(f"/ai/interviews/{session['id']}/preview-templates", json={
        **version(session, session['profile_revision']), **updates})


def choose(client, session, candidate, **updates):
    return client.post(f"/ai/interviews/{session['id']}/preview-template", json={
        **version(session, session['profile_revision']), 'template_id': candidate['template_id'],
        'elements': candidate['elements'], 'spacing_px': candidate['spacing_px'], **updates})


def test_scanning_is_deterministic_free_and_does_not_change_session(environment):
    client, db, _, _ = environment
    session = completed(client, db)
    credits = db.query(AiCreditReservation).count()
    with patch.object(service, '_gpt') as provider:
        first = choices(client, session)
        second = choices(client, session)
        provider.assert_not_called()
    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    data = first.json()
    assert data['target_pages'] == 1
    assert data['revision'] == session['revision']
    assert len(data['candidates']) == 9
    assert 'linden' not in [item['template_id'] for item in data['candidates']]
    assert client.get(f"/ai/interviews/{session['id']}").json() == session
    assert db.query(AiCreditReservation).count() == credits


def test_selection_preserves_prose_evidence_usage_and_restore_template(environment):
    client, db, _, _ = environment
    session = completed(client, db)
    original = deepcopy(session['fit_original'])
    candidate = next(item for item in choices(client, session).json()['candidates'] if item['template_id'] == 'meridian')
    assert candidate['pages'] == 1
    with patch.object(service, '_gpt') as provider:
        response = choose(client, session, candidate)
        assert response.status_code == 200, response.text
        saved = response.json()
        assert saved['revision'] == session['revision'] + 1
        assert saved['template_id'] == 'meridian'
        assert saved['preview']['pages'] == 1
        for key in ['cv_data', 'changes', 'profile_revision', 'remaining_gaps']:
            assert saved['preview'][key] == session['preview'][key]
        for key in ['evidence_profile', 'source_cv_data', 'usage']:
            assert saved.get(key) == session.get(key)
        restored = post(client, saved, action='restore')
        assert restored.status_code == 200, restored.text
        assert restored.json()['template_id'] == 'linden'
        assert restored.json()['preview']['elements'] == original['preview']['elements']
        assert restored.json()['spacing_px'] == original['spacing_px']
        provider.assert_not_called()


def test_allowed_templates_filtered_and_rechecked_when_selecting(environment):
    client, db, user, _ = environment
    session = completed(client, db)
    pro = next(item for item in choices(client, session).json()['candidates'] if item['template_id'] == 'regent')
    set_user_plan(db, user.id, 'free')
    data = choices(client, session)
    assert data.status_code == 200, data.text
    assert {item['template_id'] for item in data.json()['candidates']} == {'sterling', 'meridian'}
    assert choose(client, session, pro).status_code == 403


@pytest.mark.parametrize('kind', ['revision', 'profile_revision', 'foreign', 'pending', 'completed', 'one_page'])
def test_scan_and_selection_reject_stale_or_unavailable_preview(environment, kind):
    client, db, _, other = environment
    session = completed(client, db)
    candidate = choices(client, session).json()['candidates'][0]
    kwargs = {}
    expected = 409
    if kind in ['revision', 'profile_revision']:
        kwargs[kind] = session[kind] + 1
    elif kind == 'foreign':
        app.dependency_overrides[get_current_user] = lambda: other
        expected = 404
    else:
        row = db.get(InterviewSession, session['id'])
        state = deepcopy(row.state)
        if kind == 'pending': state['preview']['fit']['status'] = 'pending'
        elif kind == 'completed': state['phase'] = 'completed'
        else: state['preview']['pages'] = 1
        row.state = state
        db.commit()
    assert choices(client, session, **kwargs).status_code == expected
    assert choose(client, session, candidate, **kwargs).status_code == expected


@pytest.mark.parametrize('damage', ['rewrite', 'remove', 'font', 'multipage', 'asset', 'hidden'])
def test_selection_rejects_damaged_or_not_single_page_candidate(environment, damage):
    client, db, _, _ = environment
    session = completed(client, db)
    candidate = next(item for item in choices(client, session).json()['candidates'] if item['template_id'] == 'meridian')
    text = next(el for el in candidate['elements'] if el.get('content') and not el.get('fixedToPage'))
    if damage == 'rewrite': text['content'] = 'Invented experience'
    elif damage == 'remove': candidate['elements'].remove(text)
    elif damage == 'font': text['fontSize'] = 1
    elif damage == 'multipage': text['page'] = 2
    elif damage == 'hidden': text['photoSlotHidden'] = True
    else: candidate['elements'][0]['src'] = 'https://example.com/untrusted.png'
    assert choose(client, session, candidate).status_code == 422
    assert client.get(f"/ai/interviews/{session['id']}").json() == session


def test_photo_is_preserved_only_in_templates_with_an_authored_slot(environment):
    client, db, _, _ = environment
    session = completed(client, db)
    row = db.get(InterviewSession, session['id'])
    state = deepcopy(row.state)
    state['preview']['elements'].append({'element_id': 'photo', 'id': 'profile-photo', 'category': 'image',
        'photoSlot': 'image', 'src': 'https://example.com/owned-photo.png', 'page': 1,
        'left': 30, 'top': 30, 'width': 80, 'height': 90, 'flowRole': 'masthead'})
    row.state = state
    db.commit()
    result = choices(client, session)
    assert result.status_code == 200, result.text
    candidates = result.json()['candidates']
    assert candidates
    assert 'meridian' not in [item['template_id'] for item in candidates]
    for candidate in candidates:
        photo = next(el for el in candidate['elements'] if el.get('photoSlot') == 'image')
        assert photo['src'] == 'https://example.com/owned-photo.png'
        assert photo['width'] > 0 and photo['height'] > 0
        assert not photo['fixedToPage']
    candidate = next(item for item in candidates if item['template_id'] == 'atrium')
    assert choose(client, session, candidate).status_code == 200


def test_incompatible_template_that_drops_visible_fact_is_excluded(environment):
    client, db, _, _ = environment
    session = completed(client, db)
    row = db.get(InterviewSession, session['id'])
    with patch('app.services.interview_templates.generate_resume', return_value=[{
        'category': 'text', 'content': 'Test Candidate', 'page': 1, 'fontSize': 20}]):
        assert _candidate(row, 'meridian') is None


def test_record_groups_are_repeatable_despite_generator_randomness():
    data = {'name': 'Test Candidate', 'experience': [
        {'title': 'Developer', 'company': 'Example', 'period': '2020', 'bullets': ['Built test tools.']},
        {'title': 'Analyst', 'company': 'Other', 'period': '2019', 'bullets': ['Reviewed reports.']}]}
    row = SimpleNamespace(id='synthetic-groups', revision=4, state={
        'template_id': 'linden', 'spacing_px': None,
        'preview': {'cv_data': data, 'elements': generate_resume('linden', data)}})
    first = _candidate(row, 'regent')
    second = _candidate(row, 'regent')
    assert first == second
    assert len({el['flowGroup'] for el in first['elements'] if el.get('flowGroup')}) >= 2
