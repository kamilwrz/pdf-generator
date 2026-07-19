"""AI article generation: uploaded PDF text → editorial plan (LLM) → a
newspaper-style two-column layout mirroring the frontend's Gazette template
(templates/gazette.js — keep metrics in sync).

Layout devices: kicker + double masthead rule, serif headline, italic
standfirst, byline/dateline, two JUSTIFIED columns with hairline divider,
oxblood drop cap on the opening paragraph, section headings with accent
rules (kept with their text), one framed pull-quote, an end-of-article
tombstone, folio page numbers on every page and a running head from page 2.
"""
import json

from app.services.deck_generator import _get_client, extract_pdf_text, PLAN_MODEL
from app.services.pdf_generator import PDF_Generator

# ---- Gazette metrics (mirror of gazette.js) ---------------------------------
PAGE_W, PAGE_H = 595, 842
COLS = [(50, 237), (308, 237)]   # (x, width) per column
DIVIDER_X = 296
TOP_PN = 64                       # column top on pages >= 2 (below running head)
BOTTOM = 770                      # column bottom (above folio)
BODY_FS, BODY_LH = 9.5, 13.5
PARA_GAP = 8

DARK, BODY = "#191B1E", "#22262B"
ACCENT, GRAY = "#8C2F39", "#6A7078"
RULE, SOFT = "#B9BEC6", "#D9DCE1"
S, I = "Times-Roman", "Inter"


# ---- element factories ------------------------------------------------------

def _text(content, size, font, color, left, top, page, z=2, bold=False, italic=False):
    return {"category": "text", "content": content, "fontSize": size, "fontFamily": font,
            "color": color, "left": left, "top": top, "page": page, "zIndex": z,
            "bold": bold, "italic": italic}


def _block(content, left, top, w, h, size, lh, color, font, page, z=2,
           bold=False, italic=False, align="left"):
    return {"category": "textarea", "content": content, "left": left, "top": top,
            "width": w, "height": h, "fontSize": size, "lineHeight": lh, "letterSpacing": 0,
            "color": color, "fontFamily": font, "page": page, "zIndex": z,
            "bold": bold, "italic": italic, "align": align, "bulletList": False}


def _line(left, top, w, h, color, page, z=1):
    return {"category": "line", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "page": page, "zIndex": z}


def _rect(left, top, w, h, color, bw, page, z=1):
    return {"category": "rectangle", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "borderWidth": bw, "page": page, "zIndex": z}


def _wrap_lines(text, width, fs, font=S, bold=False, italic=False):
    """EXACT wrapped lines, computed with the same font metrics + wrap logic
    the PDF renderer (and the canvas, via the same font files) uses. Heights
    derived from these can never clip. Returns the list of line strings."""
    measure, _, _ = PDF_Generator._resolve_font(font, bold, italic)
    wrapped = PDF_Generator._wrap_textarea(PDF_Generator, text or "", measure, fs, 0.0, width)
    return [ln for (ln, _last, _indent) in wrapped]


# ---- two-column flow --------------------------------------------------------

class _Flow:
    def __init__(self, top_p1):
        self.els = []
        self.page, self.col = 1, 0
        self.top_p1 = top_p1
        self.y = float(top_p1)
        self.max_page = 1

    def top(self):
        return self.top_p1 if self.page == 1 else TOP_PN

    def x(self): return COLS[self.col][0]
    def w(self): return COLS[self.col][1]

    def next_col(self):
        if self.col == 0:
            self.col = 1
        else:
            self.col = 0
            self.page += 1
            self.max_page = max(self.max_page, self.page)
        self.y = float(self.top())

    def ensure(self, h):
        if self.y + h > BOTTOM and self.y > self.top():
            self.next_col()


