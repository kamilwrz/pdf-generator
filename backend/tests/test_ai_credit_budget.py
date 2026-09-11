"""Provider payload sizing and request-local credit-budget isolation."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import Mock, patch

import pytest

from app.services.ai_credit_budget import assistant_credit_budget, apply_assistant_credit_budget


def _request(text="CV", schema=None):
    return {
        "model": "gpt-5.6-terra",
        "messages": [{"role": "system", "content": text}, {"role": "user", "content": "CV"}],
        "response_format": schema or {"type": "json_object"},
        "max_completion_tokens": 16_000,
    }


def test_final_system_prompt_and_response_schema_increase_the_reservation():
    sizes = []
    def reserve(*_args, **kwargs):
        sizes.append(kwargs["preferred_credits"])
        return kwargs["preferred_credits"]

    with patch("app.services.ai_credit_budget.resize_ai_reservation", side_effect=reserve):
        for request in (_request(), _request("Reguły. " * 2000), _request(schema={"schema": "x" * 30000})):
            with assistant_credit_budget(Mock(), user_id=1, reservation_id="claim"):
                apply_assistant_credit_budget(request)
    assert sizes[1] > sizes[0]
    assert sizes[2] > sizes[0]


def test_budget_restores_context_after_failure_and_rejects_a_second_provider_call():
    with patch("app.services.ai_credit_budget.resize_ai_reservation", return_value=2) as reserve:
        with pytest.raises(RuntimeError, match="only one provider call"):
            with assistant_credit_budget(Mock(), user_id=1, reservation_id="claim"):
                apply_assistant_credit_budget(_request())
                apply_assistant_credit_budget(_request())
        independent = _request()
        apply_assistant_credit_budget(independent)
        assert independent["max_completion_tokens"] == 16_000
        reserve.assert_called_once()


def test_parallel_users_have_separate_reservation_callbacks():
    barrier = Barrier(2)
    def reserve(_db, **kwargs):
        assert kwargs["reservation_id"] == f"claim-{kwargs['user_id']}"
        return kwargs["user_id"]

    def execute(user_id):
        with assistant_credit_budget(Mock(), user_id=user_id, reservation_id=f"claim-{user_id}"):
            barrier.wait(timeout=5)
            request = _request()
            apply_assistant_credit_budget(request)
            return request["max_completion_tokens"]

    with patch("app.services.ai_credit_budget.resize_ai_reservation", side_effect=reserve):
        with ThreadPoolExecutor(max_workers=2) as executor:
            caps = list(executor.map(execute, [1, 2]))
    assert 256 <= caps[0] < caps[1] < 16_000
