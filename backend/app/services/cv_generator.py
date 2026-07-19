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
            "align": align, "bulletList": bulletList}


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
    "summary":    "PROFESSIONAL SUMMARY",
    "experience": "PROFESSIONAL EXPERIENCE",
    "education":  "EDUCATION",
    "skills":     "SKILLS",
}

def _labels(cv: dict) -> dict:
    """Return section headings in the CV's language (GPT-supplied), with English fallbacks."""
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
    photo_label = _text("PHOTO", 10, "Inter", "#6E8C92", 78, 84, zIndex=3)

    # sidebar contact label (localized)
    contact_label = (cv.get("labels") or {}).get("contact", "CONTACT").upper()
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
        _text("CONTACT", 10, "Courier", C["blue"], 50, 176, bold=True),
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
         "YEARS EXPERIENCE" if years else "ROLES"),
        (str(len(exp)) if exp else "—", "POSITIONS HELD"),
        (str(len(skills)) if skills else "—", "CORE SKILLS"),
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


# ── public API ───────────────────────────────────────────────────────────────

_GENERATORS = {
    "finance":   _gen_finance,
    "sterling":  _gen_sterling,
    "nocturne":  _gen_nocturne,
    "ampersand": _gen_ampersand,
    "education": _gen_education,
    "it":        _gen_it,
    "blueprint": _gen_blueprint,
    "monolith":  _gen_monolith,
    "prism":     _gen_prism,
    "aria":      _gen_aria,
}


def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """
    Return the complete list of canvas elements for the given template
    populated with the candidate's data.  One experience block per job,
    page overflow handled automatically.
    """
    fn = _GENERATORS.get(template_id)
    if fn is None:
        raise ValueError(f"Unknown template '{template_id}'. "
                         f"Available: {list(_GENERATORS)}")
    return fn(cv_data)
