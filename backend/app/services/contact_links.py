"""Contact / social link helpers for CV profiles.

First-class fields: ``linkedin``, ``github``, ``website``. Values are stored
as trimmed URLs or handles; canvas templates render short display labels next
to type-specific icons. PDF hyperlink annotations are intentionally not used.
"""
from __future__ import annotations

import re
from typing import Any, Literal
from urllib.parse import urlparse

ContactKind = Literal["linkedin", "github", "website"]

_CONTACT_KINDS: tuple[ContactKind, ...] = ("linkedin", "github", "website")

# Strip scheme and www. for comparison / short labels.
_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)
_WWW_RE = re.compile(r"^www\.", re.IGNORECASE)


def _text(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def clean_contact_url(value: object) -> str:
    """Trim whitespace and normalize empty-looking values to \"\"."""
    return _text(value)


def _host_and_path(value: str) -> tuple[str, str]:
    """Return (hostname_lower, path) for a URL or bare host/path string."""
    raw = clean_contact_url(value)
    if not raw:
        return "", ""
    candidate = raw if "://" in raw else f"https://{raw}"
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return "", ""
    host = (parsed.netloc or "").lower()
    host = _WWW_RE.sub("", host)
    path = (parsed.path or "").rstrip("/")
    return host, path


def categorize_contact_url(value: object) -> ContactKind | None:
    """Map a URL/handle to linkedin | github | website, or None if empty."""
    raw = clean_contact_url(value)
    if not raw:
        return None
    host, path = _host_and_path(raw)
    lowered = raw.lower()
    if "linkedin.com" in host or "linkedin.com" in lowered:
        return "linkedin"
    if host in {"github.com", "www.github.com"} or "github.com" in lowered:
        return "github"
    # Bare handles without a clear host still count as website when non-empty.
    if host or path or "." in raw or "/" in raw:
        return "website"
    return "website"


def contact_display_label(kind: ContactKind, value: object, *, limit: int = 36) -> str:
    """Short canvas label for a contact link (no scheme, compact path)."""
    raw = clean_contact_url(value)
    if not raw:
        return ""
    host, path = _host_and_path(raw)
    if kind == "linkedin":
        # Prefer linkedin.com/in/handle
        if "linkedin.com" in host or "linkedin.com" in raw.lower():
            label = f"linkedin.com{path}" if path else "linkedin.com"
        elif raw.startswith("/"):
            label = f"linkedin.com{raw}"
        else:
            label = f"linkedin.com/in/{raw.lstrip('@')}"
    elif kind == "github":
        if "github.com" in host or "github.com" in raw.lower():
            label = f"github.com{path}" if path else "github.com"
        else:
            label = f"github.com/{raw.lstrip('@')}"
    else:
        if host:
            label = f"{host}{path}" if path and path != "/" else host
        else:
            label = _SCHEME_RE.sub("", raw)
            label = _WWW_RE.sub("", label)
    label = label.strip("/")
    if len(label) <= limit:
        return label
    return f"{label[: max(limit - 1, 1)].rstrip('…/')}…"


def merge_contact_fields(
    *,
    linkedin: object = "",
    github: object = "",
    website: object = "",
    extra_urls: list[object] | None = None,
) -> dict[str, str]:
    """Build the three social slots, re-categorizing stray URLs by domain.

    Explicit field values win when their domain matches the slot. Unmatched
    extras fill empty slots. Cap remains three first-class fields.
    """
    slots: dict[str, str] = {
        "linkedin": clean_contact_url(linkedin),
        "github": clean_contact_url(github),
        "website": clean_contact_url(website),
    }

    # Re-home values that landed in the wrong slot (e.g. github URL in website).
    misplaced: list[str] = []
    for kind in _CONTACT_KINDS:
        value = slots[kind]
        if not value:
            continue
        detected = categorize_contact_url(value)
        if detected and detected != kind and not slots[detected]:
            slots[detected] = value
            slots[kind] = ""
        elif detected and detected != kind and slots[detected]:
            # Keep the correctly typed slot; drop the duplicate from the wrong one.
            slots[kind] = ""

    for item in extra_urls or []:
        value = clean_contact_url(item)
        if not value:
            continue
        kind = categorize_contact_url(value)
        if kind is None:
            continue
        if not slots[kind]:
            slots[kind] = value
        else:
            misplaced.append(value)

    # Leftover extras that lost a typed slot still fill website if free.
    for value in misplaced:
        if not slots["website"]:
            slots["website"] = value

    return slots


def extract_contact_fields_from_raw(raw: dict[str, Any]) -> dict[str, str]:
    """Pull social fields from a raw extract/wizard payload and categorize."""
    extras: list[object] = []
    for key in ("link", "links", "urls", "social", "portfolio"):
        blob = raw.get(key)
        if isinstance(blob, list):
            extras.extend(blob)
        elif blob:
            extras.append(blob)
    return merge_contact_fields(
        linkedin=raw.get("linkedin"),
        github=raw.get("github"),
        website=raw.get("website") or raw.get("link"),
        extra_urls=extras,
    )


def contact_social_items(
    cv: dict[str, Any],
    *,
    limit: int = 36,
) -> list[tuple[ContactKind, str]]:
    """Ordered non-empty (icon_key, display_text) pairs for template placers."""
    items: list[tuple[ContactKind, str]] = []
    for kind in _CONTACT_KINDS:
        value = clean_contact_url(cv.get(kind))
        if not value:
            continue
        label = contact_display_label(kind, value, limit=limit)
        if label:
            items.append((kind, label))
    return items
