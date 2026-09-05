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
_LANGUAGE_LEVEL_MARKER = re.compile(
    r"(?:\b[ABC][12](?:\+|\s*/\s*[ABC][12])?(?=\W|$)"
    r"|\b(?:native|fluent|advanced|intermediate|basic|beginner)\b"
    r"|\b(?:ojczyst\w*|bieg\w*|zaawansowan\w*|średniozaawansowan\w*|podstawow\w*|komunikatyw\w*)\b"
    r"|\bcommunicative\b"
    r"|\b(?:muttersprache|fliessend|fließend|fortgeschritten|grundkenntnisse)\b)",
    re.IGNORECASE,
)


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
ALLOWED_EDITOR_SECTION_TYPES = {
    "summary",
    "experience",
    "education",
    "languages",
    "skills",
    "skills-categories",
}

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

# Named skill-family headings that become *subsections* under the localized
# parent Skills heading when more than one is present (soft / hard / tools),
# instead of separate top-level canvas sections or one flattened chip list.
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

    These become named subsections under the localized parent Skills slot when
    more than one family is present, instead of separate top-level sections.
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
    seen_skill_keys: set[str] = set()
    for group in groups:
        # AI and imported profiles may describe the same skill in multiple
        # named groups (for example "Python" under both Automatyzacja and
        # Programowanie). A flat list was already de-duplicated below, but
        # grouped skills bypassed that path and rendered the chip twice after a
        # template change. Keep the first category assignment in reading order.
        items = []
        for item in group["items"]:
            key = item.casefold()
            if item and key not in seen_skill_keys:
                items.append(item)
                seen_skill_keys.add(key)
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
    means the caller should keep the existing localized ``labels.skills`` as a
    parent heading instead of replacing it with a child category title.
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


def _split_language_rows(value: Any) -> list[str]:
    """Split legacy multi-language strings without breaking level details.

    Horizontal PDF grids sometimes reach normalization as one provider string,
    for example ``Polski - A2 | Angielski - C1``. A pipe or semicolon denotes
    a new language only when every following fragment contains a name before a
    proficiency marker; otherwise it remains part of one entry, as in
    ``English - C1; certyfikat CAE`` or ``English | C1``.

    @param value - One language string that may contain several entries.
    @returns Ordered standalone language rows.
    """
    rows: list[str] = []
    for raw_part in re.split(
        r"(?:\r?\n|[•▪●◦‣]+|\s+·\s+)",
        str(value or ""),
    ):
        part = _text(raw_part).strip(" -•▪●◦‣")
        if not part:
            continue
        delimited_parts = [
            _text(candidate).strip(" -•▪●◦‣")
            for candidate in re.split(r"\s*[|;]\s*", part)
        ]
        starts_new_rows = len(delimited_parts) > 1 and all(
            (
                (marker := _LANGUAGE_LEVEL_MARKER.search(candidate)) is not None
                and any(character.isalpha() for character in candidate[:marker.start()])
            )
            for candidate in delimited_parts[1:]
        )
        rows.extend(delimited_parts if starts_new_rows else [part])
    return [row for row in rows if row]


def _normalize_languages(value: Any) -> list[dict[str, str]]:
    """Normalize current mappings and legacy strings into editable languages.

    Structured mappings are editor-owned rows, so their order and multiplicity
    are semantic. In particular, several newly added cells may temporarily
    contain the same ``Język — poziom`` placeholder. Legacy free-text imports
    still deduplicate repeated rows because those duplicates commonly come from
    extraction noise rather than explicit editor entries.
    """
    if not isinstance(value, list):
        return []

    entries: list[tuple[str, str, bool]] = []
    for item in value:
        if isinstance(item, Mapping):
            name = _text(item.get("name") or item.get("language"))
            level = _text(item.get("level") or item.get("proficiency"))
            # Structured mappings already separate name from level. Preserve
            # punctuation inside the level (for example ``C1; certyfikat
            # CAE``) instead of re-parsing it as another language row.
            if name:
                entries.append((name, level, True))
            continue

        for raw in _split_language_rows(_text(item)):
            separator = re.search(
                r"\s*(?:—|–|:|\|)\s*|\s+-\s+|-(?=[ABC][12](?:\b|\+))",
                raw,
                flags=re.IGNORECASE,
            )
            parenthesized_level = re.fullmatch(
                r"(?P<name>.+?)\s*\((?P<level>[^()]+)\)\s*",
                raw,
            )
            parenthesized_is_primary = (
                parenthesized_level
                and _LANGUAGE_LEVEL_MARKER.search(
                    parenthesized_level.group("level")
                )
                and (
                    separator is None
                    or separator.start() >= raw.find("(")
                )
            )
            if parenthesized_is_primary:
                name = parenthesized_level.group("name").strip()
                level = parenthesized_level.group("level").strip()
            elif separator:
                name = raw[:separator.start()].strip()
                level = raw[separator.end():].strip()
            else:
                name, level = raw.strip(), ""
            if name:
                entries.append((name, level, False))

    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for name, level, preserve_duplicate in entries:
        key = (name.casefold(), level.casefold())
        if name and (preserve_duplicate or key not in seen):
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