def _place_paragraph(f: _Flow, text, drop_cap=False):
    text = (text or "").strip()
    if not text:
        return
    if drop_cap:
        # oxblood cap + hanging paragraph beside it (cap column is 54px)
        cap, rest = text[0], text[1:]
        w = f.w() - 54
        n = len(_wrap_lines(rest, w, BODY_FS))
        h = n * BODY_LH + 6
        f.ensure(h)
        f.els.append(_text(cap, 44, S, ACCENT, f.x(), f.y - 8, f.page, bold=True))
        f.els.append(_block(rest, f.x() + 54, f.y, w, h, BODY_FS, BODY_LH, BODY, S, f.page, align="justify"))
        f.y += h + PARA_GAP
        return
    while text:
        avail = int((BOTTOM - f.y - 6) // BODY_LH)
        if avail < 3:                       # widow control: don't start a stub
            f.next_col()
            continue
        lines = _wrap_lines(text, f.w(), BODY_FS)
        if len(lines) <= avail:
            h = len(lines) * BODY_LH + 6
            f.els.append(_block(text, f.x(), f.y, f.w(), h, BODY_FS, BODY_LH, BODY, S, f.page, align="justify"))
            f.y += h + PARA_GAP
            return
        # split EXACTLY at the lines that fit; the remainder flows to the next
        # column (wrapping re-runs there, so nothing can be lost or clipped)
        part = " ".join(lines[:avail]).strip()
        text = " ".join(lines[avail:]).strip()
        h = avail * BODY_LH + 6
        f.els.append(_block(part, f.x(), f.y, f.w(), h, BODY_FS, BODY_LH, BODY, S, f.page, align="justify"))
        f.next_col()


def _place_heading(f: _Flow, heading):
    f.ensure(26 + 3 * BODY_LH)              # keep the heading with ≥3 body lines
    f.els.append(_line(f.x(), f.y, 24, 2, ACCENT, f.page, z=2))
    f.els.append(_text(heading, 12.5, S, DARK, f.x(), f.y + 6, f.page, bold=True))
    f.y += 26


def _place_pull_quote(f: _Flow, quote, attribution):
    qlines = len(_wrap_lines(quote, f.w() - 28, 13, italic=True))
    h = qlines * 18 + 52
    f.ensure(h + PARA_GAP)
    x, w = f.x(), f.w()
    f.els.append(_rect(x, f.y, w, h, SOFT, 1, f.page))
    f.els.append(_line(x + 14, f.y + 12, 60, 2, ACCENT, f.page, z=2))
    f.els.append(_block(quote, x + 14, f.y + 22, w - 28, qlines * 18 + 4, 13, 18, DARK, S,
                        f.page, italic=True, align="center"))
    if attribution:
        f.els.append(_block(f"— {attribution}", x + 14, f.y + h - 20, w - 28, 12, 8.5, 11,
                            GRAY, I, f.page, align="center"))
    f.y += h + PARA_GAP


# ---- LLM plan ---------------------------------------------------------------

def plan_article(document_text: str) -> dict:
    prompt = (
        "You are a magazine editor. Rewrite the DOCUMENT below as a polished long-form\n"
        "article for print. Keep ALL of its substantial knowledge — facts, numbers,\n"
        "arguments, examples — reorganised into flowing editorial prose (no bullet lists).\n\n"
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "kicker": "THE GAZETTE · SECTION NAME",\n'
        '  "title": "headline, sharp and concrete",\n'
        '  "standfirst": "1-2 sentence italic intro that sells the piece",\n'
        '  "byline": "By Author Name (from the document, else By The Gazette Desk)",\n'
        '  "dateline": "Place · Month Year · N min read",\n'
        '  "pull_quote": {"text": "one striking sentence from the article", "attribution": "source"},\n'
        '  "sections": [ {"heading": "short heading or null for the opening section",\n'
        '                 "paragraphs": ["...", "..."]} ]\n'
        "}\n\n"
        "Rules:\n"
        "- The FIRST paragraph of the FIRST section opens with a drop cap: make it strong,\n"
        "  and keep it under ~450 characters.\n"
        "- Paragraphs 300-600 characters; headings 2-5 words; use as many sections and\n"
        "  paragraphs as the content needs — a dense document should become a long,\n"
        "  multi-page article, never a thin summary.\n"
        "- Write paragraphs as plain prose (the layout justifies them into columns).\n\n"
        f"DOCUMENT:\n{document_text}"
    )
    resp = _get_client().chat.completions.create(
        model=PLAN_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=24000,
        response_format={"type": "json_object"},
    )
    plan = json.loads(resp.choices[0].message.content)
    if not isinstance(plan.get("sections"), list) or not plan["sections"]:
        raise ValueError("The AI returned an empty article plan.")
    return plan


# ---- assembly ---------------------------------------------------------------

def _masthead(plan: dict):
    els = [
        _line(50, 55, 7, 7, ACCENT, 1),
        _text(plan.get("kicker") or "THE GAZETTE", 8.5, I, GRAY, 63, 54, 1),
        _line(50, 72, 495, 3, DARK, 1),
        _line(50, 78, 495, 1, DARK, 1),
    ]
    y = 92
    title = plan.get("title") or "Untitled article"
    tl = len(_wrap_lines(title, 495, 29, bold=True))
    th = tl * 34 + 8
    els.append(_block(title, 50, y, 495, th, 29, 34, DARK, S, 1, bold=True))
    y += th + 8
    if plan.get("standfirst"):
        sl = len(_wrap_lines(plan["standfirst"], 495, 12.5, italic=True))
        sh = sl * 18 + 6
        els.append(_block(plan["standfirst"], 50, y, 495, sh, 12.5, 18, "#4A5058", S, 1, italic=True))
        y += sh + 8
    els.append(_text(plan.get("byline") or "By The Gazette Desk", 9, I, DARK, 50, y, 1, bold=True))
    if plan.get("dateline"):
        els.append(_block(plan["dateline"], 50, y - 2, 495, 12, 8.5, 11, GRAY, I, 1, align="right"))
    y += 18
    els.append(_line(50, y, 495, 0.5, RULE, 1))
    return els, y + 12


def build_article(plan: dict) -> list[dict]:
    masthead, top_p1 = _masthead(plan)
    f = _Flow(top_p1)

    quote = (plan.get("pull_quote") or {}) if isinstance(plan.get("pull_quote"), dict) else {}
    quote_placed = not quote.get("text")
    total_paras = sum(len(s.get("paragraphs") or []) for s in plan["sections"]) or 1
    placed = 0
    first = True

    for section in plan["sections"]:
        if section.get("heading"):
            _place_heading(f, section["heading"])
        for para in section.get("paragraphs") or []:
            _place_paragraph(f, para, drop_cap=first)
            first = False
            placed += 1
            # drop the pull-quote roughly a third of the way through the piece
            if not quote_placed and placed >= max(2, total_paras // 3):
                _place_pull_quote(f, quote["text"], quote.get("attribution"))
                quote_placed = True

    # end-of-article tombstone
    f.ensure(14)
    f.els.append(_line(f.x(), f.y + 2, 7, 7, ACCENT, f.page, z=2))

    # per-page furniture: column divider, folio, running head (page 2+)
    furniture = []
    title = plan.get("title") or ""
    for p in range(1, f.max_page + 1):
        top = top_p1 if p == 1 else TOP_PN
        furniture.append(_line(DIVIDER_X, top, 1, BOTTOM - top, SOFT, p))
        furniture.append(_line(50, 788, 495, 0.5, RULE, p))
        furniture.append(_block(f"— {p} —", 50, 796, 495, 12, 8.5, 11, GRAY, I, p, align="center"))
        if p >= 2:
            furniture.append(_text(title[:70], 8.5, S, GRAY, 50, 40, p, italic=True))
            furniture.append(_line(50, 54, 495, 0.5, RULE, p))

    return masthead + furniture + f.els


def generate_article(pdf_bytes: bytes) -> dict:
    text = extract_pdf_text(pdf_bytes)
    plan = plan_article(text)
    elements = build_article(plan)
    return {"title": plan.get("title") or "Article", "elements": elements}
