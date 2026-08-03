"""
Dynamic CV layout engine.

The AI (GPT-4o) extracts structured data from an uploaded PDF.
This module generates the full canvas-element array from that data,
using the visual style of the chosen template. The number of
experience / education blocks matches the CV exactly — no slots, no
truncation, multi-page when content overflows.

Theme families share flow helpers (`_gen_signal`, `_gen_it_theme`,
`_gen_classic_theme`); the Moss sidebar has its own `_gen_moss` layout.
Vertical rhythm constants (`SPACE_*`) keep section/record spacing consistent
across families. Page chrome uses `fixedToPage=True`.
"""

from __future__ import annotations
import math
import re
from datetime import datetime

from app.core.config import BACKEND_URL
from app.services.cv_data import (
    fold_section_label,
    group_flat_items_into_records,
    is_record_section,
    is_skills_like_title,
    normalize_cv_data,
)
# Primitives live in cv_generator_primitives; re-export so iconic/layout_gpt/tests
# keep importing from this module without churn.
from app.services.cv_generator_primitives import (  # noqa: F401
    A4_H,
    CONTENT_BOTTOM,
    MARGIN_BOTTOM,
    PAGE_TOP,
    SPACE_AFTER_HEADER_RULE,
    SPACE_AFTER_MASTHEAD,
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    SPACE_STACK,
    Builder,
    _block,
    _circle,
    _ellipse,
    _line,
    _rect,
    _text,
    section_chrome_height,
)

# ── shared helpers ───────────────────────────────────────────────────────────

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


def _flatten_extra_items(items: list) -> list[str]:
    """Flatten structured records to strings for sidebar / compact consumers."""
    flat: list[str] = []
    for item in items or []:
        if isinstance(item, dict):
            title = str(item.get("title") or "").strip()
            subtitle = str(item.get("subtitle") or "").strip()
            bullets = [
                str(bullet).strip()
                for bullet in (item.get("bullets") or [])
                if str(bullet).strip()
            ]
            if title and subtitle:
                flat.append(f"{title} — {subtitle}")
            elif title:
                flat.append(title)
            flat.extend(bullets)
        else:
            text = str(item or "").strip()
            if text:
                flat.append(text)
    return flat


