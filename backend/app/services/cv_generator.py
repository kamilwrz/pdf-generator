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
from datetime import datetime

from app.core.config import BACKEND_URL

A4_H = 842
MARGIN_BOTTOM = 40   # py before switching to the next page
PAGE_TOP = 36        # y at the top of a continuation page


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


# ── builder helper ───────────────────────────────────────────────────────────

class Builder:
    """Tracks vertical position and page across element-generating calls."""

    def __init__(self, start_y: float):
        self.els: list[dict] = []
        self.y = float(start_y)
        self.pg = 1

    def need(self, h: float):
        """Advance to a new page if the next element wouldn't fit."""
        if self.y + h > A4_H - MARGIN_BOTTOM:
            self.pg += 1
            self.y = float(PAGE_TOP)

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
        # Count rendered lines including soft-wrapping for long segments.
        # chars_per_line ≈ width / (fontSize × 0.52) for Inter-style fonts.
        cpl = max(10, int(width / (fs * 0.52)))
        rendered = 0
        for seg in content.split("\n"):
            rendered += max(1, math.ceil(len(seg) / cpl)) if seg.strip() else 1
        h = max(rendered * lh + 6, min_h)
        self.need(h)
        self.els.append(_block(content, left, self.y, width, h, fs, lh, col, fam,
                                zIndex=2, page=self.pg, bold=bold, italic=italic, align=align,
                                bulletList=bulletList))
        self.y += h
        return self.y

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

def _labels(cv: dict) -> dict:
    """Return section headings in the CV's language (GPT-supplied), with Polish fallbacks."""
    raw = cv.get("labels") or {}
    return {k: (raw.get(k) or v).upper() for k, v in _LABEL_DEFAULTS.items()}


def _extra_sections(b: Builder, cv: dict, placement: str,
                    section_fn, C: dict, L: int, W: int,
                    font_b: str, fs: float = 10, lh: float = 15) -> None:
    """
    Render extra (custom) sections found in the CV but not in the template.

    placement='after_experience' → called after the experience block
    placement='after_skills'     → called after the skills block
    Sections tagged with the requested placement are rendered; others are skipped
    here (they'll be picked up at their own placement call).
    """
    for sec in cv.get("extra_sections") or []:
        if sec.get("placement", "after_skills") != placement:
            continue
        title = (sec.get("title") or "").strip().upper()
        items = [i for i in (sec.get("items") or []) if i and str(i).strip()]
        if not title or not items:
            continue
        b.need(50)
        section_fn(title)
        content = "\n".join(f"• {item}" for item in items)
        b.block(content, L, W, fs, lh, C.get("body", "#2B2B2B"), font_b, bulletList=True)
        b.gap(14)


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


def _bullets(job: dict) -> str:
    return "\n".join(f"• {b}" for b in job.get("bullets", []) if b)


def _company_period(job: dict) -> str:
    return "   ·   ".join(filter(None, [job.get("company"), job.get("period")]))


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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L)
            if edu.get("detail"):
                b.gap(1); b.text(edu["detail"], 9.5, "Inter", C["gray"], L)
            b.gap(10)

    if cv.get("skills"):
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter"); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, C, L, W, "Inter")

    return b.build()


