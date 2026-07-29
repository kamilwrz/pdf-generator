"""Normalization and validation for CV data consumed by template generators."""

from __future__ import annotations

import unicodedata
from collections.abc import Mapping
from copy import deepcopy
from typing import Any


DEFAULT_LABELS = {
    "summary": "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education": "WYKSZTAŁCENIE",
    "skills": "UMIEJĘTNOŚCI",
}

ALLOWED_SECTION_KINDS = {"languages", "certifications", "interests", "other"}
ALLOWED_PLACEMENTS = {"after_experience", "after_skills"}

# Title tokens (ASCII-folded) that mean "skills" under another label.
# Keep kind=skills layout, but preserve the user's heading on the canvas.
_SKILLS_TITLE_TOKENS = (
    "umiejet",
    "kompetenc",
    "skill",
    "obszar",
    "obsluga komputer",
    "obslugi komputer",
    "obsluga it",
    "znajomosc program",
    "znajomosc narzed",
    "znajomosc oprogram",
    "technolog",
    "narzedz",
    "software",
    "hard skill",
    "soft skill",
    "technical skill",
    "computer skill",
    "it skill",
    "pakiet office",
    "ms office",
    "microsoft office",
    "stack technologicz",
    "tech stack",
    "tools",
)


class CvDataValidationError(ValueError):
    """Raised when a profile cannot safely be used to generate a CV."""


def _text(value: Any) -> str:
    return str(value or "").strip()


def fold_section_label(value: object) -> str:
    """Normalize headings so PL diacritics and casing do not block matching."""
    # ł/Ł do not decompose under NFKD, so map Polish letters before ASCII fold.
    translated = str(value or "").translate(str.maketrans({
        "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
        "ó": "o", "ś": "s", "ź": "z", "ż": "z",
        "Ą": "a", "Ć": "c", "Ę": "e", "Ł": "l", "Ń": "n",
        "Ó": "o", "Ś": "s", "Ź": "z", "Ż": "z",
    }))
    return (
        unicodedata.normalize("NFKD", translated)
        .encode("ascii", "ignore")
        .decode("ascii")
        .casefold()
    )


_GENERIC_SKILLS_LABELS = frozenset({
    fold_section_label(DEFAULT_LABELS["skills"]),
    "obszary",
    "skills",
})


def is_generic_skills_label(title: object) -> bool:
    """True for template defaults that should yield to a real CV heading."""
    folded = fold_section_label(title)
    return bool(folded) and folded in _GENERIC_SKILLS_LABELS


def is_skills_like_title(title: object) -> bool:
    """True when a section heading is skills under another user-facing name."""
    folded = fold_section_label(title)
    if not folded:
        return False
    return any(token in folded for token in _SKILLS_TITLE_TOKENS)


def is_skills_like_section(section: Mapping[str, Any] | None) -> bool:
    if not isinstance(section, Mapping):
        return False
    kind = _text(section.get("kind")).casefold()
    if kind == "skills":
        return True
    return is_skills_like_title(section.get("title"))


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        value = value.replace("\r\n", "\n").replace(",", "\n").split("\n")
    if not isinstance(value, list):
        return []

    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        cleaned = _text(item)
        key = cleaned.casefold()
        if cleaned and key not in seen:
            result.append(cleaned)
            seen.add(key)
    return result


def _section_items(value: Any) -> list[str]:
    if isinstance(value, str):
        return _string_list(value)
    if not isinstance(value, list):
        return []

    items: list[str] = []
    for item in value:
        if isinstance(item, Mapping):
            name = _text(item.get("name") or item.get("label") or item.get("content"))
            level = _text(item.get("level") or item.get("proficiency"))
            items.extend(_string_list([f"{name} — {level}" if name and level else name]))
        else:
            items.extend(_string_list([item]))
    return items


