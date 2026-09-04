"""Scoped input, fact guards, provider selection and metering regression tests."""
import copy
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from starlette.requests import Request

from app.api.routes.ai_assistant import AssistantRequest
from app.services.ai_assistant_service import AIServiceError
from app.services.scoped_ai import ScopedContent, review_scoped_content, validate_scoped_result


def scope_payload():
    return {"kind": "entry", "section_type": "experience", "language": "pl",
            "records": [{"id": "role-1", "context": ["Programista", "2020–2023"]}],
            "fragments": [{"id": "description:0", "record_id": "role-1", "kind": "description",
                           "content": "Rozwijałem aplikacje Python dla 30 klientów."}]}


def result_payload():
    return {"message": "Skrócono opis.", "scoped_corrections": [{
        "fragment_id": "description:0", "before": scope_payload()["fragments"][0]["content"],
        "content": "Tworzyłem aplikacje Python dla 30 klientów.",
    }], "achievement_templates": []}


@pytest.mark.parametrize("field,value", [
    ("elements", []), ("cv_data", {}), ("history", []), ("message", ""),
    ("page_size", {}), ("template_id", None), ("job_description", "offer"),
])
def test_scope_rejects_even_empty_global_snapshot_fields(field, value):
    with pytest.raises(ValidationError):
        AssistantRequest(action="shorten", scoped_content=scope_payload(), **{field: value})


def test_scope_limit_counts_context_without_silent_truncation():
    payload = scope_payload()
    payload["records"][0]["context"] = ["x" * 20_000]
    with pytest.raises(ValidationError, match="20 000"):
        ScopedContent.model_validate(payload)


@pytest.mark.parametrize("action", ["shorten", "language", "improve"])
def test_three_scoped_operations_keep_known_provider_usage(action):
    usage = {"cost_pln_estimate": 0.05, "model": "gpt-5.6-terra"}
    with patch("app.services.ai_assistant_service._model_for_action", return_value="gpt-5.6-terra"), \
         patch("app.services.ai_assistant_service._gpt", return_value=(result_payload(), usage)) as provider:
        response = review_scoped_content(action, ScopedContent.model_validate(scope_payload()))
    assert response["usage"] == usage
    assert provider.call_args.kwargs["action"] == action
    assert "geometry" not in provider.call_args.args[1]


@pytest.mark.parametrize("change", [
    {"fragment_id": "another-role"}, {"content": ""}, {"before": "stale"},
    {"content": "Tworzyłem aplikacje Python dla 40 klientów."},
    {"content": "Tworzyłem aplikacje Java dla 30 klientów."},
    {"content": "Tworzyłem aplikacje dla 30 klientów."},
    {"content": "Tworzyłem aplikacje Python dla 30 klientów i [wynik]."},
    {"left": 30},
])
def test_invalid_correction_rejects_entire_result(change):
    result = result_payload()
    result["scoped_corrections"][0].update(change)
    with pytest.raises(ValueError):
        validate_scoped_result(result, ScopedContent.model_validate(scope_payload()), "improve")


def test_empty_result_is_valid_when_no_safe_shortening_exists():
    result = {"message": "Tekst jest już zwięzły.", "scoped_corrections": [], "achievement_templates": []}
    assert validate_scoped_result(result, ScopedContent.model_validate(scope_payload()), "shorten") == result


def test_achievement_template_is_separate_and_only_available_for_improve():
    result = result_payload()
    result["achievement_templates"] = [{"fragment_id": "description:0",
        "template": "Tworzyłem aplikacje Python; [potwierdzony rezultat].", "questions": ["Jaki był rezultat?"]}]
    response = validate_scoped_result(result, ScopedContent.model_validate(scope_payload()), "improve")
    assert "[potwierdzony" not in response["scoped_corrections"][0]["content"]
    with pytest.raises(ValueError):
        validate_scoped_result(result, ScopedContent.model_validate(scope_payload()), "language")


