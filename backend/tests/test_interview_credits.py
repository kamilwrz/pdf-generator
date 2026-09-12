"""Interview receipts use actual ledger charges across failures and retries."""
from datetime import datetime, timedelta
from uuid import uuid4
from unittest.mock import patch

from app.main import app
from app.core.security import get_current_user
from app.models.models import AiCreditReservation
from app.services import interview_service as service
from app.services.entitlements import set_user_plan
from test_interviews import environment, create, confirm, version  # noqa: F401


def test_receipts_group_requests_without_exposing_provider_data(environment):
    client, db, user, other = environment
    session = create(client)
    prefix = f"interview:{session['id']}:"

    def add(suffix, credits, status='settled', owner=user, key_prefix=prefix):
        created = datetime(2026, 9, 12, 10) + timedelta(seconds=db.query(AiCreditReservation).count())
        db.add(AiCreditReservation(
            id=str(uuid4()), user_id=owner.id, period_key='2026-09', action='interview',
            idempotency_key=key_prefix + suffix, request_hash='private-hash',
            reserved_credits=100, charged_credits=credits, status=status,
            created_at=created, expires_at=created + timedelta(minutes=10),
            response_json={'secret': 'provider-payload'},
        ))
        db.commit()

    add('2:1:analysis', 2)
    add('2:1:next', 7)
    add('v2:attempt:preview:3', 11)
    add('v2:attempt:editorial:3', 3, 'failed')
    # Retried generation reuses the draft; only new stages belong to revision 4.
    add('v2:attempt:editorial:4', 4)
    add('v2:attempt:verify:4', 0, 'pending')
    add('5:1:next', 0, 'released')
    add('6:1:next', 99, owner=other)
    add('6:1:next', 88, key_prefix='interview:another-session:')
    url = f"/ai/interviews/{session['id']}/credits"
    with patch.object(service, '_gpt') as provider:
        result = client.get(url)
        assert result.status_code == 200
        payload = result.json()
        assert payload['credits_charged'] == 27
        assert [item['credits_charged'] for item in payload['requests']] == [0, 4, 14, 9]
        assert [stage['operation'] for stage in payload['requests'][3]['stages']] == ['analysis', 'next']
        assert payload['requests'][1]['pending'] is True
        assert [stage['operation'] for stage in payload['requests'][2]['stages']] == ['preview', 'editorial']
        assert payload['requests'][2]['stages'][1]['status'] == 'failed'
        assert all('Z' in item['created_at'] for item in payload['requests'])
        assert all(secret not in result.text for secret in ('private-hash', 'provider-payload', prefix, 'reserved_credits'))
        set_user_plan(db, user.id, 'free')
        assert client.get(url).json() == payload
        provider.assert_not_called()
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get(url).status_code == 404
    assert client.get('/ai/interviews/missing/credits').status_code == 404


def test_question_receipt_survives_resume_and_replay_without_new_charge(environment):
    client, _, _, _ = environment
    session = confirm(client, create(client))
    url = f"/ai/interviews/{session['id']}"
    assert client.get(url + '/credits').json() == {'credits_charged': 0, 'requests': []}
    output = {'questions': [], 'requirements': []}
    with patch.object(service, '_gpt', return_value=(output, {'cost_pln_estimate': .07})) as provider:
        result = client.post(url + '/next', json=version(session, 1))
        assert result.status_code == 200, result.text
        first = client.get(url + '/credits').json()
        assert first['credits_charged'] > 0
        assert len(first['requests']) == 1
        assert first['requests'][0]['operation'] == 'next'
        resumed = client.get(url).json()
        assert client.post(url + '/next', json=version(resumed, 1)).status_code == 200
        assert client.get(url + '/credits').json() == first
        assert provider.call_count == 1
