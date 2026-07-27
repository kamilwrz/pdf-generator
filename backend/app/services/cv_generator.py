"""
Dynamic CV layout engine.

The AI (GPT-4o) extracts structured data from an uploaded PDF.
This module generates the full canvas-element array from that data,
using the visual style of the chosen template.  The number of
experience / education blocks matches the CV exactly — no slots, no
truncation, multi-page when content overflows.
"""

from __future__ import annotations
import math
import re
import unicodedata
from datetime import datetime

from app.core.config import BACKEND_URL
from app.services.pdf_generator import PDF_Generator

A4_H = 842
# Match classic frames + frontend textarea reflow (pageTop 66 / bottomMargin 96).
MARGIN_BOTTOM = 96
PAGE_TOP = 66
CONTENT_BOTTOM = A4_H - MARGIN_BOTTOM  # 746

# Vertical rhythm for generated CVs. Every template should space content as:
#   section → record (block) → stack (elements inside a record).
# Keep these equal within each level so X/Y placement reads as one pattern.
SPACE_STACK = 4       # title → meta → body inside one record
SPACE_RECORD = 14     # between records in the same section
SPACE_SECTION = 18    # after a finished section before the next heading
SPACE_AFTER_RULE = 12 # section heading rule → first content block


def section_chrome_height(label_fs: float) -> float:
    """Y advance for a typical section label + after-rule gap."""
    return float(label_fs) * 1.35 + SPACE_AFTER_RULE


# ── low-level element constructors ──────────────────────────────────────────

def _text(content, fontSize, fontFamily, color, left, top, *,
          zIndex=2, page=1, bold=False, italic=False):
    return {"category": "text", "content": str(content),
            "fontSize": fontSize, "fontFamily": fontFamily,
            "color": color, "left": left, "top": top,
            "zIndex": zIndex, "page": page, "bold": bold, "italic": italic}


def _block(content, left, top, width, height, fontSize, lineHeight, color, fontFamily, *,
           zIndex=2, page=1, bold=False, italic=False, align="left", bulletList=False):
    return {"category": "textarea", "content": str(content),
            "left": left, "top": top, "width": width, "height": height,
            "fontSize": fontSize, "lineHeight": lineHeight,
            "letterSpacing": 0, "color": color, "fontFamily": fontFamily,
            "zIndex": zIndex, "page": page, "bold": bold, "italic": italic,
            "align": align, "bulletList": bulletList, "autoHeight": True}


def _line(left, top, width, height, color, *, zIndex=1, page=1):
    return {"category": "line", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "zIndex": zIndex, "page": page}


def _rect(left, top, width, height, color, borderWidth=1, *, zIndex=1, page=1):
    """Outline-only rectangle (backgroundColor = border colour)."""
    return {"category": "rectangle", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "borderWidth": borderWidth, "zIndex": zIndex, "page": page}


def _circle(left, top, diameter, color, *, filled=False, borderWidth=1, zIndex=1, page=1):
    return {"category": "circle", "left": left, "top": top,
            "width": diameter, "height": diameter, "backgroundColor": color,
            "filled": filled, "borderWidth": borderWidth,
            "zIndex": zIndex, "page": page}


def _ellipse(left, top, width, height, color, *, filled=False, borderWidth=1, zIndex=1, page=1):
    return {"category": "ellipse", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
            "filled": filled, "borderWidth": borderWidth,
            "zIndex": zIndex, "page": page}


# ── builder helper ───────────────────────────────────────────────────────────

class Builder:
    """Tracks vertical position and page across element-generating calls."""

    def __init__(self, start_y: float):
        self.els: list[dict] = []
        self.y = float(start_y)
        self.pg = 1

    def need(self, h: float):
        """Advance to a new page if the next element wouldn't fit."""
        if self.y + h > CONTENT_BOTTOM:
            self.pg += 1
            self.y = float(PAGE_TOP)

    def need_section(self, chrome_h: float, first_body_h: float = 0.0):
        """
        Reserve section chrome together with the first body block so a heading
        is never stranded alone above the page footer.
        """
        self.need(float(chrome_h) + max(float(first_body_h), 0.0))

    def text(self, content, fs, fam, col, left, *, bold=False, italic=False) -> float:
        if not content:
            return self.y
        self.need(fs * 1.5)
        self.els.append(_text(content, fs, fam, col, left, self.y,
                               zIndex=2, page=self.pg, bold=bold, italic=italic))
        self.y += fs * 1.35
        return self.y

    def block(self, content, left, width, fs, lh, col, fam, *,
              bold=False, italic=False, align="left", min_h=0.0, bulletList=False) -> float:
        if not content:
            return self.y
        h = self.measure_block(
            content, width, fs, lh, fam,
            bold=bold, italic=italic, min_h=min_h, bulletList=bulletList,
        )
        self.need(h)
        self.els.append(_block(content, left, self.y, width, h, fs, lh, col, fam,
                                zIndex=2, page=self.pg, bold=bold, italic=italic, align=align,
                                bulletList=bulletList))
        self.y += h
        return self.y

    @staticmethod
    def measure_block(content, width, fs, lh, fam, *,
                      bold=False, italic=False, min_h=0.0, bulletList=False) -> float:
        if not content:
            return 0.0
        rendered_height = PDF_Generator.measure_textarea_height(
            str(content), fam, fs, lh, width,
            bold=bold, italic=italic, bullet_list=bulletList,
        )
        # Canvas textareas have no padding or border. Match their integer
        # scrollHeight so mounting the canvas does not alter the authored gaps.
        return max(math.ceil(rendered_height), min_h)

    def line(self, left, width, height, col):
        self.els.append(_line(left, self.y, width, height, col, page=self.pg))

    def gap(self, px: float):
        self.y += px

    def build(self) -> list[dict]:
        return self.els


# ── shared helpers ───────────────────────────────────────────────────────────

_LABEL_DEFAULTS = {
    "summary":    "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education":  "WYKSZTAŁCENIE",
    "skills":     "UMIEJĘTNOŚCI",
}


def _fold_label(value: object) -> str:
    """Normalize section titles so old and newly extracted CVs classify alike."""
    return (
        unicodedata.normalize("NFKD", str(value or ""))
        .encode("ascii", "ignore")
        .decode("ascii")
        .casefold()
    )


def _extra_section_kind(section: dict) -> str:
    """Return a supported semantic kind with a title-based legacy fallback."""
    declared = _fold_label(section.get("kind"))
    if declared in {"languages", "certifications", "interests", "education", "skills"}:
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
    if any(token in title for token in ("umiejet", "kompetenc", "skill")):
        return "skills"
    return "other"


def _labels(cv: dict) -> dict:
    """Return section headings in the CV's language (GPT-supplied), with Polish fallbacks."""
    raw = cv.get("labels") or {}
    return {k: (raw.get(k) or v).upper() for k, v in _LABEL_DEFAULTS.items()}


def _extra_sections(b: Builder, cv: dict, placement: str,
                    section_fn, C: dict, L: int, W: int,
                    font_b: str, fs: float = 10, lh: float = 15,
                    skip_indices: set[int] | None = None) -> None:
    """
    Render extra (custom) sections found in the CV but not in the template.

    placement='after_experience' → called after the experience block
    placement='after_skills'     → called after the skills block
    Sections tagged with the requested placement are rendered; others are skipped
    here (they'll be picked up at their own placement call).
    """
    for index, sec in enumerate(cv.get("extra_sections") or []):
        if skip_indices and index in skip_indices:
            continue
        if sec.get("placement", "after_skills") != placement:
            continue
        title = (sec.get("title") or "").strip().upper()
        items = [i for i in (sec.get("items") or []) if i and str(i).strip()]
        if not title or not items:
            continue
        content = "\n".join(f"• {item}" for item in items)
        body_height = b.measure_block(content, W, fs, lh, font_b, bulletList=True)
        # Reserve heading chrome + body together so custom sections do not leave
        # a title stranded above the page footer.
        b.need_section(section_chrome_height(8.6), body_height + SPACE_SECTION)
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


def _compact_lines(values: list[object], *, max_items: int, chars_per_item: int) -> str:
    """Return a bounded multi-line summary suitable for a narrow decorative panel."""
    lines = [
        _compact_text(value, chars_per_item)
        for value in values[:max_items]
        if str(value or "").strip()
    ]
    return "\n".join(lines)


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
            "title": "OBSZARY",
            "content": "\n".join(skills),
        })

    for index, section in enumerate(cv.get("extra_sections") or []):
        kind = _extra_section_kind(section)
        if kind not in _SIDEBAR_SECTION_ORDER:
            continue
        title = str(section.get("title") or "").strip().upper()
        items = [str(item).strip() for item in (section.get("items") or []) if str(item).strip()]
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
            degree, width, degree_fs, degree_lh, font, bold=True, min_h=15
        )
    meta = _education_meta(edu)
    if meta:
        if height:
            height += SPACE_STACK
        height += b.measure_block(meta, width, meta_fs, meta_lh, font, min_h=12)
    description = _education_description(edu)
    if description:
        if height:
            height += SPACE_STACK
        height += b.measure_block(description, width, body_fs, body_lh, font, min_h=12)
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
    body_color = body or muted
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
                bold=True, min_h=15,
            )
            placed = True
        if meta:
            if placed:
                b.gap(SPACE_STACK)
            b.block(meta, left, width, meta_fs, meta_lh, muted, font, min_h=12)
            placed = True
        if description:
            if placed:
                b.gap(SPACE_STACK)
            b.block(
                description, left, width, body_fs, body_lh, body_color, font, min_h=12
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


# ── template generators ──────────────────────────────────────────────────────

def _gen_finance(cv: dict) -> list[dict]:
    C = dict(ink="#16243A", sub="#5A6B7B", gray="#6B7280",
             gold="#B08D57", body="#2B2B2B")
    L, W = 50, 495
    lbl = _labels(cv)
    b = Builder(54)

    b.text(cv.get("name", ""), 30, "Times-Roman", C["ink"], L, bold=True); b.gap(4)
    b.text(cv.get("title", ""), 14, "Times-Roman", C["sub"], L); b.gap(4)
    b.text(_contact_line(cv), 9.5, "Inter", C["sub"], L); b.gap(8)
    b.line(L, W, 1.5, C["ink"]); b.gap(16)

    def section(label):
        b.text(label, 12, "Times-Roman", C["ink"], L, bold=True); b.gap(2)
        b.line(L, 70, 2, C["gold"]); b.gap(10)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, L, W, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, C, L, W, "Inter")

    return b.build()