def _gen_ledger(cv: dict) -> list[dict]:
    """Blue-grey finance CV with editable data panels and market graphic."""
    NAVY, BLUE = "#102A43", "#2E5E86"
    SLATE, STEEL, INK = "#607789", "#AEBECC", "#17212B"
    L, W, SANS, SERIF = 52, 490, "Inter", "Times-Roman"
    lbl = _labels(cv)

    metric_revenue = {**_rect(52, 180, 150, 62, STEEL, page=1), "id": "metric-revenue"}
    metric_margin = {**_rect(222, 180, 150, 62, STEEL, page=1), "id": "metric-margin"}
    metric_capital = {**_rect(392, 180, 150, 62, STEEL, page=1), "id": "metric-capital"}
    static = [
        _line(0, 0, 595, 146, NAVY, zIndex=0),
        _line(0, 146, 595, 5, BLUE, zIndex=1),
        _rect(416, 24, 122, 126, STEEL, 1.2, zIndex=3),
        {
            "category": "image",
            "src": f"{BACKEND_URL}/uploads/templates/ledger-finance-accent.png",
            "width": 110,
            "height": 118,
            "left": 422,
            "top": 28,
            "zIndex": 2,
            "page": 1,
        },
        _line(400, 30, 2, 102, BLUE, zIndex=2),
        _text("LEDGER / FINANCE", 8.5, SANS, "#BFD0DE", L, 34, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, "#FFFFFF", L, 58, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 52), 10, SANS, "#C7D7E2", L, 98, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.8, SANS, "#C7D7E2", L, 120, zIndex=2),
        metric_revenue,
        metric_margin,
        metric_capital,
        {"category": "connector", "source_id": "metric-revenue", "target_id": "metric-margin",
         "backgroundColor": BLUE, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        {"category": "connector", "source_id": "metric-margin", "target_id": "metric-capital",
         "backgroundColor": BLUE, "borderWidth": 1, "arrow": False, "zIndex": 2, "page": 1},
        _text("PRZYCHODY", 7.5, SANS, SLATE, 66, 193, zIndex=3),
        _text("WZROST", 20, SERIF, NAVY, 66, 208, zIndex=3, bold=True),
        _text("MARŻA", 7.5, SANS, SLATE, 236, 193, zIndex=3),
        _text("KONTROLA", 20, SERIF, NAVY, 236, 208, zIndex=3, bold=True),
        _text("KAPITAŁ", 7.5, SANS, SLATE, 406, 193, zIndex=3),
        _text("WARTOŚĆ", 20, SERIF, NAVY, 406, 208, zIndex=3, bold=True),
    ]
    static[5]["letterSpacing"] = 1.5

    b = Builder(278)

    def section(label: str) -> None:
        b.need(34)
        b.text(label, 9, SANS, BLUE, L)
        b.line(L, W, 1, STEEL)
        b.gap(14)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.2, 15, INK, SANS)
        b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(72)
            b.block(job.get("title", ""), L, W, 11, 13.5, NAVY, SANS, bold=True, min_h=15)
            b.gap(1)
            b.block(_company_period(job), L, W, 9, 11.5, SLATE, SANS, min_h=12)
            b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 9.6, 13.5, INK, SANS, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.6, lh=13.5)

    if cv.get("education"):
        section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.6, 13, NAVY, SANS, bold=True, min_h=15)
            b.gap(2)
            b.block(edu.get("period", ""), L, W, 9, 11.5, SLATE, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1)
                b.block(edu["detail"], L, W, 9, 11.5, SLATE, SANS, min_h=12)
            b.gap(10)

    if cv.get("skills"):
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.8, 14, INK, SANS)
        b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.8, lh=14)
    return static + b.build()


