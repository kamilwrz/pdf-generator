"""Canonical document identifiers used by models, services, and migrations."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from typing import Any


TITLE_KEY_MAX_LENGTH = 140
IDEMPOTENCY_KEY_MAX_LENGTH = 128


def canonical_title_key(value: str | None) -> str:
    """Return a bounded comparison key for per-owner title uniqueness.

    NFKC plus case-folding makes visually equivalent titles collide. Some
    Unicode characters expand during case-folding, so long keys use a digest
    suffix instead of relying on a database-specific truncation.
    """
    canonical = unicodedata.normalize("NFKC", value or "").strip().casefold()
    if len(canonical) <= TITLE_KEY_MAX_LENGTH:
        return canonical
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    prefix_length = TITLE_KEY_MAX_LENGTH - len(digest) - 1
    return f"{canonical[:prefix_length]}~{digest}"


def normalize_idempotency_key(value: str | None) -> str:
    """Validate and normalize the client retry token used for PDF creation."""
    normalized = str(value or "").strip()
    if not normalized or len(normalized) > IDEMPOTENCY_KEY_MAX_LENGTH:
        raise ValueError("invalid idempotency key")
    if any(unicodedata.category(char) == "Cc" for char in normalized):
        raise ValueError("invalid idempotency key")
    return normalized


def create_request_hash(pdf_data: Any) -> str:
    """Hash the semantic create payload for safe idempotency-key replay.

    ``pdf_id`` is a render-only compatibility field and cannot affect document
    creation, so it is excluded from the fingerprint as well.
    """
    if hasattr(pdf_data, "model_dump"):
        payload = pdf_data.model_dump(mode="json", exclude={"pdf_id"})
    else:
        payload = dict(pdf_data)
        payload.pop("pdf_id", None)
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def current_template_id(editor_mode: str | None, template_id: str | None) -> str | None:
    """Return the active template, clearing stale ids after freeform unlock."""
    return template_id if editor_mode == "template" else None