def _measure_one_record_height(
    b: Builder,
    record: dict,
    W: int,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> float:
    """Estimate height for a single experience-like record."""
    title = str(record.get("title") or "").strip()
    subtitle = str(record.get("subtitle") or "").strip()
    bullets = [
        str(bullet).strip()
        for bullet in (record.get("bullets") or [])
        if str(bullet).strip()
    ]
    height = 0.0
    if title:
        height += b.measure_block(
            title, W, title_fs, title_lh, font_b, bold=True, min_h=title_lh + 2
        )
    if subtitle:
        if height:
            height += SPACE_STACK
        height += b.measure_block(
            subtitle, W, body_fs * 0.92, body_lh * 0.9, font_b, min_h=body_lh
        )
    if bullets:
        if height:
            height += SPACE_STACK
        content = "\n".join(f"• {bullet}" for bullet in bullets)
        height += b.measure_block(content, W, body_fs, body_lh, font_b, bulletList=True)
    return height


def _measure_record_section_body(
    b: Builder,
    records: list[dict],
    W: int,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> float:
    """Estimate stacked height for bold titles + optional nested bullet lists."""
    total = 0.0
    for index, record in enumerate(records):
        total += _measure_one_record_height(
            b, record, W, font_b,
            title_fs=title_fs, title_lh=title_lh, body_fs=body_fs, body_lh=body_lh,
        )
        if index < len(records) - 1:
            total += SPACE_RECORD
    return total


def _render_record_section_body(
    b: Builder,
    records: list[dict],
    L: int,
    W: int,
    C: dict,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> None:
    """
    Render experience-like records: bold title, optional subtitle, nested bullets.

    Used for projects, references, awards, and any other record-kind extras so
    each template does not need a bespoke branch. Later records page-break
    individually — the caller must only reserve chrome + the first record.
    """
    ink = C.get("body", "#2B2B2B")
    muted = C.get("muted", C.get("slate", ink))
    for index, record in enumerate(records):
        title = str(record.get("title") or "").strip()
        subtitle = str(record.get("subtitle") or "").strip()
        bullets = [
            str(bullet).strip()
            for bullet in (record.get("bullets") or [])
            if str(bullet).strip()
        ]
        if not title and not bullets:
            continue
        # Match experience flow: only the first record was reserved with the
        # section heading. Later records move alone so page 1 is not left empty
        # when the whole section would not fit as one block.
        if index > 0:
            b.need(_measure_one_record_height(
                b, record, W, font_b,
                title_fs=title_fs, title_lh=title_lh, body_fs=body_fs, body_lh=body_lh,
            ))
        if title:
            b.block(title, L, W, title_fs, title_lh, ink, font_b, bold=True, min_h=title_lh + 2)
        if subtitle:
            b.gap(SPACE_STACK)
            b.block(subtitle, L, W, body_fs * 0.92, body_lh * 0.9, muted, font_b, min_h=body_lh)
        if bullets:
            b.gap(SPACE_STACK)
            content = "\n".join(f"• {bullet}" for bullet in bullets)
            b.block(content, L, W, body_fs, body_lh, ink, font_b, bulletList=True)
        if index < len(records) - 1:
            b.gap(SPACE_RECORD)


def _extra_sections(b: Builder, cv: dict, placement: str,
                    section_fn, C: dict, L: int, W: int,
                    font_b: str, fs: float = 10, lh: float = 15,
                    skip_indices: set[int] | None = None,
                    section_chrome_h: float | None = None) -> None:
    """
    Render extra (custom) sections found in the CV but not in the template.

    placement='after_experience' → called after the experience block
    placement='after_skills'     → called after the skills block
    Sections tagged with the requested placement are rendered; others are skipped
    here (they'll be picked up at their own placement call).

    Flat-list kinds (interests, certifications, …) stay a single bullet block.
    Record kinds (projects, references, …) render like experience: bold title
    per entry, then a nested bullet list for the description.

    ``section_chrome_h`` should match the template's real heading/icon/rule
    advance (Iconic is taller than the default label-only estimate).
    """
    chrome_h = (
        float(section_chrome_h)
        if section_chrome_h is not None
        else section_chrome_height(8.6)
    )
    title_fs = max(fs + 0.8, 10.5)
    title_lh = max(lh, title_fs + 2.5)

    for index, sec in enumerate(cv.get("extra_sections") or []):
        if skip_indices and index in skip_indices:
            continue
        if sec.get("placement", "after_skills") != placement:
            continue
        title = (sec.get("title") or "").strip().upper()
        raw_items = list(sec.get("items") or [])
        if not title or not raw_items:
            continue

        use_records = is_record_section(sec.get("kind"), title) and any(
            isinstance(item, dict) for item in raw_items
        )
        # When normalization left only flat strings but the kind/title still
        # implies records, regroup here so older cached profiles still layout.
        if is_record_section(sec.get("kind"), title) and not use_records:
            flat = _flatten_extra_items(raw_items)
            if len(flat) >= 2:
                raw_items = group_flat_items_into_records(flat)
                use_records = True

        if use_records:
            records = [item for item in raw_items if isinstance(item, dict) and item.get("title")]
            if not records:
                continue
            # Reserve only chrome + the first record. Requiring the whole
            # projects/references block to fit pushed entire sections onto the
            # next page and left a large empty band under experience.
            first_record_height = _measure_one_record_height(
                b, records[0], W, font_b,
                title_fs=title_fs, title_lh=title_lh, body_fs=fs, body_lh=lh,
            )
            b.need_section(chrome_h, first_record_height)
            section_fn(title)
            _render_record_section_body(
                b, records, L, W, C, font_b,
                title_fs=title_fs, title_lh=title_lh, body_fs=fs, body_lh=lh,
            )
            b.gap(SPACE_SECTION)
            continue

        items = _flatten_extra_items(raw_items)
        if not items:
            continue
        content = "\n".join(f"• {item}" for item in items)
        body_height = b.measure_block(content, W, fs, lh, font_b, bulletList=True)
        # Reserve heading chrome + body together so custom sections do not leave
        # a title stranded above the page footer.
        b.need_section(chrome_h, body_height)
        section_fn(title)
        b.block(content, L, W, fs, lh, C.get("body", "#2B2B2B"), font_b, bulletList=True)
        b.gap(SPACE_SECTION)


def _contact_line(cv: dict) -> str:
    return "   ·   ".join(filter(None, [
        cv.get("email"), cv.get("phone"), cv.get("location")
    ]))


def _compact_text(value: object, limit: int) -> str:
    """Collapse whitespace and shorten decorative-slot copy without splitting words."""
    clean = " ".join(str(value or "").split())
    if len(clean) <= limit:
        return clean
    shortened = clean[: max(limit - 1, 1)].rsplit(" ", 1)[0].rstrip()
    return f"{shortened or clean[: max(limit - 1, 1)]}…"


_SIDEBAR_SECTION_ORDER = ("skills", "languages", "certifications", "interests", "education")
_SIDEBAR_FONT_SIZES = (8.3, 8.0, 7.5)
_SIDEBAR_MAX_SECTION_HEIGHT = 160


def _sidebar_wrapped_height(content: str, width: float, font_size: float, line_height: float) -> float:
    """Match Builder's text estimate for a narrow, auto-height sidebar block."""
    chars_per_line = max(10, int(width / (font_size * 0.52)))
    rendered_lines = sum(
        max(1, math.ceil(len(line.strip()) / chars_per_line)) if line.strip() else 1
        for line in content.split("\n")
    )
    return round(max(rendered_lines * line_height + 6, line_height + 6), 2)



def _sidebar_candidates(cv: dict, labels: dict) -> list[dict]:
    """Prepare complete, non-truncated sections eligible for sidebar placement."""
    candidates: list[dict] = []
    skills = [str(skill).strip() for skill in (cv.get("skills") or []) if str(skill).strip()]
    if skills:
        candidates.append({
            "key": "skills",
            "kind": "skills",
            "title": labels["skills"],
            "content": "\n".join(skills),
        })

    for index, section in enumerate(cv.get("extra_sections") or []):
        kind = _extra_section_kind(section)
        if kind not in _SIDEBAR_SECTION_ORDER:
            continue
        title = str(section.get("title") or "").strip().upper()
        items = _flatten_extra_items(section.get("items") or [])
        if title and items:
            candidates.append({
                "key": f"extra:{index}",
                "kind": kind,
                "title": title,
                "content": "\n".join(items),
                "extra_index": index,
            })

    education_content = _education_sidebar_content(cv.get("education") or [])
    if education_content:
        candidates.append({
            "key": "education",
            "kind": "education",
            "title": labels["education"],
            "content": education_content,
        })

    order = {kind: index for index, kind in enumerate(_SIDEBAR_SECTION_ORDER)}
    return sorted(candidates, key=lambda candidate: (order[candidate["kind"]], candidate["key"]))


def _fit_sidebar_sections(
    candidates: list[dict],
    *,
    width: float,
    start_y: float,
    bottom_y: float,
) -> tuple[list[dict], set[str]]:
    """Select only complete sections that fit the first-page sidebar budget."""
    placed: list[dict] = []
    placed_keys: set[str] = set()
    cursor = float(start_y)

    for candidate in candidates:
        for font_size in _SIDEBAR_FONT_SIZES:
            line_height = round(max(font_size * 1.45, 11.0), 2)
            body_height = _sidebar_wrapped_height(candidate["content"], width, font_size, line_height)
            section_height = 10 + 5 + body_height + 18
            if section_height > _SIDEBAR_MAX_SECTION_HEIGHT:
                continue
            if cursor + section_height <= bottom_y:
                placed.append({
                    **candidate,
                    "left": 24,
                    "top": round(cursor, 2),
                    "width": width,
                    "fontSize": font_size,
                    "lineHeight": line_height,
                    "body_top": round(cursor + 15, 2),
                    "body_height": body_height,
                })
                placed_keys.add(candidate["key"])
                cursor += section_height
                break
    return placed, placed_keys


def _bullets(job: dict) -> str:
    return "\n".join(f"• {b}" for b in job.get("bullets", []) if b)


def _company_period(job: dict) -> str:
    return "   ·   ".join(filter(None, [
        job.get("company"),
        job.get("city"),
        job.get("period"),
    ]))

def _education_meta(edu: dict) -> str:
    """School · city · period — the muted line under the diploma title."""
    school = str(edu.get("school") or "").strip()
    city = str(edu.get("city") or "").strip()
    period = str(edu.get("period") or "").strip()
    parts = [part for part in (school, city, period) if part]
    if parts:
        return "   ·   ".join(parts)

    # Legacy entries may only expose a combined detail string.
    detail = str(edu.get("detail") or "").strip()
    description = str(edu.get("description") or "").strip()
    if detail and not description:
        if period and period not in detail:
            return f"{detail}   ·   {period}"
        return detail
    return period


def _education_description(edu: dict) -> str:
    """Optional body copy; never reuse the mashed legacy detail field."""
    return str(edu.get("description") or "").strip()


def _education_record_height(
    b: "Builder",
    edu: dict,
    width: float,
    font: str,
    *,
    degree_fs: float = 10.2,
    degree_lh: float = 13,
    meta_fs: float = 8.6,
    meta_lh: float = 11.5,
    body_fs: float = 8.5,
    body_lh: float = 11.5,
) -> float:
    """Measured height of one structured education record (no trailing gap)."""
    height = 0.0
    degree = str(edu.get("degree") or "").strip()
    if degree:
        height += b.measure_block(
            degree, width, degree_fs, degree_lh, font, bold=True, min_h=degree_lh
        )
    meta = _education_meta(edu)
    if meta:
        if height:
            height += SPACE_STACK
        height += b.measure_block(meta, width, meta_fs, meta_lh, font, min_h=meta_lh)
    description = _education_description(edu)
    if description:
        if height:
            height += SPACE_STACK
        height += b.measure_block(description, width, body_fs, body_lh, font, min_h=body_lh)
    return height


def _place_education_record(
    b: "Builder",
    edu: dict,
    left: float,
    width: float,
    *,
    ink: str,
    muted: str,
    font: str,
    body: str | None = None,
    mode: str = "block",
    degree_fs: float = 10.2,
    degree_lh: float = 13,
    meta_fs: float = 8.6,
    meta_lh: float = 11.5,
    body_fs: float = 8.5,
    body_lh: float = 11.5,
    after_gap: float | None = None,
) -> None:
    """
    Render one education entry as:
      1. diploma / degree (bold)
      2. school · city · period (muted)
      3. optional description
    """
    degree = str(edu.get("degree") or "").strip()
    meta = _education_meta(edu)
    description = _education_description(edu)
    # The school/date line is metadata, while the optional description is
    # readable content and must use the same ink as experience descriptions.
    # Falling back to `muted` here makes the education body look disabled.
    body_color = body if body is not None else ink
    placed = False

    if mode == "text":
        if degree:
            b.text(degree, degree_fs, font, ink, left, bold=True)
            placed = True
        if meta:
            if placed:
                b.gap(SPACE_STACK)
            b.text(meta, meta_fs, font, muted, left)
            placed = True
        if description:
            if placed:
                b.gap(SPACE_STACK)
            b.text(description, body_fs, font, body_color, left)
            placed = True
    else:
        if degree:
            b.block(
                degree, left, width, degree_fs, degree_lh, ink, font,
                bold=True, min_h=degree_lh,
            )
            placed = True
        if meta:
            if placed:
                b.gap(SPACE_STACK)
            b.block(meta, left, width, meta_fs, meta_lh, muted, font, min_h=meta_lh)
            placed = True
        if description:
            if placed:
                b.gap(SPACE_STACK)
            b.block(
                description, left, width, body_fs, body_lh, body_color, font, min_h=body_lh
            )
            placed = True

    if after_gap is not None and placed:
        b.gap(after_gap)


def _education_sidebar_content(education: list[dict]) -> str:
    """Compact, structured records for a narrow sidebar column."""
    records: list[str] = []
    for entry in education:
        lines: list[str] = []
        degree = str(entry.get("degree") or "").strip()
        school = str(entry.get("school") or "").strip()
        city = str(entry.get("city") or "").strip()
        period = str(entry.get("period") or "").strip()
        description = _education_description(entry)
        legacy_detail = str(entry.get("detail") or "").strip()
        school_city = "  ·  ".join(part for part in (school, city) if part)
        if degree:
            lines.append(degree)
        if school_city:
            lines.append(school_city)
        elif legacy_detail and legacy_detail not in {degree, period}:
            # Older payloads store the school in `detail` only.
            lines.append(legacy_detail)
        if period:
            lines.append(period)
        if description:
            lines.append(description)
        if not lines:
            legacy = _education_meta(entry)
            if legacy:
                lines.append(legacy)
        if lines:
            records.append("\n".join(lines))
    return "\n\n".join(records)


def _language_sidebar_lines(cv: dict) -> list[str]:
    """Language lines for sidebar bullet lists (wizard field or extra_sections)."""
    lines: list[str] = []
    for entry in cv.get("languages") or []:
        if isinstance(entry, dict):
            name = str(entry.get("name") or "").strip()
            level = str(entry.get("level") or "").strip()
            if name:
                lines.append(f"{name} — {level}" if level else name)
        else:
            text = str(entry or "").strip()
            if text:
                lines.append(text)
    if lines:
        return lines
    for section in cv.get("extra_sections") or []:
        if _extra_section_kind(section) != "languages":
            continue
        for item in section.get("items") or []:
            text = str(item or "").strip()
            if text:
                lines.append(text)
    return lines


def _obsidian_education_parts(edu: dict) -> tuple[str, str, str]:
    """
    Obsidian sidebar education format:
      1. Nazwa dyplomu — Data/Okres
      2. Uczelnia, Miasto
      3. Opis
    """
    degree = str(edu.get("degree") or "").strip()
    period = str(edu.get("period") or "").strip()
    school = str(edu.get("school") or "").strip()
    city = str(edu.get("city") or "").strip()
    description = _education_description(edu)
    legacy_detail = str(edu.get("detail") or "").strip()

    title = " — ".join(part for part in (degree, period) if part)
    school_city = ", ".join(part for part in (school, city) if part)
    if not school_city and legacy_detail:
        if legacy_detail not in {degree, period, description, title}:
            school_city = legacy_detail
    return title, school_city, description


# ── template generators ──────────────────────────────────────────────────────


_SIGNAL_THEME = {
    "paper": "#101C26", "ink": "#F2F7F6", "body": "#E4EFEE",
    "muted": "#9DB7C3", "accent": "#3BD2C7", "rule": "#395263",
    "light": "#7BE1D9", "left": 76, "width": 465,
    "start": 222, "continuation": 66, "mark_x": 525,
}


def _signal_page_decorations(page: int) -> list[dict]:
    """Return fixed paper, rail, and folio for one Signal banking page."""
    C = _SIGNAL_THEME
    return [
        {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
        {**_line(0, 0, 595, 5, C["accent"], page=page), "fixedToPage": True},
        {**_line(76, 789, 465, 1, C["rule"], page=page), "fixedToPage": True},
        {**_text(f"{page:02d}", 8, "Inter", C["muted"], 522, 800, page=page), "fixedToPage": True},
    ]


def _gen_signal(cv: dict) -> list[dict]:
    """Generate the Signal banking CV with a dark header and resilient flow."""
    C = _SIGNAL_THEME
    L, W = C["left"], C["width"]
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class BankingBuilder(Builder):
        def need(self, h: float):
            # Match canvas reflow (pageTop 66 / bottomMargin 96 → 746), not a
            # deeper footer — otherwise headings land in the dead zone and
            # orphan above content that reflow pushes to the next page.
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = float(C["continuation"])

    node_a = {**_circle(78, 197, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-a"}
    node_b = {**_circle(116, 197, 18, C["muted"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-b"}
    node_c = {**_circle(154, 197, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-c"}
    static = [
        _ellipse(392, 26, 164, 106, "#173545", borderWidth=1.2, zIndex=1),
        _ellipse(427, 48, 94, 62, C["accent"], borderWidth=1, zIndex=1),
        _circle(460, 65, 28, C["accent"], filled=True, zIndex=2),
        _line(52, 42, 4, 118, C["accent"], zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, C["ink"], 76, 77, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 54), 9.2, SANS, C["muted"], 78, 122, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.6, SANS, C["muted"], 78, 145, zIndex=2),
        node_a, node_b, node_c,
        _line(96, 205, 20, 1, C["accent"], zIndex=2),
        _line(134, 205, 20, 1, C["accent"], zIndex=2),
        _rect(487, 181, 54, 22, C["rule"], 1, zIndex=2),
    ]
    static[5]["letterSpacing"] = 1.35

    SECTION_CHROME = section_chrome_height(8.6)
    b = BankingBuilder(C["start"])

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 10.8, 13.4, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.4, 13.1, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.2, degree_lh=13,
            meta_fs=8.6, meta_lh=11.5,
            body_fs=8.6, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_circle(C["mark_x"], b.y + 1, 12, C["accent"], borderWidth=1.1, zIndex=2, page=b.pg))
        b.text(label, 8.6, SANS, C["light"], L)
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.4, 13.1, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.4, 13.1, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 10.8, 13.4, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.7, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.4, 13.1, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]}, L, W, SANS, fs=9.4, lh=13.1)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.2, 13.1, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.2, 13.1, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]}, L, W, SANS, fs=9.2, lh=13.1)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    decorations = [
        element
        for page in range(1, pages_used + 1)
        for element in _signal_page_decorations(page)
    ]
    return decorations + static + flow


def _gen_ledger(cv: dict) -> list[dict]:
    """Blue-grey finance CV with editable data panels and market graphic."""
    NAVY, BLUE = "#102A43", "#2E5E86"
    SLATE, STEEL, INK = "#607789", "#AEBECC", "#17212B"
    L, W, SANS, SERIF = 52, 490, "Inter", "Times-Roman"
    lbl = _labels(cv)

    static = [
        _line(0, 0, 595, 146, NAVY, zIndex=0),
        _line(0, 146, 595, 5, BLUE, zIndex=1),
        _rect(416, 24, 122, 126, STEEL, 1.2, zIndex=3),
        {
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/ledger-finance-accent.png",
            "width": 110,
            "height": 118,
            "left": 422,
            "top": 28,
            "zIndex": 2,
            "page": 1,
        },
        _line(400, 30, 2, 102, BLUE, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, "#FFFFFF", L, 58, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 52), 10, SANS, "#C7D7E2", L, 98, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.8, SANS, "#C7D7E2", L, 120, zIndex=2),
    ]
    static[6]["letterSpacing"] = 1.05

    SECTION_CHROME = section_chrome_height(8.4)
    # Navy band + accent rule end at y=151; masthead air before first section.
    b = Builder(151 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 9, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.6, 13.5, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.6, degree_lh=13,
            meta_fs=9, meta_lh=11.5,
            body_fs=9, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.text(label, 9, SANS, BLUE, L)
        b.line(L, W, 1, STEEL)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.6, 13.5, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.6, 13.5, INK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 13.5, NAVY, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 9, 11.5, SLATE, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.6, 13.5, INK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.6, lh=13.5)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=NAVY, muted=SLATE, body=INK, font=SANS,
                degree_fs=10.6, degree_lh=13,
                meta_fs=9, meta_lh=11.5,
                body_fs=9, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.8, 14, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.8, 14, INK, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.8, lh=14)
    return static + b.build()


def _gen_nimbus(cv: dict) -> list[dict]:
    """Light blue-grey finance CV with an airy editorial rhythm."""
    INK, BLUE = "#2B3D4C", "#5F8EAD"
    POWDER, SKY, CLOUD, SLATE = "#B9D2E5", "#DFEBF4", "#E9EEF1", "#72818C"
    L, W, SANS, SERIF = 80, 462, "Inter", "Times-Roman"
    CONTINUATION = 66
    SECTION_CHROME = section_chrome_height(8.4)
    lbl = _labels(cv)

    class NimbusBuilder(Builder):
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = float(CONTINUATION)

    mark_one = {**_rect(80, 176, 14, 14, BLUE, 1.2, zIndex=2), "id": "nimbus-mark-one"}
    mark_two = {**_rect(114, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-two"}
    mark_three = {**_rect(148, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-three"}
    static = [
        _line(0, 0, 595, 4, POWDER, zIndex=0),
        _line(52, 207, 490, 1, POWDER),
        _rect(401, 35, 141, 153, POWDER, 1.1, zIndex=3),
        {
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/nimbus-finance-accent.png",
            "width": 129,
            "height": 141,
            "left": 407,
            "top": 41,
            "zIndex": 2,
            "page": 1,
        },
        _line(52, 48, 4, 112, BLUE, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 29, SERIF, INK, 78, 55, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 52), 9.3, SANS, BLUE, 80, 99, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, SLATE, 80, 153, zIndex=2),
        mark_one,
        mark_two,
        mark_three,
        _line(94, 182, 20, 1, POWDER, zIndex=1),
        _line(128, 182, 20, 1, POWDER, zIndex=1),
    ]
    static[6]["letterSpacing"] = 1.5

    # Header rail at y=207; masthead clearance before the first section heading.
    b = NimbusBuilder(208 + SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.8, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.5, 13.4, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.3, degree_lh=13,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=8.7, body_lh=11.5,
        )

    def section(label: str, decorated: bool = True) -> None:
        if decorated:
            # Short rail next to the heading only — a page-tall rail fought
            # client reflow and made continuation pages look bottom-heavy.
            b.els.append(_line(52, b.y + 5, 2, 28, SKY, page=b.pg))
            b.els.append(_rect(45, b.y + 20, 16, 16, BLUE, zIndex=2, page=b.pg))
        b.text(label, 8.7, SANS, BLUE, L)
        b.line(L, W, 1, CLOUD)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"], decorated=False)
        b.block(cv["summary"], L, W, 9.5, 13.4, INK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.8, 11.5, SLATE, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.5, 13.4, INK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=SLATE, body=INK, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.4, 13.5, INK, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.4, lh=13.5)
    return static + b.build()


def _gen_cinder(cv: dict) -> list[dict]:
    """Single-column black, grey and signal-red editorial CV."""
    BLACK, CHARCOAL, GRAPHITE = "#111315", "#292D31", "#62686D"
    ASH, PAPER, RED = "#D5D6D6", "#F4F3F1", "#C93F3F"
    L, W, SANS, SERIF = 76, 466, "Inter", "Times-Roman"
    lbl = _labels(cv)

    frame_one = {**_rect(425, 34, 72, 72, RED, 1.2, zIndex=3), "id": "cinder-frame-one"}
    frame_two = {**_rect(455, 63, 78, 78, "#767B80", 1, zIndex=3), "id": "cinder-frame-two"}
    node = {**_rect(482, 39, 12, 12, "#FFFFFF", 1, zIndex=3), "id": "cinder-node"}
    header = [
        _line(0, 0, 595, 170, BLACK, zIndex=1),
        _line(52, 36, 5, 99, RED, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, "#FFFFFF", L, 43, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.5, SANS, "#E06B67", L + 2, 86, zIndex=3),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, "#B8BCC0", L + 2, 119, zIndex=3),
        frame_one,
        frame_two,
        node,
        _line(497, 45, 18, 1, RED, zIndex=2),
    ]
    header[3]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    # Black masthead band occupies y=0..170. Use masthead clearance (not the
    # tighter SPACE_SECTION) so the first heading has visible breathing room.
    b = Builder(170 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.5, 13.4, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.3, degree_lh=13,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_rect(526, b.y + 2, 16, 16, RED, 1.2, zIndex=2, page=b.pg))
        b.text(label, 8.7, SANS, RED, L)
        b.line(L, W, 1, ASH)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.5, 13.4, CHARCOAL, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 13.5, BLACK, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.7, 11.5, GRAPHITE, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.5, 13.4, CHARCOAL, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": CHARCOAL}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=BLACK, muted=GRAPHITE, body=CHARCOAL, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.4, 13.5, CHARCOAL, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": CHARCOAL}, L, W, SANS, fs=9.4, lh=13.5)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, PAPER, zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, 595, 5, RED, zIndex=2, page=page), "fixedToPage": True},
            {**_line(52, 786, 490, 1, BLACK, page=page), "fixedToPage": True},
            {**_line(52, 786, 64, 3, RED, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, GRAPHITE, 522, 801, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_rift(cv: dict) -> list[dict]:
    """Abstract red/grey CV over a generated full-page background."""
    BLACK, GRAPHITE, ASH, RED = "#181A1C", "#565B60", "#C9CBCC", "#E21B1B"
    L, W, SANS, SERIF = 194, 330, "Inter", "Times-Roman"
    lbl = _labels(cv)

    class RiftBuilder(Builder):
        """Keep flowing copy inside the background's central quiet field."""
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = 90.0

    node_one = {**_rect(194, 158, 13, 13, RED, 1.2, zIndex=3), "id": "rift-node-one"}
    node_two = {**_rect(229, 158, 13, 13, GRAPHITE, 1, zIndex=3), "id": "rift-node-two"}
    node_three = {**_rect(264, 158, 13, 13, ASH, 1, zIndex=3), "id": "rift-node-three"}
    header = [
        _text(_compact_text(cv.get("name"), 30), 29, SERIF, BLACK, L, 48, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.3, SANS, RED, L + 2, 88, zIndex=3),
        _block(_compact_text(_contact_line(cv), 72), L + 2, 113, 300, 30, 8.7, 13, GRAPHITE, SANS, zIndex=3),
        node_one,
        node_two,
        node_three,
        _line(207, 163, 22, 1, RED, zIndex=2),
        _line(242, 163, 22, 1, GRAPHITE, zIndex=2),
    ]
    header[1]["letterSpacing"] = 1.7
    SECTION_CHROME = section_chrome_height(8.7)
    # Accent nodes occupy y=158..171 in the content column — clear below them.
    b = RiftBuilder(171 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.3, 13.2, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.2, degree_lh=13,
            meta_fs=8.6, meta_lh=11.5,
            body_fs=8.6, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_rect(510, b.y, 14, 14, RED, 1.2, zIndex=2, page=b.pg))
        b.text(label, 8.5, SANS, RED, L)
        b.line(L, W, 1, ASH)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.3, 13.2, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.3, 13.2, BLACK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 13.5, BLACK, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.7, 11.5, GRAPHITE, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.3, 13.2, BLACK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BLACK}, L, W, SANS, fs=9.3, lh=13.2)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=BLACK, muted=GRAPHITE, body=BLACK, font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.2, 13.2, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.2, 13.2, BLACK, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BLACK}, L, W, SANS, fs=9.2, lh=13.2)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image",
                "src": f"{BACKEND_URL}/template-assets/rift-cv-background.png",
                "width": 595,
                "height": 842,
                "left": 0,
                "top": 0,
                "zIndex": 0,
                "page": page,
                "fixedToPage": True,
            },
            {**_rect(493, 780, 31, 22, "#FFFFFF", 1, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, GRAPHITE, 503, 787, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow



# IT + classic theme families live in app.services.themes (late-imported below).



def _gen_monument(cv: dict) -> list[dict]:
    """
    Generate the monochrome Monument editorial layout.

    The font hierarchy bottoms out at 9 px. The summary uses the same size as
    body copy so it does not appear one step larger than surrounding text.
    Section navigation uses numbered filled rectangles paired with outlined
    title frames, while all dynamic content remains in a single readable column
    that can reflow across as many A4 pages as the CV requires.
    """
    C = {
        "paper": "#F7F7F7",
        "white": "#FFFFFF",
        "ink": "#111111",
        "body": "#343434",
        "muted": "#6D6D6D",
        "rule": "#C8C8C8",
        "pale": "#E8E8E8",
    }
    L, W = 102, 427
    DISPLAY, SANS = "CormorantGaramond", "Montserrat"
    SECTION_CHROME = 44.0
    BODY_FS, BODY_LH = 9.0, 14.0

    class MonumentBuilder(Builder):
        """Continue the editorial column below the repeated page frame."""

        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = 72.0

    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    contact = _compact_text(_contact_line(cv), 82)
    header = [
        _text(name, 33, DISPLAY, C["ink"], 74, 59, zIndex=3, bold=True),
        _block(title, 76, 104, 337, 20, 12.5, 16, C["body"], SANS, zIndex=3, bold=True),
        _block(contact, 76, 136, 337, 16, 9, 12, C["muted"], SANS, zIndex=3),
        {**_rect(425, 54, 84, 84, C["ink"], 1.5, zIndex=3), "id": "monument-masthead-frame"},
        _line(441, 70, 52, 11, C["ink"], zIndex=3),
        _line(441, 88, 34, 11, C["body"], zIndex=3),
        _line(441, 106, 52, 11, C["rule"], zIndex=3),
        _text("CV / 01", 9, SANS, C["muted"], 449, 145, zIndex=3),
    ]
    header[1]["letterSpacing"] = 1.1

    # Contact block ends near y=152; masthead clearance before first chrome.
    b = MonumentBuilder(152 + SPACE_AFTER_MASTHEAD)
    section_number = 0

    def section(label: str) -> None:
        """
        Draw one numbered heading unit and advance to its content baseline.

        The fixed frame width keeps every section aligned. Long custom labels
        are shortened only in this decorative slot; their content is preserved.
        """
        nonlocal section_number
        section_number += 1
        top = b.y
        display_label = _compact_text(label, 31)
        chrome = [
            _line(66, top, 32, 32, C["ink"], zIndex=2, page=b.pg),
            _text(f"{section_number:02d}", 11, SANS, C["white"], 74, top + 8,
                  zIndex=5, page=b.pg, bold=True),
            _rect(106, top, 251, 32, C["ink"], 1.2, zIndex=2, page=b.pg),
            _text(display_label, 12.5, DISPLAY, C["ink"], 118, top + 8,
                  zIndex=5, page=b.pg, bold=True),
            _line(369, top + 15, 160, 2, C["rule"], zIndex=1, page=b.pg),
        ]
        chrome[-2]["letterSpacing"] = 0.35
        # Keep the marker, number, title frame, label, and rule as one reflow
        # cluster. Without explicit roles, the browser's legacy fallback treats
        # text and shapes independently and can break the heading alignment.
        b.els.extend({**element, "flowRole": "section-chrome"} for element in chrome)
        b.y += SECTION_CHROME

    def experience_height(job: dict) -> float:
        height = (
            b.measure_block(job.get("title", ""), W, 11, 14, SANS, bold=True, min_h=14)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 9, 12, SANS, min_h=12)
        )
        bullets = _bullets(job)
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, BODY_FS, BODY_LH, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10, degree_lh=13,
            meta_fs=9, meta_lh=12,
            body_fs=BODY_FS, body_lh=BODY_LH,
        )

    lbl = _labels(cv)

    if cv.get("summary"):
        # Keep summary at BODY_FS. A larger lead paragraph would fight the
        # compact editorial hierarchy this template is built around.
        summary_height = b.measure_block(cv["summary"], W, BODY_FS, BODY_LH, SANS)
        b.need_section(SECTION_CHROME, summary_height)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, BODY_FS, BODY_LH, C["body"], SANS)
        b.gap(SPACE_SECTION)

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 14, C["ink"], SANS,
                    bold=True, min_h=14)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 9, 12, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, BODY_FS, BODY_LH, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_experience", section, C, L, W, SANS,
        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
    )

    if cv.get("education"):
        entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(entries[0]))
        section(lbl["education"])
        for index, education in enumerate(entries):
            if index > 0:
                b.need(education_height(education))
            _place_education_record(
                b, education, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10, degree_lh=13,
                meta_fs=9, meta_lh=12,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=SPACE_RECORD if index < len(entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if cv.get("skills"):
        skills = "  ·  ".join(cv["skills"])
        skills_height = b.measure_block(skills, W, BODY_FS, BODY_LH, SANS)
        b.need_section(SECTION_CHROME, skills_height)
        section(lbl["skills"])
        b.block(skills, L, W, BODY_FS, BODY_LH, C["body"], SANS)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_skills", section, C, L, W, SANS,
        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
    )

    flow = b.build()
    selectable = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in header + flow
    ]
    pages_used = max([element.get("page", 1) for element in selectable] or [1])
    page_decorations = []
    for page in range(1, pages_used + 1):
        page_decorations.extend([
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_rect(34, 32, 527, 778, C["rule"], 0.8, page=page), "fixedToPage": True},
        ])
        # The tall bars belong to the name-and-position masthead. Repeating
        # them on continuation pages incorrectly suggests a missing header.
        if page == 1:
            page_decorations.extend([
                {
                    **_line(51, 54, 8, 111, C["ink"], zIndex=2, page=page),
                    "fixedToPage": True,
                    "repeatOnContinuation": False,
                },
                {
                    **_line(529, 54, 8, 111, C["pale"], zIndex=2, page=page),
                    "fixedToPage": True,
                    "repeatOnContinuation": False,
                },
            ])
        page_decorations.extend([
            {**_line(66, 779, 463, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(66, 792, 28, 8, C["ink"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 9, SANS, C["muted"], 512, 787,
                     zIndex=3, page=page), "fixedToPage": True},
        ])
    return page_decorations + selectable


def _gen_moss(cv: dict) -> list[dict]:
    """Generate the Moss narrow-sidebar layout on every content page."""
    C = {
        "asset": "moss-sidebar.png", "paper": "#FBFAF6", "ink": "#274232",
        "body": "#344238", "accent": "#B99854", "marker": "#73856E",
        "muted": "#798078", "rule": "#D5D0C2", "side_text": "#274232",
        "side_label": "#274232",
    }
    SIDE, L, W = 184, 220, 326
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class SidebarBuilder(Builder):
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = 56.0


    sidebar_left, sidebar_width = 24, 136
    contact = "\n".join(filter(None, [
        str(cv.get("location") or "").strip(),
        str(cv.get("email") or "").strip(),
        str(cv.get("phone") or "").strip(),
    ]))
    contact_font_size, contact_line_height = 8.0, 12.5
    contact_height = _sidebar_wrapped_height(
        contact or " ", sidebar_width, contact_font_size, contact_line_height
    )
    sidebar_start = 322 + contact_height + 18
    sidebar_sections, sidebar_keys = _fit_sidebar_sections(
        _sidebar_candidates(cv, lbl),
        width=sidebar_width,
        start_y=sidebar_start,
        bottom_y=758,
    )
    sidebar_extra_indices = {
        section["extra_index"]
        for section in sidebar_sections
        if "extra_index" in section
    }
    name = _compact_text(cv.get("name"), 32).upper()
    title = _compact_text(cv.get("title"), 54).upper()
    contact_line = _compact_text(_contact_line(cv), 78)

    frame = {**_rect(462, 52, 58, 54, C["accent"], 0.85, zIndex=3), "id": "moss-frame"}
    orbit = {**_ellipse(472, 62, 35, 17, C["marker"], borderWidth=1, zIndex=3), "id": "moss-orbit"}
    node = {**_circle(484, 82, 11, C["accent"], filled=True, zIndex=3), "id": "moss-node"}
    contact_label = _text("KONTAKT", 8, SANS, C["side_label"], sidebar_left, 300, zIndex=3)
    contact_rule = _line(sidebar_left, 312, 44, 1, C["accent"], zIndex=3)
    contact_body = _block(
        contact, sidebar_left, 322, sidebar_width, contact_height,
        contact_font_size, contact_line_height, C["side_text"], SANS, zIndex=3,
    )
    sidebar_static = [contact_label, contact_rule, contact_body]
    for section_data in sidebar_sections:
        section_label = _text(
            section_data["title"], 8, SANS, C["side_label"],
            sidebar_left, section_data["top"], zIndex=3,
        )
        section_label["letterSpacing"] = 1.2
        sidebar_static.extend([
            section_label,
            _line(sidebar_left, section_data["top"] + 12, 44, 1, C["accent"], zIndex=3),
            _block(
                section_data["content"], sidebar_left, section_data["body_top"],
                sidebar_width, section_data["body_height"], section_data["fontSize"],
                section_data["lineHeight"], C["side_text"], SANS, zIndex=3,
            ),
        ])

    static = [
        _text(name, 29, SERIF, C["ink"], L, 52, zIndex=3, bold=True),
        # Keep the main-column X origin identical for header and body flow.
        _text(title, 8.8, SANS, C["marker"], L, 92, zIndex=3),
        _text(contact_line, 8.4, SANS, C["muted"], L, 120, zIndex=3),
        _line(L, 145, W, 1, C["rule"], zIndex=2),
        *sidebar_static,
        frame, orbit, node,
        _line(528, 85, 14, 1, C["accent"], zIndex=2),
    ]
    static[0]["letterSpacing"] = 0.1
    static[1]["letterSpacing"] = 1.45
    contact_label["letterSpacing"] = 1.2

    # Header rule at y=145; body starts after masthead clearance.
    b = SidebarBuilder(145 + SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 10.8, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.6, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.3, 13.2, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.2, degree_lh=13,
            meta_fs=8.6, meta_lh=11.5,
            body_fs=8.6, body_lh=11.5,
        )

    SECTION_CHROME = section_chrome_height(8.4)

    def section(label: str) -> None:
        marker_y = b.y + 1
        b.els.append(
            _ellipse(L - 23, marker_y, 12, 12, C["marker"], borderWidth=1, zIndex=3, page=b.pg)
        )
        b.text(label, 8.4, SANS, C["marker"], L)
        b.els[-1]["letterSpacing"] = 1.55 if label != lbl["skills"] else 1.3
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.3, 13.2, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.3, 13.2, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            # Treat title, metadata and bullets as one visual record. This
            # avoids orphaned titles and uses the remaining page space when
            # the complete record genuinely fits.
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 10.8, 13.5, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.6, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.3, 13.2, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]},
                        L, W, SANS, fs=9.3, lh=13.2, skip_indices=sidebar_extra_indices)

    if cv.get("education") and "education" not in sidebar_keys:
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills") and "skills" not in sidebar_keys:
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.3, 13.2, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.3, 13.2, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]},
                    L, W, SANS, fs=9.3, lh=13.2, skip_indices=sidebar_extra_indices)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])

    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image", "src": f"{BACKEND_URL}/template-assets/{C['asset']}",
                "width": SIDE, "height": A4_H, "left": 0, "top": 0, "zIndex": 0,
                "page": page, "fixedToPage": True,
            },
            {**_line(SIDE, 0, 2, A4_H, C["accent"], zIndex=1, page=page), "fixedToPage": True},
            {**_line(SIDE + 2, 0, 409, A4_H, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 783, W, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 796, 6, C["accent"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["muted"], L + W - 15, 791, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + static + flow


def _gen_obsidian(cv: dict) -> list[dict]:
    """Sidebar dark theme — a near-black sidecar beside a charcoal main field,
    signed with a single warm-gold accent. Both panels stay dark on every page.

    Sidebar order: KONTAKT → skills (user/label title) → JĘZYKI → WYKSZTAŁCENIE.
    Skills and languages are bullet lists; education uses diploma — period /
    school, city / description.
    """
    SIDEBAR_BG, MAIN_BG = "#0B0D10", "#15181C"
    GOLD, INK, MUTED, BODY, RULE = "#C9A24B", "#F4F1EA", "#9AA1AC", "#D7DAE0", "#33383F"
    SANS, SERIF = "Inter", "Times-Roman"
    SIDE, L, W = 184, 222, 337
    SIDEBAR_L, SIDEBAR_W, SIDEBAR_BOTTOM = 24, 136, 758
    lbl = _labels(cv)

    contact = "\n".join(filter(None, [
        str(cv.get("location") or "").strip(),
        str(cv.get("email") or "").strip(),
        str(cv.get("phone") or "").strip(),
    ]))
    contact_fs, contact_lh = 8.0, 12.5
    contact_height = _sidebar_wrapped_height(
        contact or " ", SIDEBAR_W, contact_fs, contact_lh
    )

    frame = {**_rect(464, 50, 56, 52, GOLD, 1, zIndex=3), "id": "obsidian-frame"}
    orbit = {**_ellipse(474, 60, 32, 15, GOLD, borderWidth=1, zIndex=3), "id": "obsidian-orbit"}
    node = {**_circle(484, 79, 11, GOLD, filled=True, zIndex=3), "id": "obsidian-node"}

    contact_label = _text("KONTAKT", 8, SANS, GOLD, SIDEBAR_L, 60, zIndex=3)
    contact_label["letterSpacing"] = 1.3
    static = [
        _text(_compact_text(cv.get("name"), 28), 29, SERIF, INK, L, 52, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9, SANS, GOLD, L + 2, 92, zIndex=3),
        _line(L, 116, W, 1, RULE, zIndex=2),
        frame, orbit, node,
        _line(528, 74, 14, 1, GOLD, zIndex=2),
        contact_label,
        _block(
            contact, SIDEBAR_L, 80, SIDEBAR_W, contact_height,
            contact_fs, contact_lh, BODY, SANS, zIndex=3,
        ),
    ]
    static[1]["letterSpacing"] = 1.4

    cursor_y = 80 + contact_height + 18
    placed_keys: set[str] = set()
    sidebar_extra_indices: set[int] = set()

    def bulleted_section_height(items: list[str], font_size: float) -> float:
        content = "\n".join(f"• {item}" for item in items)
        line_height = round(max(font_size * 1.45, 11.0), 2)
        body_height = _sidebar_wrapped_height(content, SIDEBAR_W, font_size, line_height)
        return 15 + body_height + 18

    def place_bulleted_section(
        title: str,
        items: list[str],
        key: str,
        *,
        reserve: float = 0.0,
    ) -> bool:
        """Place a complete bulleted sidebar section when it fits below the cursor.

        Obsidian deliberately ignores `_SIDEBAR_MAX_SECTION_HEIGHT` — skills lists
        are often taller than that cap, and rejecting them dumps UMIEJĘTNOŚCI into
        the main column while languages/education still fit.
        """
        nonlocal cursor_y
        if not items:
            return False
        content = "\n".join(f"• {item}" for item in items)
        for font_size in _SIDEBAR_FONT_SIZES:
            line_height = round(max(font_size * 1.45, 11.0), 2)
            body_height = _sidebar_wrapped_height(content, SIDEBAR_W, font_size, line_height)
            section_height = 15 + body_height + 18
            if cursor_y + section_height + reserve > SIDEBAR_BOTTOM:
                continue
            label = _text(title, 8, SANS, GOLD, SIDEBAR_L, cursor_y, zIndex=3)
            label["letterSpacing"] = 1.3
            static.extend([
                label,
                _block(
                    content, SIDEBAR_L, cursor_y + 15, SIDEBAR_W, body_height,
                    font_size, line_height, BODY, SANS, zIndex=3, bulletList=True,
                ),
            ])
            cursor_y += section_height
            placed_keys.add(key)
            return True
        return False

    def education_record_height(edu: dict) -> float:
        title, school_city, description = _obsidian_education_parts(edu)
        height = 0.0
        if title:
            height += _sidebar_wrapped_height(title, SIDEBAR_W, 8.6, 12)
        if school_city:
            if height:
                height += SPACE_STACK
            height += _sidebar_wrapped_height(school_city, SIDEBAR_W, 7.9, 11)
        if description:
            if height:
                height += SPACE_STACK
            height += _sidebar_wrapped_height(description, SIDEBAR_W, 8.0, 12)
        return height

    skills = [str(skill).strip() for skill in (cv.get("skills") or []) if str(skill).strip()]
    language_lines = _language_sidebar_lines(cv)
    education_entries = list(cv.get("education") or [])

    language_reserve = (
        bulleted_section_height(language_lines, _SIDEBAR_FONT_SIZES[-1])
        if language_lines else 0.0
    )
    education_reserve = 0.0
    if education_entries:
        records_height = 0.0
        for index, edu in enumerate(education_entries):
            if index:
                records_height += SPACE_RECORD
            records_height += education_record_height(edu)
        if records_height > 0:
            education_reserve = 15 + records_height + 18

    # Prefer KONTAKT → skills → languages → education. Reserve room so a tall
    # skills list cannot push languages/education out of the sidebar.
    place_bulleted_section(
        lbl["skills"], skills, "skills",
        reserve=language_reserve + education_reserve,
    )

    if place_bulleted_section("JĘZYKI", language_lines, "languages", reserve=education_reserve):
        for index, section in enumerate(cv.get("extra_sections") or []):
            if _extra_section_kind(section) == "languages":
                sidebar_extra_indices.add(index)

    if education_entries and education_reserve > 0 and cursor_y + education_reserve <= SIDEBAR_BOTTOM:
        edu_label = _text(lbl["education"], 8, SANS, GOLD, SIDEBAR_L, cursor_y, zIndex=3)
        edu_label["letterSpacing"] = 1.3
        static.append(edu_label)
        cursor_y += 15
        for index, edu in enumerate(education_entries):
            if index:
                cursor_y += SPACE_RECORD
            title, school_city, description = _obsidian_education_parts(edu)
            if title:
                title_h = _sidebar_wrapped_height(title, SIDEBAR_W, 8.6, 12)
                static.append(_block(
                    title, SIDEBAR_L, cursor_y, SIDEBAR_W, title_h,
                    8.6, 12, INK, SANS, zIndex=3, bold=True,
                ))
                cursor_y += title_h
            if school_city:
                cursor_y += SPACE_STACK
                meta_h = _sidebar_wrapped_height(school_city, SIDEBAR_W, 7.9, 11)
                static.append(_block(
                    school_city, SIDEBAR_L, cursor_y, SIDEBAR_W, meta_h,
                    7.9, 11, MUTED, SANS, zIndex=3,
                ))
                cursor_y += meta_h
            if description:
                cursor_y += SPACE_STACK
                desc_h = _sidebar_wrapped_height(description, SIDEBAR_W, 8.0, 12)
                static.append(_block(
                    description, SIDEBAR_L, cursor_y, SIDEBAR_W, desc_h,
                    8.0, 12, BODY, SANS, zIndex=3,
                ))
                cursor_y += desc_h
        cursor_y += 18
        placed_keys.add("education")

    # Last chance: leftover sidebar space after languages/education.
    if "skills" not in placed_keys:
        place_bulleted_section(lbl["skills"], skills, "skills")

    # Main-column header rule ends at y=117; clear before first section.
    b = Builder(117 + SPACE_AFTER_HEADER_RULE)

    def section(label: str) -> None:
        b.need(34)
        b.els.append(_circle(L - 18, b.y + 2, 7, GOLD, filled=True, zIndex=3, page=b.pg))
        b.text(label, 8.6, SANS, INK, L, bold=True)
        b.els.append(_line(L, b.y - 2, W, 1, RULE, page=b.pg))
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.4, 13.3, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            b.need(80)
            b.block(job.get("title", ""), L, W, 11, 14, INK, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.7, 11.5, MUTED, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.4, 13.3, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": BODY}, L, W, SANS,
            fs=9.4, lh=13.3, skip_indices=sidebar_extra_indices,
        )

    if education_entries and "education" not in placed_keys:
        b.need_section(section_chrome_height(12), 72)
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD,
            )
        close_section()

    if skills and "skills" not in placed_keys:
        section(lbl["skills"])
        b.block("  ·  ".join(skills), L, W, 9.4, 13.3, BODY, SANS)
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": BODY}, L, W, SANS,
        fs=9.4, lh=13.3, skip_indices=sidebar_extra_indices,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, SIDE, A4_H, SIDEBAR_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(SIDE, 0, 2, A4_H, GOLD, zIndex=1, page=page), "fixedToPage": True},
            {**_line(SIDE + 2, 0, 595 - SIDE - 2, A4_H, MAIN_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 783, W, 1, RULE, zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 796, 6, GOLD, filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, L + W - 15, 791, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + static + flow


def _gen_raven(cv: dict) -> list[dict]:
    """Topbar dark theme — a raised masthead band over a fully dark page,
    single column, cool teal accents. The structural counterpart to the
    sidebar dark theme: one horizontal band instead of a vertical column."""
    BODY_BG, BAND_BG = "#12161C", "#181D25"
    TEAL, INK, MUTED, BODY, RULE = "#3FBFA6", "#F2F5F4", "#8B98A1", "#C9D2D6", "#2A3038"
    L, W, SANS, SERIF = 76, 466, "Inter", "Times-Roman"
    lbl = _labels(cv)

    frame_one = {**_rect(425, 34, 72, 72, TEAL, 1.2, zIndex=3), "id": "raven-frame-one"}
    frame_two = {**_rect(455, 63, 78, 78, "#4C5760", 1, zIndex=3), "id": "raven-frame-two"}
    node = {**_rect(482, 39, 12, 12, INK, 1, zIndex=3), "id": "raven-node"}
    header = [
        _line(0, 0, 595, 170, BAND_BG, zIndex=1),
        _line(0, 170, 595, 3, TEAL, zIndex=2),
        _line(52, 36, 5, 99, TEAL, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, INK, L, 43, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.5, SANS, TEAL, L + 2, 86, zIndex=3),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, MUTED, L + 2, 119, zIndex=3),
        frame_one, frame_two, node,
        _line(497, 45, 18, 1, TEAL, zIndex=2),
    ]
    header[4]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    # Band y=0..170 + teal rule to 173. Masthead air before body copy.
    b = Builder(173 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(bullets, W, 9.5, 13.4, SANS, bulletList=True)
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.3, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_rect(526, b.y + 2, 16, 16, TEAL, 1.2, zIndex=2, page=b.pg))
        b.text(label, 8.7, SANS, TEAL, L)
        b.line(L, W, 1, RULE)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.5, 13.4, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.7, 11.5, MUTED, SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.5, 13.4, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.3, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.4, 13.5, BODY, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS, fs=9.4, lh=13.5)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, BODY_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, 595, 3, TEAL, zIndex=2, page=page), "fixedToPage": True},
            {**_line(52, 786, 490, 1, RULE, page=page), "fixedToPage": True},
            {**_line(52, 786, 64, 3, TEAL, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, 522, 801, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_graphite(cv: dict) -> list[dict]:
    """Ultra-minimalist dark theme. A single cool-silver accent, hairline
    rules and generous whitespace carry the whole hierarchy — no bands,
    frames or sidebars, just quiet typography on a dark field."""
    BG, SILVER, INK, MUTED, BODY, HAIRLINE = (
        "#101113", "#B7C3CC", "#F5F6F7", "#8A9099", "#C7CBCF", "#2B2E32",
    )
    L, W, SANS, SERIF = 56, 483, "Inter", "Times-Roman"
    lbl = _labels(cv)
    b = Builder(58)

    b.text(_compact_text(cv.get("name"), 34), 32, SERIF, INK, L, bold=True); b.gap(4)
    b.text(_compact_text(cv.get("title"), 52), 12, SANS, SILVER, L, italic=True); b.gap(4)
    b.text(_compact_text(_contact_line(cv), 82), 9, SANS, MUTED, L); b.gap(10)
    b.line(L, W, 0.5, HAIRLINE); b.gap(SPACE_AFTER_HEADER_RULE)

    def section(label: str) -> None:
        b.need(38)
        b.text(label, 9, SANS, SILVER, L)
        b.els[-1]["letterSpacing"] = 1.6
        b.gap(2)
        b.line(L, W, 0.5, HAIRLINE)
        b.gap(14)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            b.need(56)
            b.text(job.get("title", ""), 11, SANS, INK, L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.3, SANS, MUTED, L); b.gap(2)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 10, 14.5, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=10, lh=14.5)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(section_chrome_height(9), _education_record_height(
            b, education_entries[0], W, SANS,
            degree_fs=10.5, degree_lh=14, meta_fs=9.3, meta_lh=12.5,
            body_fs=9.3, body_lh=13.5,
        ))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.5, degree_lh=14, meta_fs=9.3, meta_lh=12.5,
                body_fs=9.3, body_lh=13.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, BODY, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS)

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 784, W, 0.5, HAIRLINE, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, L + W - 15, 792, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + flow


