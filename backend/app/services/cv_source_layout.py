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
        "podsumowaniezawodowe",
        "podsumowanie",
        "profilzawodowy",
        "profil",
        "professionalsummary",
        "professionalprofile",
        "summaryofqualifications",
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
        "educationalbackground",
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
        "kursy",
        "kursyiszkolenia",
        "szkolenia",
        "certifications",
        "certificates",
        "courses",
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
    "driving_license": (
        "prawojazdy",
        "drivinglicence",
        "drivinglicense",
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
    "driving_license": "PRAWO JAZDY",
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
    """Map an exact source heading to a stable kind without model output.

    Source grounding treats detected headings as hard geometric boundaries, so
    prefix matching is unsafe here. A wrapped prose line such as ``education. I
    possess...`` or ``skills, and empathy...`` must remain part of its current
    section instead of truncating the summary or splitting a skill category.
    Punctuation and letter spacing are still tolerated because ``_fold`` keeps
    only accent-free alphanumeric characters.
    """
    key = _fold(value)
    if not key:
        return None
    for kind, aliases in _HEADING_ALIASES.items():
        if key in aliases:
            return kind
    return None


def _inline_heading_value(value: Any) -> tuple[str, str, str] | None:
    """Recognize a source heading whose value shares the same visual row.

    Most section headings must match an alias exactly because prefix matching
    can turn ordinary prose into a hard section boundary. A driving-licence row
    is a narrow exception used by compact CV sidebars: producers commonly emit
    ``Prawo jazdy: Kategoria B`` as one text object. Splitting only this known
    heading preserves the value while preventing it from becoming a language
    or skill item.

    @param value - Text from one reconstructed PDF line.
    @returns ``(kind, source heading, inline body)`` when the row is supported.
    """
    collapsed = _collapse(value)
    for separator in (":", "|", "—", "–", "-"):
        if separator not in collapsed:
            continue
        heading_text, inline_value = (
            _collapse(part) for part in collapsed.split(separator, 1)
        )
        if _heading_kind(heading_text) == "driving_license" and inline_value:
            return "driving_license", heading_text, inline_value
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
    """Extract and reassemble visual lines with geometry and type information.

    PDF producers may encode one justified row as several independent text
    objects, often one object per word or phrase. Keeping those fragments as
    separate lines makes their different ``x0`` values look like extra columns
    and can move part of a Skills row into a neighbouring Courses section. The
    reassembly step joins only same-baseline fragments separated by a word-sized
    gap; the larger gutter between real CV columns remains a hard boundary.
    """
    lines: list[dict[str, Any]] = []
    page_dict = page.get_text("dict", sort=False)
    for block_index, block in enumerate(page_dict.get("blocks") or []):
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
                "block_index": block_index,
                # PDF font flags use bit 4 for bold. The font-name fallback
                # covers producers that omit or rewrite the standard flags.
                "is_bold": any(
                    bool(int(span.get("flags") or 0) & 16)
                    or "bold" in str(span.get("font") or "").casefold()
                    for span in spans
                ),
            })
    return _merge_visual_line_fragments(lines)


