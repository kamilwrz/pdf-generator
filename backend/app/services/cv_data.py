"""Normalization and validation for CV data consumed by template generators."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from app.services.contact_links import extract_contact_fields_from_raw

# Strip leading list markers so skills stored as "• Foo" or bare "•" do not
# produce an empty UMIEJĘTNOŚCI chrome block after `_bullet_list_content`.
_LEADING_LIST_MARKER = re.compile(r"^[\s]*[•\-–*—∙·]\s*")


DEFAULT_LABELS = {
    "summary": "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education": "WYKSZTAŁCENIE",
    "skills": "UMIEJĘTNOŚCI",
}

ALLOWED_SECTION_KINDS = {
    "languages",
    "certifications",
    "interests",
    "projects",
    "references",
    "awards",
    "publications",
    "volunteering",
    "other",
}
ALLOWED_PLACEMENTS = {"after_experience", "after_skills"}

# Sections whose items are title + nested bullets (like experience records),
# not a flat chip/list of equal-weight lines.
RECORD_SECTION_KINDS = {
    "projects",
    "references",
    "awards",
    "publications",
    "volunteering",
}

# Title tokens (ASCII-folded) that imply record-style rendering even when
# extractors omit or mis-set `kind`.
_RECORD_TITLE_TOKENS = (
    "projekt",
    "project",
    "referenc",
    "reference",
    "nagrod",
    "award",
    "achiev",
    "publikac",
    "publication",
    "wolontar",
    "volunteer",
    "portfolio",
)

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


def _skill_items(value: Any) -> list[str]:
    """
    Flatten skills to unique display strings.

    Accepts plain strings and legacy ``{name|title|...}`` objects. Leading bullet
    glyphs are removed so a bare ``"•"`` cannot keep ``skills`` truthy while
    ``_bullet_list_content`` later produces an empty body.
    """
    flattened = _section_items(value)
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in flattened:
        text = _LEADING_LIST_MARKER.sub("", item).strip()
        key = text.casefold()
        if text and key not in seen:
            cleaned.append(text)
            seen.add(key)
    return cleaned


def _section_items(value: Any) -> list[str]:
    """Flatten section items to strings (legacy / skills-absorb / sidebar)."""
    if isinstance(value, str):
        return _string_list(value)
    if not isinstance(value, list):
        return []

    items: list[str] = []
    for item in value:
        if isinstance(item, Mapping):
            title = _text(
                item.get("title")
                or item.get("name")
                or item.get("label")
                or item.get("project")
                or item.get("content")
            )
            level = _text(item.get("level") or item.get("proficiency"))
            bullets = _string_list(
                item.get("bullets") or item.get("description") or item.get("items")
            )
            subtitle = _text(
                item.get("subtitle") or item.get("role") or item.get("period") or item.get("meta")
            )
            if title and bullets:
                items.append(title)
                if subtitle:
                    items.append(subtitle)
                items.extend(bullets)
            elif title and level:
                items.extend(_string_list([f"{title} — {level}"]))
            elif title:
                if subtitle:
                    items.append(f"{title} — {subtitle}" if subtitle else title)
                else:
                    items.append(title)
                items.extend(bullets)
            else:
                items.extend(bullets)
        else:
            items.extend(_string_list([item]))
    return items


def is_record_section(kind: object, title: object = "") -> bool:
    """True when a custom section should render as title + nested bullets."""
    declared = _text(kind).casefold()
    if declared in RECORD_SECTION_KINDS:
        return True
    folded = fold_section_label(title)
    if not folded:
        return False
    return any(token in folded for token in _RECORD_TITLE_TOKENS)


def group_flat_items_into_records(items: list[str]) -> list[dict[str, Any]]:
    """
    Turn a flat bullet dump into ``{title, bullets[]}`` records.

    A new record starts on a title-like line (dash/slash separator, or a short
    heading after an open record). Remaining lines append as nested bullets.
    If no title-like boundary is found, returns a single record whose title is
    the first line and the rest are bullets — still better than a flat list
    when the section kind already implies records.
    """
    cleaned = [_text(item) for item in items if _text(item)]
    if not cleaned:
        return []

    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for index, line in enumerate(cleaned):
        start_new = False
        if current is None:
            start_new = True
        elif any(sep in line for sep in (" — ", " – ", " - ", " / ")):
            start_new = True
        elif (
            current.get("bullets")
            and len(line) <= 55
            and not line.endswith((".", "!", "?"))
            and len(line.split()) <= 8
            and index + 1 < len(cleaned)
            and not any(sep in cleaned[index + 1] for sep in (" — ", " – ", " - ", " / "))
            and len(cleaned[index + 1]) > len(line)
        ):
            # Short heading followed by a longer description line.
            start_new = True

        if start_new:
            current = {"title": line, "bullets": []}
            records.append(current)
        elif current is not None:
            current["bullets"].append(line)
        else:
            current = {"title": line, "bullets": []}
            records.append(current)

    # A single title with no bullets is still a valid one-line record.
    return [record for record in records if record.get("title")]


def _normalize_section_entry(item: Any) -> str | dict[str, Any] | None:
    """
    Normalize one custom-section item to either a plain string or a record.

    Record shape: ``{"title": str, "bullets": list[str], "subtitle"?: str}``.
    Language-style ``{name, level}`` maps stay as flat ``"Name — Level"`` strings.
    """
    if isinstance(item, Mapping):
        title = _text(
            item.get("title")
            or item.get("project")
            or item.get("label")
        )
        # Prefer explicit title; fall back to name only when not a language row.
        name = _text(item.get("name") or item.get("language"))
        level = _text(item.get("level") or item.get("proficiency"))
        bullets = _string_list(
            item.get("bullets") or item.get("description") or item.get("items")
        )
        subtitle = _text(
            item.get("subtitle") or item.get("role") or item.get("period") or item.get("meta")
        )
        content = _text(item.get("content"))

        if title or (name and bullets):
            record_title = title or name
            record: dict[str, Any] = {"title": record_title, "bullets": bullets}
            if subtitle:
                record["subtitle"] = subtitle
            return record
        if name and level and not bullets:
            return f"{name} — {level}"
        if name:
            return name
        if content:
            return content
        return None

    text = _text(item)
    return text or None


def _normalize_section_items(
    value: Any,
    *,
    kind: str,
    title: str,
) -> list[str | dict[str, Any]]:
    """
    Normalize custom-section items.

    Flat list kinds (languages, interests, certifications) stay ``list[str]``.
    Record kinds accept structured objects and, when only flat strings are
    present, regroup them with ``_group_flat_items_into_records``.
    """
    if isinstance(value, str):
        raw_list: list[Any] = _string_list(value)
    elif isinstance(value, list):
        raw_list = list(value)
    else:
        return []

    if not is_record_section(kind, title):
        return _section_items(raw_list)

    entries: list[str | dict[str, Any]] = []
    flat_only: list[str] = []
    saw_structured = False

    for item in raw_list:
        normalized = _normalize_section_entry(item)
        if normalized is None:
            continue
        if isinstance(normalized, dict):
            saw_structured = True
            entries.append(normalized)
        else:
            flat_only.append(normalized)
            entries.append(normalized)

    if saw_structured:
        # Keep structured records; drop orphan flat strings that slipped in.
        return [entry for entry in entries if isinstance(entry, dict)]

    if not flat_only:
        return []

    # Extractors often emit projects as one flat bullet list. Regroup so the
    # layout engine can bold titles and nest descriptions without an LLM.
    if len(flat_only) >= 2:
        return group_flat_items_into_records(flat_only)
    return [{"title": flat_only[0], "bullets": []}]


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


def _normalize_education(value: Any) -> list[dict[str, Any]]:
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
        bullets = _string_list(entry.get("bullets") or entry.get("items"))
        description = _text(
            entry.get("description")
            or entry.get("details")
            or entry.get("notes")
        )
        legacy_detail = _text(entry.get("detail"))

        # Older extract prompt returned only degree/period/detail. Recover a
        # dedicated description when school/city are already present or when
        # detail looks like "school · city · opis".
        if not description and not bullets and legacy_detail:
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

        # Multiline descriptions become explicit bullets so templates render a
        # list without re-parsing at layout time. A single paragraph stays in
        # `description` and is still drawn as one bullet by the record helper.
        if not bullets and description and "\n" in description:
            bullets = _string_list(description.splitlines())
            if bullets:
                description = "\n".join(bullets)

        detail = " · ".join(part for part in (school, city, description) if part) or legacy_detail
        normalized: dict[str, Any] = {
            "school": school,
            "city": city,
            "degree": degree,
            "period": period,
            "description": description,
            "bullets": bullets,
            # Existing template themes consume this legacy display field.
            "detail": detail,
        }
        if any(value for key, value in normalized.items() if key != "bullets") or bullets:
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


def _infer_record_kind_from_title(title: str) -> str:
    """Map a heading like PROJEKTY to a concrete record kind."""
    folded = fold_section_label(title)
    if any(token in folded for token in ("projekt", "project", "portfolio")):
        return "projects"
    if any(token in folded for token in ("referenc", "reference")):
        return "references"
    if any(token in folded for token in ("nagrod", "award", "achiev")):
        return "awards"
    if any(token in folded for token in ("publikac", "publication")):
        return "publications"
    if any(token in folded for token in ("wolontar", "volunteer")):
        return "volunteering"
    return "other"


def _normalize_custom_sections(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    result = []
    for section in value:
        if not isinstance(section, Mapping):
            continue
        title = _text(section.get("title"))
        kind = _text(section.get("kind")).casefold() or "other"
        placement = _text(section.get("placement")) or "after_skills"
        if kind not in ALLOWED_SECTION_KINDS:
            kind = "other"
        # Extractors often tag projects/references as generic "other". Upgrade
        # from the heading so layout and regroup heuristics still apply.
        if kind == "other" and is_record_section("other", title):
            kind = _infer_record_kind_from_title(title)
        if placement not in ALLOWED_PLACEMENTS:
            # Record-style sections read better after experience.
            placement = (
                "after_experience"
                if is_record_section(kind, title)
                else "after_skills"
            )
        items = _normalize_section_items(
            section.get("items") or section.get("data"),
            kind=kind,
            title=title,
        )
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
        if kind == "languages":
            items = _section_items(section.get("items"))
            languages.extend(_normalize_languages(items))
            continue
        if kind not in ALLOWED_SECTION_KINDS:
            kind = "other"
        if kind == "other" and is_record_section("other", title):
            kind = _infer_record_kind_from_title(title)
        if placement not in ALLOWED_PLACEMENTS:
            placement = (
                "after_experience"
                if is_record_section(kind, title)
                else "after_skills"
            )
        items = _normalize_section_items(
            section.get("items"),
            kind=kind,
            title=title,
        )
        if title and items:
            custom_sections.append({
                "title": title,
                "kind": kind,
                "placement": placement,
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
        absorbed.extend(_section_items(section.get("items") or []))

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
    # Prefer the editable `languages` / `custom_sections` fields when present.
    # An explicit empty `custom_sections: []` means the user cleared structured
    # extras — do not resurrect stale `extra_sections` (including languages).
    # An empty `languages: []` alone is not enough to drop languages that still
    # exist only in legacy `extra_sections` (common after extract + client
    # payloads that always send `languages: []`).
    custom_sections_explicitly_cleared = (
        "custom_sections" in raw and isinstance(raw.get("custom_sections"), list)
        and len(raw.get("custom_sections") or []) == 0
    )
    if "languages" in raw:
        languages = _normalize_languages(raw.get("languages"))
        if (
            not languages
            and fallback_languages
            and not custom_sections_explicitly_cleared
        ):
            languages = fallback_languages
    else:
        languages = fallback_languages
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
        _skill_items(raw.get("skills")),
        custom_sections,
        labels,
        labels_skills_explicit=labels_skills_explicit,
    )
    # Absorb may reintroduce marker-only lines from alias sections — scrub again.
    skills = _skill_items(skills)

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

    # LinkedIn / GitHub / website survive the whitelist so icon templates and
    # masthead contact lines can render social rows after extract or wizard fill.
    social = extract_contact_fields_from_raw(raw)

    normalized = {
        "name": _text(raw.get("name")),
        "title": _text(raw.get("title") or raw.get("professional_title")),
        "email": _text(raw.get("email")),
        "phone": _text(raw.get("phone")),
        "address": address,
        "location": address,
        "linkedin": social["linkedin"],
        "github": social["github"],
        "website": social["website"],
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
