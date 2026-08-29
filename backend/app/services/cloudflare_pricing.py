"""Cloudflare Workers AI list-price estimates for CV extraction.

Cloudflare invoices Workers AI in neurons, while model pages also publish
equivalent token prices. The token estimate below is operational telemetry: it
does not decide whether a user can import a CV and can be zero-billed while the
account remains inside Cloudflare's daily Free allocation.

Rates checked 2026-08 against the official Workers AI model catalog:
- Gemma 4 26B: $0.10 input / $0.30 output per one million tokens.
- Qwen 3.8 27B: $0.45 input / $3.20 output per one million tokens.
"""
from __future__ import annotations

import os
from typing import Any


_USD_TO_PLN = float(os.getenv("USD_TO_PLN", "4.0"))
_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    "@cf/google/gemma-4-26b-a4b-it": (0.10, 0.30),
    "@cf/qwen/qwen3.8-27b": (0.45, 3.20),
}


def rates_for_model(model: str) -> tuple[float, float]:
    """Return published input/output USD rates or a conservative Qwen fallback."""
    return _PRICE_PER_1M.get(model, _PRICE_PER_1M["@cf/qwen/qwen3.8-27b"])


def _token_count(usage: Any, *names: str) -> int:
    """Read an integer token counter from an OpenAI-compatible usage object."""
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


def usage_from_cloudflare_response(
    response: Any,
    *,
    model: str,
    extraction_mode: str,
) -> dict[str, Any]:
    """Build safe provider telemetry without coupling imports to AI credits.

    The returned estimate uses token counts reported by the compatibility API.
    Cloudflare's daily neuron allocation is account-wide, so this estimate must
    not be presented as an exact invoice amount.
    """
    raw_usage = getattr(response, "usage", None)
    prompt_tokens = _token_count(raw_usage, "prompt_tokens", "input_tokens")
    completion_tokens = _token_count(raw_usage, "completion_tokens", "output_tokens")
    total_tokens = _token_count(raw_usage, "total_tokens") or (
        prompt_tokens + completion_tokens
    )
    input_rate, output_rate = rates_for_model(model)
    cost_usd = (
        (prompt_tokens / 1_000_000.0) * input_rate
        + (completion_tokens / 1_000_000.0) * output_rate
    )
    return {
        "provider": "cloudflare",
        "model": model,
        "action": "extract_cv",
        "extraction_mode": extraction_mode,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost_usd, 6),
        "cost_pln_estimate": round(cost_usd * _USD_TO_PLN, 4),
        "credits_charged": 0,
        "meter": "monthly_cv_imports",
        "usd_to_pln": _USD_TO_PLN,
        "rates_usd_per_1m": {"input": input_rate, "output": output_rate},
    }
