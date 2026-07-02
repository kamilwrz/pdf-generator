"""
Dynamic CV layout engine.

The AI (GPT-4o) extracts structured data from an uploaded PDF.
This module generates the full canvas-element array from that data,
using the visual style of the chosen template.  The number of
experience / education blocks matches the CV exactly — no slots, no
truncation, multi-page when content overflows.
"""

from __future__ import annotations

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
           zIndex=2, page=1, bold=False, italic=False, align="left"):
    return {"category": "textarea", "content": str(content),
            "left": left, "top": top, "width": width, "height": height,
            "fontSize": fontSize, "lineHeight": lineHeight,
            "letterSpacing": 0, "color": color, "fontFamily": fontFamily,
            "zIndex": zIndex, "page": page, "bold": bold, "italic": italic,
            "align": align}


def _line(left, top, width, height, color, *, zIndex=1, page=1):
    return {"category": "line", "left": left, "top": top,
            "width": width, "height": height, "backgroundColor": color,
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
              bold=False, italic=False, align="left", min_h=0.0) -> float:
        if not content:
            return self.y
        n = content.count("\n") + 1
        h = max(n * lh + 4, min_h)
        self.need(h)
        self.els.append(_block(content, left, self.y, width, h, fs, lh, col, fam,
                                zIndex=2, page=self.pg, bold=bold, italic=italic, align=align))
        self.y += h
        return self.y

    def line(self, left, width, height, col):
        self.els.append(_line(left, self.y, width, height, col, page=self.pg))

    def gap(self, px: float):
        self.y += px

    def build(self) -> list[dict]:
        return self.els


# ── shared helpers ───────────────────────────────────────────────────────────

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
    b = Builder(54)

    # header
    b.text(cv.get("name", ""), 30, "Times-Roman", C["ink"], L, bold=True); b.gap(4)
    b.text(cv.get("title", ""), 14, "Times-Roman", C["sub"], L); b.gap(4)
    b.text(_contact_line(cv), 9.5, "Inter", C["sub"], L); b.gap(8)
    b.line(L, W, 1.5, C["ink"]); b.gap(16)

    def section(label):
        b.text(label, 12, "Times-Roman", C["ink"], L, bold=True); b.gap(2)
        b.line(L, 70, 2, C["gold"]); b.gap(10)

    if cv.get("summary"):
        section("PROFESSIONAL SUMMARY")
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(18)

    if cv.get("experience"):
        section("PROFESSIONAL EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter")
            b.gap(12)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L)
            if edu.get("detail"):
                b.gap(1); b.text(edu["detail"], 9.5, "Inter", C["gray"], L)
            b.gap(10)

    if cv.get("skills"):
        b.need(40)
        section("SKILLS & CERTIFICATIONS")
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter")

    return b.build()


def _gen_nocturne(cv: dict) -> list[dict]:
    C = dict(ink="#1F2933", coral="#F25F4C", gray="#6B7280", body="#1F2933")
    L, W = 50, 495
    # static dark header band + name on top
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
        section("ABOUT")
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(18)

    if cv.get("experience"):
        section("EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter")
            b.gap(12)

    if cv.get("skills"):
        b.need(40)
        section("SKILLS")
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter"); b.gap(14)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L); b.gap(10)

    return static + b.build()