_BANKING_THEMES = {
    "vault": {
        "paper": "#F3F3ED", "ink": "#143A32", "body": "#1E2A25",
        "muted": "#718279", "accent": "#B79A56", "rule": "#B7C4BB",
        "light": "#D7E2DB", "left": 54, "width": 487,
        "start": 278, "continuation": 64, "mark_x": 525,
    },
    "clearing": {
        "paper": "#FBFCFE", "ink": "#173F67", "body": "#203342",
        "muted": "#71869A", "accent": "#48B8C8", "rule": "#C8D6E1",
        "light": "#B9E8EB", "left": 164, "width": 377,
        "start": 202, "continuation": 60, "mark_x": 150,
    },
    "herald": {
        "paper": "#FCF8F0", "ink": "#312725", "body": "#312725",
        "muted": "#71645B", "accent": "#9D3341", "rule": "#CDBA97",
        "light": "#F6EBDC", "left": 70, "width": 455,
        "start": 354, "continuation": 66, "mark_x": 510,
    },
    "signal": {
        "paper": "#101C26", "ink": "#F2F7F6", "body": "#E4EFEE",
        "muted": "#9DB7C3", "accent": "#3BD2C7", "rule": "#395263",
        "light": "#7BE1D9", "left": 76, "width": 465,
        "start": 251, "continuation": 66, "mark_x": 525,
    },
}


def _banking_page_decorations(theme: str, page: int) -> list[dict]:
    """Return fixed paper, rails, and folios for one banking-template page."""
    C = _BANKING_THEMES[theme]
    paper = {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True}
    footer = {**_text(f"{page:02d}", 8, "Inter", C["muted"], 522, 800, page=page), "fixedToPage": True}

    if theme == "vault":
        return [
            paper,
            {**_line(0, 0, 595, 12, C["ink"], page=page), "fixedToPage": True},
            {**_line(54, 789, 487, 1, C["rule"], page=page), "fixedToPage": True},
            footer,
        ]
    if theme == "clearing":
        return [
            paper,
            {**_line(0, 0, 130, 842, C["ink"], page=page), "fixedToPage": True},
            {**_line(130, 0, 4, 842, C["accent"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(164, 789, 377, 1, C["rule"], page=page), "fixedToPage": True},
            footer,
        ]
    if theme == "herald":
        return [
            paper,
            {**_rect(24, 24, 547, 794, C["accent"], 1.1, page=page), "fixedToPage": True},
            {**_rect(31, 31, 533, 780, C["rule"], 0.8, page=page), "fixedToPage": True},
            footer,
        ]
    return [
        paper,
        {**_line(0, 0, 595, 5, C["accent"], page=page), "fixedToPage": True},
        {**_line(76, 789, 465, 1, C["rule"], page=page), "fixedToPage": True},
        footer,
    ]


def _gen_banking_theme(cv: dict, theme: str) -> list[dict]:
    """Generate a banking CV with a theme-specific header and resilient flow."""
    C = _BANKING_THEMES[theme]
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

    static: list[dict] = []
    if theme == "vault":
        node_a = {**_rect(54, 196, 143, 47, C["accent"], page=1), "id": "vault-marker-a"}
        node_b = {**_rect(226, 196, 143, 47, C["accent"], page=1), "id": "vault-marker-b"}
        node_c = {**_rect(398, 196, 143, 47, C["accent"], page=1), "id": "vault-marker-c"}
        static = [
            _line(0, 12, 595, 154, C["ink"], zIndex=1),
            _line(0, 166, 595, 6, C["accent"], zIndex=2),
            _rect(408, 34, 112, 104, C["accent"], 1.1, zIndex=3),
            _circle(430, 50, 70, C["paper"], borderWidth=1.1, zIndex=2),
            _ellipse(444, 72, 42, 26, C["accent"], filled=True, zIndex=2),
            _text(_compact_text(cv.get("name"), 30), 29, SERIF, "#FFFFFF", 52, 65, zIndex=2, bold=True),
            _text(_compact_text(cv.get("title"), 54), 9.3, SANS, C["light"], 54, 108, zIndex=2),
            _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, C["light"], 54, 132, zIndex=2),
            node_a, node_b, node_c,
            {"category": "connector", "source_id": "vault-marker-a", "target_id": "vault-marker-b",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            {"category": "connector", "source_id": "vault-marker-b", "target_id": "vault-marker-c",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            _text("RYZYKO", 7.4, SANS, C["muted"], 67, 207, zIndex=3),
            _text("KONTROLA", 13, SERIF, C["ink"], 67, 221, zIndex=3, bold=True),
            _text("KAPITAŁ", 7.4, SANS, C["muted"], 239, 207, zIndex=3),
            _text("WARTOŚĆ", 13, SERIF, C["ink"], 239, 221, zIndex=3, bold=True),
            _text("REPUTACJA", 7.4, SANS, C["muted"], 411, 207, zIndex=3),
            _text("ZAUFANIE", 13, SERIF, C["ink"], 411, 221, zIndex=3, bold=True),
        ]
        static[6]["letterSpacing"] = 1.2
    elif theme == "clearing":
        node_a = {**_circle(454, 59, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "clearing-node-a"}
        node_b = {**_circle(489, 59, 18, C["ink"], borderWidth=1.2, zIndex=2, page=1), "id": "clearing-node-b"}
        node_c = {**_circle(524, 59, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "clearing-node-c"}
        static = [
            _circle(38, 42, 52, C["accent"], borderWidth=1.2, zIndex=2),
            _ellipse(47, 57, 34, 18, C["accent"], filled=True, zIndex=2),
            _text("BANK", 8, SANS, C["light"], 42, 125, zIndex=2),
            _text("OPERACJE", 8, SANS, C["light"], 42, 144, zIndex=2),
            _line(34, 174, 64, 1, "#5F89AF"),
            _text("RYZYKO", 7.5, SANS, C["light"], 34, 202, zIndex=2),
            _text("PŁATNOŚCI", 7.5, SANS, C["light"], 34, 222, zIndex=2),
            _text("COMPLIANCE", 7.5, SANS, C["light"], 34, 242, zIndex=2),
            _rect(34, 690, 62, 62, "#5F89AF", page=1, zIndex=2),
            _circle(50, 706, 30, C["light"], borderWidth=1, zIndex=3),
            _text(_compact_text(cv.get("name"), 30), 27, SERIF, C["ink"], 164, 56, zIndex=2, bold=True),
            _text(_compact_text(cv.get("title"), 58), 9, SANS, "#24889A", 166, 99, zIndex=2),
            _block(_compact_text(_contact_line(cv), 78), 164, 127, 286, 30, 8.8, 12.5, C["muted"], SANS, zIndex=2),
            node_a, node_b, node_c,
            {"category": "connector", "source_id": "clearing-node-a", "target_id": "clearing-node-b",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            {"category": "connector", "source_id": "clearing-node-b", "target_id": "clearing-node-c",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        ]
        static[2]["letterSpacing"] = 1.5
        static[3]["letterSpacing"] = 1.5
        static[11]["letterSpacing"] = 1.4
    elif theme == "herald":
        node_a = {**_rect(122, 271, 70, 38, C["accent"], page=1, zIndex=2), "id": "herald-seal-a"}
        node_b = {**_rect(262, 271, 70, 38, C["rule"], page=1, zIndex=2), "id": "herald-seal-b"}
        node_c = {**_rect(402, 271, 70, 38, C["accent"], page=1, zIndex=2), "id": "herald-seal-c"}
        static = [
            _line(54, 52, 487, 3, C["accent"], zIndex=2),
            _line(54, 60, 487, 1, C["rule"]),
            _circle(267, 78, 60, C["accent"], borderWidth=1.1, zIndex=2),
            _ellipse(280, 99, 34, 18, C["rule"], filled=True, zIndex=2),
            _text(_compact_text(cv.get("name"), 30), 28, SERIF, C["ink"], 154, 152, zIndex=2, bold=True),
            _text(_compact_text(cv.get("title"), 56), 8.7, SANS, C["accent"], 172, 194, zIndex=2),
            _text(_compact_text(_contact_line(cv), 78), 8.6, SANS, C["muted"], 149, 218, zIndex=2),
            _line(54, 247, 487, 1, C["rule"]),
            node_a, node_b, node_c,
            {"category": "connector", "source_id": "herald-seal-a", "target_id": "herald-seal-b",
             "backgroundColor": C["rule"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            {"category": "connector", "source_id": "herald-seal-b", "target_id": "herald-seal-c",
             "backgroundColor": C["rule"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            _text("DYSKRECJA", 7.2, SANS, "#FFFFFF", 132, 283, zIndex=3),
            _text("STRATEGIA", 7.2, SANS, "#7A6045", 273, 283, zIndex=3),
            _text("PARTNERSTWO", 7.2, SANS, "#FFFFFF", 410, 283, zIndex=3),
        ]
        static[5]["letterSpacing"] = 1.5
    else:
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
            {"category": "connector", "source_id": "signal-node-a", "target_id": "signal-node-b",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
            {"category": "connector", "source_id": "signal-node-b", "target_id": "signal-node-c",
             "backgroundColor": C["accent"], "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
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
        b.text(label, 8.6, SANS, C["accent"] if theme != "signal" else C["light"], L)
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.7, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.7, C["body"], SANS)
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
                ink=C["ink"], muted=C["muted"], body=C["muted"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.2, 13.1, SANS) + SPACE_SECTION)
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.2, 13.1, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]}, L, W, SANS, fs=9.2, lh=13.1)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    decorations = [
        element
        for page in range(1, pages_used + 1)
        for element in _banking_page_decorations(theme, page)
    ]
    return decorations + static + flow


def _gen_vault(cv: dict) -> list[dict]:
    return _gen_banking_theme(cv, "vault")


def _gen_clearing(cv: dict) -> list[dict]:
    return _gen_banking_theme(cv, "clearing")


def _gen_herald(cv: dict) -> list[dict]:
    return _gen_banking_theme(cv, "herald")


def _gen_signal(cv: dict) -> list[dict]:
    return _gen_banking_theme(cv, "signal")


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
    b = Builder(180)

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
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10.2, 15, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.2, 15, INK, SANS)
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
                ink=NAVY, muted=SLATE, body=SLATE, font=SANS,
                degree_fs=10.6, degree_lh=13,
                meta_fs=9, meta_lh=11.5,
                body_fs=9, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.8, 14, SANS) + SPACE_SECTION)
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
        {"category": "connector", "source_id": "nimbus-mark-one", "target_id": "nimbus-mark-two",
         "backgroundColor": POWDER, "borderWidth": 1, "arrow": False, "zIndex": 1, "page": 1},
        {"category": "connector", "source_id": "nimbus-mark-two", "target_id": "nimbus-mark-three",
         "backgroundColor": POWDER, "borderWidth": 1, "arrow": False, "zIndex": 1, "page": 1},
    ]
    static[6]["letterSpacing"] = 1.5

    b = NimbusBuilder(248)

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
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10.1, 15, SANS) + SPACE_SECTION)
        section(lbl["summary"], decorated=False)
        b.block(cv["summary"], L, W, 10.1, 15, INK, SANS)
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
                ink=INK, muted=SLATE, body=SLATE, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS) + SPACE_SECTION)
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
        {"category": "connector", "source_id": "cinder-frame-one", "target_id": "cinder-frame-two",
         "backgroundColor": "#8B9094", "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        {"category": "connector", "source_id": "cinder-frame-one", "target_id": "cinder-node",
         "backgroundColor": RED, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
    ]
    header[3]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    b = Builder(205)

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
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10.2, 15, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.2, 15, CHARCOAL, SANS)
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
                ink=BLACK, muted=GRAPHITE, body=GRAPHITE, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS) + SPACE_SECTION)
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
        {"category": "connector", "source_id": "rift-node-one", "target_id": "rift-node-two",
         "backgroundColor": RED, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        {"category": "connector", "source_id": "rift-node-two", "target_id": "rift-node-three",
         "backgroundColor": GRAPHITE, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
    ]
    header[1]["letterSpacing"] = 1.7
    SECTION_CHROME = section_chrome_height(8.7)
    b = RiftBuilder(202)

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
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.5, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, BLACK, SANS)
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
                ink=BLACK, muted=GRAPHITE, body=GRAPHITE, font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.2, 13.2, SANS) + SPACE_SECTION)
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


