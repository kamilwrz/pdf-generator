"""OpenAI per-token list prices used to estimate request cost in USD.

Rates are USD per 1M tokens (standard API, not Batch). Update when OpenAI
changes the public price sheet. Sources checked 2026-07:
- gpt-5.4-mini: $0.75 in / $4.50 out (developers.openai.com)
- gpt-4o: $2.50 in / $10.00 out (developers.openai.com)
"""
from __future__ import annotations

from typing import Any

# model -> (input_usd_per_1m, output_usd_per_1m)
_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4": (2.50, 15.00),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
}


def estimate_cost_usd(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    rates = _PRICE_PER_1M.get(model)
    if rates is None:
        # Unknown model: treat as gpt-5.4-mini so the UI still shows a number.
        rates = _PRICE_PER_1M["gpt-5.4-mini"]
    input_rate, output_rate = rates
    return (prompt_tokens / 1_000_000.0) * input_rate + (
        completion_tokens / 1_000_000.0
    ) * output_rate


def _token_count(usage: Any, *names: str) -> int:
    if usage is None:
        return 0
    for name in names:
        raw = getattr(usage, name, None)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    return 0


def usage_from_response(resp: Any, *, model: str, action: str = "") -> dict[str, Any]:
    """Build a frontend-friendly usage payload from an OpenAI chat response."""
    usage = getattr(resp, "usage", None)
    # Real SDK objects expose ints; mocks / missing attrs must not crash.
    if usage is not None and not hasattr(usage, "prompt_tokens") and not hasattr(usage, "input_tokens"):
        usage = None
    prompt_tokens = _token_count(usage, "prompt_tokens", "input_tokens")
    completion_tokens = _token_count(usage, "completion_tokens", "output_tokens")
    total_tokens = _token_count(usage, "total_tokens") or (prompt_tokens + completion_tokens)
    cost = estimate_cost_usd(model, prompt_tokens, completion_tokens)
    return {
        "model": model,
        "action": action,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost, 6),
        "cost_pln_estimate": round(cost * 4.0, 4),  # rough FX for console readability
        "rates_usd_per_1m": {
            "input": _PRICE_PER_1M.get(model, _PRICE_PER_1M["gpt-5.4-mini"])[0],
            "output": _PRICE_PER_1M.get(model, _PRICE_PER_1M["gpt-5.4-mini"])[1],
        },
    }