def test_bad_paid_response_retains_usage_for_failed_settlement():
    result = result_payload()
    result["scoped_corrections"][0]["content"] = "Invented 99"
    usage = {"cost_pln_estimate": 0.07}
    with patch("app.services.ai_assistant_service._gpt", return_value=(result, usage)), \
         pytest.raises(AIServiceError) as raised:
        review_scoped_content("shorten", ScopedContent.model_validate(scope_payload()))
    assert raised.value.reservation_outcome == "settle_usage"
    assert raised.value.usage == usage


@pytest.mark.parametrize("model", ["gemma", "qwen3"])
def test_only_gpt_models_are_allowed(model):
    with patch("app.services.ai_assistant_service._model_for_action", return_value=model), \
         patch("app.services.ai_assistant_service._gpt") as provider, pytest.raises(AIServiceError):
        review_scoped_content("shorten", ScopedContent.model_validate(scope_payload()))
    provider.assert_not_called()


def test_duplicate_fragment_and_record_ids_are_rejected():
    for key in ["records", "fragments"]:
        payload = scope_payload()
        payload[key].append(copy.deepcopy(payload[key][0]))
        with pytest.raises(ValidationError):
            ScopedContent.model_validate(payload)


def test_one_skill_cannot_turn_into_multiple_items():
    payload = scope_payload()
    payload["fragments"][0].update(kind="skill", content="Zarządzanie projektami")
    result = result_payload()
    result["scoped_corrections"][0].update(before="Zarządzanie projektami", content="Zarządzanie projektami\nAnaliza danych")
    with pytest.raises(ValueError):
        validate_scoped_result(result, ScopedContent.model_validate(payload), "improve")


def test_route_reuses_credit_reservation_and_replay_for_scoped_responses():
    from app.api.routes.ai_assistant import ai_assistant
    result = {**result_payload(), "usage": {"cost_pln_estimate": 0.05}}
    request = AssistantRequest(action="shorten", scoped_content=scope_payload())
    http = Request({"type": "http", "headers": []})
    prefix = "app.api.routes.ai_assistant."
    with ExitStack() as stack:
        for name in ["assert_can_use_ai_action", "assert_can_use_scoped_ai", "validate_and_resolve_image_elements", "log_metric_event"]:
            stack.enter_context(patch(prefix + name))
        stack.enter_context(patch(prefix + "resolve_user_from_payload", return_value=SimpleNamespace(id=1)))
        reserve = stack.enter_context(patch(prefix + "reserve_ai_credits", side_effect=[
            SimpleNamespace(replay_response=None, reservation_id=10), SimpleNamespace(replay_response=result),
        ]))
        settle = stack.enter_context(patch(prefix + "settle_ai_reservation", return_value=result))
        provider = stack.enter_context(patch(prefix + "review_scoped_content", return_value=result))
        legacy = stack.enter_context(patch(prefix + "analyze_action"))
        first = ai_assistant(request, http, "same-key", {}, None)
        second = ai_assistant(request, http, "same-key", {}, None)
    assert first.scoped_corrections == second.scoped_corrections == result["scoped_corrections"]
    assert reserve.call_args_list[0].kwargs["request_hash"] == reserve.call_args_list[1].kwargs["request_hash"]
    provider.assert_called_once()
    settle.assert_called_once()
    legacy.assert_not_called()


def test_route_denies_entitlement_before_reserving_scoped_credits():
    from app.api.routes.ai_assistant import ai_assistant
    with patch("app.api.routes.ai_assistant.resolve_user_from_payload", return_value=SimpleNamespace(id=1)), \
         patch("app.api.routes.ai_assistant.assert_can_use_scoped_ai", side_effect=HTTPException(403)), \
         patch("app.api.routes.ai_assistant.reserve_ai_credits") as reserve, pytest.raises(HTTPException):
        ai_assistant(AssistantRequest(action="shorten", scoped_content=scope_payload()),
                     Request({"type": "http", "headers": []}), "key", {}, None)
    reserve.assert_not_called()