def _gen_it_theme(cv: dict, theme: str) -> list[dict]:
    """Four distinct IT CV systems with shared safe, multi-page content flow."""
    themes = {
        "vector": {
            "asset": "vector-it-network.png",
            "left": 160, "width": 365, "start": 180, "continuation": 82,
            "ink": "#FFFFFF", "body": "#DCEBFA", "muted": "#95AFC5",
            "accent": "#26D8FF", "marker": "#B8EF4A", "rule": "#3C6682",
            "font": "Inter", "display": "Times-Roman",
        },
        "kernel": {
            "asset": "kernel-it-architecture.png",
            "left": 167, "width": 355, "start": 184, "continuation": 78,
            "ink": "#173A76", "body": "#253D54", "muted": "#526A83",
            "accent": "#2462B7", "marker": "#D69B22", "rule": "#ACC5D8",
            "font": "Inter", "display": "Times-Roman",
        },
        "relay": {
            "asset": "relay-it-signal.png",
            "left": 192, "width": 340, "start": 181, "continuation": 82,
            "ink": "#F7F6F1", "body": "#F7F6F1", "muted": "#92989C",
            "accent": "#F47B20", "marker": "#EE2525", "rule": "#596065",
            "font": "Inter", "display": "Inter",
        },
        "lattice": {
            "asset": "lattice-it-cloud.png",
            "left": 103, "width": 424, "start": 184, "continuation": 78,
            "ink": "#26336D", "body": "#2C3852", "muted": "#64708A",
            "accent": "#5B62BA", "marker": "#F37E71", "rule": "#B9C4DC",
            "font": "Inter", "display": "Times-Roman",
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw IT: {theme}")

    C = themes[theme]
    L, W = C["left"], C["width"]
    SANS, DISPLAY = C["font"], C["display"]
    lbl = _labels(cv)

    class TechBuilder(Builder):
        def need(self, h: float):
            if self.y + h > 746:
                self.pg += 1
                self.y = float(C["continuation"])

    def connector(source_id: str, target_id: str, color: str) -> dict:
        return {
            "category": "connector",
            "source_id": source_id,
            "target_id": target_id,
            "backgroundColor": color,
            "borderWidth": 1,
            "arrow": False,
            "zIndex": 3,
            "page": 1,
        }

    contact = _compact_text(_contact_line(cv), 78)
    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    header: list[dict]

    if theme == "vector":
        node_one = {**_circle(430, 53, 18, C["marker"], filled=True, zIndex=3), "id": "vector-node-one"}
        node_two = {**_ellipse(468, 54, 42, 18, C["accent"], borderWidth=1.2, zIndex=3), "id": "vector-node-two"}
        node_three = {**_circle(527, 53, 18, C["accent"], borderWidth=1.2, zIndex=3), "id": "vector-node-three"}
        header = [
            _line(133, 36, 2, 112, C["accent"], zIndex=3),
            _rect(412, 38, 137, 48, "#184568", 0.8, zIndex=2),
            _text(name, 31, DISPLAY, C["ink"], L, 48, zIndex=3, bold=True),
            _text(title, 9.2, SANS, C["accent"], L, 91, zIndex=3),
            _text(contact, 8.8, SANS, C["body"], L, 119, zIndex=3),
            node_one, node_two, node_three,
            connector("vector-node-one", "vector-node-two", C["marker"]),
            connector("vector-node-two", "vector-node-three", C["accent"]),
        ]
        header[2]["letterSpacing"] = 0.2
        header[3]["letterSpacing"] = 1.35
    elif theme == "kernel":
        orbit = {**_ellipse(435, 54, 75, 34, "#6FB9B4", borderWidth=1.2, zIndex=3), "id": "kernel-orbit"}
        core = {**_circle(456, 64, 15, C["marker"], filled=True, zIndex=3), "id": "kernel-core"}
        node = {**_circle(494, 64, 15, C["accent"], borderWidth=1.2, zIndex=3), "id": "kernel-node"}
        header = [
            _line(137, 48, 4, 104, C["ink"], zIndex=3),
            _rect(425, 42, 105, 52, C["rule"], 0.8, zIndex=2),
            _text(name, 30, DISPLAY, C["ink"], L, 51, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], L, 94, zIndex=3),
            _text(contact, 8.7, SANS, C["muted"], L, 121, zIndex=3),
            orbit, core, node,
            connector("kernel-core", "kernel-node", C["marker"]),
        ]
        header[2]["letterSpacing"] = 0.15
        header[3]["letterSpacing"] = 1.55
    elif theme == "relay":
        module_one = {**_rect(428, 51, 18, 18, C["marker"], 1.2, zIndex=3), "id": "relay-module-one"}
        module_two = {**_circle(471, 52, 18, C["accent"], filled=True, zIndex=3), "id": "relay-module-two"}
        module_three = {**_ellipse(511, 53, 28, 17, "#D6D9D9", borderWidth=1.1, zIndex=3), "id": "relay-module-three"}
        header = [
            _line(164, 43, 4, 106, C["marker"], zIndex=3),
            _rect(413, 40, 137, 49, "#3A3E42", 0.8, zIndex=2),
            _text(name, 30, DISPLAY, C["ink"], L, 49, zIndex=3, bold=True),
            _text(title, 8.7, "Courier", C["accent"], L, 91, zIndex=3),
            _text(contact, 8.5, SANS, "#D6D9D9", L, 119, zIndex=3),
            module_one, module_two, module_three,
            connector("relay-module-one", "relay-module-two", C["accent"]),
            connector("relay-module-two", "relay-module-three", "#D6D9D9"),
        ]
        header[2]["letterSpacing"] = 0.3
        header[3]["letterSpacing"] = 0.9
    else:
        orbit_one = {**_ellipse(411, 50, 53, 28, "#8587D8", borderWidth=1.2, zIndex=3), "id": "lattice-orbit-one"}
        orbit_two = {**_circle(434, 56, 16, "#8DE6ED", filled=True, zIndex=3), "id": "lattice-orbit-two"}
        orbit_three = {**_circle(491, 56, 16, C["marker"], filled=True, zIndex=3), "id": "lattice-orbit-three"}
        header = [
            _line(70, 44, 6, 112, C["ink"], zIndex=3),
            _rect(402, 42, 129, 51, C["rule"], 0.8, zIndex=2),
            _text(name, 29, DISPLAY, C["ink"], L, 50, zIndex=3, bold=True),
            _text(title, 8.8, SANS, C["accent"], L, 93, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], L, 121, zIndex=3),
            orbit_one, orbit_two, orbit_three,
            connector("lattice-orbit-one", "lattice-orbit-two", "#8DE6ED"),
            connector("lattice-orbit-two", "lattice-orbit-three", C["marker"]),
        ]
        header[2]["letterSpacing"] = 0.1
        header[3]["letterSpacing"] = 1.35

    SECTION_CHROME = section_chrome_height(8.5)
    title_fs = 11 if theme != "relay" else 10.8
    meta_fs = 8.7 if theme != "relay" else 8.6
    body_fs = 9.4 if theme != "relay" else 9.2
    body_lh = 13.3 if theme != "relay" else 13.1
    b = TechBuilder(C["start"])

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, title_fs, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, meta_fs, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, body_fs, body_lh, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.4, degree_lh=13,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        marker_y = b.y + 1
        if theme == "vector":
            b.els.extend([
                _ellipse(L - 27, marker_y, 13, 13, C["accent"], borderWidth=1.2, zIndex=3, page=b.pg),
                _circle(L - 23, marker_y + 4, 5, C["marker"], filled=True, zIndex=3, page=b.pg),
            ])
        elif theme == "kernel":
            b.els.extend([
                _circle(L - 24, marker_y + 1, 12, C["marker"], filled=True, zIndex=3, page=b.pg),
                _line(L - 8, marker_y + 7, 11, 1, C["accent"], zIndex=3, page=b.pg),
            ])
        elif theme == "relay":
            b.els.extend([
                _circle(L - 31, marker_y, 18, C["marker"], borderWidth=1.2, zIndex=3, page=b.pg),
                _rect(L - 25, marker_y + 6, 6, 6, C["accent"], 1, zIndex=3, page=b.pg),
            ])
        else:
            b.els.extend([
                _ellipse(L - 29, marker_y, 16, 16, "#8587D8", borderWidth=1.2, zIndex=3, page=b.pg),
                _circle(L - 25, marker_y + 4, 8, C["marker"], filled=True, zIndex=3, page=b.pg),
            ])
        b.text(label, 8.5 if theme != "relay" else 8.3,
               "Courier" if theme == "relay" else SANS, C["accent"], L)
        b.els[-1]["letterSpacing"] = 1.55 if theme != "relay" else 1.1
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.5, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, title_fs, 13.5, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, meta_fs, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, body_fs, body_lh, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]},
                        L, W, SANS, fs=body_fs, lh=body_lh)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["muted"], font=SANS,
                degree_fs=10.4, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.3, 13.3, SANS) + SPACE_SECTION)
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.3, 13.3, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]},
                    L, W, SANS, fs=9.3, lh=13.3)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image",
                "src": f"{BACKEND_URL}/template-assets/{C['asset']}",
                "width": 595,
                "height": 842,
                "left": 0,
                "top": 0,
                "zIndex": 0,
                "page": page,
                "fixedToPage": True,
            },
            {**_line(L, 784, W, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 797, 7, C["marker"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, "Courier" if theme == "relay" else SANS,
                     C["muted"], L + W - 15, 792, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_vector(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "vector")


def _gen_kernel(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "kernel")


def _gen_relay(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "relay")


def _gen_lattice(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "lattice")


def _gen_classic_theme(cv: dict, theme: str) -> list[dict]:
    """Image-free, single-column CVs inspired by impeccably edited Word files."""
    themes = {
        "scribe": {
            "paper": "#FBFAF6", "ink": "#1C2B3A", "accent": "#34516A",
            "muted": "#687782", "rule": "#C7CBC7",
            "left": 94, "width": 429, "start": 194, "continuation": 66,
        },
        "regent": {
            "paper": "#FCFBF8", "ink": "#24201E", "accent": "#733B43",
            "muted": "#756F6B", "rule": "#BFB4AA",
            "left": 113, "width": 386, "start": 193, "continuation": 66,
        },
        "aldine": {
            "paper": "#F8F4EC", "ink": "#2A3028", "accent": "#486151",
            "muted": "#79776E", "rule": "#D7CCB8",
            "left": 116, "width": 384, "start": 193, "continuation": 66,
        },
        "merit": {
            "paper": "#FAFAF8", "ink": "#262A31", "accent": "#4F6679",
            "muted": "#7F909C", "rule": "#CED4D5",
            "left": 102, "width": 418, "start": 193, "continuation": 66,
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw klasyczny: {theme}")

    C = themes[theme]
    L, W = C["left"], C["width"]
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class ClassicBuilder(Builder):
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = float(C["continuation"])

    def connector(source_id: str, target_id: str, color: str | None = None) -> dict:
        return {
            "category": "connector",
            "source_id": source_id,
            "target_id": target_id,
            "backgroundColor": color or C["accent"],
            "borderWidth": 0.8,
            "arrow": False,
            "zIndex": 3,
            "page": 1,
        }

    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    contact = _compact_text(_contact_line(cv), 78)

    if theme == "scribe":
        frame = {**_rect(461, 60, 58, 58, C["accent"], 0.9, zIndex=3), "id": "scribe-frame"}
        orbit = {**_ellipse(473, 70, 34, 17, C["accent"], borderWidth=0.9, zIndex=3), "id": "scribe-orbit"}
        seal = {**_circle(484, 91, 11, C["accent"], filled=True, zIndex=3), "id": "scribe-seal"}
        header = [
            _text(name, 30, SERIF, C["ink"], 72, 66, zIndex=3, bold=True),
            _text(title, 9.2, SANS, C["accent"], 74, 106, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 74, 132, zIndex=3),
            _line(72, 157, 451, 1, C["rule"], zIndex=2),
            frame, orbit, seal,
            connector("scribe-frame", "scribe-orbit", C["rule"]),
            connector("scribe-orbit", "scribe-seal"),
        ]
        header[0]["letterSpacing"] = 0.15
        header[1]["letterSpacing"] = 1.25
    elif theme == "regent":
        square = {**_rect(442, 57, 57, 57, C["accent"], 0.9, zIndex=3), "id": "regent-square"}
        signet = {**_circle(458, 73, 25, C["accent"], borderWidth=1.1, zIndex=3), "id": "regent-signet"}
        rule = {**_ellipse(451, 91, 39, 13, "#A66B5B", borderWidth=0.8, zIndex=3), "id": "regent-rule"}
        header = [
            _text(name, 29, SERIF, C["ink"], 88, 67, zIndex=3, bold=True),
            _text(title, 8.8, SANS, C["accent"], 90, 107, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 90, 133, zIndex=3),
            _line(88, 158, 411, 1, C["rule"], zIndex=2),
            square, signet, rule,
            connector("regent-square", "regent-signet", C["rule"]),
            connector("regent-signet", "regent-rule", "#A66B5B"),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.45
    elif theme == "aldine":
        seal = {**_circle(446, 61, 48, C["accent"], borderWidth=1, zIndex=3), "id": "aldine-seal"}
        lozenge = {**_ellipse(458, 76, 24, 10, "#788068", borderWidth=0.9, zIndex=3), "id": "aldine-lozenge"}
        core = {**_circle(465, 93, 10, C["accent"], filled=True, zIndex=3), "id": "aldine-core"}
        frame = {**_rect(437, 52, 66, 66, C["rule"], 0.7, zIndex=3), "id": "aldine-frame"}
        header = [
            _text(name, 30, SERIF, C["ink"], 92, 66, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], 94, 106, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 94, 132, zIndex=3),
            _line(92, 157, 408, 1, C["rule"], zIndex=2),
            seal, lozenge, core, frame,
            connector("aldine-frame", "aldine-seal", C["rule"]),
            connector("aldine-lozenge", "aldine-core"),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.4
    else:
        panel = {**_rect(452, 58, 67, 58, C["accent"], 0.8, zIndex=3), "id": "merit-panel"}
        capsule = {**_ellipse(462, 69, 47, 18, C["accent"], borderWidth=1, zIndex=3), "id": "merit-capsule"}
        dot_one = {**_circle(476, 93, 12, C["accent"], filled=True, zIndex=3), "id": "merit-dot-one"}
        dot_two = {**_circle(497, 93, 12, C["muted"], borderWidth=1, zIndex=3), "id": "merit-dot-two"}
        header = [
            _text(name, 30, SERIF, C["ink"], 77, 68, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], 79, 108, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 79, 134, zIndex=3),
            _line(77, 159, 443, 1, C["rule"], zIndex=2),
            panel, capsule, dot_one, dot_two,
            connector("merit-panel", "merit-capsule", C["rule"]),
            connector("merit-dot-one", "merit-dot-two"),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.45

    b = ClassicBuilder(C["start"])

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
            meta_fs=8.5, meta_lh=11.5,
            body_fs=8.5, body_lh=11.5,
        )

    # Heading label + rule + after-rule gap. Callers reserve this together with
    # the first body block so section titles are never stranded above the footer.
    SECTION_CHROME = section_chrome_height(8.4)

    def section(label: str) -> None:
        marker_y = b.y + 1
        if theme == "scribe":
            b.els.append(_circle(L - 22, marker_y + 1, 8, C["accent"], filled=True, zIndex=3, page=b.pg))
        elif theme == "regent":
            b.els.append(_rect(L - 25, marker_y + 1, 8, 8, C["accent"], 0.9, zIndex=3, page=b.pg))
        elif theme == "aldine":
            b.els.append(_circle(L - 22, marker_y + 1, 7, C["accent"], filled=True, zIndex=3, page=b.pg))
        else:
            b.els.append(_ellipse(L - 26, marker_y, 13, 13, C["accent"], borderWidth=0.9, zIndex=3, page=b.pg))
        b.text(label, 8.4, SANS, C["accent"], L)
        b.els[-1]["letterSpacing"] = 1.6 if label != lbl["skills"] else 1.35
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.5, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, C["ink"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            # Keep title/meta/bullets as one record so page breaks never split
            # a role across the footer chrome.
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 10.8, 13.5, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.6, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.3, 13.2, C["ink"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["ink"]},
                        L, W, SANS, fs=9.3, lh=13.2)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["muted"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.5, meta_lh=11.5,
                body_fs=8.5, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.1, 13, SANS) + SPACE_SECTION)
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.1, 13, C["ink"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["ink"]},
                    L, W, SANS, fs=9.1, lh=13)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])

    def page_frame(page: int) -> tuple[dict, ...]:
        if theme == "scribe":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_rect(30, 28, 535, 786, C["rule"], 0.8, page=page), "fixedToPage": True},
                {**_rect(38, 36, 519, 770, "#E7E6DF", 0.5, page=page), "fixedToPage": True},
            )
        if theme == "regent":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(46, 36, 3, 770, C["accent"], page=page), "fixedToPage": True},
                {**_rect(56, 36, 483, 770, C["rule"], 0.75, page=page), "fixedToPage": True},
            )
        if theme == "aldine":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_rect(29, 29, 537, 784, C["rule"], 0.7, page=page), "fixedToPage": True},
                {**_line(71, 36, 1, 770, "#E3D9C9", page=page), "fixedToPage": True},
                {**_line(523, 36, 1, 770, "#E3D9C9", page=page), "fixedToPage": True},
            )
        return (
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_rect(35, 34, 525, 774, C["rule"], 0.7, page=page), "fixedToPage": True},
            {**_line(35, 34, 525, 3, C["accent"], zIndex=2, page=page), "fixedToPage": True},
        )

    footer_left = 72 if theme == "scribe" else 88 if theme == "regent" else 92 if theme == "aldine" else 77
    footer_width = 451 if theme == "scribe" else 411 if theme == "regent" else 408 if theme == "aldine" else 443
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            *page_frame(page),
            {**_line(footer_left, 783, footer_width, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(footer_left, 796, 6, C["accent"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["muted"], footer_left + footer_width - 15, 791,
                     zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_scribe(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "scribe")


def _gen_regent(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "regent")


def _gen_aldine(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "aldine")


def _gen_merit(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "merit")


def _gen_nocturne(cv: dict) -> list[dict]:
    C = dict(ink="#1F2933", coral="#F25F4C", gray="#6B7280", body="#1F2933")
    L, W = 50, 495
    lbl = _labels(cv)
    static = [
        _line(0, 0, 595, 160, "#1F2933", zIndex=0),
        _line(L, 120, 56, 4, C["coral"], zIndex=1),
        _text(cv.get("name", ""), 32, "Inter", "#FFFFFF", L, 56, zIndex=2, bold=True),
        _text(cv.get("title", ""), 14, "Inter", C["coral"], L, 96, zIndex=2),
        _text(_contact_line(cv), 9.5, "Inter", "#AEB6BD", L, 132, zIndex=2),
    ]
    b = Builder(192)

    def section(label):
        b.text(label, 12, "Inter", C["ink"], L, bold=True); b.gap(2)
        b.line(L, 40, 2, C["coral"]); b.gap(10)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, L, W, "Inter")

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, C, L, W, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    return static + b.build()


def _gen_ampersand(cv: dict) -> list[dict]:
    C = dict(ink="#2A2320", wine="#7B2D3A", gray="#8A7F78",
             rule="#E0D7D1", body="#3A332E")
    L, W = 50, 497
    S = "Times-Roman"
    lbl = _labels(cv)
    static = [
        _line(0, 0, 9, 842, C["wine"], zIndex=0),
        _text(cv.get("name", ""), 31, S, C["ink"], L, 58, bold=True),
        _text(cv.get("title", ""), 14, S, C["wine"], L, 98, italic=True),
        _text(_contact_line(cv), 9.5, S, C["gray"], L, 122),
        _line(L, 140, W, 1, C["rule"]),
    ]
    b = Builder(158)

    def section(label):
        b.text(label, 12, S, C["ink"], L, bold=True); b.gap(2)

    section(lbl["summary"])
    b.block(cv.get("summary", ""), L, W, 11, 16, C["body"], S); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11.5, S, C["ink"], L, bold=True); b.gap(2)
            b.text(job.get("period", ""), 9.5, S, C["gray"], L, italic=True); b.gap(2)
            company = job.get("company", "")
            if company:
                b.text(company, 9.5, S, C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10.5, 15, C["body"], S, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, L, W, S, fs=10.5, lh=15)

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font=S,
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10.5, 15, C["body"], S); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, C, L, W, S, fs=10.5, lh=15)

    return static + b.build()


