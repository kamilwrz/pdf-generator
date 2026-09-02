"""
Canvas AI assistant HTTP surface.

Validates the requested action, enforces the AI-assistant entitlement, logs a
product metric, dispatches to `analyze_action`, then charges AI credits from
the model's estimated PLN cost. Provider failures bubble as `AIServiceError`
and are mapped to a stable Polish 500 by the app-level handler in `main.py`.
"""

import hashlib
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request as HttpRequest
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.security import resolve_user_from_payload, verify_token
from app.dependencies import get_db
from app.services.ai_assistant_service import (
    AIServiceError,
    assistant_reservation_cost_pln,
    analyze_action,
)
from app.services.ats_readability import AtsReadabilityError
from app.services.document_service import validate_and_resolve_image_elements
from app.services.job_offer_service import JobOfferError, resolve_job_offer
from app.services.entitlements import (
    assert_can_use_ai_action,
    credits_for_cost,
    release_ai_reservation,
    reserve_ai_credits,
    settle_ai_reservation,
    settle_failed_ai_reservation,
)
from app.utils.metrics_logging import log_metric_event

logger = logging.getLogger("ai_assistant")

router = APIRouter(prefix="/ai", tags=["ai_assistant"])

VALID_ACTIONS = {
    "rating", "design_rating", "position_rating",
    "grammar", "language", "improve", "shorten", "ats_score", "layout", "chat",
    "translate",
}

# ISO-ish language codes shared by detection, content corrections, and translate.
SUPPORTED_LANGUAGES = frozenset({"pl", "en", "de", "fr", "es", "uk", "it", "nl"})
# Backwards-compatible alias for the translate action's existing references.
TRANSLATE_LANGUAGES = SUPPORTED_LANGUAGES
MAX_ASSISTANT_REQUEST_BYTES = 1024 * 1024
MAX_ASSISTANT_ELEMENTS = 500
MAX_ASSISTANT_HISTORY = 20
MAX_ASSISTANT_MESSAGE_CHARS = 4_000
MAX_JOB_DESCRIPTION_CHARS = 20_000
MAX_JOB_OFFER_URL_CHARS = 2_048
MAX_CANDIDATE_NOTES_CHARS = 5_000


class AssistantRequest(BaseModel):
    """Body for POST /ai/assistant.

    `elements` is the current canvas snapshot (client ids + style/geometry).
    `history` is only meaningful for `chat` follow-ups in the open session.
    `target_language` is required for `translate` (pl/en/de/fr/es/uk/it/nl).
    """

    action: str
    elements: list[dict] = Field(default_factory=list, max_length=MAX_ASSISTANT_ELEMENTS)
    message: str = Field(default="", max_length=MAX_ASSISTANT_MESSAGE_CHARS)
    job_description: str = Field(default="", max_length=MAX_JOB_DESCRIPTION_CHARS)
    job_offer_url: str = Field(default="", max_length=MAX_JOB_OFFER_URL_CHARS)
    candidate_notes: str = Field(default="", max_length=MAX_CANDIDATE_NOTES_CHARS)
    page_size: dict = Field(default_factory=dict)
    # Prior turns from the open editor session (role + content). Chat / layout.
    history: list[dict] = Field(default_factory=list, max_length=MAX_ASSISTANT_HISTORY)
    # Optional template slug (e.g. "monument", "slate") for layout_contract hints.
    # Freestyle / saved documents may omit this; the layout session still works.
    template_id: str | None = None
    # Target language code for the translate action (ignored by other actions).
    target_language: str = ""
    # Optional CV-language override for content actions (grammar/language/
    # improve/shorten). Empty means the backend auto-detects from the canvas.
    cv_language: str = ""
    # Canonical profile snapshot. Translate uses it to return a structured
    # translated profile for future template fills instead of relying on
    # renderer-specific canvas strings.
    cv_data: dict | None = None

    @model_validator(mode="after")
    def validate_history_messages(self):
        """Bound nested history content before it reaches prompts or logs."""
        for entry in self.history:
            if not isinstance(entry, dict):
                raise ValueError("Każdy wpis historii musi być obiektem.")
            content = entry.get("content", "")
            if not isinstance(content, str) or len(content) > MAX_ASSISTANT_MESSAGE_CHARS:
                raise ValueError("Wpis historii może mieć maksymalnie 4000 znaków.")
            if entry.get("role") not in {"user", "assistant"}:
                raise ValueError("Historia może zawierać tylko role user i assistant.")
        return self