def _merge_visual_line_fragments(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Join independently encoded phrases that occupy one visual text row.

    Same-block fragments receive a slightly wider allowance because word
    spacing in justified text can be large. Cross-block joins are deliberately
    stricter and cover producers that emit every phrase as its own text object.
    Both limits scale with the source font and remain below a normal column
    gutter, preventing rows from adjacent lanes from being combined.
    """
    if len(lines) < 2:
        return lines

    rows: list[list[dict[str, Any]]] = []
    for line in sorted(lines, key=lambda item: (item["y0"], item["x0"])):
        line_height = max(line["y1"] - line["y0"], line.get("font_size") or 1.0, 1.0)
        row = next(
            (
                candidate
                for candidate in reversed(rows)
                if abs(candidate[0]["y0"] - line["y0"]) <= max(1.5, line_height * 0.3)
                and min(candidate[0]["y1"], line["y1"])
                - max(candidate[0]["y0"], line["y0"])
                >= min(candidate[0]["y1"] - candidate[0]["y0"], line["y1"] - line["y0"]) * 0.55
            ),
            None,
        )
        if row is None:
            rows.append([line])
        else:
            row.append(line)

    merged_lines: list[dict[str, Any]] = []
    for row in rows:
        ordered = sorted(row, key=lambda item: item["x0"])
        current = dict(ordered[0])
        for fragment in ordered[1:]:
            font_size = max(
                float(current.get("font_size") or 0),
                float(fragment.get("font_size") or 0),
                1.0,
            )
            same_block = current.get("block_index") == fragment.get("block_index")
            max_gap = font_size * (3.0 if same_block else 1.8)
            gap = fragment["x0"] - current["x1"]
            if -font_size * 0.2 <= gap <= max_gap:
                fragment_text = _collapse(fragment.get("text"))
                separator = ""
                if (
                    current["text"]
                    and fragment_text
                    and not current["text"].endswith((" ", "-", "/"))
                    and not fragment_text.startswith((",", ".", ":", ";", ")", "]"))
                ):
                    separator = " "
                current["text"] = _collapse(
                    f"{current['text']}{separator}{fragment_text}"
                )
                current["x1"] = max(current["x1"], fragment["x1"])
                current["y0"] = min(current["y0"], fragment["y0"])
                current["y1"] = max(current["y1"], fragment["y1"])
                current["font_size"] = font_size
                # A mixed-weight row is body copy with an emphasized phrase,
                # not a standalone section/category heading.
                current["is_bold"] = bool(current.get("is_bold")) and bool(
                    fragment.get("is_bold")
                )
                if not same_block:
                    current["block_index"] = None
                continue
            merged_lines.append(current)
            current = dict(fragment)
        merged_lines.append(current)
    return merged_lines


def _assign_lanes(lines: list[dict[str, Any]], page_width: float) -> None:
    """Cluster line starts into columns so neighbouring lanes never merge.

    The tolerance intentionally follows the page width instead of absolute PDF
    points. Designed CVs often centre a short section heading over left-aligned
    body copy, which can shift the heading start by more than one tenth of an A4
    page. Those lines must remain in one lane; real A4 columns are separated by
    a substantially wider gutter.
    """
    tolerance = max(42.0, page_width * 0.14)
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
    """Return lines visually below one heading and before its next peer.

    Font bounding boxes from Canva and similar producers overlap even when two
    rows have distinct baselines. Comparing a body line's top with the heading
    box's bottom therefore drops the first item in a section. Vertical centres
    preserve the visual order without assuming that glyph rectangles never
    overlap.
    """
    heading = lines[heading_index]
    heading_center = (heading["y0"] + heading["y1"]) / 2
    next_center = float("inf")
    for other_index, other, _kind in headings:
        if (
            other_index != heading_index
            and other.get("lane") == heading.get("lane")
            and other["y0"] > heading["y0"]
        ):
            next_center = min(next_center, (other["y0"] + other["y1"]) / 2)
    return [
        line
        for index, line in enumerate(lines)
        if index != heading_index
        and line.get("lane") == heading.get("lane")
        and (line["y0"] + line["y1"]) / 2 > heading_center
        and (line["y0"] + line["y1"]) / 2 < next_center
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
            headings: list[tuple[int, dict[str, Any], str]] = []
            inline_headings: dict[int, tuple[str, str]] = {}
            for index, line in enumerate(lines):
                kind = _heading_kind(line["text"])
                if kind is not None:
                    headings.append((index, line, kind))
                    continue
                inline_heading = _inline_heading_value(line["text"])
                if inline_heading is None:
                    continue
                kind, source_heading, inline_value = inline_heading
                headings.append((index, line, kind))
                inline_headings[index] = (source_heading, inline_value)
            sections: list[dict[str, Any]] = []
            for heading_index, heading, kind in headings:
                body_lines = _section_body_lines(lines, heading_index, headings)
                source_heading, inline_value = inline_headings.get(
                    heading_index,
                    (heading["text"], ""),
                )
                if inline_value:
                    # Keep geometry/style metadata because downstream list
                    # parsing consumes the same line shape as ordinary bodies.
                    body_lines.insert(0, {**heading, "text": inline_value})
                body = "\n".join(line["text"] for line in body_lines).strip()
                sections.append({
                    "id": f"p{page_index + 1}-c{heading.get('lane', 1)}-{kind}-{len(sections) + 1}",
                    "page": page_index + 1,
                    "column": int(heading.get("lane") or 1),
                    "kind": kind,
                    "title": _source_title(source_heading, kind),
                    # Heading style is internal grounding metadata. It lets the
                    # guard distinguish a standalone Languages section from a
                    # same-style category that visually continues Skills.
                    "heading_text": source_heading,
                    "heading_y0": heading["y0"],
                    "heading_font_size": heading["font_size"],
                    "heading_is_bold": heading["is_bold"],
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
    """Join visual wraps into one paragraph without breaking hyphenated words."""
    result = ""
    for line in lines:
        text = _collapse(line.get("text"))
        if not text:
            continue
        if result.endswith("-") and text[0].islower():
            # A line-ending hyphen belongs to the word (for example
            # "human-" + "centered"), so adding a space would corrupt it.
            result += text
        else:
            result = f"{result} {text}".strip()
    return _collapse(result)


def _middle_dot_items(lines: list[dict[str, Any]]) -> list[str]:
    """Recover complete items separated by middle dots across visual wraps."""
    joined = _prose(lines)
    if "·" not in joined:
        return []
    return [
        item
        for part in re.split(r"\s*·\s*", joined)
        if (item := _collapse(part).strip(" -•▪●◦‣"))
    ]


def _plain_list_items(lines: list[dict[str, Any]]) -> list[str]:
    """Reassemble visually wrapped list items that expose no text bullet.

    Some designed PDFs draw bullets as vector shapes, leaving native text as a
    sequence of plain rows. A lowercase continuation or a row that closes an
    unmatched bracket belongs to the preceding item. Uppercase rows otherwise
    remain separate, so compact language and skill lists retain their records.

    @param lines - Ordered body lines from one geometric source section.
    @returns Complete logical items with visual wraps joined.
    """
    items: list[str] = []
    for line in lines:
        text = _collapse(line.get("text"))
        if not text:
            continue
        if not items:
            items.append(text)
            continue

        first_alpha = next((character for character in text if character.isalpha()), "")
        previous = items[-1]
        closes_previous_delimiter = (
            previous.count("(") > previous.count(")") and ")" in text
        ) or (
            previous.count("[") > previous.count("]") and "]" in text
        ) or (
            previous.count("{") > previous.count("}") and "}" in text
        )
        is_continuation = bool(first_alpha and first_alpha.islower()) or (
            closes_previous_delimiter
        )
        if not is_continuation:
            items.append(text)
            continue

        if previous.endswith("-") and first_alpha and first_alpha.islower():
            items[-1] = f"{previous}{text}"
        else:
            items[-1] = _collapse(f"{previous} {text}")
    return items


def _bullet_items(lines: list[dict[str, Any]]) -> list[str]:
    if not lines:
        return []
    has_bullets = any(_BULLET_PREFIX.match(line["text"]) for line in lines)
    if not has_bullets:
        middle_dot_items = _middle_dot_items(lines)
        if middle_dot_items:
            return middle_dot_items
        return _plain_list_items(lines)

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


def _compact_list_items(lines: list[dict[str, Any]]) -> list[str]:
    """Recover bullets, middle-dot chips, or semicolon-delimited list items.

    Course sections frequently use semicolons instead of visible bullets, and
    one logical course may wrap over multiple PDF rows. Joining the rows before
    splitting on semicolons preserves the complete course title instead of
    turning the wrapped continuation into another item.
    """
    if not lines:
        return []
    if any(_BULLET_PREFIX.match(_collapse(line.get("text"))) for line in lines):
        return _bullet_items(lines)
    middle_dot_items = _middle_dot_items(lines)
    if middle_dot_items:
        return middle_dot_items
    joined = _prose(lines)
    if ";" in joined:
        return [
            item
            for part in re.split(r"\s*;\s*", joined)
            if (item := _collapse(part).strip(" -•▪●◦‣"))
        ]
    return _plain_list_items(lines)


def _source_supported_field_value(
    value: Any,
    source_lines: list[dict[str, Any]],
) -> str | list[str]:
    """Keep only model field fragments present in one geometric source section.

    A model can correctly identify an Education record but continue its
    ``description`` across the next visual section, for example copying every
    Courses row into the degree. Section geometry is stronger evidence than
    that continuation. Delimited fragments are retained only when their folded
    text occurs in the source Education body; list inputs keep their list shape
    so the normalizer still handles explicit bullets correctly.

    @param value - Model string or list field to validate.
    @param source_lines - Native PDF lines owned by the source section.
    @returns The source-supported subset, preserving string/list shape.
    """
    source_line_keys = {
        key
        for line in source_lines
        if (key := _fold(line.get("text")))
    }
    source_text_key = _fold(" ".join(
        _collapse(line.get("text")) for line in source_lines
    ))

    is_list = isinstance(value, list)
    raw_parts = value if is_list else re.split(
        r"(?:\r?\n|[;•▪●◦‣]+|\s+·\s+)",
        str(value or ""),
    )
    supported: list[str] = []
    for raw_part in raw_parts:
        part = _collapse(raw_part)
        key = _fold(part)
        if not key:
            continue
        # Short values such as "IT" must match a complete source line; a raw
        # substring check would accept them inside unrelated longer words.
        occurs_in_source = key in source_line_keys or (
            len(key) >= 8 and key in source_text_key
        )
        if occurs_in_source:
            supported.append(part)

    return supported if is_list else "\n".join(supported)


def _looks_like_plain_skill_group_label(
    lines: list[dict[str, Any]],
    index: int,
) -> bool:
    """Recognize a short, unstyled label that introduces a bullet run.

    Some PDF exporters discard the visual weight of nested skill headings, so
    category labels and bullet text arrive with the same font flags. A label is
    accepted only when it starts like a title, is followed immediately by a
    bullet, and does not look like a wrapped continuation. Requiring at least
    two labels later in ``_nested_skill_groups`` prevents a single capitalized
    skill from creating a false taxonomy.
    """
    line = lines[index]
    text = _collapse(line.get("text"))
    if (
        not text
        or line.get("is_bold")
        or _BULLET_PREFIX.match(text)
        or index + 1 >= len(lines)
        or not _BULLET_PREFIX.match(_collapse(lines[index + 1].get("text")))
    ):
        return False
    if len(text) > 48 or len(text.split()) > 6:
        return False
    if text.endswith((".", ",", ";", ":", ")", "]", "-", "—")):
        return False
    first_alpha = next((char for char in text if char.isalpha()), "")
    if not first_alpha or not first_alpha.isupper():
        return False

    if index > 0:
        previous = _collapse(lines[index - 1].get("text"))
        # An unfinished delimiter on the previous row is strong evidence that
        # this row completes the preceding bullet (for example ``OpenCV,`` +
        # ``YOLO)`` or a wrapped language level), not that it starts a category.
        if previous.endswith((",", ";", "/", "-", "—")):
            return False
        if previous.count("(") > previous.count(")"):
            return False
        if previous.count("[") > previous.count("]"):
            return False
    return True


def _skill_group_label_indices(lines: list[dict[str, Any]]) -> list[int]:
    """Return bold or structurally inferred labels for one Skills section."""
    candidates: set[int] = set()
    for index, line in enumerate(lines):
        text = _collapse(line.get("text"))
        if not text or _BULLET_PREFIX.match(text):
            continue
        if _looks_like_plain_skill_group_label(lines, index):
            candidates.add(index)
        if not line.get("is_bold"):
            continue
        next_bold = next(
            (
                other_index
                for other_index in range(index + 1, len(lines))
                if lines[other_index].get("is_bold")
            ),
            len(lines),
        )
        owned_lines = lines[index + 1:next_bold]
        if any(
            _collapse(owned.get("text")) and not owned.get("is_bold")
            for owned in owned_lines
        ):
            candidates.add(index)
    return sorted(candidates)


def _nested_skill_groups(section: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Parse styled or structurally delimited labels inside a Skills section.

    Many designed CVs use a single parent heading followed by bold category
    names and regular-weight prose separated by middle dots. Treating PDF wraps
    as individual skills loses both the categories and complete item text. Some
    exporters flatten the label weight; in that case, short title-like rows that
    introduce bullet runs recover the same taxonomy without another model call.
    """
    lines = list(section.get("body_lines") or [])
    candidates = _skill_group_label_indices(lines)

    if len(candidates) < 2:
        return []

    groups: list[dict[str, Any]] = []
    for offset, index in enumerate(candidates):
        end = candidates[offset + 1] if offset + 1 < len(candidates) else len(lines)
        items = _bullet_items(lines[index + 1:end])
        if items:
            groups.append({"category": _collapse(lines[index]["text"]), "items": items})
    return groups if len(groups) >= 2 else []


def _nested_language_skill_group(
    skill_section: Mapping[str, Any],
    language_section: Mapping[str, Any],
    groups: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Return a visually subordinate Languages block as one skill group.

    A language heading can be a true top-level section or the final category
    under Skills. It is nested only when it immediately follows a proven skill
    taxonomy in the same page/column and its font size/weight matches the
    category labels. This preserves layouts such as the reported Monument CV
    without folding ordinary standalone Languages sections into Skills.
    """
    if len(groups) < 2:
        return None
    if (
        skill_section.get("page") != language_section.get("page")
        or skill_section.get("column") != language_section.get("column")
    ):
        return None

    label_names = {_collapse(group.get("category")) for group in groups}
    label_lines = [
        line
        for line in skill_section.get("body_lines") or []
        if _collapse(line.get("text")) in label_names
    ]
    if not label_lines:
        return None
    label_size = statistics.median(
        max(float(line.get("font_size") or 0), 1.0)
        for line in label_lines
    )
    heading_size = max(float(language_section.get("heading_font_size") or 0), 1.0)
    label_bold = sum(bool(line.get("is_bold")) for line in label_lines) >= (
        len(label_lines) / 2
    )
    if (
        bool(language_section.get("heading_is_bold")) != label_bold
        or abs(heading_size - label_size) > max(0.75, label_size * 0.12)
    ):
        return None

    items = _bullet_items(list(language_section.get("body_lines") or []))
    if not items:
        return None
    return {
        "category": _collapse(
            language_section.get("heading_text") or language_section.get("title")
        ),
        "items": items,
    }


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


def _source_experience_cities(
    pages: list[dict[str, Any]],
) -> dict[tuple[str, str], str]:
    """Return unambiguous cities from ``role | company | city`` source rows.

    Employment records produced by many CV builders encode their metadata in
    one pipe-delimited visual line. The extraction prompt now requests
    ``experience[].city``, but a model may still omit that optional-looking
    field. Matching both role and employer lets the source guard restore the
    third segment without guessing from prose or confusing it with another
    record. Duplicate role/employer pairs are accepted only when every source
    occurrence names the same city.

    @param pages - Layout-aware source pages used for the model request.
    @returns A mapping from folded ``(role, employer)`` pairs to source cities.
    """
    candidates: dict[tuple[str, str], set[str]] = {}
    for page in pages:
        for raw_line in str(page.get("plain_text") or "").splitlines():
            parts = [_collapse(part) for part in raw_line.split("|")]
            if len(parts) < 3:
                continue
            title, company, city = parts[:3]
            key = (_fold(title), _fold(company))
            if not all((*key, city)):
                continue
            # A third segment containing a year is a period in common compact
            # CV formats, not a city. Refusing it is safer than creating a
            # plausible but false location in the editable import wizard.
            if re.search(r"\b(?:19|20)\d{2}\b", city):
                continue
            candidates.setdefault(key, set()).add(city)

    return {
        key: next(iter(cities))
        for key, cities in candidates.items()
        if len(cities) == 1
    }


def ground_cv_data_from_source(
    model_data: Mapping[str, Any],
    pages: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    """Restore high-confidence fields from geometric source sections.

    The model still handles flexible record schemas and classification. Source
    geometry owns fields whose boundaries are unambiguous: professional
    summary prose, named skills/specialisation lists, language rows, and
    reference records. This prevents prompt examples or neighbouring columns
    from replacing facts.

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

    experience = grounded.get("experience")
    if isinstance(experience, list):
        source_cities = _source_experience_cities(pages)
        cleaned_experience: list[Any] = []
        removed_heading_title = False
        restored_city = False
        for entry in experience:
            if not isinstance(entry, Mapping):
                cleaned_experience.append(entry)
                continue
            cleaned_entry = dict(entry)
            if _heading_kind(cleaned_entry.get("title")) == "experience":
                # Some CVs intentionally omit a job title and start the record
                # with the employer. A model must not fill that blank by copying
                # WORK EXPERIENCE / DOŚWIADCZENIE ZAWODOWE into the role field.
                cleaned_entry["title"] = ""
                removed_heading_title = True
            source_city = source_cities.get((
                _fold(cleaned_entry.get("title")),
                _fold(cleaned_entry.get("company")),
            ))
            if source_city and _collapse(cleaned_entry.get("city")) != source_city:
                cleaned_entry["city"] = source_city
                restored_city = True
            cleaned_experience.append(cleaned_entry)
        if removed_heading_title or restored_city:
            grounded["experience"] = cleaned_experience
        if removed_heading_title:
            source_grounded_fields.append("experience_titles")
        if restored_city:
            source_grounded_fields.append("experience_cities")

    education_sections = [
        section for section in sections if section.get("kind") == "education"
    ]
    education = grounded.get("education")
    if education_sections and isinstance(education, list):
        source_education_lines = [
            line
            for section in education_sections
            for line in section.get("body_lines") or []
        ]
        cleaned_education: list[Any] = []
        cleaned_education_fields = False
        for entry in education:
            if not isinstance(entry, Mapping):
                cleaned_education.append(entry)
                continue
            cleaned_entry = dict(entry)
            for field in ("description", "details", "notes", "detail", "bullets", "items"):
                if field not in cleaned_entry:
                    continue
                supported_value = _source_supported_field_value(
                    cleaned_entry.get(field),
                    source_education_lines,
                )
                if supported_value != cleaned_entry.get(field):
                    cleaned_entry[field] = supported_value
                    cleaned_education_fields = True
            cleaned_education.append(cleaned_entry)
        if cleaned_education_fields:
            grounded["education"] = cleaned_education
            source_grounded_fields.append("education_descriptions")

    skill_sections = [section for section in sections if section.get("kind") == "skills"]
    skill_groups: list[dict[str, Any]] = []
    nested_language_ids: set[str] = set()
    for section in skill_sections:
        nested_groups = _nested_skill_groups(section)
        if nested_groups:
            following = min(
                (
                    candidate
                    for candidate in sections
                    if candidate.get("page") == section.get("page")
                    and candidate.get("column") == section.get("column")
                    and float(candidate.get("heading_y0") or -1)
                    > float(section.get("heading_y0") or -1)
                ),
                key=lambda candidate: float(candidate.get("heading_y0") or 0),
                default=None,
            )
            if following and following.get("kind") == "languages":
                language_group = _nested_language_skill_group(
                    section,
                    following,
                    nested_groups,
                )
                if language_group:
                    nested_groups.append(language_group)
                    nested_language_ids.add(str(following.get("id") or ""))
            skill_groups.extend(nested_groups)
        else:
            skill_groups.append({
                "category": section["title"],
                "items": _compact_list_items(section.get("body_lines") or []),
            })
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

    certification_sections = [
        section for section in sections if section.get("kind") == "certifications"
    ]
    if certification_sections:
        extras = [
            dict(section)
            for section in (grounded.get("extra_sections") or [])
            if isinstance(section, Mapping)
            and section.get("kind") != "certifications"
            and _heading_kind(section.get("title")) != "certifications"
        ]
        restored_certifications = []
        for section in certification_sections:
            items = _compact_list_items(section.get("body_lines") or [])
            if not items:
                continue
            restored_certifications.append({
                "title": section["title"],
                "kind": "certifications",
                "placement": "after_experience",
                "items": items,
            })
        if restored_certifications:
            grounded["extra_sections"] = [*extras, *restored_certifications]
            source_grounded_fields.append("certifications")

    driving_license_sections = [
        section for section in sections if section.get("kind") == "driving_license"
    ]
    has_complete_native_text = bool(pages) and all(
        not bool(page.get("needs_vision")) for page in pages
    )
    if driving_license_sections or has_complete_native_text:
        # A model may infer a common licence category even when the source CV
        # never mentions one. On fully native PDFs, absence from the geometric
        # section inventory is reliable negative evidence, so remove any such
        # model-created section. Scanned/mixed documents retain model output
        # because an image-only page cannot be disproved by native geometry.
        extras = [
            dict(section)
            for section in (grounded.get("extra_sections") or [])
            if isinstance(section, Mapping)
            and section.get("kind") != "driving_license"
            and _heading_kind(section.get("title")) != "driving_license"
        ]
        restored_driving_licenses = []
        for section in driving_license_sections:
            items = _compact_list_items(section.get("body_lines") or [])
            if not items:
                continue
            restored_driving_licenses.append({
                "title": section["title"],
                "kind": "other",
                "placement": "after_skills",
                "items": items,
            })
        if restored_driving_licenses or len(extras) != len(
            grounded.get("extra_sections") or []
        ):
            grounded["extra_sections"] = [*extras, *restored_driving_licenses]
            source_grounded_fields.append("driving_license")

    language_sections = [
        section
        for section in sections
        if section.get("kind") == "languages"
        and str(section.get("id") or "") not in nested_language_ids
    ]
    language_items = [
        item
        for section in language_sections
        for item in _bullet_items(section.get("body_lines") or [])
    ]
    if language_items:
        grounded["languages"] = language_items
        source_grounded_fields.append("languages")
    elif nested_language_ids:
        # The visually subordinate language rows now live inside Skills. Clear
        # model-created top-level copies so normalization cannot render both.
        grounded["languages"] = []
        extras = grounded.get("extra_sections")
        if isinstance(extras, list):
            grounded["extra_sections"] = [
                dict(extra)
                for extra in extras
                if isinstance(extra, Mapping)
                and extra.get("kind") != "languages"
                and _heading_kind(extra.get("title")) != "languages"
            ]

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