def _normalize_experience(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    result = []
    for entry in value:
        if not isinstance(entry, Mapping):
            continue
        bullets = _string_list(entry.get("bullets"))
        if not bullets:
            bullets = _string_list(entry.get("description"))
        normalized = {
            "title": _text(entry.get("title") or entry.get("position")),
            "company": _text(entry.get("company") or entry.get("employer")),
            "city": _text(entry.get("city")),
            "period": _text(entry.get("period") or entry.get("date")),
            "bullets": bullets,
        }
        if any(normalized.values()):
            result.append(normalized)
    return result


def _normalize_education(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    result = []
    for entry in value:
        if not isinstance(entry, Mapping):
            continue
        school = _text(entry.get("school") or entry.get("university"))
        city = _text(entry.get("city"))
        degree = _text(entry.get("degree") or entry.get("diploma"))
        period = _text(entry.get("period") or entry.get("date"))
        description = _text(
            entry.get("description")
            or entry.get("details")
            or entry.get("notes")
        )
        legacy_detail = _text(entry.get("detail"))

        # Older extract prompt returned only degree/period/detail. Recover a
        # dedicated description when school/city are already present or when
        # detail looks like "school · city · opis".
        if not description and legacy_detail:
            composed = " · ".join(part for part in (school, city) if part)
            if composed and legacy_detail.startswith(composed):
                remainder = legacy_detail[len(composed):].lstrip(" ·•|-–,;")
                if remainder:
                    description = remainder
            elif school and legacy_detail not in {school, city, degree, period, composed}:
                description = legacy_detail
            elif not school and not city:
                # Pure legacy payload: keep mashed detail for template meta.
                pass

        detail = " · ".join(part for part in (school, city, description) if part) or legacy_detail
        normalized = {
            "school": school,
            "city": city,
            "degree": degree,
            "period": period,
            "description": description,
            # Existing template themes consume this legacy display field.
            "detail": detail,
        }
        if any(normalized.values()):
            result.append(normalized)
    return result


def _normalize_languages(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    result = []
    seen: set[tuple[str, str]] = set()
    for item in value:
        if isinstance(item, Mapping):
            name = _text(item.get("name") or item.get("language"))
            level = _text(item.get("level") or item.get("proficiency"))
        else:
            raw = _text(item)
            name, separator, level = raw.partition("—")
            if not separator:
                name, separator, level = raw.partition("-")
            name, level = name.strip(), level.strip()
        key = (name.casefold(), level.casefold())
        if name and key not in seen:
            result.append({"name": name, "level": level})
            seen.add(key)
    return result


def _normalize_custom_sections(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    result = []
    for section in value:
        if not isinstance(section, Mapping):
            continue
        title = _text(section.get("title"))
        items = _section_items(section.get("items") or section.get("data"))
        kind = _text(section.get("kind")).casefold() or "other"
        placement = _text(section.get("placement")) or "after_skills"
        if kind not in ALLOWED_SECTION_KINDS:
            kind = "other"
        if placement not in ALLOWED_PLACEMENTS:
            placement = "after_skills"
        if title and items:
            result.append({
                "title": title.upper(),
                "kind": kind,
                "placement": placement,
                "items": items,
            })
    return result


def _derive_manual_sections(extra_sections: Any) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    languages: list[dict[str, str]] = []
    custom_sections: list[dict[str, Any]] = []
    if not isinstance(extra_sections, list):
        return languages, custom_sections

    for section in extra_sections:
        if not isinstance(section, Mapping):
            continue
        kind = _text(section.get("kind")).casefold() or "other"
        title = _text(section.get("title"))
        placement = _text(section.get("placement")) or "after_skills"
        items = _section_items(section.get("items"))
        if kind == "languages":
            languages.extend(_normalize_languages(items))
        elif title and items:
            custom_sections.append({
                "title": title,
                "kind": kind if kind in ALLOWED_SECTION_KINDS else "other",
                "placement": placement if placement in ALLOWED_PLACEMENTS else "after_skills",
                "items": items,
            })
    return languages, custom_sections


def _absorb_skills_alias_sections(
    skills: list[str],
    sections: list[dict[str, Any]],
    labels: dict[str, str],
    *,
    labels_skills_explicit: bool,
) -> tuple[list[str], list[dict[str, Any]], dict[str, str]]:
    """
    Treat skills-like custom sections as the skills slot:
    - keep the user's heading in labels['skills']
    - merge items into cv['skills']
    - drop the alias from extra_sections so it is not rendered twice
    """
    kept: list[dict[str, Any]] = []
    alias_title: str | None = None
    absorbed: list[str] = []

    for section in sections:
        if not is_skills_like_section(section):
            kept.append(section)
            continue
        title = _text(section.get("title")).upper()
        if alias_title is None and title:
            alias_title = title
        absorbed.extend(_string_list(section.get("items") or []))

    merged_skills = _string_list([*skills, *absorbed]) if absorbed else list(skills)
    next_labels = dict(labels)
    # Default extract labels ("UMIEJĘTNOŚCI" / "OBSZARY") must not block the
    # real CV heading when a skills-like alias section is present.
    if alias_title and (
        not labels_skills_explicit or is_generic_skills_label(next_labels.get("skills"))
    ):
        next_labels["skills"] = alias_title
    return merged_skills, kept, next_labels


def normalize_cv_data(value: Mapping[str, Any] | None, *, require_name: bool = False) -> dict[str, Any]:
    """
    Convert manual wizard input and legacy PDF-extraction output to one stable
    profile. The returned object keeps both editable wizard fields and the
    `extra_sections` representation used by the deterministic layout engine.
    """
    if value is None:
        value = {}
    if not isinstance(value, Mapping):
        raise CvDataValidationError("Dane CV muszą być obiektem JSON.")

    raw = deepcopy(dict(value))
    address = _text(raw.get("address") or raw.get("location"))
    fallback_languages, fallback_sections = _derive_manual_sections(raw.get("extra_sections"))
    # An explicitly supplied empty list means the user deleted every item.
    # Fall back to legacy `extra_sections` only when the editable field is
    # absent, never when it is present and empty.
    languages = (
        _normalize_languages(raw.get("languages"))
        if "languages" in raw
        else fallback_languages
    )
    custom_sections = (
        _normalize_custom_sections(raw.get("custom_sections"))
        if "custom_sections" in raw
        else fallback_sections
    )

    raw_labels = raw.get("labels") if isinstance(raw.get("labels"), Mapping) else {}
    labels_skills_from_payload = _text(raw_labels.get("skills"))
    # "Explicit" means a non-generic heading (e.g. OBSŁUGA KOMPUTERA), not the
    # forced extract default UMIEJĘTNOŚCI.
    labels_skills_explicit = bool(labels_skills_from_payload) and not is_generic_skills_label(
        labels_skills_from_payload
    )
    labels = {
        key: _text(raw_labels.get(key)) or default
        for key, default in DEFAULT_LABELS.items()
    }

    skills, custom_sections, labels = _absorb_skills_alias_sections(
        _string_list(raw.get("skills")),
        custom_sections,
        labels,
        labels_skills_explicit=labels_skills_explicit,
    )

    language_items = [
        f"{entry['name']} — {entry['level']}" if entry["level"] else entry["name"]
        for entry in languages
    ]
    extra_sections = list(custom_sections)
    if language_items:
        extra_sections.append({
            "title": "JĘZYKI",
            "kind": "languages",
            "placement": "after_skills",
            "items": language_items,
        })

    normalized = {
        "name": _text(raw.get("name")),
        "title": _text(raw.get("title") or raw.get("professional_title")),
        "email": _text(raw.get("email")),
        "phone": _text(raw.get("phone")),
        "address": address,
        "location": address,
        "summary": _text(raw.get("summary")),
        "experience": _normalize_experience(raw.get("experience")),
        "education": _normalize_education(raw.get("education")),
        "skills": skills,
        "languages": languages,
        "custom_sections": custom_sections,
        "language": _text(raw.get("language")) or "Polish",
        "labels": labels,
        "extra_sections": extra_sections,
    }

    if normalized["email"] and "@" not in normalized["email"]:
        raise CvDataValidationError("Adres e-mail musi zawierać znak @.")
    if require_name and not normalized["name"]:
        raise CvDataValidationError("Podaj imię i nazwisko przed utworzeniem CV.")
    return normalized
