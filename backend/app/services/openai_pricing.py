"""OpenAI per-token list prices used to estimate request cost in USD and PLN.

Rates are USD per 1M tokens (standard API short-context tier, not Batch).
Fast mode (formerly Priority processing) is billed at roughly 2× the standard
token rates for the GPT-5.6 family; pass ``service_tier="fast"`` / ``"priority"``
into the estimators so credit metering matches the bill.

Billing rule (must stay aligned with ``entitlements.CREDIT_PLN``):
- 1 AI credit = 5 groszy = 0.05 PLN
- credits charged = max(1, ceil(cost_pln / 0.05)) per successful call

Sources checked 2026-07: developers.openai.com/api/docs/pricing,
openai.com/api-fast-mode/
"""
from __future__ import annotations

import os
from typing import Any

from app.services.entitlements import CREDIT_PLN, credits_for_cost

# Rough USD→PLN for credit metering (override via env when FX drifts).
_USD_TO_PLN = float(os.getenv("USD_TO_PLN", "4.0"))

# model -> (input_usd_per_1m, output_usd_per_1m) — Standard processing.
_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    "gpt-5.6-sol": (5.00, 30.00),
    "gpt-5.6-terra": (2.00, 12.00),
    "gpt-5.6-luna": (0.20, 1.20),
    "gpt-5.4-mini": (0.75, 4.50),
    "gpt-5.4": (2.50, 15.00),
    "gpt-5.4-pro": (30.00, 180.00),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
}

# Fast mode / Priority processing list prices (short context, excludes long context).
# GPT-5.6 family Fast is 2× Standard on the published sheet.
_PRICE_PER_1M_FAST: dict[str, tuple[float, float]] = {
    "gpt-5.6-sol": (10.00, 60.00),
    "gpt-5.6-terra": (4.00, 24.00),
    "gpt-5.6-luna": (0.40, 2.40),
    "gpt-5.5": (12.50, 75.00),
    "gpt-5.4": (5.00, 30.00),
    "gpt-5.4-mini": (1.50, 9.00),
}

_FAST_SERVICE_TIERS = frozenset({"fast", "priority"})


def normalize_service_tier(service_tier: str | None) -> str:
    """Return ``fast``, ``priority``, or ``default`` for metering."""
    if service_tier is None:
        return "default"
    normalized = str(service_tier).strip().lower()
    if normalized in _FAST_SERVICE_TIERS:
        return normalized
    if normalized in {"", "auto", "default", "standard"}:
        return "default"
    return "default"


def is_fast_service_tier(service_tier: str | None) -> bool:
    """True when the request/response used Fast mode (or legacy priority)."""
    return normalize_service_tier(service_tier) in _FAST_SERVICE_TIERS


def rates_for_model(
    model: str,
    service_tier: str | None = None,
) -> tuple[float, float]:
    """Return (input, output) USD-per-1M rates for the model and service tier."""
    if is_fast_service_tier(service_tier):
        if model in _PRICE_PER_1M_FAST:
            return _PRICE_PER_1M_FAST[model]
        # Unknown Fast-capable model: fall back to 2× the standard sheet when
        # we know the base rates, otherwise to mini Fast-equivalent guess.
        base = _PRICE_PER_1M.get(model)
        if base is not None:
            return (base[0] * 2.0, base[1] * 2.0)
        return _PRICE_PER_1M_FAST.get("gpt-5.4-mini", (1.50, 9.00))
    return _PRICE_PER_1M.get(model, _PRICE_PER_1M["gpt-5.4-mini"])


def estimate_cost_usd(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    *,
    service_tier: str | None = None,
) -> float:
    """Estimate USD cost from token counts using the local price sheet."""
    input_rate, output_rate = rates_for_model(model, service_tier)
    return (prompt_tokens / 1_000_000.0) * input_rate + (
        completion_tokens / 1_000_000.0
    ) * output_rate


def estimate_cost_pln(cost_usd: float) -> float:
    """Convert USD estimate to PLN for credit charging."""
    try:
        usd = float(cost_usd)
    except (TypeError, ValueError):
        usd = 0.0
    return round(max(0.0, usd) * _USD_TO_PLN, 4)


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


def _effective_service_tier(resp: Any, service_tier: str | None) -> str:
    """Prefer the tier echoed by OpenAI; fall back to the requested tier."""
    response_tier = getattr(resp, "service_tier", None) if resp is not None else None
    if response_tier:
        return normalize_service_tier(response_tier)
    return normalize_service_tier(service_tier)


def usage_from_response(
    resp: Any,
    *,
    model: str,
    action: str = "",
    service_tier: str | None = None,
) -> dict[str, Any]:
    """Build a frontend-friendly usage payload from an OpenAI chat response."""
    usage = getattr(resp, "usage", None)
    # Real SDK objects expose ints; mocks / missing attrs must not crash.
    if usage is not None and not hasattr(usage, "prompt_tokens") and not hasattr(usage, "input_tokens"):
        usage = None
    prompt_tokens = _token_count(usage, "prompt_tokens", "input_tokens")
    completion_tokens = _token_count(usage, "completion_tokens", "output_tokens")
    total_tokens = _token_count(usage, "total_tokens") or (prompt_tokens + completion_tokens)
    effective_tier = _effective_service_tier(resp, service_tier)
    cost_usd = estimate_cost_usd(
        model,
        prompt_tokens,
        completion_tokens,
        service_tier=effective_tier,
    )
    cost_pln = estimate_cost_pln(cost_usd)
    rates = rates_for_model(model, effective_tier)
    return {
        "model": model,
        "action": action,
        "service_tier": effective_tier,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost_usd, 6),
        "cost_pln_estimate": cost_pln,
        # Same formula as entitlements.charge_ai_credits (1 credit = 5 groszy).
        "credits_charged": credits_for_cost(cost_pln),
        "credit_pln": CREDIT_PLN,
        "usd_to_pln": _USD_TO_PLN,
        "rates_usd_per_1m": {
            "input": rates[0],
            "output": rates[1],
        },
    }


def empty_usage(
    *,
    model: str,
    action: str = "",
    service_tier: str | None = None,
) -> dict[str, Any]:
    """Zero-token usage payload (still documents credit rule for the client)."""
    effective_tier = normalize_service_tier(service_tier)
    rates = rates_for_model(model, effective_tier)
    return {
        "model": model,
        "action": action,
        "service_tier": effective_tier,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
        "cost_pln_estimate": 0.0,
        "credits_charged": 0,
        "credit_pln": CREDIT_PLN,
        "usd_to_pln": _USD_TO_PLN,
        "rates_usd_per_1m": {
            "input": rates[0],
            "output": rates[1],
        },
    }
