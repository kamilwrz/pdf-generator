"""Effort routing is independent of shared billing action and recovery keys."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services.ai_request_policy import reasoning_effort, task_name
from app.services import ai_assistant_service as assistant


@pytest.mark.parametrize("workflow,operation,action,expected", [
    ("assistant", "", "grammar", "low"),
    *[("assistant", "", action, "medium") for action in ("language", "improve", "shorten", "translate")],
    *[("assistant", "", action, "high") for action in ("rating", "position_rating", "ats_score", "chat", "unknown")],
    ("scoped", "", "language", "low"), ("scoped", "", "improve", "medium"),
    ("scoped", "", "shorten", "medium"), ("scoped", "", "unknown", "high"),
    *[("interview", operation, "improve", "medium") for operation in
      ("next", "answer-help", "editorial", "fit-shorten-1", "fit-shorten-3")],
    *[("interview", operation, "improve", "high") for operation in
      ("analysis", "preview", "verify", "answer-help-verify", "fit-verify-1", "unknown")],
])
def test_effort_at_provider_boundary(workflow, operation, action, expected):
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"), finish_reason="stop")], usage=None)
    with patch.object(assistant, "_MODEL", "gpt-5.6-luna"), \
         patch.object(assistant, "_ASSISTANT_REASONING_EFFORT", ""), \
         patch.object(assistant._client.chat.completions, "create", return_value=response) as provider:
        assistant._gpt("system", "input", action=action,
                       task=task_name(action, workflow=workflow, operation=operation))
    assert provider.call_count == 1
    assert provider.call_args.kwargs["reasoning_effort"] == expected
    assert provider.call_args.kwargs["max_completion_tokens"] == 16_000


def test_override_and_unknown_config_are_checked_before_spending():
    assert reasoning_effort("gpt-5.6-luna", "grammar", override=" HIGH ") == "high"
    assert reasoning_effort("gpt-5.6-luna", "improve", task="interview:verify", override="medium") == "medium"
    assert reasoning_effort("gpt-4o", "grammar") is None
    for model, override in (("gpt-5.6-luna", "minimal"), ("gpt-4o", "high"), ("unknown-model", "")):
        with patch.object(assistant, "_MODEL", model), \
             patch.object(assistant, "_ASSISTANT_REASONING_EFFORT", override), \
             patch.object(assistant._client.chat.completions, "create") as provider:
            with pytest.raises(assistant.AIServiceError) as error:
                assistant._gpt("s", "u", action="grammar")
            assert error.value.reservation_outcome == "release"
            provider.assert_not_called()


def test_metric_task_names_cannot_contain_user_content():
    assert task_name("private CV") == "assistant:unknown"
    assert task_name(workflow="interview", operation="private CV") == "interview:unknown"
    assert task_name(workflow="interview", operation="fit-verify-3") == "interview:fit-verify"
