"""Layout-aware source extraction and grounding for imported CV PDFs.

PDF text is positioned on a two-dimensional page. Flattening that page by
visual Y position can join unrelated lines from neighbouring columns, which in
turn makes a language model assign headings or facts to the wrong CV field.
This module preserves column boundaries, inventories recognised source
sections, and deterministically restores high-confidence fields after the model
has produced its JSON structure.
"""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import json
import re
import statistics
import unicodedata
from typing import Any

import fitz


_BULLET_PREFIX = re.compile(r"^\s*[-•▪●◦‣]\s*")
_ASCII_TRANSLITERATION = str.maketrans({
    "ł": "l",
    "Ł": "L",
    "ø": "o",
    "Ø": "O",
    "đ": "d",
    "Đ": "D",
})
_HEADING_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": (
        "podsumowanie",
        "profilzawodowy",
        "profil",
        "professionalsummary",
        "professionalprofile",
        "summary",
        "aboutme",
        "omnie",
    ),
    "experience": (
        "historiazatrudnienia",
        "doswiadczeniezawodowe",
        "doswiadczenie",
        "workexperience",
        "employmenthistory",
        "professionalexperience",
        "careerhistory",
        "berufserfahrung",
    ),
    "education": (
        "wyksztalcenie",
        "edukacja",
        "education",
        "academicbackground",
        "ausbildung",
    ),
    "skills": (
        "specjalizacje",
        "specjalizacja",
        "umiejetnosci",
        "kompetencje",
        "mocnestrony",
        "skills",
        "expertise",
        "corecompetencies",
        "specializations",
        "specialisations",
    ),
    "contact": (
        "danekontaktowe",
        "kontakt",
        "contactdetails",
        "contact",
    ),
    "references": (
        "referencje",
        "references",
        "recommendations",
    ),
    "languages": (
        "jezyki",
        "jezykiobce",
        "languages",
        "language",
        "sprachen",
    ),
    "certifications": (
        "certyfikaty",
        "certyfikacje",
        "kursyiszkolenia",
        "szkolenia",
        "certifications",
        "certificates",
        "coursesandtraining",
        "training",
    ),
    "projects": (
        "projekty",
        "projects",
        "selectedprojects",
    ),
    "interests": (
        "zainteresowania",
        "hobby",
        "interests",
    ),
    "awards": (
        "nagrody",
        "wyroznienia",
        "awards",
        "honors",
        "honours",
    ),
    "publications": (
        "publikacje",
        "publications",
    ),
    "volunteering": (
        "wolontariat",
        "volunteering",
        "volunteerexperience",
    ),
}

_CANONICAL_POLISH_TITLES = {
    "summary": "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education": "WYKSZTAŁCENIE",
    "contact": "DANE KONTAKTOWE",
    "references": "REFERENCJE",
    "languages": "JĘZYKI",
    "certifications": "CERTYFIKATY",
    "projects": "PROJEKTY",
    "interests": "ZAINTERESOWANIA",
    "awards": "NAGRODY",
    "publications": "PUBLIKACJE",
    "volunteering": "WOLONTARIAT",
}


def _fold(value: Any) -> str:
    """Return an accent-free alphanumeric key used only for comparisons."""
    # Unicode decomposition removes combining accents, but characters such as
    # Polish `ł` are independent letters. Transliterate them before comparing
    # headings so letter-spaced variants like "WY K S Z T A Ł C E NI E" are
    # still recognised as the education boundary.
    transliterated = str(value or "").translate(_ASCII_TRANSLITERATION)
    decomposed = unicodedata.normalize("NFKD", transliterated)
    ascii_like = "".join(char for char in decomposed if not unicodedata.combining(char))
    return "".join(char for char in ascii_like.casefold() if char.isalnum())