def _gen_education(cv: dict) -> list[dict]:
    C = dict(ink="#2E2A25", sage="#4E7A6B", flank="#CBB89E",
             frame="#D8CDBA", gray="#6B7280", body="#2B2B2B")
    L, W = 55, 485
    S = "Times-Roman"
    lbl = _labels(cv)
    static = [
        _line(28, 28, 539, 1, C["frame"]),
        _line(28, 813, 539, 1, C["frame"]),
        _line(28, 28, 1, 786, C["frame"]),
        _line(566, 28, 1, 786, C["frame"]),
        _text(cv.get("name", "").upper(), 28, S, C["ink"], 55, 52, bold=True),
        _text(cv.get("title", ""), 13, S, C["sage"], 55, 92),
        _text(_contact_line(cv), 9.5, "Inter", C["gray"], 55, 116),
        _line(248, 138, 100, 1.5, C["sage"]),
    ]
    b = Builder(158)

    def section(label):
        b.need(30)
        b.text(label, 12, S, C["ink"], L, bold=True)
        y_rule = b.y - 8
        b.els.append(_line(90, y_rule, 150, 1, C["flank"], page=b.pg))
        b.els.append(_line(355, y_rule, 150, 1, C["flank"], page=b.pg))
        b.gap(4)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, L, W, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, C, L, W, "Inter")

    return static + b.build()