def _gen_onyx(cv: dict) -> list[dict]:
    """Framed diplomatic dark theme: a bronze double frame, a centered serif
    masthead and three data-derived stat boxes — the formal, symmetric
    counterpart to the other, left-aligned dark themes."""
    BG, FRAME, FRAME_INNER = "#0E0E10", "#B08D57", "#3A3227"
    IVORY, MUTED, BODY, RULE = "#EDE6D8", "#8A7550", "#D2C9BA", "#332C22"
    S, I = "Times-Roman", "Inter"
    L, W = 55, 485
    lbl = _labels(cv)

    static = [
        _block((cv.get("name") or "").upper(), 50, 56, 495, 36, 27, 33, IVORY, S,
               bold=True, align="center"),
        _block((cv.get("title") or "").upper(), 50, 96, 495, 18, 11.5, 15, FRAME, I,
               align="center"),
        _block(_contact_line(cv), 50, 120, 495, 14, 9.3, 13, MUTED, I, align="center"),
        _rect(255, 139, 8, 8, FRAME, 1),
        _line(271, 142, 53, 2, FRAME),
        _rect(332, 139, 8, 8, FRAME, 1),
    ]
    static[1]["letterSpacing"] = 2

    exp = cv.get("experience") or []
    years_found = [int(m) for job in exp
                   for m in re.findall(r"\b(?:19|20)\d{2}\b", job.get("period") or "")]
    years = max(datetime.now().year - min(years_found), 1) if years_found else None
    skills = cv.get("skills") or []
    kpis = [
        (f"{years}+" if years else str(len(exp) or "—"),
         "LAT DOŚWIADCZENIA" if years else "STANOWISK"),
        (str(len(exp)) if exp else "—", "ZAJMOWANYCH STANOWISK"),
        (str(len(skills)) if skills else "—", "KLUCZOWYCH UMIEJĘTNOŚCI"),
    ]
    for i, (figure, label) in enumerate(kpis):
        left = 55 + i * 164
        static.append(_rect(left, 160, 157, 52, FRAME, 1, zIndex=1))
        static.append(_block(figure, left, 168, 157, 18, 15, 18, IVORY, S, bold=True, align="center"))
        lab = _block(label, left, 190, 157, 12, 7.3, 10, MUTED, I, align="center")
        lab["letterSpacing"] = 1
        static.append(lab)

    # KPI cards end near y=212; start the first section shortly after.
    b = Builder(220)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            (11 * 1.35) + SPACE_STACK
            + (9 * 1.35) + SPACE_STACK
        )
        if bullets:
            height += b.measure_block(bullets, W, 10, 14, I, bulletList=True)
        return height

    def section(label: str) -> None:
        # Match frontend/src/templates/onyx.js chrome rhythm:
        #   marker + label on one band, rule 14px below label top, then 16px to body.
        # Using Builder.text() then line at y-2 put the rule inside the label's
        # line-box leading (~2px under the glyphs) and only 8px before content —
        # which made every AI-filled Onyx section look top-crushed.
        b.need(40)
        y0 = b.y
        marker = _rect(L, y0 + 2, 9, 9, FRAME, 1.5, zIndex=2, page=b.pg)
        marker["flowRole"] = "section-chrome"
        b.els.append(marker)
        heading = _text(label, 11.5, S, IVORY, 72, y0, zIndex=2, page=b.pg, bold=True)
        heading["letterSpacing"] = 1.4
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        b.y = y0 + 14
        b.line(L, W, 1, RULE)
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(16)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14, BODY, I); b.gap(16)

    if exp:
        section(lbl["experience"])
        for index, job in enumerate(exp):
            b.need(experience_height(job))
            b.text(job.get("title", ""), 11, I, IVORY, L, bold=True); b.gap(SPACE_STACK)
            b.text(_company_period(job), 9, I, MUTED, L); b.gap(SPACE_STACK)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, BODY, I, bulletList=True)
            if index < len(exp) - 1:
                b.gap(SPACE_RECORD)
        b.gap(SPACE_SECTION)
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, I)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=IVORY, muted=MUTED, body=BODY, font=I,
                degree_fs=10.5, degree_lh=14, meta_fs=9, meta_lh=12.5,
                body_fs=9, body_lh=13,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if skills:
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(skills), L, W, 10, 15, BODY, I); b.gap(SPACE_SECTION)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, I)

    # Reflow must distinguish section chrome from ordinary `text` nodes such
    # as job titles. Without an explicit role, the client treated every text
    # element as keep-with-next chrome and could move a heading behind its own
    # section content during independent auto-height passes.
    flow = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in b.build()
    ]
    static = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in static
    ]
    pages_used = max([e.get("page", 1) for e in static + flow] or [1])
    frames = []
    for p in range(1, pages_used + 1):
        frames.append({**_line(0, 0, 595, 842, BG, zIndex=0, page=p), "fixedToPage": True})
        # Frames must be fixed — otherwise textarea reflow treats the full-page
        # outlines as content and shifts them down, leaving empty boxes / pages.
        frames.append({**_rect(24, 24, 547, 794, FRAME, 1.5, page=p), "fixedToPage": True})
        frames.append({**_rect(29, 29, 537, 784, FRAME_INNER, 1, page=p), "fixedToPage": True})
        frames.append({
            **_text(f"{p:02d}", 8, I, MUTED, 522, 801, page=p),
            "fixedToPage": True,
        })

    return frames + static + flow