def _gen_ampersand(cv: dict) -> list[dict]:
    C = dict(ink="#2A2320", wine="#7B2D3A", gray="#8A7F78",
             rule="#E0D7D1", body="#3A332E")
    L, W = 50, 497
    S = "Times-Roman"

    static = [
        _line(0, 0, 9, 842, C["wine"], zIndex=0),
        _text(cv.get("name", ""), 31, S, C["ink"], L, 58, bold=True),
        _text(cv.get("title", ""), 14, S, C["wine"], L, 98, italic=True),
        _text(_contact_line(cv), 9.5, S, C["gray"], L, 122),
        _line(L, 140, W, 1, C["rule"]),
    ]

    b = Builder(158)

    def section(label):
        b.text(label, 12, S, C["ink"], L, bold=True)
        b.gap(2)

    section("PROFILE")
    b.block(cv.get("summary", ""), L, W, 11, 16, C["body"], S); b.gap(16)

    if cv.get("experience"):
        section("EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11.5, S, C["ink"], L, bold=True); b.gap(2)
            b.text(job.get("period", ""), 9.5, S, C["gray"], L, italic=True); b.gap(2)
            company = job.get("company", "")
            if company:
                b.text(company, 9.5, S, C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10.5, 15, C["body"], S)
            b.gap(12)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, S, C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, S, C["gray"], L, italic=True); b.gap(10)

    if cv.get("skills"):
        b.need(40)
        section("SKILLS")
        b.block(" · ".join(cv["skills"]), L, W, 10.5, 15, C["body"], S)

    return static + b.build()


def _gen_education(cv: dict) -> list[dict]:
    C = dict(ink="#2E2A25", sage="#4E7A6B", flank="#CBB89E",
             frame="#D8CDBA", gray="#6B7280", body="#2B2B2B")
    L, W, MID = 55, 485, 297  # W=595-55-55, MID≈center
    S = "Times-Roman"

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
        b.text(label, 12, S, C["ink"], L, bold=True, align="center" if False else None); b.gap(2)
        b.line(L, 150, 1, C["flank"])
        b.els[-1]["left"] = 90
        b.els.append(_line(355, b.y, 150, 1, C["flank"], page=b.pg))
        b.gap(10)

    def section(label):  # noqa: F811
        b.need(30)
        # flanked heading: rule ——LABEL—— rule
        b.text(label, 12, S, C["ink"], L, bold=True)
        y_rule = b.y - 8
        b.els.append(_line(90, y_rule, 150, 1, C["flank"], page=b.pg))
        b.els.append(_line(355, y_rule, 150, 1, C["flank"], page=b.pg))
        b.gap(4)

    if cv.get("summary"):
        section("PROFILE")
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], "Inter"); b.gap(16)

    if cv.get("experience"):
        section("EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], L); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, L, W, 10, 14, C["body"], "Inter")
            b.gap(12)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], L, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], L); b.gap(10)

    if cv.get("skills"):
        b.need(40)
        section("SKILLS")
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, C["body"], "Inter")

    return static + b.build()


def _gen_it(cv: dict) -> list[dict]:
    C = dict(teal="#2BB3C0", white="#FFFFFF", light="#C9D8DA",
             mute="#9FB8BC", ink="#1F2937", gray="#6B7280", body="#3A4753")
    SB, ML, MW = 190, 220, 330  # sidebar width, main-left, main-width

    # Static sidebar structure
    sidebar_bg = _line(0, 0, SB, 842, "#0F2A33", zIndex=0)
    photo_frame = _line(43, 38, 104, 104, C["teal"], zIndex=1)
    photo_inner = _line(45, 40, 100, 100, "#14333D", zIndex=2)
    photo_label = _text("PHOTO", 10, "Inter", "#6E8C92", 78, 84, zIndex=3)

    static = [sidebar_bg, photo_frame, photo_inner, photo_label,
              _text(cv.get("name", ""), 18, "Inter", C["white"], 28, 158, zIndex=3, bold=True),
              _text(cv.get("title", ""), 11, "Inter", C["teal"], 28, 184, zIndex=3),
              _text("CONTACT", 10, "Inter", C["mute"], 28, 218, zIndex=3, bold=True),
              _line(28, 232, 40, 2, C["teal"], zIndex=3),
              ]

    contact_text = "\n".join(filter(None, [
        cv.get("email"), cv.get("phone"), cv.get("location")
    ]))
    static.append(_block(contact_text, 28, 242, 148, max(len(contact_text.splitlines()) * 15, 45),
                         9, 15, C["light"], "Inter", zIndex=3))

    skills_y = 320
    static.append(_text("SKILLS", 10, "Inter", C["mute"], 28, skills_y, zIndex=3, bold=True))
    static.append(_line(28, skills_y + 13, 40, 2, C["teal"], zIndex=3))
    skills_text = "\n".join(cv.get("skills", []))
    static.append(_block(skills_text, 28, skills_y + 23,
                         148, max(len(cv.get("skills", [])) * 16, 60),
                         9, 16, C["light"], "Inter", zIndex=3))

    # Dynamic main column
    b = Builder(48)
    b.pg = 1  # stays page 1 (sidebar spans all pages anyway)

    def section(label):
        b.need(30)
        b.text(label, 12, "Inter", C["ink"], ML, bold=True); b.gap(2)
        b.els[-1]["left"] = ML
        b.els.append(_line(ML, b.y - 2, 60, 2, C["teal"], page=b.pg))
        b.gap(10)

    if cv.get("summary"):
        section("PROFILE")
        b.block(cv["summary"], ML, MW, 10.5, 15, C["body"], "Inter"); b.gap(16)

    if cv.get("experience"):
        section("EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], ML); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, ML, MW, 10, 14, C["body"], "Inter")
            b.gap(12)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], ML); b.gap(10)

    return static + b.build()