def _gen_it(cv: dict) -> list[dict]:
    C = dict(teal="#2BB3C0", white="#FFFFFF", light="#C9D8DA",
             mute="#9FB8BC", ink="#1F2937", gray="#6B7280", body="#3A4753")
    SB, ML, MW = 190, 220, 330
    lbl = _labels(cv)

    sidebar_bg  = _line(0, 0, SB, 842, "#0F2A33", zIndex=0)
    photo_frame = _line(43, 38, 104, 104, C["teal"], zIndex=1)
    photo_inner = _line(45, 40, 100, 100, "#14333D", zIndex=2)
    photo_label = _text("ZDJĘCIE", 10, "Inter", "#6E8C92", 78, 84, zIndex=3)

    # sidebar contact label (localized)
    contact_label = (cv.get("labels") or {}).get("contact", "KONTAKT").upper()
    skills_label  = lbl["skills"]

    static = [sidebar_bg, photo_frame, photo_inner, photo_label,
              _text(cv.get("name", ""), 18, "Inter", C["white"], 28, 158, zIndex=3, bold=True),
              _text(cv.get("title", ""), 11, "Inter", C["teal"], 28, 184, zIndex=3),
              _text(contact_label, 10, "Inter", C["mute"], 28, 218, zIndex=3, bold=True),
              _line(28, 232, 40, 2, C["teal"], zIndex=3)]

    contact_text = "\n".join(filter(None, [cv.get("email"), cv.get("phone"), cv.get("location")]))
    static.append(_block(contact_text, 28, 242, 148, max(len(contact_text.splitlines()) * 15, 45),
                         9, 15, C["light"], "Inter", zIndex=3))

    skills_y = 320
    static.append(_text(skills_label, 10, "Inter", C["mute"], 28, skills_y, zIndex=3, bold=True))
    static.append(_line(28, skills_y + 13, 40, 2, C["teal"], zIndex=3))
    skills_text = "\n".join(cv.get("skills", []))
    static.append(_block(skills_text, 28, skills_y + 23,
                         148, max(len(cv.get("skills", [])) * 16, 60),
                         9, 16, C["light"], "Inter", zIndex=3))

    b = Builder(48)

    def section(label):
        b.need(30)
        b.text(label, 12, "Inter", C["ink"], ML, bold=True); b.gap(2)
        b.els[-1]["left"] = ML
        b.els.append(_line(ML, b.y - 2, 60, 2, C["teal"], page=b.pg))
        b.gap(10)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], ML, MW, 10.5, 15, C["body"], "Inter"); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], ML); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, ML, MW, 10, 14, C["body"], "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, ML, MW, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, ML, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    _extra_sections(b, cv, "after_skills", section, C, ML, MW, "Inter")

    return static + b.build()


def _gen_blueprint(cv: dict) -> list[dict]:
    C = dict(ink="#1A2530", blue="#2B6CB0", gray="#6B7280",
             body="#3A4753", div="#D8DEE4")
    ML, MW = 225, 320
    lbl = _labels(cv)
    skills_label = lbl["skills"]

    static = [
        _text(cv.get("name", ""), 30, "Inter", C["ink"], 50, 56, bold=True),
        _text("// " + cv.get("title", ""), 12, "Courier", C["blue"], 50, 94),
        _text(_contact_line(cv), 9.5, "Inter", C["gray"], 50, 118),
        _line(50, 138, 495, 1.5, C["ink"]),
        _line(205, 160, 1, 645, C["div"]),
        _text("KONTAKT", 10, "Courier", C["blue"], 50, 176, bold=True),
    ]

    contact_text = "\n".join(filter(None, [cv.get("email"), cv.get("phone"), cv.get("location")]))
    static.append(_block(contact_text, 50, 196, 148,
                         max(len(contact_text.splitlines()) * 13, 40), 8.5, 13, C["body"], "Inter"))

    skills_y = 290
    static.append(_text(skills_label, 10, "Courier", C["blue"], 50, skills_y, bold=True))
    skills_text = "\n".join(cv.get("skills", []))
    static.append(_block(skills_text, 50, skills_y + 14, 148,
                         max(len(cv.get("skills", [])) * 15, 50), 9, 15, C["body"], "Inter"))

    b = Builder(176)

    def section(label):
        b.need(30)
        b.text(label, 10, "Courier", C["blue"], ML, bold=True); b.gap(10)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], ML); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, ML, MW, 10, 14, C["body"], "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, C, ML, MW, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, ML, W,
                ink=C["ink"], muted=C["gray"], body=C["gray"], font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    _extra_sections(b, cv, "after_skills", section, C, ML, MW, "Inter")

    return static + b.build()


