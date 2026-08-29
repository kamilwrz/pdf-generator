"""Cloudflare Workers AI list-price estimates for CV extraction.

Cloudflare invoices Workers AI in neurons, while model pages also publish
equivalent token prices. The token estimate below is operational telemetry: it
does not decide whether a user can import a CV and can be zero-billed while the
account remains inside Cloudflare's daily Free allocation.

Rates checked 2026-08 against the official Workers AI pricing table:
- Llama 3.1 8B fast: $0.045 input / $0.384 output per one million tokens.
- Gemma 4 26B: $0.10 input / $0.30 output per one million tokens (legacy override).
- Qwen 3.8 27B: $0.45 input / $3.20 output per one million tokens.
"""
from __future__ import annotations

import os
from typing import Any


_USD_TO_PLN = float(os.getenv("USD_TO_PLN", "4.0"))
_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    # Cloudflare's JSON Mode allowlist uses the `-fast` alias while its pricing
    # table names `-fp8-fast`; use that published fast-model row as the estimate.
    "@cf/meta/llama-3.1-8b-instruct-fast": (0.045, 0.384),
    "@cf/meta/llama-3.1-8b-instruct-fp8-fast": (0.045, 0.384),
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


def usage_from_cloudflare_attempts(
    attempts: list[tuple[str, Any]],
    *,
    extraction_mode: str,
) -> dict[str, Any]:
    """Aggregate provider telemetry when an empty text response needs fallback.

    Every Cloudflare call consumes account capacity even when it exposes no
    visible content. Summing all attempts keeps diagnostics and cost estimates
    honest while retaining the final model in the existing top-level fields.

    @param attempts - Ordered ``(model, response)`` pairs sent for one import.
    @param extraction_mode - ``text`` or ``vision`` routing decision.
    @returns Safe aggregate usage with per-attempt, content-free diagnostics.
    """
    if not attempts:
        raise ValueError("At least one Cloudflare attempt is required.")

    rows = [
        usage_from_cloudflare_response(
            response,
            model=model,
            extraction_mode=extraction_mode,
        )
        for model, response in attempts
    ]
    aggregate = dict(rows[-1])
    aggregate.update({
        "prompt_tokens": sum(row["prompt_tokens"] for row in rows),
        "completion_tokens": sum(row["completion_tokens"] for row in rows),
        "total_tokens": sum(row["total_tokens"] for row in rows),
        "cost_usd": round(sum(row["cost_usd"] for row in rows), 6),
        "cost_pln_estimate": round(
            sum(row["cost_usd"] for row in rows) * _USD_TO_PLN,
            4,
        ),
        "fallback_used": len(rows) > 1,
        "model_attempts": [
            {
                "model": row["model"],
                "prompt_tokens": row["prompt_tokens"],
                "completion_tokens": row["completion_tokens"],
                "total_tokens": row["total_tokens"],
                "cost_usd": row["cost_usd"],
            }
            for row in rows
        ],
    })
    return aggregate
