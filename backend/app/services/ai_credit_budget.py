"""Bind an assistant reservation to the actual provider payload for one request."""
from contextlib import contextmanager
from contextvars import ContextVar
from collections.abc import Iterator
from dataclasses import dataclass
import json

from sqlalchemy.orm import Session

from app.services.entitlements import credits_for_cost, resize_ai_reservation
from app.services.openai_pricing import estimate_cost_pln, estimate_cost_usd


@dataclass
class _RequestBudget:
    db: Session
    user_id: int
    reservation_id: str
    started: bool = False


_budget: ContextVar[_RequestBudget | None] = ContextVar("assistant_credit_budget", default=None)


@contextmanager
def assistant_credit_budget(
    db: Session, *, user_id: int, reservation_id: str,
) -> Iterator[None]:
    """Scope provider admission to one route and restore it even on failure.

    The route has already claimed one credit and its idempotency key. The
    provider boundary expands that claim using the completed prompt, including
    fetched job offers and response schemas. Context-local state prevents
    concurrent users or reused worker threads from sharing a reservation.
    """
    token = _budget.set(_RequestBudget(db, user_id, reservation_id))
    try:
        yield
    finally:
        _budget.reset(token)


def apply_assistant_credit_budget(provider_request: dict) -> None:
    """Reserve the actual prompt ceiling and fit output to available credits.

    Mutates only ``max_completion_tokens``. The byte bound covers the final
    messages and response format, with 256 tokens for provider framing. Editor
    metadata absent from that payload costs nothing. Output includes reasoning
    tokens; at least 256 must fit or admission fails before provider I/O.
    Outside the assistant route, existing independently metered callers retain
    their own reservation policy. No prompt content is persisted or logged.
    """
    budget = _budget.get()
    if budget is None:
        return
    if budget.started:
        raise RuntimeError("An assistant reservation permits only one provider call.")

    prompt_bytes = len(json.dumps({
        "messages": provider_request["messages"],
        "response_format": provider_request["response_format"],
    }, ensure_ascii=False).encode("utf-8"))
    prompt_ceiling = prompt_bytes + 256
    model = provider_request["model"]
    maximum = int(provider_request["max_completion_tokens"])
    minimum = min(256, maximum)

    def required_credits(output_tokens: int) -> int:
        # The shared PLN estimator rounds to four decimals. One extra 0.0001
        # PLN prevents that rounding from understating a reservation boundary.
        cost = estimate_cost_pln(estimate_cost_usd(model, prompt_ceiling, output_tokens))
        return credits_for_cost(cost + 0.0001)

    reserved = resize_ai_reservation(
        budget.db, user_id=budget.user_id, reservation_id=budget.reservation_id,
        preferred_credits=required_credits(maximum),
        minimum_credits=required_credits(minimum),
    )
    # Find the largest completion budget that fits the atomically granted
    # credits. A low balance reduces the provider cap instead of rejecting a
    # request merely because it cannot fund the default 16,000-token ceiling.
    low, high = minimum, maximum
    while low < high:
        middle = (low + high + 1) // 2
        if required_credits(middle) <= reserved:
            low = middle
        else:
            high = middle - 1
    provider_request["max_completion_tokens"] = low
    budget.started = True
