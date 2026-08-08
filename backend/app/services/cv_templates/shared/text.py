"""Shared text / label helpers for CV template generators."""
from __future__ import annotations

import re

from app.services.cv_data import fold_section_label, is_skills_like_title

# Strip leading glyph/dash markers so callers can pass already-bulleted lines
# without producing "• • item" in the canvas bulletList renderer.
_LEADING_BULLET = re.compile(r"^[\s]*[•\-–*—∙·]\s*")


def _clean_list_items(items: list | tuple | None) -> list[str]:
    """Strip leading markers and drop empty entries from a flat chip list."""
    cleaned: list[str] = []
    for item in items or []:
        text = _LEADING_BULLET.sub("", str(item or "").strip())
        if text:
            cleaned.append(text)
    return cleaned


def _bullet_list_content(items: list | tuple | None) -> str:
    """
    Format flat strings as a ``bulletList`` textarea body.

    Used in sidebars and for non-skills chip sections (languages, interests,
    certifications). Main-column skills use ``_skills_inline_content`` instead.
    """
    return "\n".join(f"• {text}" for text in _clean_list_items(items))


def _skills_inline_content(items: list | tuple | None) -> str:
    """
    Main-column skills as a compact mid-dot row.

    Vertical ``bulletList`` formatting is reserved for sidebar skills so the
    primary column stays dense and matches the pre-bulletList layout.
    """
    return "  ·  ".join(_clean_list_items(items))

_LABEL_DEFAULTS = {
    "summary":    "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education":  "WYKSZTAŁCENIE",
    "skills":     "UMIEJĘTNOŚCI",
}


def _fold_label(value: object) -> str:
    """Normalize section titles so old and newly extracted CVs classify alike."""
    return fold_section_label(value)


def _extra_section_kind(section: dict) -> str:
    """Return a supported semantic kind with a title-based legacy fallback."""
    declared = _fold_label(section.get("kind"))
    if declared in {
        "languages",
        "certifications",
        "interests",
        "education",
        "skills",
        "projects",
        "references",
        "awards",
        "publications",
        "volunteering",
    }:
        return declared

    title = _fold_label(section.get("title"))
    if any(token in title for token in ("jezyk", "language", "lingua", "sprache")):
        return "languages"
    if any(token in title for token in ("certyf", "certificate", "certification", "licenc", "uprawnien", "kurs", "szkolen")):
        return "certifications"
    if any(token in title for token in ("zainteres", "hobb", "interest", "pasj")):
        return "interests"
    if any(token in title for token in ("wyksztalc", "education")):
        return "education"
    if any(token in title for token in ("projekt", "project", "portfolio")):
        return "projects"
    if any(token in title for token in ("referenc", "reference")):
        return "references"
    if any(token in title for token in ("nagrod", "award", "achiev")):
        return "awards"
    if any(token in title for token in ("publikac", "publication")):
        return "publications"
    if any(token in title for token in ("wolontar", "volunteer")):
        return "volunteering"
    if is_skills_like_title(section.get("title")):
        return "skills"
    return "other"


def _labels(cv: dict) -> dict:
    """Return section headings in the CV's language (GPT-supplied), with Polish fallbacks."""
    raw = cv.get("labels") or {}
    return {k: (raw.get(k) or v).upper() for k, v in _LABEL_DEFAULTS.items()}


def _contact_line_core(cv: dict) -> str:
    """Email · phone · location only (no socials — use when socials live elsewhere)."""
    return "   ·   ".join(filter(None, [
        cv.get("email"), cv.get("phone"), cv.get("location"),
    ]))


def _contact_line(cv: dict) -> str:
    """Mid-dot masthead contact string: email · phone · location · socials."""
    from app.services.cv_templates.shared.contact import _social_contact_line_parts

    return "   ·   ".join(filter(None, [
        cv.get("email"),
        cv.get("phone"),
        cv.get("location"),
        *_social_contact_line_parts(cv),
    ]))


def _compact_text(value: object, limit: int) -> str:
    """Collapse whitespace and shorten decorative-slot copy without splitting words."""
    clean = " ".join(str(value or "").split())
    if len(clean) <= limit:
        return clean
    shortened = clean[: max(limit - 1, 1)].rsplit(" ", 1)[0].rstrip()
    return f"{shortened or clean[: max(limit - 1, 1)]}…"


def _bullets(job: dict) -> str:
    return "\n".join(f"• {b}" for b in job.get("bullets", []) if b)


def _company_period(job: dict) -> str:
    return "   ·   ".join(filter(None, [
        job.get("company"),
        job.get("city"),
        job.get("period"),
    ]))
