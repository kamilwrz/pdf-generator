"""Content-free timings for provider calls and complete AI operations.

Context-local spans support synchronous FastAPI worker threads and nested
interview stages. No request/response objects, exception messages, account IDs
or document IDs are ever passed to the logger. Missing usage is null, not zero.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
import inspect
import json
import logging
from time import perf_counter

from app.services.ai.request_policy import task_name

logger = logging.getLogger("ai_latency")
_operations: ContextVar[tuple] = ContextVar("ai_latency_operations", default=())


def _count(obj, name):
    value = obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
    return value if type(value) is int and value >= 0 else None


def _field(obj, name):
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def usage_counters(response):
    """Extract numeric SDK usage only; omitted counters remain unavailable."""
    usage = _field(response, "usage")
    input_details = _field(usage, "prompt_tokens_details") or _field(usage, "input_tokens_details")
    output_details = _field(usage, "completion_tokens_details") or _field(usage, "output_tokens_details")
    return {
        "input_tokens": _count(usage, "prompt_tokens"),
        "output_tokens": _count(usage, "completion_tokens"),
        "reasoning_tokens": _count(output_details, "reasoning_tokens"),
        "cached_tokens": _count(input_details, "cached_tokens"),
        "cache_write_tokens": _count(input_details, "cache_write_tokens"),
    }


def _outcome(error):
    if error is None:
        return "success"
    outcome = getattr(error, "reservation_outcome", None)
    return {"uncertain": "response_lost", "settle_usage": "invalid_response",
            "release": "rejected"}.get(outcome, "error")


class ProviderSpan:
    """Collect one provider attempt without storing its content or identifiers."""

    def __init__(self, model, task, effort, response_format):
        self.started = perf_counter()
        self.data = {"event": "ai_provider", "model": model, "task": task,
                     "reasoning_effort": effort, "response_format": response_format,
                     "provider_ms": None, "finish_reason": None,
                     **usage_counters(None)}

    def received(self, response=None):
        """Stop I/O timing before JSON parsing, even on a transport failure."""
        self.data["provider_ms"] = round((perf_counter() - self.started) * 1000, 3)
        self.data.update(usage_counters(response))
        choices = _field(response, "choices")
        if isinstance(choices, list) and choices:
            reason = _field(choices[0], "finish_reason")
            self.data["finish_reason"] = reason if reason in {
                "stop", "length", "content_filter", "tool_calls", "function_call"
            } else None


@contextmanager
def provider_span(model, task, effort, response_format):
    """Emit one numeric event after parsing, including failed/empty responses."""
    span = ProviderSpan(model, task, effort, response_format)
    error = None
    try:
        yield span
    except Exception as exc:
        error = exc
        raise
    finally:
        if span.data["provider_ms"] is None:
            span.received()
        span.data["outcome"] = _outcome(error)
        span.data["error_type"] = type(error).__name__ if error else None
        for operation in _operations.get():
            operation["provider_calls"] += 1
            operation["provider_ms"] += span.data["provider_ms"]
        logger.info("%s", json.dumps(span.data, separators=(",", ":")))


def measure_operation(workflow, *, operation=None):
    """Time a whole handler including preparation, validation and replay.

    The signature is preserved for FastAPI injection and existing tests. Nested
    handlers receive independent spans; the outer operation sums provider time
    while replayed operations correctly contain zero provider calls.
    """
    def decorate(function):
        signature = inspect.signature(function)

        @wraps(function)
        def measured(*args, **kwargs):
            arguments = signature.bind(*args, **kwargs).arguments
            request = arguments.get("request")
            action = arguments.get("action", getattr(request, "action", ""))
            actual_workflow = "scoped" if getattr(request, "scoped_content", None) is not None else workflow
            task = task_name(action, workflow=actual_workflow,
                             operation=operation or arguments.get("operation", ""))
            span = {"event": "ai_operation", "task": task, "handler": function.__name__,
                    "provider_calls": 0, "provider_ms": 0.0}
            token = _operations.set((*_operations.get(), span))
            started, error = perf_counter(), None
            try:
                return function(*args, **kwargs)
            except Exception as exc:
                error = exc
                raise
            finally:
                _operations.reset(token)
                span.update(duration_ms=round((perf_counter() - started) * 1000, 3),
                            outcome=_outcome(error), error_type=type(error).__name__ if error else None)
                logger.info("%s", json.dumps(span, separators=(",", ":")))
        return measured
    return decorate
