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

# Skill subsection lines as printed on many PL CVs:
# "Bezpieczeństwo: Wireshark, Nmap, …" / "Przemysł / OT: PLC, …"
_SKILL_CATEGORY_LINE = re.compile(r"^(?P<title>[^:]{2,48}?):\s+(?P<body>\S.+)$")
_SKILL_BODY_SPLIT = re.compile(r"\s*[,;|•·]\s*")
_LANGUAGE_CATEGORY_TOKENS = ("jezyk", "language", "lingua", "sprache")


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

# Named skill-family headings that become *subsections* under UMIEJĘTNOŚCI when
# more than one is present (soft / hard / tools), instead of separate top-level
# canvas sections or one flattened chip list.
_DISTINCT_SKILL_FAMILY_TOKENS = (
    "soft skill",
    "hard skill",
    "miekk",       # umiejętności miękkie / kompetencje miękkie
    "tward",       # umiejętności twarde / kompetencje twarde
    "narzedz",     # narzędzia / znane narzędzia
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


def is_distinct_skill_family_title(title: object) -> bool:
    """
    True for soft skills / hard skills / tools headings.

    These become named subsections under the parent UMIEJĘTNOŚCI slot when more
    than one family is present, instead of separate top-level sections.
    """
    folded = fold_section_label(title)
    if not folded:
        return False
    return any(token in folded for token in _DISTINCT_SKILL_FAMILY_TOKENS)


def is_skills_like_section(section: Mapping[str, Any] | None) -> bool:
    if not isinstance(section, Mapping):
        return False
    kind = _text(section.get("kind")).casefold()
    if kind == "skills":
        return True
    return is_skills_like_title(section.get("title"))


def _looks_like_skill_category_title(title: object) -> bool:
    """True for short skill-subsection labels, not URLs or long prose."""
    raw = _text(title)
    folded = fold_section_label(raw)
    if not folded or len(folded) > 48:
        return False
    if any(token in folded for token in ("http", "www.", ".com", ".pl")):
        return False
    if "@" in raw or "://" in raw:
        return False
    # Category labels are short; long clauses before a colon are body text.
    if len(raw.split()) > 6:
        return False
    return True


def _split_skill_category_body(body: object) -> list[str]:
    """Split a category body on commas / mid-dots into individual skill chips."""
    text = _text(body)
    if not text:
        return []
    parts = _SKILL_BODY_SPLIT.split(text)
    return _string_list(parts)


def _explode_multiline_skill_items(skills: list[str]) -> list[str]:
    """Flatten skills that still contain embedded newlines into one line each."""
    exploded: list[str] = []
    for item in skills:
        if "\n" in item:
            exploded.extend(
                line.strip()
                for line in item.replace("\r\n", "\n").split("\n")
                if line.strip()
            )
        else:
            exploded.append(item)
    return exploded


def _parse_language_category_body(body: object) -> list[dict[str, str]]:
    """
    Parse a languages line nested under skills, e.g.
    ``polski — biegły (C1/C2) • angielski — B2 pisemny``.
    """
    text = _text(body)
    if not text:
        return []
    bits = re.split(r"\s*[•·]\s*", text)
    return _normalize_languages(bits)


def _clean_skill_chip(value: object) -> str:
    """Strip list markers from one skill chip."""
    return _LEADING_LIST_MARKER.sub("", _text(value)).strip()


def _is_skill_group_mapping(item: Mapping[str, Any]) -> bool:
    """True for ``{category, items}`` (extract / normalize), not ``{name}`` chips."""
    if "category" in item:
        return True
    if isinstance(item.get("items"), list) and (
        _text(item.get("category")) or _text(item.get("title"))
    ):
        return True
    return False


def _skill_group_from_mapping(item: Mapping[str, Any]) -> dict[str, Any] | None:
    """Build one ``{category, items}`` group or None when empty."""
    category = _text(item.get("category"))
    if not category:
        category = _text(item.get("title"))
    raw_items = item.get("items")
    if not isinstance(raw_items, list):
        raw_items = item.get("bullets") if isinstance(item.get("bullets"), list) else []
    chips: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        text = _clean_skill_chip(raw)
        key = text.casefold()
        if text and key not in seen:
            chips.append(text)
            seen.add(key)
    if not category and not chips:
        return None
    return {"category": category, "items": chips}


def skill_groups(value: Any) -> list[dict[str, Any]]:
    """
    View skills as ``[{category: str|None, items: [str]}, ...]`` for rendering.

    Flat chip lists become a single group with ``category=None``. Named groups
    keep their category string. Ungrouped leftover chips before/after named
    groups become ``category=None`` groups so nothing is dropped.
    """
    if value is None:
        return []
    if isinstance(value, str):
        chips = [_clean_skill_chip(part) for part in _string_list(value)]
        chips = [chip for chip in chips if chip]
        return [{"category": None, "items": chips}] if chips else []
    if not isinstance(value, list):
        return []

    groups: list[dict[str, Any]] = []
    flat_buf: list[str] = []
    seen_flat: set[str] = set()

    def flush_flat() -> None:
        nonlocal flat_buf, seen_flat
        if flat_buf:
            groups.append({"category": None, "items": list(flat_buf)})
            flat_buf = []
            seen_flat = set()

    for item in value:
        if isinstance(item, Mapping) and _is_skill_group_mapping(item):
            flush_flat()
            group = _skill_group_from_mapping(item)
            if group and group["items"]:
                groups.append({
                    "category": group["category"] or None,
                    "items": group["items"],
                })
            continue
        if isinstance(item, Mapping):
            # Legacy ``{name|title}`` chip objects.
            chip = _clean_skill_chip(
                item.get("name") or item.get("title") or item.get("label") or item.get("content")
            )
        else:
            chip = _clean_skill_chip(item)
        key = chip.casefold()
        if chip and key not in seen_flat:
            flat_buf.append(chip)
            seen_flat.add(key)
    flush_flat()
    return groups


def skills_have_content(value: Any) -> bool:
    """True when any skill chip exists (flat or inside a named group)."""
    return any(group["items"] for group in skill_groups(value))


def _skills_have_named_groups(value: Any) -> bool:
    return any(_text(group.get("category")) for group in skill_groups(value))


def _is_redundant_skill_category(category: object) -> bool:
    """
    True when a group label duplicates the parent skills chrome.

    Extractors often wrap a flat SKILLS sidebar as
    ``[{category: "SKILLS", items: [...]}]`` while ``labels.skills`` is already
    UMIEJĘTNOŚCI — that would print a useless bold "SKILLS" under the section
    heading. Generic synonyms must never become subcategory chrome.
    """
    return is_generic_skills_label(category)


def _normalize_skills(value: Any) -> list[Any]:
    """
    Canonical skills list: plain strings and/or ``{category, items}`` groups.

    Named groups are kept only when at least two real categories remain after
    scrubbing. A single category (including a lone ``SKILLS`` / ``UMIEJĘTNOŚCI``
    wrapper from extract) collapses to a flat chip list so the canvas shows
    simple text under the parent skills heading — no fake subcategory.
    """
    groups = skill_groups(value)
    if not groups:
        return []

    # Drop parent-duplicate labels (SKILLS / UMIEJĘTNOŚCI / Obszary) before
    # deciding whether a taxonomy is present.
    scrubbed: list[dict[str, Any]] = []
    for group in groups:
        items = list(group["items"])
        if not items:
            continue
        category = _text(group.get("category"))
        if category and _is_redundant_skill_category(category):
            category = ""
        scrubbed.append({"category": category, "items": items})

    if not scrubbed:
        return []

    named_count = sum(1 for group in scrubbed if group["category"])
    # Flatten when there is no real taxonomy:
    # - every category was a parent duplicate (SKILLS / UMIEJĘTNOŚCI), or
    # - a single named wrapper with no sibling groups (lone extract category).
    # Keep groups when two+ real categories exist, or when one named family
    # sits beside uncategorized chips (absorb: flat skills + soft-skills family).
    should_flatten = named_count == 0 or (
        named_count == 1 and len(scrubbed) == 1
    )
    if should_flatten:
        flat: list[str] = []
        seen: set[str] = set()
        for group in scrubbed:
            for chip in group["items"]:
                key = chip.casefold()
                if chip and key not in seen:
                    flat.append(chip)
                    seen.add(key)
        return flat

    normalized: list[dict[str, Any]] = []
    for group in scrubbed:
        normalized.append({
            "category": group["category"],
            "items": list(group["items"]),
        })
    return normalized


def _merge_skill_entries(*parts: Any) -> list[Any]:
    """Concatenate skill lists/groups and re-normalize."""
    merged: list[Any] = []
    for part in parts:
        if part is None:
            continue
        if isinstance(part, list):
            merged.extend(part)
        else:
            merged.append(part)
    return _normalize_skills(merged)


def _expand_skill_category_lines(
    skills: list[Any],
    languages: list[dict[str, str]],
) -> tuple[list[Any], list[dict[str, str]], bool]:
    """
    Turn ``Category: a, b`` skill lines into named skill groups.

    Many CVs (e.g. CV16) print one UMIEJĘTNOŚCI heading and then several
    category rows. Those become ``{category, items}`` entries under the parent
    skills slot (not separate top-level sections). A nested ``Języki:`` row
    merges into ``languages``.

    Requires at least two category lines so a lone ``Uwaga: …`` note is not
    mistaken for a skill taxonomy.

    Returns ``(skills, languages, used_parent_label)`` where ``used_parent_label``
    means the caller should keep ``labels.skills`` as the generic UMIEJĘTNOŚCI.
    """
    if _skills_have_named_groups(skills):
        # Extractor already returned structured groups — keep them.
        return _normalize_skills(skills), languages, True

    # Only string chips can be Category: lines.
    flat = _skill_items(skills)
    lines = _explode_multiline_skill_items(flat)
    categorized: list[tuple[str, str]] = []
    remainder: list[str] = []
    for item in lines:
        match = _SKILL_CATEGORY_LINE.match(item.strip())
        if not match or not _looks_like_skill_category_title(match.group("title")):
            remainder.append(item)
            continue
        categorized.append((match.group("title").strip(), match.group("body").strip()))

    if len(categorized) < 2:
        return _normalize_skills(skills), languages, False

    next_languages = list(languages)
    groups: list[dict[str, Any]] = []
    if remainder:
        groups.append({"category": "", "items": _skill_items(remainder)})

    for title, body in categorized:
        folded = fold_section_label(title)
        if any(token in folded for token in _LANGUAGE_CATEGORY_TOKENS):
            for entry in _parse_language_category_body(body):
                key = (entry["name"].casefold(), entry["level"].casefold())
                if not any(
                    (lang["name"].casefold(), lang["level"].casefold()) == key
                    for lang in next_languages
                ):
                    next_languages.append(entry)
            continue
        items = _split_skill_category_body(body)
        if items:
            groups.append({"category": title, "items": items})

    return _normalize_skills(groups), next_languages, bool(groups)


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
    Flatten skills to unique display strings (ATS / emptiness checks).

    Accepts plain strings, legacy ``{name|title|...}`` chips, and
    ``{category, items}`` groups. Leading bullet glyphs are removed so a bare
    ``"•"`` cannot keep skills truthy while list formatters produce an empty body.
    Category labels are not included — only chips.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for group in skill_groups(value):
        for item in group["items"]:
            text = _clean_skill_chip(item)
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
    skills: list[Any],
    sections: list[dict[str, Any]],
    labels: dict[str, str],
    *,
    labels_skills_explicit: bool,
    force_parent_skills_label: bool = False,
) -> tuple[list[Any], list[dict[str, Any]], dict[str, str]]:
    """
    Fold skills-like custom sections into the skills slot.

    Generic aliases (Obsługa komputera, Technologie, …):
    - merge chips into flat/grouped skills
    - keep the alias heading in labels['skills'] when appropriate
    - drop the alias from extra_sections

    Distinct skill-family headings (soft / hard / tools):
    - one family alone with empty skills → fills the skills slot (flat chips +
      that heading), same as a lone generic alias
    - two or more families, or families alongside existing skills → become
      named ``{category, items}`` groups under parent ``UMIEJĘTNOŚCI``
    """
    kept: list[dict[str, Any]] = []
    distinct_aliases: list[dict[str, Any]] = []
    alias_title: str | None = None
    absorbed_flat: list[str] = []

    for section in sections:
        if not is_skills_like_section(section):
            kept.append(section)
            continue
        if is_distinct_skill_family_title(section.get("title")):
            distinct_aliases.append(section)
            continue
        title = _text(section.get("title")).upper()
        if alias_title is None and title:
            alias_title = title
        absorbed_flat.extend(_section_items(section.get("items") or []))

    next_skills: list[Any] = list(skills)
    use_parent_label = force_parent_skills_label

    # Multiple named families (or families + existing skills) → subsections
    # under UMIEJĘTNOŚCI. A solitary family with an empty skills slot still
    # fills that slot with a single heading (Obsługa-komputera path).
    nest_distinct = (
        len(distinct_aliases) >= 2
        or (distinct_aliases and (skills_have_content(skills) or absorbed_flat))
    )
    if nest_distinct:
        family_groups = [
            {
                "category": _text(section.get("title")),
                "items": _skill_items(section.get("items") or []),
            }
            for section in distinct_aliases
            if _skill_items(section.get("items") or [])
        ]
        next_skills = _merge_skill_entries(next_skills, family_groups)
        use_parent_label = True
    elif len(distinct_aliases) == 1:
        only = distinct_aliases[0]
        title = _text(only.get("title")).upper()
        if alias_title is None and title:
            alias_title = title
        absorbed_flat.extend(_section_items(only.get("items") or []))

    if absorbed_flat:
        next_skills = _merge_skill_entries(next_skills, absorbed_flat)

    next_labels = dict(labels)
    if use_parent_label:
        # Parent chrome for nested subsections — never a child category name.
        next_labels["skills"] = DEFAULT_LABELS["skills"]
    elif alias_title and (
        not labels_skills_explicit or is_generic_skills_label(next_labels.get("skills"))
    ):
        next_labels["skills"] = alias_title
    return _normalize_skills(next_skills), kept, next_labels


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

    # Promote "Bezpieczeństwo: …" rows to named skill groups under UMIEJĘTNOŚCI
    # before alias absorb (soft/hard/tools families nest the same way).
    skills, languages, category_parent_label = _expand_skill_category_lines(
        _normalize_skills(raw.get("skills")),
        languages,
    )

    skills, custom_sections, labels = _absorb_skills_alias_sections(
        skills,
        custom_sections,
        labels,
        labels_skills_explicit=labels_skills_explicit,
        force_parent_skills_label=category_parent_label,
    )
    skills = _normalize_skills(skills)

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