def _collapse(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _heading_kind(value: Any) -> str | None:
    """Map a source heading to a stable section kind without using model output."""
    key = _fold(value)
    if not key:
        return None
    for kind, aliases in _HEADING_ALIASES.items():
        if any(key == alias or key.startswith(alias) for alias in aliases):
            return kind
    return None


def _source_title(text: str, kind: str) -> str:
    """Preserve ordinary headings and repair letter-spaced known headings."""
    collapsed = _collapse(text)
    tokens = collapsed.split()
    letter_spaced = len(tokens) >= 4 and sum(len(token) <= 2 for token in tokens) >= len(tokens) * 0.6
    if not letter_spaced:
        return collapsed.upper()
    compact = _fold(collapsed)
    if kind == "skills" and compact.startswith("specjalizac"):
        return "SPECJALIZACJE"
    if kind == "skills" and compact.startswith("umiejetnos"):
        return "UMIEJĘTNOŚCI"
    return _CANONICAL_POLISH_TITLES.get(kind, collapsed.upper())


def _join_spans(spans: list[dict[str, Any]]) -> str:
    """Join PDF spans while retaining word boundaries omitted by some fonts."""
    fragments: list[str] = []
    previous_x1: float | None = None
    previous_text = ""
    for span in spans:
        text = str(span.get("text") or "")
        if not text:
            continue
        bbox = span.get("bbox") or (0, 0, 0, 0)
        x0 = float(bbox[0])
        font_size = max(float(span.get("size") or 0), 1.0)
        needs_gap = (
            fragments
            and previous_x1 is not None
            and x0 - previous_x1 > font_size * 0.18
            and not previous_text.endswith((" ", "\n"))
            and not text.startswith((" ", "\n", ",", ".", ":", ";"))
        )
        if needs_gap:
            fragments.append(" ")
        fragments.append(text)
        previous_text = text
        previous_x1 = float(bbox[2])
    return _collapse("".join(fragments))


def _page_lines(page: fitz.Page) -> list[dict[str, Any]]:
    """Extract individual visual lines with geometry and type information."""
    lines: list[dict[str, Any]] = []
    page_dict = page.get_text("dict", sort=False)
    for block in page_dict.get("blocks") or []:
        if block.get("type") != 0:
            continue
        for line in block.get("lines") or []:
            spans = line.get("spans") or []
            text = _join_spans(spans)
            if not text:
                continue
            bbox = tuple(float(value) for value in (line.get("bbox") or (0, 0, 0, 0)))
            lines.append({
                "text": text,
                "x0": bbox[0],
                "y0": bbox[1],
                "x1": bbox[2],
                "y1": bbox[3],
                "font_size": max((float(span.get("size") or 0) for span in spans), default=0.0),
            })
    return lines


def _assign_lanes(lines: list[dict[str, Any]], page_width: float) -> None:
    """Cluster line starts into columns so neighbouring lanes never merge.

    The tolerance intentionally follows the page width instead of absolute PDF
    points. It joins modest indentation within a column while keeping the
    common A4 two-column gutter separate.
    """
    tolerance = max(36.0, page_width * 0.09)
    clusters: list[dict[str, Any]] = []
    for line in sorted(lines, key=lambda item: item["x0"]):
        closest = min(
            clusters,
            key=lambda cluster: abs(float(cluster["anchor"]) - line["x0"]),
            default=None,
        )
        if closest is None or abs(float(closest["anchor"]) - line["x0"]) > tolerance:
            closest = {"anchor": line["x0"], "members": []}
            clusters.append(closest)
        closest["members"].append(line)
        closest["anchor"] = statistics.median(
            member["x0"] for member in closest["members"]
        )

    for lane, cluster in enumerate(sorted(clusters, key=lambda item: item["anchor"]), start=1):
        for line in cluster["members"]:
            line["lane"] = lane


def _section_body_lines(
    lines: list[dict[str, Any]],
    heading_index: int,
    headings: list[tuple[int, dict[str, Any], str]],
) -> list[dict[str, Any]]:
    heading = lines[heading_index]
    next_y = float("inf")
    for other_index, other, _kind in headings:
        if (
            other_index != heading_index
            and other.get("lane") == heading.get("lane")
            and other["y0"] > heading["y0"]
        ):
            next_y = min(next_y, other["y0"])
    return [
        line
        for index, line in enumerate(lines)
        if index != heading_index
        and line.get("lane") == heading.get("lane")
        and line["y0"] >= heading["y1"] - 0.5
        and line["y0"] < next_y
    ]


def _layout_text(lines: list[dict[str, Any]], page_number: int) -> str:
    """Serialize one page as explicit columns instead of one interleaved line."""
    groups: dict[int, list[dict[str, Any]]] = {}
    for line in lines:
        groups.setdefault(int(line.get("lane") or 1), []).append(line)
    chunks = [f"--- STRONA {page_number}: BLOKI W ODDZIELNYCH KOLUMNACH ---"]
    for lane, members in sorted(groups.items()):
        x0 = min(member["x0"] for member in members)
        x1 = max(member["x1"] for member in members)
        chunks.append(f"[KOLUMNA {lane}; x={x0:.0f}-{x1:.0f}]")
        chunks.extend(member["text"] for member in sorted(members, key=lambda item: (item["y0"], item["x0"])))
        chunks.append(f"[/KOLUMNA {lane}]")
    return "\n".join(chunks)


def extract_pdf_source_pages(
    pdf_bytes: bytes,
    *,
    max_pages: int,
    min_text_chars_per_page: int,
) -> list[dict[str, Any]]:
    """Read PDF pages without flattening adjacent columns into shared lines.

    @param pdf_bytes - Valid PDF file contents.
    @param max_pages - Maximum number of pages to inspect.
    @param min_text_chars_per_page - Native-text threshold below which vision is required.
    @returns Page dictionaries consumed by the model request and source guard.
    """
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        pages: list[dict[str, Any]] = []
        for page_index, page in enumerate(document):
            if page_index >= max_pages:
                break
            lines = _page_lines(page)
            _assign_lanes(lines, float(page.rect.width))
            lines.sort(key=lambda item: (int(item.get("lane") or 1), item["y0"], item["x0"]))
            headings = [
                (index, line, kind)
                for index, line in enumerate(lines)
                if (kind := _heading_kind(line["text"])) is not None
            ]
            sections: list[dict[str, Any]] = []
            for heading_index, heading, kind in headings:
                body_lines = _section_body_lines(lines, heading_index, headings)
                body = "\n".join(line["text"] for line in body_lines).strip()
                sections.append({
                    "id": f"p{page_index + 1}-c{heading.get('lane', 1)}-{kind}-{len(sections) + 1}",
                    "page": page_index + 1,
                    "column": int(heading.get("lane") or 1),
                    "kind": kind,
                    "title": _source_title(heading["text"], kind),
                    "body": body,
                    "body_lines": body_lines,
                })
            plain_text = "\n".join(line["text"] for line in lines)
            pages.append({
                "number": page_index + 1,
                "text": _layout_text(lines, page_index + 1),
                "plain_text": plain_text,
                "sections": sections,
                "needs_vision": len("".join(plain_text.split())) < min_text_chars_per_page,
            })
        return pages
    finally:
        document.close()


def source_sections_prompt(pages: list[dict[str, Any]]) -> str:
    """Return a compact heading inventory for the untrusted model material.

    Bodies remain in the layout-preserving page text. Repeating them here would
    increase token usage without adding evidence, so the inventory carries only
    stable geometric boundaries and heading hints.
    """
    payload = [
        {
            "id": section["id"],
            "page": section["page"],
            "column": section["column"],
            "kind_hint": section["kind"],
            "source_heading": section["title"],
        }
        for page in pages
        for section in page.get("sections") or []
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _prose(lines: list[dict[str, Any]]) -> str:
    return _collapse(" ".join(line["text"] for line in lines))


def _bullet_items(lines: list[dict[str, Any]]) -> list[str]:
    if not lines:
        return []
    has_bullets = any(_BULLET_PREFIX.match(line["text"]) for line in lines)
    if not has_bullets:
        return [_collapse(line["text"]) for line in lines if _collapse(line["text"])]

    items: list[str] = []
    current = ""
    for line in lines:
        text = _collapse(line["text"])
        if not text:
            continue
        if _BULLET_PREFIX.match(text):
            if current:
                items.append(current)
            current = _collapse(_BULLET_PREFIX.sub("", text))
        elif current:
            current = _collapse(f"{current} {text}")
        else:
            current = text
    if current:
        items.append(current)
    return items


def _reference_records(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group reference lines by visual gaps, preserving title and affiliation."""
    if not lines:
        return []
    heights = [max(line["y1"] - line["y0"], 1.0) for line in lines]
    split_gap = statistics.median(heights) * 1.15
    groups: list[list[str]] = []
    current: list[str] = []
    previous: dict[str, Any] | None = None
    for line in sorted(lines, key=lambda item: item["y0"]):
        if previous is not None and line["y0"] - previous["y1"] > split_gap and current:
            groups.append(current)
            current = []
        current.append(_collapse(line["text"]))
        previous = line
    if current:
        groups.append(current)

    return [
        {
            "title": group[0],
            "subtitle": group[1] if len(group) > 1 else "",
            "bullets": group[2:] if len(group) > 2 else [],
        }
        for group in groups
        if group and group[0]
    ]


def ground_cv_data_from_source(
    model_data: Mapping[str, Any],
    pages: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    """Restore high-confidence fields from geometric source sections.

    The model still handles flexible record schemas and classification. Source
    geometry owns fields whose boundaries are unambiguous: professional
    summary prose, named skills/specialisation lists, and reference records.
    This prevents prompt examples or neighbouring columns from replacing facts.

    @param model_data - Parsed provider JSON before application normalization.
    @param pages - Layout-aware pages returned by ``extract_pdf_source_pages``.
    @returns Grounded model data and content-free names of source-owned fields.
    """
    grounded = deepcopy(dict(model_data))
    source_grounded_fields: list[str] = []
    sections = [section for page in pages for section in page.get("sections") or []]

    summary = next(
        (_prose(section.get("body_lines") or []) for section in sections if section.get("kind") == "summary"),
        "",
    )
    if summary:
        grounded["summary"] = summary
        source_grounded_fields.append("summary")

    skill_sections = [section for section in sections if section.get("kind") == "skills"]
    skill_groups = [
        {
            "category": section["title"],
            "items": _bullet_items(section.get("body_lines") or []),
        }
        for section in skill_sections
    ]
    skill_groups = [group for group in skill_groups if group["items"]]
    if skill_groups:
        next_skills: list[Any]
        if len(skill_groups) == 1:
            next_skills = skill_groups[0]["items"]
        else:
            next_skills = skill_groups
        grounded["skills"] = next_skills
        source_grounded_fields.append("skills")
        labels = dict(grounded.get("labels") or {}) if isinstance(grounded.get("labels"), Mapping) else {}
        labels["skills"] = skill_groups[0]["category"] if len(skill_groups) == 1 else "UMIEJĘTNOŚCI"
        grounded["labels"] = labels

    reference_sections = [section for section in sections if section.get("kind") == "references"]
    if reference_sections:
        records = [
            record
            for section in reference_sections
            for record in _reference_records(section.get("body_lines") or [])
        ]
        if records:
            extras = [
                dict(section)
                for section in (grounded.get("extra_sections") or [])
                if isinstance(section, Mapping)
                and section.get("kind") != "references"
                and _heading_kind(section.get("title")) != "references"
            ]
            extras.append({
                "title": reference_sections[0]["title"],
                "kind": "references",
                "placement": "after_experience",
                "items": records,
            })
            grounded["extra_sections"] = extras
            source_grounded_fields.append("references")

    return grounded, source_grounded_fields