def _gen_nimbus(cv: dict) -> list[dict]:
    """Light blue-grey finance CV with an airy editorial rhythm."""
    INK, BLUE = "#2B3D4C", "#5F8EAD"
    POWDER, SKY, CLOUD, SLATE = "#B9D2E5", "#DFEBF4", "#E9EEF1", "#72818C"
    L, W, SANS, SERIF = 80, 462, "Inter", "Times-Roman"
    lbl = _labels(cv)

    mark_one = {**_rect(80, 176, 14, 14, BLUE, 1.2, zIndex=2), "id": "nimbus-mark-one"}
    mark_two = {**_rect(114, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-two"}
    mark_three = {**_rect(148, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-three"}
    static = [
        _line(0, 0, 595, 4, POWDER, zIndex=0),
        _line(52, 207, 490, 1, POWDER),
        _rect(401, 35, 141, 153, POWDER, 1.1, zIndex=3),
        {
            "category": "image",
            "src": f"{BACKEND_URL}/uploads/templates/nimbus-finance-accent.png",
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
        _line(52, 347, 2, 328, SKY),
        _rect(45, 362, 16, 16, BLUE, zIndex=2),
    ]
    static[6]["letterSpacing"] = 1.5

    b = Builder(248)

    def section(label: str) -> None:
        b.need(34)
        b.text(label, 8.7, SANS, BLUE, L)
        b.line(L, W, 1, CLOUD)
        b.gap(14)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.1, 15, INK, SANS)
        b.gap(18)

    if cv.get("experience"):
        section(lbl["experience"])
        for job in cv["experience"]:
            b.need(72)
            b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15)
            b.gap(1)
            b.block(_company_period(job), L, W, 8.8, 11.5, SLATE, SANS, min_h=12)
            b.gap(3)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 9.5, 13.4, INK, SANS, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.3, 13, INK, SANS, bold=True, min_h=15)
            b.gap(2)
            b.block(edu.get("period", ""), L, W, 8.7, 11.5, SLATE, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1)
                b.block(edu["detail"], L, W, 8.7, 11.5, SLATE, SANS, min_h=12)
            b.gap(10)

    if cv.get("skills"):
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.4, 13.5, INK, SANS)
        b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.4, lh=13.5)
    return static + b.build()


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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L); b.gap(10)

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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, S, C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, S, C["gray"], L, italic=True); b.gap(10)

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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L); b.gap(10)

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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], ML); b.gap(10)

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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], ML); b.gap(10)

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
            b.text(edu.get("degree", ""), 11, "Inter", K, L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", MG, L); b.gap(10)

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
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", INK, L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", GRAY, L); b.gap(10)

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
            b.text(edu.get("degree", ""), 11, "Inter", INK, L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", MID, L); b.gap(14)

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

    def section(label):
        b.need(34)
        b.els.append(_rect(L, b.y + 2, 9, 9, ACCENT, 1.5, zIndex=2, page=b.pg))
        b.text(label, 11.5, S, NAVY, 72, bold=True)
        b.els.append(_line(L, b.y - 2, W, 1, PALE, page=b.pg))
        b.gap(8)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, BODY, I); b.gap(16)

    if exp:
        section(lbl["experience"])
        for job in exp:
            b.need(56)
            b.text(job.get("title", ""), 11, I, NAVY, L, bold=True); b.gap(2)
            b.text(_company_period(job), 9, I, GRAY, L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, BODY, I, bulletList=True)
            b.gap(12)
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, I)

    if cv.get("education"):
        b.need(50); section(lbl["education"])
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 10.5, I, NAVY, L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9, I, GRAY, L)
            if edu.get("detail"):
                b.gap(1); b.text(edu["detail"], 9, I, GRAY, L)
            b.gap(10)

    if skills:
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(skills), L, W, 10, 15, BODY, I); b.gap(14)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, I)

    flow = b.build()

    # ---- engraved double frame on every page used ----
    pages_used = max([e.get("page", 1) for e in static + flow] or [1])
    frames = []
    for p in range(1, pages_used + 1):
        frames.append(_rect(24, 24, 547, 794, STEEL, 1.5, page=p))
        frames.append(_rect(29, 29, 537, 784, PALE, 1, page=p))

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
        b.need(58); section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.5, 13, INK, SANS, bold=True, min_h=15); b.gap(2)
            b.block(edu.get("period", ""), L, W, 9.2, 12, MIST, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1); b.block(edu["detail"], L, W, 9.2, 12, MIST, SANS, min_h=12)
            b.gap(10)

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
        b.need(58); section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.5, 13, INK, SANS, bold=True, min_h=15); b.gap(2)
            b.block(edu.get("period", ""), L, W, 9.2, 12, DRIFT, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1); b.block(edu["detail"], L, W, 9.2, 12, DRIFT, SANS, min_h=12)
            b.gap(10)

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
        b.need(56); section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.6, 13, INK, SANS, bold=True, min_h=15); b.gap(2)
            b.block(edu.get("period", ""), L, W, 9, 11.5, SLATE, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1); b.block(edu["detail"], L, W, 9, 11.5, SLATE, SANS, min_h=12)
            b.gap(10)

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
        b.need(56); section(lbl["education"])
        for edu in cv["education"]:
            b.block(edu.get("degree", ""), L, W, 10.6, 13, INK, SANS, bold=True, min_h=15); b.gap(2)
            b.block(edu.get("period", ""), L, W, 9, 11.5, GRAY, SANS, min_h=12)
            if edu.get("detail"):
                b.gap(1); b.block(edu["detail"], L, W, 9, 11.5, GRAY, SANS, min_h=12)
            b.gap(10)

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


# ── public API ───────────────────────────────────────────────────────────────

_GENERATORS = {
    "finance":   _gen_finance,
    "ledger":    _gen_ledger,
    "nimbus":    _gen_nimbus,
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