class TokenUsage(BaseModel):
    """Token and cost estimate returned for billing meters and UI display.

    Credit rule: 1 credit = 5 groszy (0.05 PLN). ``credits_charged`` mirrors
    ``entitlements.credits_for_cost(cost_pln_estimate)`` for successful calls.
    """

    model: str | None = None
    action: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    cost_pln_estimate: float = 0.0
    credits_charged: int = 0
    credit_pln: float = 0.05
    usd_to_pln: float = 4.0
    rates_usd_per_1m: dict[str, float] = {}


class AssistantResponse(BaseModel):
    """Union response covering rating tips, style corrections, and layout groups.

    Unused group lists stay empty depending on the action so the frontend can
    render one message shape for all assistant buttons. Scored actions may also
    return structured `categories`, `strengths`, and `priorities` for the
    dashboard UI (partial scores must not live only inside tip strings).
    """

    message: str
    rating: int | None = None
    tips: list[str] = []
    corrections: list[dict] = []
    categories: list[dict] = []
    strengths: list[str] = []
    priorities: list[dict] = []
    job_offer: dict | None = None
    job_requirements: list[dict] = []
    evidence_gaps: list[dict] = []
    layout_groups: list[dict] = []
    layout_issues: list[dict] = []
    structure_groups: list[dict] = []
    structure_issues: list[dict] = []
    deletion_groups: list[dict] = []
    deletion_issues: list[dict] = []
    clone_groups: list[dict] = []
    clone_issues: list[dict] = []
    web_sources: list[str] = []
    usage: TokenUsage | None = None
    # Language actually used for corrections, echoed so the UI selector syncs.
    cv_language: str = ""
    # Present for profile-aware content actions: the complete normalized profile
    # after the proposed corrections, applied by the client on "Apply all".
    updated_cv_data: dict | None = None