def _gen_monolith(cv: dict) -> list[dict]:
    """Stark black / white / grayscale. Left 4 px bar before every section heading."""
    K, MG, LG, VLG = "#0A0A0A", "#777777", "#AAAAAA", "#DDDDDD"
    L, W = 50, 495
    lbl = _labels(cv)
    b = Builder(54)

    b.text(cv.get("name", ""), 32, "Inter", K, L, bold=True); b.gap(4)
    b.text(cv.get("title", ""), 13, "Inter", MG, L, italic=True); b.gap(4)
    b.text(_contact_line(cv), 9.5, "Inter", LG, L); b.gap(8)
    b.line(L, W, 0.5, "#444444"); b.gap(16)

    def section(label):
        b.need(30)
        # 4 px black bar at current y — line doesn't advance b.y
        b.els.append(_line(L, b.y, 4, 12, K, zIndex=2, page=b.pg))
        b.text(label, 11, "Inter", K, 68, bold=True); b.gap(6)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, MG, "Inter"); b.gap(14)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", K, L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", MG, L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, MG, "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": MG}, L, W, "Inter", fs=10, lh=14)

    if cv.get("education"):
        b.need(50)
        b.els.append(_line(L, b.y, W, 0.5, VLG, page=b.pg)); b.gap(14)
        section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=K, muted=MG, body=MG, font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(44)
        b.els.append(_line(L, b.y, W, 0.5, VLG, page=b.pg)); b.gap(14)
        section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, MG, "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": MG}, L, W, "Inter", fs=10, lh=15)
    return b.build()


def _gen_prism(cv: dict) -> list[dict]:
    """Colourful & artistic. Purple header band + rotating accent squares per section."""
    PURPLE  = "#6B21A8"
    TEAL    = "#0D9488"
    ORANGE  = "#F26B2E"
    MAGENTA = "#D63384"
    COLORS  = [ORANGE, TEAL, PURPLE, MAGENTA, "#F59E0B"]
    INK, GRAY = "#1A1A1A", "#6B7280"
    L, W = 50, 495
    lbl = _labels(cv)

    static = [
        _line(0, 0, 595, 118, PURPLE, zIndex=0),
        _line(0, 118, 595, 6, TEAL,   zIndex=1),
        _line(0, 124, 595, 3, ORANGE, zIndex=1),
        _text(cv.get("name", ""), 30, "Inter", "#FFFFFF", L, 38, bold=True),
        _text(cv.get("title", ""), 13, "Inter", "#E9D5FF", L, 80, italic=True),
    ]

    b = Builder(148)
    col = [0]   # mutable colour-cycle index

    def section(label):
        b.need(30)
        c = COLORS[col[0] % len(COLORS)]; col[0] += 1
        # coloured square at current y — does not advance b.y
        b.els.append(_line(L, b.y + 1, 10, 10, c, zIndex=2, page=b.pg))
        b.text(label, 12, "Inter", INK, 68, bold=True); b.gap(8)

    b.text(_contact_line(cv), 9.5, "Inter", "#9CA3AF", L); b.gap(8)
    b.line(L, W, 1.5, ORANGE); b.gap(16)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, GRAY, "Inter"); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", INK, L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", GRAY, L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, GRAY, "Inter", bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": GRAY}, L, W, "Inter")

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=GRAY, body=GRAY, font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, GRAY, "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": GRAY}, L, W, "Inter")
    return static + b.build()


def _gen_aria(cv: dict) -> list[dict]:
    """Ultra-minimalist. No coloured accents. Hierarchy comes from size only.
    The name is deliberately large and regular-weight; section headings are
    smaller than body text with generous whitespace above and below."""
    INK, MID, SOFT = "#1A1A1A", "#666666", "#BBBBBB"
    L, W = 50, 495
    lbl = _labels(cv)
    b = Builder(60)

    # Name: large, NOT bold — that's the signature of this template
    b.text(cv.get("name", ""), 36, "Inter", INK, L); b.gap(4)
    b.text(cv.get("title", ""), 12, "Inter", MID, L, italic=True); b.gap(4)
    b.text(_contact_line(cv), 9, "Inter", MID, L); b.gap(10)
    b.line(L, W, 0.5, SOFT); b.gap(26)

    def section(label):
        b.need(40)
        # very small heading, then a hairline rule below
        b.text(label, 9, "Inter", MID, L); b.gap(2)
        b.line(L, W, 0.5, SOFT); b.gap(14)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 16, MID, "Inter"); b.gap(24)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(60)
            b.text(job.get("title", ""), 11, "Inter", INK, L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", MID, L); b.gap(4)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10.5, 16, MID, "Inter", bulletList=True)
            b.gap(16)
        _extra_sections(b, cv, "after_experience", section, {"body": MID}, L, W, "Inter", fs=10.5, lh=16)

    if cv.get("education"):
        b.gap(8); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MID, body=MID, font="Inter",
                mode="text",
                degree_fs=11, meta_fs=9.5, body_fs=9.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.gap(8); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10.5, 16, MID, "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": MID}, L, W, "Inter", fs=10.5, lh=16)
    return b.build()


def _gen_sterling(cv: dict) -> list[dict]:
    """Engraved share-certificate finance CV (mirrors templates/sterling.js):
    double outline frame on EVERY page, centered serif header, a row of
    outlined KPI stat boxes derived from the data, outline-square section
    markers. Navy/steel blues over cool greys."""
    NAVY, ACCENT, STEEL = "#1B2A41", "#2E5E9E", "#7C8CA0"
    GRAY, PALE, BODY = "#66707E", "#D9E0E9", "#33404F"
    S, I = "Times-Roman", "Inter"
    L, W = 55, 485
    lbl = _labels(cv)

    # ---- centered header (align-center textareas: exact on canvas + PDF) ----
    static = [
        _block((cv.get("name") or "").upper(), 50, 56, 495, 36, 28, 34, NAVY, S,
               bold=True, align="center"),
        _block((cv.get("title") or "").upper(), 50, 96, 495, 18, 12, 16, ACCENT, I,
               align="center"),
        _block(_contact_line(cv), 50, 120, 495, 14, 9.5, 13, GRAY, I, align="center"),
        # ornament: accent bar flanked by outline squares
        _rect(255, 139, 8, 8, STEEL, 1),
        _line(271, 142, 53, 2, ACCENT),
        _rect(332, 139, 8, 8, STEEL, 1),
    ]
    static[1]["letterSpacing"] = 2  # engraved small-caps tracking on the title

    # ---- KPI stat boxes derived from the data ----
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
        static.append(_rect(left, 160, 157, 52, STEEL, 1.2))
        static.append(_block(figure, left, 168, 157, 18, 15, 18, NAVY, S,
                             bold=True, align="center"))
        lab = _block(label, left, 190, 157, 12, 7.5, 10, GRAY, I, align="center")
        lab["letterSpacing"] = 1
        static.append(lab)

    # ---- flowing sections ----
    b = Builder(244)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (11 * 1.35) + SPACE_STACK + (9 * 1.35) + SPACE_STACK
        if bullets:
            height += b.measure_block(bullets, W, 10, 14, I, bulletList=True)
        return height

    def section(label):
        b.need(34)
        b.els.append(_rect(L, b.y + 2, 9, 9, ACCENT, 1.5, zIndex=2, page=b.pg))
        b.text(label, 11.5, S, NAVY, 72, bold=True)
        b.els.append(_line(L, b.y - 2, W, 1, PALE, page=b.pg))
        b.gap(8)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, BODY, I); b.gap(SPACE_SECTION)

    if exp:
        section(lbl["experience"])
        for index, job in enumerate(exp):
            b.need(experience_height(job))
            b.text(job.get("title", ""), 11, I, NAVY, L, bold=True); b.gap(SPACE_STACK)
            b.text(_company_period(job), 9, I, GRAY, L); b.gap(SPACE_STACK)
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
                ink=NAVY, muted=GRAY, body=GRAY, font=I,
                mode="text",
                degree_fs=10.5, meta_fs=9, body_fs=9,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if skills:
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(skills), L, W, 10, 15, BODY, I); b.gap(SPACE_SECTION)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, I)

    flow = b.build()

    # ---- engraved double frame on every page used ----
    pages_used = max([e.get("page", 1) for e in static + flow] or [1])
    frames = []
    for p in range(1, pages_used + 1):
        frames.append({**_rect(24, 24, 547, 794, STEEL, 1.5, page=p), "fixedToPage": True})
        frames.append({**_rect(29, 29, 537, 784, PALE, 1, page=p), "fixedToPage": True})

    return frames + static + flow


def _gen_solstice(cv: dict) -> list[dict]:
    """Art-deco CV with a midnight sidecar and sun-gold geometric details."""
    MIDNIGHT, SUN, CREAM = "#17283C", "#D99A32", "#F8F1E4"
    INK, MIST = "#26323B", "#697682"
    SERIF, SANS = "Times-Roman", "Inter"
    SIDE, L, W = 184, 224, 316
    lbl = _labels(cv)

    contact = _compact_lines(
        [cv.get("email"), cv.get("phone"), cv.get("location")],
        max_items=3,
        chars_per_item=24,
    )
    skills_preview = _compact_lines(
        cv.get("skills") or [],
        max_items=4,
        chars_per_item=18,
    )
    name = _compact_text(cv.get("name"), 22).upper()
    title = _compact_text(cv.get("title"), 48).upper()
    static = [
        _rect(36, 42, 112, 112, SUN, 1.2, zIndex=2),
        _rect(43, 49, 98, 98, CREAM, 1, zIndex=2),
        _block("CV", 43, 74, 98, 28, 23, 28, MIDNIGHT, SERIF, zIndex=3, bold=True, align="center"),
        _block("SOLSTICE", 43, 110, 98, 14, 8, 10, MIDNIGHT, SANS, zIndex=3, align="center"),
        _block(name, L, 50, W, 34, 25, 28, MIDNIGHT, SERIF, bold=True),
        _block(title, L + 2, 94, W - 2, 24, 9.5, 12, SUN, SANS),
        _line(L, 126, W, 1.5, MIDNIGHT),
        _line(L, 132, 104, 2, SUN),
        _text("KONTAKT", 9, SANS, SUN, 36, 196),
        _line(36, 211, 76, 1, "#5D6E7D", zIndex=2),
        _block(contact, 36, 226, 112, 56, 8.2, 13, "#E9E5DE", SANS),
        _text("SPECJALIZACJE", 9, SANS, SUN, 36, 342),
        _line(36, 357, 76, 1, "#5D6E7D", zIndex=2),
        _block(skills_preview, 36, 372, 112, 64, 8.4, 13, "#E9E5DE", SANS),
    ]
    b = Builder(162)

    def section(label):
        b.need(34)
        b.els.append(_line(L, b.y + 6, 32, 2, SUN, page=b.pg))
        b.text(label, 11, SANS, MIDNIGHT, L + 42, bold=True)
        b.els.append(_line(L + 42, b.y - 1, 274, 0.75, "#D8D1C5", page=b.pg))
        b.gap(8)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, MIST, SANS); b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(80)
            b.block(job.get("title", ""), L, W, 11.2, 14, INK, SANS, bold=True, min_h=16); b.gap(1)
            b.block(_company_period(job), L, W, 9.2, 12, MIST, SANS, min_h=13); b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 10, 14, INK, SANS, bulletList=True)
            b.gap(13)
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS)

    if cv.get("education"):
        b.need_section(section_chrome_height(11), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MIST, body=MIST, font=SANS,
                degree_fs=10.5, degree_lh=13,
                meta_fs=9.2, meta_lh=12,
                body_fs=9.2, body_lh=12,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(42); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 14, INK, SANS); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    sidecars = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            _line(0, 0, SIDE, A4_H, MIDNIGHT, zIndex=0, page=page),
            _line(SIDE, 0, 8, A4_H, SUN, zIndex=1, page=page),
        )
    ]
    return sidecars + static + flow