def _normalize_category_records(value: Any) -> list[dict[str, Any]]:
    """Keep editor-authored category/body pairs without title-based inference.

    Empty structured records and repeated records are intentional. Legacy flat
    values remain bodies; guessing a colon boundary could corrupt user text.
    """
    if not isinstance(value, list):
        return []
    records = []
    for item in value:
        record = {
            "title": _text(item.get("title")),
            "body": _text(item.get("body")),
            "bulletList": item.get("bulletList") is True,
        } if isinstance(item, Mapping) else {
            "title": "", "body": _text(item), "bulletList": False,
        }
        # An explicit pair survives save/refill even before the user types.
        # Empty legacy strings carry no record structure and can still be dropped.
        if record["title"] or record["body"] or isinstance(item, Mapping):
            records.append(record)
    return records


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
        layout = _text(section.get("layout")).casefold()
        layout = layout if layout in {"grid", "cc-sub"} else ""
        section_type = _text(section.get("section_type")).casefold()
        if section_type not in ALLOWED_EDITOR_SECTION_TYPES:
            # `cc-sub` is the product's Skills (Categories) layout. Profiles
            # saved before section_type existed still need the same semantic
            # canvas actions after a template regeneration.
            section_type = "skills-categories" if layout == "cc-sub" else ""
        if kind not in ALLOWED_SECTION_KINDS:
            kind = "other"
        # Extractors often tag projects/references as generic "other". Upgrade
        # from the heading so layout and regroup heuristics still apply.
        if kind == "other" and not layout and is_record_section("other", title):
            kind = _infer_record_kind_from_title(title)
        if placement not in ALLOWED_PLACEMENTS:
            # Record-style sections read better after experience.
            placement = (
                "after_experience"
                if is_record_section(kind, title)
                else "after_skills"
            )
        raw_items = section.get("items") or section.get("data")
        items = (
            _normalize_category_records(raw_items) if layout == "cc-sub"
            else _normalize_section_items(raw_items, kind=kind, title=title)
        )
        if title and items:
            normalized_section = {
                "title": title.upper(),
                "kind": kind,
                "placement": placement,
                "items": items,
            }
            if layout:
                normalized_section["layout"] = layout
            if section_type:
                normalized_section["section_type"] = section_type
            result.append(normalized_section)
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
        layout = _text(section.get("layout")).casefold()
        layout = layout if layout in {"grid", "cc-sub"} else ""
        section_type = _text(section.get("section_type")).casefold()
        if section_type not in ALLOWED_EDITOR_SECTION_TYPES:
            section_type = "skills-categories" if layout == "cc-sub" else ""
        if kind == "languages" and not layout:
            items = _section_items(section.get("items"))
            languages.extend(_normalize_languages(items))
            continue
        if kind not in ALLOWED_SECTION_KINDS:
            kind = "other"
        if kind == "other" and not layout and is_record_section("other", title):
            kind = _infer_record_kind_from_title(title)
        if placement not in ALLOWED_PLACEMENTS:
            placement = (
                "after_experience"
                if is_record_section(kind, title)
                else "after_skills"
            )
        items = (
            _normalize_category_records(section.get("items")) if layout == "cc-sub"
            else _normalize_section_items(section.get("items"), kind=kind, title=title)
        )
        if title and items:
            normalized_section = {
                "title": title,
                "kind": kind,
                "placement": placement,
                "items": items,
            }
            if layout:
                normalized_section["layout"] = layout
            if section_type:
                normalized_section["section_type"] = section_type
            custom_sections.append(normalized_section)
    return languages, custom_sections


def _language_section_title(extra_sections: Any) -> str:
    """Return the persisted Languages heading, with a Polish legacy fallback.

    Languages have both an editable structured list and a derived
    ``extra_sections`` representation used by template generators. A template
    refill normalizes that already-normalized profile again, so rebuilding the
    derived section from a hard-coded title would discard an accepted AI
    translation such as ``LANGUAGES``.
    """
    if isinstance(extra_sections, list):
        for section in extra_sections:
            if not isinstance(section, Mapping):
                continue
            if _text(section.get("kind")).casefold() != "languages":
                continue
            title = _text(section.get("title"))
            if title:
                return title.upper()
    return "JĘZYKI"


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
      named ``{category, items}`` groups under the localized parent Skills label
    """
    kept: list[dict[str, Any]] = []
    distinct_aliases: list[dict[str, Any]] = []
    alias_title: str | None = None
    absorbed_flat: list[str] = []

    for section in sections:
        # Explicit grids and category records are independent sections. Their
        # headings may intentionally use a skills-like word such as NARZĘDZIA;
        # absorbing them into the canonical Skills slot would destroy the
        # field/column contract after a template refill.
        if section.get("layout") in {"grid", "cc-sub"}:
            kept.append(section)
            continue
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

    # Multiple named families (or families + existing skills) become
    # subsections under the current localized Skills label. A solitary family
    # with an empty skills slot still fills that slot with a single heading.
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
    parent_label_folded = fold_section_label(next_labels.get("skills"))
    parent_matches_child = use_parent_label and bool(parent_label_folded) and any(
        isinstance(group, Mapping)
        and fold_section_label(group.get("category")) == parent_label_folded
        for group in next_skills
    )
    if parent_matches_child:
        # Legacy profiles can carry a child category (for example Soft Skills)
        # as the parent label. Keep translated parent labels such as SKILLS, but
        # restore the neutral fallback when parent and child would render twice.
        next_labels["skills"] = DEFAULT_LABELS["skills"]
    elif not use_parent_label and alias_title and (
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
    language_section_title = _language_section_title(raw.get("extra_sections"))
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

    # Promote "Bezpieczeństwo: …" rows to named skill groups under the current
    # Skills label before alias absorb (soft/hard/tools families nest likewise).
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
            "title": language_section_title,
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
