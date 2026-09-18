"""Timing events must stay content-free across failures, nesting and replay."""
import json
import logging
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from openai import APITimeoutError

from app.services import ai_assistant_service as assistant
from app.services.ai_telemetry import measure_operation, provider_span, usage_counters


def test_provider_clock_excludes_processing_and_outer_span_sums_calls(caplog):
    caplog.set_level(logging.INFO, logger="ai_latency")

    @measure_operation("assistant")
    def operation(action):
        with provider_span("gpt-5.6-luna", "assistant:grammar", "low", "json_object") as span:
            span.received(SimpleNamespace(usage=None, choices=[]))

    with patch("app.services.ai_telemetry.perf_counter", side_effect=[10, 11, 13, 16]):
        operation("grammar")
    provider, total = [json.loads(record.message) for record in caplog.records]
    assert provider["provider_ms"] == 2000
    assert total["duration_ms"] == 6000
    assert total["provider_calls"] == 1
    assert total["provider_ms"] == 2000
    assert provider["reasoning_tokens"] is None


def test_usage_distinguishes_missing_and_zero():
    response = SimpleNamespace(usage=SimpleNamespace(prompt_tokens=20, completion_tokens=5,
        prompt_tokens_details=SimpleNamespace(cached_tokens=0),
        completion_tokens_details=SimpleNamespace(reasoning_tokens=3)))
    counters = usage_counters(response)
    assert counters == {"input_tokens": 20, "output_tokens": 5, "reasoning_tokens": 3,
                        "cached_tokens": 0, "cache_write_tokens": None}


@pytest.mark.parametrize("failure", ["timeout", "json", "empty", "no_choices"])
def test_failures_log_one_safe_provider_event(caplog, failure):
    caplog.set_level(logging.INFO, logger="ai_latency")
    response = SimpleNamespace(choices=[] if failure == "no_choices" else [SimpleNamespace(
        message=SimpleNamespace(content="private output" if failure == "json" else ""),
        finish_reason="length" if failure == "empty" else "stop")],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15))
    error = APITimeoutError(request=httpx.Request("POST", "https://example.test")) if failure == "timeout" else None
    with patch.object(assistant._client.chat.completions, "create", return_value=response, side_effect=error) as provider:
        with pytest.raises(assistant.AIServiceError) as caught:
            assistant._gpt("private instructions", "private CV", action="grammar")
    assert provider.call_count == 1
    events = [json.loads(record.message) for record in caplog.records if record.name == "ai_latency"]
    assert len(events) == 1
    assert events[0]["outcome"] == ("response_lost" if failure == "timeout" else "invalid_response")
    assert "private" not in caplog.text
    assert caught.value.reservation_outcome == ("uncertain" if failure == "timeout" else "settle_usage")


def test_replay_has_no_provider_time_and_failed_spans_do_not_leak(caplog):
    caplog.set_level(logging.INFO, logger="ai_latency")

    @measure_operation("interview")
    def replay(operation):
        return {"_replayed": True}

    assert replay("verify")["_replayed"]
    event = json.loads(caplog.records[-1].message)
    assert event["provider_calls"] == 0
    assert event["provider_ms"] == 0
    assert event["task"] == "interview:verify"