def _gen_mistral(cv: dict) -> list[dict]:
    """Coastal editorial CV with a sea-glass side column and calm masthead."""
    DEEP, SEA, FOAM = "#173F4C", "#4D9AA6", "#E8F0ED"
    PAPER, INK, DRIFT = "#FBFAF5", "#29363A", "#748184"
    SERIF, SANS = "Times-Roman", "Inter"
    SIDEBAR, L, W = 164, 204, 340
    lbl = _labels(cv)

    profile_preview = _compact_text(cv.get("summary"), 125)
    skills_preview = _compact_lines(
        cv.get("skills") or [],
        max_items=4,
        chars_per_item=18,
    )
    contact = _compact_text(_contact_line(cv), 76)
    name = _compact_text(cv.get("name"), 26).upper()
    title = _compact_text(cv.get("title"), 52)
    static = [
        _line(0, 0, 595, 150, DEEP, zIndex=1),
        _line(0, 150, 595, 7, SEA, zIndex=1),
        _rect(48, 42, 88, 58, FOAM, 1, zIndex=2),
        _block("MISTRAL", 48, 57, 88, 14, 8.5, 11, DEEP, SANS, zIndex=3, align="center"),
        _line(62, 80, 60, 1, SEA, zIndex=3),
        _block(name, 188, 36, 356, 30, 24, 27, "#FFFFFF", SERIF, bold=True),
        _block(title, 190, 78, 350, 24, 10.5, 12, "#CBE3DF", SANS, italic=True),
        _block(contact, 190, 112, 350, 18, 8.4, 10, "#B4D5D0", SANS),
        _text("PROFIL", 8.5, SANS, SEA, 48, 198),
        _line(48, 213, 104, 1, "#C7D7D4"),
        _block(profile_preview, 48, 222, 104, 92, 8.8, 13, INK, SANS),
        _text("UMIEJĘTNOŚCI", 8.5, SANS, SEA, 48, 364),
        _line(48, 379, 104, 1, "#C7D7D4"),
        _block(skills_preview, 48, 388, 104, 64, 8.4, 13, INK, SANS),
    ]
    b = Builder(194)

    def section(label):
        b.need(34)
        b.els.append(_line(188, b.y + 4, 5, 16, SEA, zIndex=2, page=b.pg))
        b.text(label, 10.5, SANS, DEEP, L, bold=True)
        b.els.append(_line(L, b.y + 2, W, 0.75, "#D9E1DE", page=b.pg))
        b.gap(10)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14, INK, SANS); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(80)
            b.block(job.get("title", ""), L, W, 11.2, 14, INK, SANS, bold=True, min_h=16); b.gap(1)
            b.block(_company_period(job), L, W, 9.2, 12, DRIFT, SANS, min_h=13); b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 10, 14, INK, SANS, bulletList=True)
            b.gap(13)
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS)

    if cv.get("education"):
        b.need_section(section_chrome_height(11), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=DRIFT, body=DRIFT, font=SANS,
                degree_fs=10.5, degree_lh=13,
                meta_fs=9.2, meta_lh=12,
                body_fs=9.2, body_lh=12,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 14, INK, SANS); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    scaffolding = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            _line(0, 0, 595, A4_H, PAPER, zIndex=0, page=page),
            _line(SIDEBAR, 176 if page == 1 else 0, 1, A4_H - (176 if page == 1 else 0), "#C7D7D4", zIndex=1, page=page),
        )
    ]
    return scaffolding + static + flow


def _gen_axiom(cv: dict) -> list[dict]:
    """Architectural one-column CV with nested outline frames and square markers."""
    INK, ACCENT, SLATE = "#182A33", "#0D6E72", "#60757B"
    PALE, BODY = "#C8D7D6", "#2E3E44"
    SANS, SERIF = "Inter", "Times-Roman"
    L, W = 64, 467
    lbl = _labels(cv)
    name = _compact_text(cv.get("name"), 30).upper()
    title = _compact_text(cv.get("title"), 58).upper()
    contact = _compact_text(_contact_line(cv), 88)

    static = [
        _rect(44, 44, 507, 120, INK, 1.2),
        _rect(56, 56, 38, 38, ACCENT, 1.4),
        _rect(64, 64, 22, 22, PALE, 0.9),
        _text("01", 8, SANS, ACCENT, 68, 71),
        _block(name, 112, 66, 400, 30, 25, 28, INK, SERIF, bold=True),
        _block(title, 114, 102, 398, 16, 8.8, 10, ACCENT, SANS),
        _block(contact, 114, 132, 398, 14, 8.5, 10, SLATE, SANS),
        _line(112, 151, 400, 1, PALE),
    ]
    static[5]["letterSpacing"] = 1.35
    b = Builder(188)

    def section(label):
        b.need(34)
        b.els.append(_rect(L, b.y + 1, 18, 18, ACCENT, 1.4, zIndex=1, page=b.pg))
        b.text(label, 11, SANS, INK, L + 32, bold=True)
        b.els.append(_line(L + 32, b.y - 1, W - 32, 0.75, PALE, page=b.pg))
        b.gap(8)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.4, 15, BODY, SANS); b.gap(16)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(78)
            b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15); b.gap(1)
            b.block(_company_period(job), L, W, 9, 11.5, SLATE, SANS, min_h=12); b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 9.8, 13.5, BODY, SANS, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=9.8, lh=13.5)

    if cv.get("education"):
        b.need_section(section_chrome_height(11), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=SLATE, body=SLATE, font=SANS,
                degree_fs=10.6, degree_lh=13,
                meta_fs=9, meta_lh=11.5,
                body_fs=9, body_lh=11.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, BODY, SANS); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS, fs=10, lh=15)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    frames = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            _rect(22, 22, 551, 798, "#8EA3A2", 1.25, page=page),
            _rect(30, 30, 535, 782, PALE, 0.75, page=page),
        )
    ]
    return frames + static + flow


def _gen_vellum(cv: dict) -> list[dict]:
    """Warm editorial one-column CV with transparent outlined content panels."""
    INK, WINE, CLAY = "#312724", "#7C3B42", "#B8765A"
    SAND, GRAY, BODY = "#DCCFC0", "#786E68", "#493D37"
    SERIF, SANS = "Times-Roman", "Inter"
    L, W = 60, 475
    lbl = _labels(cv)
    name = _compact_text(cv.get("name"), 32).upper()
    title = _compact_text(cv.get("title"), 54).upper()
    contact = _compact_text(_contact_line(cv), 82)

    static = [
        _rect(60, 54, 475, 106, CLAY, 1.15),
        _rect(70, 64, 455, 86, SAND, 0.75),
        _block(name, 70, 72, 455, 30, 26, 30, INK, SERIF,
               bold=True, align="center"),
        _block(title, 70, 108, 455, 14, 9.5, 12, WINE, SANS,
               align="center"),
        _block(contact, 70, 132, 455, 14, 9, 12, GRAY, SANS, align="center"),
    ]
    static[3]["letterSpacing"] = 1.45
    b = Builder(186)

    def section(label):
        b.need(40)
        b.els.append(_rect(L, b.y, W, 26, CLAY, 1, zIndex=1, page=b.pg))
        b.text(label, 11, SANS, WINE, L + 16, bold=True)
        b.gap(14)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.3, 15, BODY, SANS); b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(78)
            b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15); b.gap(1)
            b.block(_company_period(job), L, W, 9, 11.5, GRAY, SANS, min_h=12); b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 9.8, 13.5, BODY, SANS, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=9.8, lh=13.5)

    if cv.get("education"):
        b.need_section(section_chrome_height(11), 72); section(lbl["education"])
        for edu in cv["education"]:
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=GRAY, body=GRAY, font=SANS,
                degree_fs=10.6, degree_lh=13,
                meta_fs=9, meta_lh=11.5,
                body_fs=9, body_lh=11.5,
                after_gap=10,
            )

    if cv.get("skills"):
        b.need(42); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, BODY, SANS); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS, fs=10, lh=15)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    frames = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            _rect(28, 26, 539, 790, WINE, 1.2, page=page),
            _rect(36, 34, 523, 774, SAND, 0.75, page=page),
        )
    ]
    return frames + static + flow


