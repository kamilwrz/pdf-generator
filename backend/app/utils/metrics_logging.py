"""Shared best-effort metrics logging for product events (AiAssistant open
rate, template pick/dismiss, etc.). Resolves the numeric user id from the
JWT payload rather than logging the raw username (an identifiable handle) —
see docs/designs/cv-only-ux-monetization.md, Outside Voice finding 7.

Never allowed to raise — a logging failure must not break the user action
it's measuring (fire-and-forget).
"""
import logging
from sqlalchemy.orm import Session

from app.core.security import resolve_user_from_payload

logger = logging.getLogger("metrics")


def log_metric_event(message: str, db: Session, payload: dict, **fields) -> None:
    """Emit one structured metrics log line keyed by numeric user id.

    Never raises — logging failures must not break the measured user action.
    """
    try:
        user = resolve_user_from_payload(db, payload)
        field_str = " ".join(f"{key}={value}" for key, value in fields.items())
        logger.info("%s user_id=%s %s", message, user.id if user else None, field_str)
    except Exception:
        logger.debug("%s logging failed", message, exc_info=True)