@router.post("/assistant", response_model=AssistantResponse, status_code=200)
def ai_assistant(
    request: AssistantRequest,
    http_request: HttpRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Run one assistant action against the caller's canvas snapshot.

    Side effects: metric log, OpenAI call, and durable credit settlement.
    Successful or usage-bearing responses charge only reported usage;
    confirmed non-2xx/local failures release the reservation, while response
    loss stays pending until its conservative lease expiry.
    """
    if request.action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_ai_action", "message": "Wybrana akcja AI jest nieprawidłowa."},
        )

    if (
        request.action == "position_rating"
        and not request.job_offer_url.strip()
        and not request.job_description.strip()
    ):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "job_offer_required",
                "message": "Wklej link do oferty lub jej opis.",
            },
        )

    target_language = (request.target_language or "").strip().lower()
    if request.action == "translate":
        if not target_language:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "target_language_required",
                    "message": "Język docelowy jest wymagany dla tłumaczenia.",
                },
            )
        if target_language not in TRANSLATE_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "unsupported_target_language",
                    "message": "Nieobsługiwany język tłumaczenia.",
                },
            )

    cv_language = (request.cv_language or "").strip().lower()
    if cv_language and cv_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail={"code": "unsupported_cv_language", "message": "Nieobsługiwany język CV."},
        )

    canonical_body = json.dumps(
        request.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    declared_length = http_request.headers.get("content-length")
    if (
        len(canonical_body) > MAX_ASSISTANT_REQUEST_BYTES
        or (declared_length and declared_length.isdigit() and int(declared_length) > MAX_ASSISTANT_REQUEST_BYTES)
    ):
        raise HTTPException(
            status_code=413,
            detail={"code": "ai_request_too_large", "message": "Żądanie AI przekracza limit 1 MiB."},
        )
    key = (idempotency_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "idempotency_key_required",
                "message": "Nagłówek Idempotency-Key jest wymagany.",
            },
        )

    user = resolve_user_from_payload(db, payload)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "invalid_token",
                "message": "Token jest nieprawidłowy lub wygasł.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Content AI is available on Pro. Appearance actions (design_rating + layout)
    # are gated separately via PRO_ONLY_AI_ACTIONS in entitlements.
    assert_can_use_ai_action(db, user, request.action)

    # Authorize identifiers and validate storage locators before quota mutation,
    # but do not download remote image bytes yet. ATS image materialization can
    # be expensive and must happen only after an atomic credit reservation.
    validate_and_resolve_image_elements(
        db,
        request.elements,
        owner_id=user.id,
        resolve_paths=False,
    )

    request_hash = hashlib.sha256(canonical_body).hexdigest()
    reserved_credits = credits_for_cost(
        assistant_reservation_cost_pln(request.action, len(canonical_body)),
    )
    claim = reserve_ai_credits(
        db,
        user_id=user.id,
        action=request.action,
        idempotency_key=key,
        request_hash=request_hash,
        reserved_credits=reserved_credits,
    )
    if claim.replay_response is not None:
        return AssistantResponse(**claim.replay_response)

    log_metric_event("ai_assistant_call", db, payload, action=request.action)

    try:
        resolved_job_offer = (
            resolve_job_offer(
                request.job_offer_url,
                request.job_description,
            )
            if request.action == "position_rating"
            else None
        )
        resolved_images = (
            validate_and_resolve_image_elements(
                db,
                request.elements,
                owner_id=user.id,
                resolve_paths=True,
            )
            if request.action == "ats_score"
            else {}
        )

        def resolve_ats_image(src: str) -> str:
            return resolved_images[str(src or "")]

        result = analyze_action(
            action=request.action,
            elements=request.elements,
            message=request.message,
            job_description=(
                resolved_job_offer["description"]
                if resolved_job_offer
                else request.job_description
            ),
            page_size=request.page_size,
            history=request.history,
            template_id=request.template_id,
            target_language=target_language,
            cv_language=cv_language,
            cv_data=request.cv_data,
            candidate_notes=request.candidate_notes,
            job_offer=resolved_job_offer,
            db=db,
            image_resolver=resolve_ats_image if request.action == "ats_score" else None,
        )
    except JobOfferError as exc:
        release_ai_reservation(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
        )
        raise HTTPException(
            status_code=400,
            detail={"code": exc.code, "message": exc.user_message},
        ) from exc
    except HTTPException:
        # A post-reservation storage/materialization failure is confirmed local
        # work. Release immediately and preserve its stable 4xx response.
        release_ai_reservation(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
        )
        raise
    except AIServiceError as exc:
        # Reservation disposition follows evidence from the provider boundary:
        # confirmed non-2xx/local failures release immediately, malformed or
        # empty responses settle their reported usage, and only a timeout or
        # broken connection remains pending because the response may be lost.
        if exc.reservation_outcome == "settle_usage" and exc.usage is not None:
            settle_failed_ai_reservation(
                db,
                user_id=user.id,
                reservation_id=claim.reservation_id,
                cost_pln=exc.usage.get("cost_pln_estimate", 0.0),
            )
        elif (
            exc.reservation_outcome == "release"
            or isinstance(exc.original, AtsReadabilityError)
        ):
            release_ai_reservation(
                db,
                user_id=user.id,
                reservation_id=claim.reservation_id,
            )
        # Handled by the app-level exception_handler in main.py, which logs
        # full context and returns a generic, non-leaking message.
        raise
    except Exception:
        # Unexpected application failures are confirmed local failures, not an
        # ambiguous provider timeout. Free the slot so they cannot drain the
        # user's monthly allowance at lease expiry.
        release_ai_reservation(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
        )
        logger.exception("Unexpected error in AI assistant route: action=%s", request.action)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ai_internal_error",
                "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
            },
        )

    try:
        settled = settle_ai_reservation(
            db,
            user_id=user.id,
            reservation_id=claim.reservation_id,
            cost_pln=result.get("usage", {}).get("cost_pln_estimate", 0.0),
            response_payload=result,
        )
    except Exception:
        # The provider has already returned successfully. Releasing here would
        # make a paid request free and let an immediate retry invoke the model
        # again. Keep the durable reservation pending so lease expiry charges
        # its conservative ceiling if the settlement transaction cannot commit.
        logger.exception(
            "AI settlement failed after provider success: action=%s",
            request.action,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ai_settlement_pending",
                "message": "Wynik AI wymaga bezpiecznego rozliczenia. Spróbuj ponownie później.",
            },
        )
    return AssistantResponse(**settled)