def _gen_sidebar_theme(cv: dict, theme: str) -> list[dict]:
    """Minimal, generated narrow-sidebars that repeat on every content page."""
    themes = {
        "quarry": {
            "asset": "quarry-sidebar-v2.png", "paper": "#F7FAFC", "ink": "#13293D",
            "body": "#13293D", "accent": "#37D1EE", "marker": "#B7D84B",
            "muted": "#607384", "rule": "#C7D5DE", "side_text": "#F3F7FC",
            "side_label": "#37D1EE", "section": "circle",
        },
        "moss": {
            "asset": "moss-sidebar.png", "paper": "#FBFAF6", "ink": "#274232",
            "body": "#344238", "accent": "#B99854", "marker": "#73856E",
            "muted": "#798078", "rule": "#D5D0C2", "side_text": "#274232",
            "side_label": "#274232", "section": "ellipse",
        },
        "garnet": {
            "asset": "garnet-sidebar.png", "paper": "#FBF8F5", "ink": "#2A2023",
            "body": "#2A2023", "accent": "#C7A66A", "marker": "#722E3C",
            "muted": "#7D6D70", "rule": "#DFCFC7", "side_text": "#FFF8F4",
            "side_label": "#F4DEDE", "section": "rectangle",
        },
        "harbor": {
            "asset": "harbor-sidebar-v3.png", "paper": "#FAFBFB", "ink": "#1D3446",
            "body": "#1D3446", "accent": "#B78355", "marker": "#527286",
            "muted": "#6E7E88", "rule": "#CBD5D9", "side_text": "#F7FAFB",
            "side_label": "#EAF0F3", "section": "circle",
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw sidebara: {theme}")

    C = themes[theme]
    SIDE, L, W = 184, 220, 326
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class SidebarBuilder(Builder):
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = 56.0

    def connector(source_id: str, target_id: str, color: str | None = None) -> dict:
        return {
            "category": "connector", "source_id": source_id, "target_id": target_id,
            "backgroundColor": color or C["accent"], "borderWidth": 0.8,
            "arrow": False, "zIndex": 3, "page": 1,
        }

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

    frame = {**_rect(462, 52, 58, 54, C["accent"], 0.85, zIndex=3), "id": f"{theme}-frame"}
    orbit = {**_ellipse(472, 62, 35, 17, C["marker"], borderWidth=1, zIndex=3), "id": f"{theme}-orbit"}
    node = {**_circle(484, 82, 11, C["accent"], filled=True, zIndex=3), "id": f"{theme}-node"}
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
        connector(f"{theme}-frame", f"{theme}-orbit", C["rule"]),
        connector(f"{theme}-orbit", f"{theme}-node"),
    ]
    static[0]["letterSpacing"] = 0.1
    static[1]["letterSpacing"] = 1.45
    contact_label["letterSpacing"] = 1.2

    # Header rule ends at 145; keep the same section gap used between body sections.
    b = SidebarBuilder(145 + SPACE_SECTION)

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
        if C["section"] == "rectangle":
            b.els.append(_rect(L - 22, marker_y, 9, 9, C["marker"], 1, zIndex=3, page=b.pg))
        elif C["section"] == "ellipse":
            b.els.append(_ellipse(L - 23, marker_y, 12, 12, C["marker"], borderWidth=1, zIndex=3, page=b.pg))
        else:
            b.els.append(_circle(L - 22, marker_y + 1, 8, C["accent"], filled=True, zIndex=3, page=b.pg))
        b.text(label, 8.4, SANS, C["marker"], L)
        b.els[-1]["letterSpacing"] = 1.55 if label != lbl["skills"] else 1.3
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.5, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, C["body"], SANS)
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
                ink=C["ink"], muted=C["muted"], body=C["muted"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills") and "skills" not in sidebar_keys:
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.3, 13.2, SANS) + SPACE_SECTION)
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


def _gen_quarry(cv: dict) -> list[dict]:
    return _gen_sidebar_theme(cv, "quarry")


def _gen_moss(cv: dict) -> list[dict]:
    return _gen_sidebar_theme(cv, "moss")


def _gen_garnet(cv: dict) -> list[dict]:
    return _gen_sidebar_theme(cv, "garnet")


def _gen_harbor(cv: dict) -> list[dict]:
    return _gen_sidebar_theme(cv, "harbor")


def _gen_obsidian(cv: dict) -> list[dict]:
    """Sidebar dark theme — a near-black sidecar beside a charcoal main field,
    signed with a single warm-gold accent. Both panels stay dark on every page."""
    SIDEBAR_BG, MAIN_BG = "#0B0D10", "#15181C"
    GOLD, INK, MUTED, BODY, RULE = "#C9A24B", "#F4F1EA", "#9AA1AC", "#D7DAE0", "#33383F"
    SANS, SERIF = "Inter", "Times-Roman"
    SIDE, L, W = 184, 222, 337
    lbl = _labels(cv)

    contact = _compact_lines(
        [cv.get("email"), cv.get("phone"), cv.get("location")],
        max_items=3, chars_per_item=26,
    )
    skills_preview = _compact_lines(cv.get("skills") or [], max_items=6, chars_per_item=20)

    frame = {**_rect(464, 50, 56, 52, GOLD, 1, zIndex=3), "id": "obsidian-frame"}
    orbit = {**_ellipse(474, 60, 32, 15, GOLD, borderWidth=1, zIndex=3), "id": "obsidian-orbit"}
    node = {**_circle(484, 79, 11, GOLD, filled=True, zIndex=3), "id": "obsidian-node"}

    static = [
        _text(_compact_text(cv.get("name"), 28), 29, SERIF, INK, L, 52, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9, SANS, GOLD, L + 2, 92, zIndex=3),
        _line(L, 116, W, 1, RULE, zIndex=2),
        frame, orbit, node,
        {"category": "connector", "source_id": "obsidian-frame", "target_id": "obsidian-orbit",
         "backgroundColor": RULE, "borderWidth": 0.9, "arrow": False, "zIndex": 2, "page": 1},
        {"category": "connector", "source_id": "obsidian-orbit", "target_id": "obsidian-node",
         "backgroundColor": GOLD, "borderWidth": 0.9, "arrow": False, "zIndex": 2, "page": 1},
        _text("KONTAKT", 8, SANS, GOLD, 24, 60, zIndex=3),
        _block(contact, 24, 80, 136, 46, 8, 12.5, BODY, SANS, zIndex=3),
    ]
    static[1]["letterSpacing"] = 1.4
    static[8]["letterSpacing"] = 1.3
    if skills_preview:
        skills_label = _text(lbl["skills"], 8, SANS, GOLD, 24, 200, zIndex=3)
        skills_label["letterSpacing"] = 1.3
        static.append(skills_label)
        static.append(_block(skills_preview, 24, 220, 136, 90, 8.2, 13, BODY, SANS, zIndex=3))

    b = Builder(148)

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
        b.block(cv["summary"], L, W, 10, 15, BODY, SANS)
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
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=9.4, lh=13.3)

    if cv.get("education"):
        b.need_section(section_chrome_height(12), 72)
        section(lbl["education"])
        for index, edu in enumerate(cv["education"]):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD,
            )
        close_section()

    if cv.get("skills"):
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.4, 13.3, BODY, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS, fs=9.4, lh=13.3)

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
        {"category": "connector", "source_id": "raven-frame-one", "target_id": "raven-frame-two",
         "backgroundColor": "#4C5760", "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        {"category": "connector", "source_id": "raven-frame-one", "target_id": "raven-node",
         "backgroundColor": TEAL, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
    ]
    header[4]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    b = Builder(205)

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
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10.2, 15, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.2, 15, BODY, SANS)
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
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.4, 13.5, SANS) + SPACE_SECTION)
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
    b.line(L, W, 0.5, HAIRLINE); b.gap(24)

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
        b.block(cv["summary"], L, W, 10.5, 16, BODY, SANS)
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

    b = Builder(244)

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
        b.need(34)
        b.els.append(_rect(L, b.y + 2, 9, 9, FRAME, 1.5, zIndex=2, page=b.pg))
        b.text(label, 11.5, S, IVORY, 72, bold=True)
        b.els.append(_line(L, b.y - 2, W, 1, RULE, page=b.pg))
        b.gap(8)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, BODY, I); b.gap(16)

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

    flow = b.build()
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


# ── public API ───────────────────────────────────────────────────────────────

_GENERATORS = {
    "finance":   _gen_finance,
    "ledger":    _gen_ledger,
    "nimbus":    _gen_nimbus,
    "cinder":    _gen_cinder,
    "rift":      _gen_rift,
    "vault":     _gen_vault,
    "clearing":  _gen_clearing,
    "herald":    _gen_herald,
    "signal":    _gen_signal,
    "vector":    _gen_vector,
    "kernel":    _gen_kernel,
    "relay":     _gen_relay,
    "lattice":   _gen_lattice,
    "scribe":    _gen_scribe,
    "regent":    _gen_regent,
    "aldine":    _gen_aldine,
    "merit":     _gen_merit,
    "quarry":    _gen_quarry,
    "moss":      _gen_moss,
    "garnet":    _gen_garnet,
    "harbor":    _gen_harbor,
    "sterling":  _gen_sterling,
    "nocturne":  _gen_nocturne,
    "ampersand": _gen_ampersand,
    "education": _gen_education,
    "it":        _gen_it,
    "blueprint": _gen_blueprint,
    "monolith":  _gen_monolith,
    "prism":     _gen_prism,
    "aria":      _gen_aria,
    "solstice":  _gen_solstice,
    "mistral":   _gen_mistral,
    "axiom":     _gen_axiom,
    "vellum":    _gen_vellum,
    "obsidian":  _gen_obsidian,
    "raven":     _gen_raven,
    "graphite":  _gen_graphite,
    "onyx":      _gen_onyx,
}


def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """
    Return the complete list of canvas elements for the given template
    populated with the candidate's data.  One experience block per job,
    page overflow handled automatically.
    """
    fn = _GENERATORS.get(template_id)
    if fn is None:
        raise ValueError(f"Nieznany szablon '{template_id}'. "
                         f"Dostępne: {list(_GENERATORS)}")
    return fn(cv_data)