def _gen_words(cv: dict) -> list[dict]:
    """
    Generate the monochrome Words layout inspired by a formatted Word document.

    The layout intentionally uses one serif text column with ordinary document
    rhythm. Thin rules and small circles are the only decoration; there are no
    frames, side panels, or artificial page margins.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#202020",
        "body": "#383838",
        "muted": "#6F6F6F",
        "rule": "#BEBEBE",
        "pale": "#E6E6E6",
    }
    L, W = 89, 434
    FONT = "Times-Roman"
    SECTION_CHROME = 36.0

    class WordsBuilder(Builder):
        """Continue the document column below a compact page-top inset."""

        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = 58.0

    name = str(cv.get("name") or "").strip()
    title = str(cv.get("title") or "").strip()
    contact = _contact_line(cv)
    # Unlike poster-like mastheads, a Word document must never shorten contact
    # data or a long name. Measure each block and move the document body down
    # when wrapping adds another line.
    name_top = 58.0
    name_height = Builder.measure_block(
        name, 451, 29, 34, FONT, bold=True, min_h=34
    )
    title_top = name_top + name_height + 6
    title_height = Builder.measure_block(
        title, 451, 13.5, 17, FONT, bold=True, min_h=17
    )
    contact_top = title_top + title_height + 12
    contact_height = Builder.measure_block(
        contact, 451, 10, 13, FONT, min_h=13
    )
    divider_top = contact_top + contact_height + 16
    header = [
        _block(name, 72, name_top, 451, name_height, 29, 34,
               C["ink"], FONT, zIndex=3, bold=True),
        _block(title, 72, title_top, 451, title_height, 13.5, 17,
               C["body"], FONT, zIndex=3, bold=True),
        _block(contact, 72, contact_top, 451, contact_height, 10, 13,
               C["muted"], FONT, zIndex=3),
        _circle(72, divider_top - 2, 5, C["ink"], filled=True, zIndex=3),
        _circle(82, divider_top - 2, 5, C["pale"], borderWidth=1, zIndex=3),
        _line(94, divider_top, 429, 1, C["rule"], zIndex=2),
    ]

    b = WordsBuilder(divider_top + SPACE_AFTER_HEADER_RULE)

    def section(label: str) -> None:
        """
        Render one Word-like heading and advance to the section body.

        All three decorative parts share an explicit flow role so browser text
        measurement cannot separate the marker, heading, and underline.
        """
        top = b.y
        chrome = [
            _circle(72, top + 4, 7, C["ink"], borderWidth=1.2, zIndex=3, page=b.pg),
            _text(_compact_text(label, 42), 12, FONT, C["ink"], L, top,
                  zIndex=3, page=b.pg, bold=True),
            _line(L, top + 21, W, 1, C["rule"], zIndex=2, page=b.pg),
        ]
        b.els.extend({**element, "flowRole": "section-chrome"} for element in chrome)
        b.y += SECTION_CHROME

    def experience_height(job: dict) -> float:
        height = (
            b.measure_block(job.get("title", ""), W, 11.5, 15, FONT, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 10, 13, FONT, italic=True, min_h=13)
        )
        bullets = _bullets(job)
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 10.5, 15, FONT, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, FONT,
            degree_fs=11, degree_lh=14,
            meta_fs=10, meta_lh=13,
            body_fs=10, body_lh=15,
        )

    lbl = _labels(cv)

    if cv.get("summary"):
        summary_height = b.measure_block(cv["summary"], W, 10.5, 15, FONT)
        b.need_section(SECTION_CHROME, summary_height)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], FONT)
        b.gap(SPACE_SECTION)

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 11.5, 15, C["ink"], FONT,
                    bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 10, 13, C["muted"], FONT,
                    italic=True, min_h=13)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 10.5, 15, C["body"], FONT, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_experience", section, C, L, W, FONT,
        fs=10.5, lh=15, section_chrome_h=SECTION_CHROME,
    )

    if cv.get("education"):
        entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(entries[0]))
        section(lbl["education"])
        for index, education in enumerate(entries):
            if index > 0:
                b.need(education_height(education))
            _place_education_record(
                b, education, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=FONT,
                degree_fs=11, degree_lh=14,
                meta_fs=10, meta_lh=13,
                body_fs=10, body_lh=15,
                after_gap=SPACE_RECORD if index < len(entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if cv.get("skills"):
        skills = "  •  ".join(cv["skills"])
        skills_height = b.measure_block(skills, W, 10.5, 15, FONT)
        b.need_section(SECTION_CHROME, skills_height)
        section(lbl["skills"])
        b.block(skills, L, W, 10.5, 15, C["body"], FONT)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_skills", section, C, L, W, FONT,
        fs=10.5, lh=15, section_chrome_h=SECTION_CHROME,
    )

    selectable = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in header + b.build()
    ]
    pages_used = max([element.get("page", 1) for element in selectable] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(72, 783, 451, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {
                **_circle(72, 794, 6, C["ink"], borderWidth=1, zIndex=3, page=page),
                "fixedToPage": True,
            },
            {
                **_text(f"{page:02d}", 10, FONT, C["muted"], 508, 790,
                        zIndex=3, page=page),
                "fixedToPage": True,
            },
        )
    ]
    return page_decorations + selectable


# ── public API ───────────────────────────────────────────────────────────────

from app.services.cv_generator_iconic import (  # noqa: E402  — after helpers exist
    _gen_cardinal,
    _gen_loom,
    _gen_nova,
    _gen_ridge,
    _gen_volt,
)
from app.services.themes.it import (  # noqa: E402
    _gen_kernel,
    _gen_relay,
    _gen_vector,
)
from app.services.themes.classic import (  # noqa: E402
    _gen_aldine,
    _gen_merit,
    _gen_regent,
    _gen_scribe,
)

_GENERATORS = {
    # Must stay in sync with the frontend template registry.
    "ledger":    _gen_ledger,
    "nimbus":    _gen_nimbus,
    "cinder":    _gen_cinder,
    "rift":      _gen_rift,
    "signal":    _gen_signal,
    "vector":    _gen_vector,
    "kernel":    _gen_kernel,
    "relay":     _gen_relay,
    "scribe":    _gen_scribe,
    "regent":    _gen_regent,
    "aldine":    _gen_aldine,
    "merit":     _gen_merit,
    "moss":      _gen_moss,
    "obsidian":  _gen_obsidian,
    "raven":     _gen_raven,
    "graphite":  _gen_graphite,
    "onyx":      _gen_onyx,
    "nova":      _gen_nova,
    "ridge":     _gen_ridge,
    "loom":      _gen_loom,
    "volt":      _gen_volt,
    "monument":  _gen_monument,
    "words":     _gen_words,
    "cardinal":  _gen_cardinal,
}


def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """Return a full canvas element list for `template_id` filled with `cv_data`.

    Layout is deterministic Python (not LLM placement). One experience/education
    block is emitted per record; page overflow is handled by each theme's Builder.
    Raises ValueError for unknown template ids.
    """
    fn = _GENERATORS.get(template_id)
    if fn is None:
        raise ValueError(f"Nieznany szablon '{template_id}'. "
                         f"Dostępne: {list(_GENERATORS)}")
    return fn(normalize_cv_data(cv_data))