def _gen_blueprint(cv: dict) -> list[dict]:
    C = dict(ink="#1A2530", blue="#2B6CB0", gray="#6B7280",
             body="#3A4753", div="#D8DEE4")
    ML, MW = 225, 320  # main column

    static = [
        _text(cv.get("name", ""), 30, "Inter", C["ink"], 50, 56, bold=True),
        _text("// " + cv.get("title", ""), 12, "Courier", C["blue"], 50, 94),
        _text(_contact_line(cv), 9.5, "Inter", C["gray"], 50, 118),
        _line(50, 138, 495, 1.5, C["ink"]),
        _line(205, 160, 1, 645, C["div"]),
        # left column header
        _text("CONTACT", 10, "Courier", C["blue"], 50, 176, bold=True),
    ]

    contact_text = "\n".join(filter(None, [
        cv.get("email"), cv.get("phone"), cv.get("location")
    ]))
    static.append(_block(contact_text, 50, 196, 148,
                         max(len(contact_text.splitlines()) * 13, 40),
                         8.5, 13, C["body"], "Inter"))

    skills_y = 290
    static.append(_text("SKILLS", 10, "Courier", C["blue"], 50, skills_y, bold=True))
    skills_text = "\n".join(cv.get("skills", []))
    static.append(_block(skills_text, 50, skills_y + 14, 148,
                         max(len(cv.get("skills", [])) * 15, 50),
                         9, 15, C["body"], "Inter"))

    # Dynamic main column
    b = Builder(176)

    def section(label):
        b.need(30)
        b.text(label, 10, "Courier", C["blue"], ML, bold=True); b.gap(10)

    if cv.get("experience"):
        section("EXPERIENCE")
        for job in cv["experience"]:
            b.need(56)
            b.text(job.get("title", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(_company_period(job), 9.5, "Inter", C["gray"], ML); b.gap(2)
            bul = _bullets(job)
            if bul:
                b.block(bul, ML, MW, 10, 14, C["body"], "Inter")
            b.gap(12)

    if cv.get("education"):
        b.need(50)
        section("EDUCATION")
        for edu in cv["education"]:
            b.text(edu.get("degree", ""), 11, "Inter", C["ink"], ML, bold=True); b.gap(2)
            b.text(edu.get("period", ""), 9.5, "Inter", C["gray"], ML); b.gap(10)

    return static + b.build()


# ── public API ───────────────────────────────────────────────────────────────

_GENERATORS = {
    "finance": _gen_finance,
    "nocturne": _gen_nocturne,
    "ampersand": _gen_ampersand,
    "education": _gen_education,
    "it": _gen_it,
    "blueprint": _gen_blueprint,
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
