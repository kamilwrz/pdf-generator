"""Guided intake isolation, recovery, billing boundaries and privacy regressions."""
from copy import deepcopy
from uuid import uuid4
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.dependencies import get_db
from app.core.security import get_current_user, verify_token
from app.models.database import Base
from app.models.models import User, Pdf, TailoringFlow, InterviewSession, CareerProfile
from app.services.billing.entitlements import seed_plans, set_user_plan
from app.services.accounts.data import build_account_export, delete_account_data


@pytest.fixture
def env():
    engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    user = User(username='tailor-owner', email='owner@example.com', hashed_password='test', is_active=True)
    other = User(username='tailor-other', email='other@example.com', hashed_password='test', is_active=True)
    db.add_all([user, other]); db.commit()
    seed_plans(db); set_user_plan(db, user.id, 'free')
    cv = Pdf(owner_id=user.id, title='Source CV', cv_data={'name': 'Anna Example', 'skills': ['SQL']}, revision=1, template_id='linden')
    db.add(cv); db.commit()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[verify_token] = lambda: {'sub': user.username}
    yield TestClient(app), db, user, other, cv
    app.dependency_overrides.clear(); db.close(); engine.dispose()


def create(client, source_id, **changes):
    flow_id = str(uuid4())
    body = dict(revision=0, source_kind='document', source_id=source_id,
                job_description='We need a reporting analyst with SQL experience.', **changes)
    result = client.put(f'/tailoring/{flow_id}', json=body)
    assert result.status_code == 200, result.text
    return flow_id, body, result.json()


def test_free_drafts_resume_and_cannot_start_ai(env):
    client, db, user, _, cv = env
    flow_id, body, saved = create(client, cv.id)
    assert client.put(f'/tailoring/{flow_id}', json=body).json()['revision'] == saved['revision']
    assert client.get(f'/tailoring/{flow_id}').json()['job_description'] == body['job_description']
    response = client.post(f'/tailoring/{flow_id}/start', json={'revision': saved['revision']})
    assert response.status_code in (402, 403), response.text
    assert db.query(InterviewSession).count() == 0
    assert db.query(CareerProfile).count() == 0


def test_owner_and_revision_boundaries(env):
    client, db, user, other, cv = env
    flow_id, body, saved = create(client, cv.id)
    response = client.put(f'/tailoring/{flow_id}', json={**body, 'revision': 1, 'job_description': 'Updated advert'})
    assert response.status_code == 200
    assert client.put(f'/tailoring/{flow_id}', json={**body, 'revision': 1}).status_code == 409
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get(f'/tailoring/{flow_id}').status_code == 404
    assert client.delete(f'/tailoring/{flow_id}').status_code == 404
    assert client.get('/tailoring').json()['items'] == []
    assert client.put(f'/tailoring/{uuid4()}', json=body).status_code == 422


def test_start_replays_one_confirmed_isolated_interview_without_ai(env):
    client, db, user, _, cv = env
    set_user_plan(db, user.id, 'pro')
    flow_id, _, saved = create(client, cv.id)
    with patch('app.api.routes.interviews.resolve_job_offer', return_value={'text': 'SQL analyst'}) as resolve:
        first = client.post(f'/tailoring/{flow_id}/start', json={'revision': 1})
        assert first.status_code == 200, first.text
        second = client.post(f'/tailoring/{flow_id}/start', json={'revision': 1})
        assert second.status_code == 200, second.text
    assert first.json()['session_id'] == second.json()['session_id']
    assert resolve.call_count == 1
    session = db.query(InterviewSession).one()
    assert session.state['evidence_scope'] == 'session'
    assert session.state['confirmed'] is True
    assert session.state['answers'] == [] and session.state['question'] is None
    assert session.state['template_id'] == 'linden'
    assert db.query(CareerProfile).count() == 0
    # A completed document is obtained from server state, never a client ID.
    state = deepcopy(session.state); state['document_id'] = 123; session.state = state; db.commit()
    assert client.get(f'/tailoring/{flow_id}').json()['document_id'] == 123


def test_missing_offer_and_changed_source_are_rejected(env):
    client, db, user, _, cv = env
    set_user_plan(db, user.id, 'pro')
    flow_id, body, saved = create(client, cv.id)
    cv.cv_data = {'name': 'Different Example'}; db.commit()
    # Saving the advert must not implicitly approve the changed source.
    response = client.put(f'/tailoring/{flow_id}', json={**body, 'revision': 1, 'step': 'offer'})
    result = client.post(f'/tailoring/{flow_id}/start', json={'revision': response.json()['revision']})
    assert result.status_code == 409 and result.json()['detail']['code'] == 'tailoring_source_changed'
    response = client.put(f'/tailoring/{flow_id}', json={**body, 'revision': response.json()['revision'], 'step': 'source', 'job_description': ''})
    result = client.post(f'/tailoring/{flow_id}/start', json={'revision': response.json()['revision']})
    assert result.status_code == 422 and result.json()['detail']['code'] == 'tailoring_offer_required'


def test_drafts_follow_privacy_export_and_erasure(env):
    client, db, user, _, cv = env
    flow_id, _, _ = create(client, cv.id)
    export = build_account_export(db, user=user)
    assert export['tailoring_flows'][0]['id'] == flow_id
    delete_account_data(db, user_id=user.id)
    assert db.query(TailoringFlow).count() == 0


def test_checkout_uses_only_owned_flow_return(env):
    client, db, user, other, cv = env
    flow_id, _, _ = create(client, cv.id)
    with patch('app.api.routes.billing.ALLOW_UNPAID_PLAN_SELECTION', False), patch('app.api.routes.billing.STRIPE_SECRET_KEY', 'test'), patch('app.api.routes.billing.STRIPE_PRICE_PRO', 'price_test'), patch('app.api.routes.billing.create_checkout_session', return_value={'id': 'cs_test', 'url': 'https://checkout.stripe.com/test'}) as checkout:
        response = client.post('/billing/select-plan', headers={'Idempotency-Key': 'tailoring-test'}, json={'plan_slug': 'pro', 'tailoring_flow_id': flow_id})
        assert response.status_code == 200, response.text
        assert f'returnTo=%2Fapp%2Ftailor%2F{flow_id}' in checkout.call_args.kwargs['success_url']
        assert f'returnTo=%2Fapp%2Ftailor%2F{flow_id}' in checkout.call_args.kwargs['cancel_url']
        assert client.post('/billing/select-plan', json={'plan_slug': 'pro', 'tailoring_flow_id': str(uuid4())}).status_code == 404
