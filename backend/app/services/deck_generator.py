"""AI deck generation: uploaded PDF text + vision-captioned gallery images →
slide plan (LLM) → deterministic 960×540 layout mirroring the frontend's
Meridian template (templates/meridian.js). Keep the two in sync.

Pipeline (route /ai/generate_deck):
  extract_pdf_text → describe_images → plan_deck → build_deck
"""
import base64
import json
import os

import fitz
from openai import OpenAI

from app.core.config import OPENAI_API_KEY, BACKEND_URL
from app.utils.image_src_to_path import image_src_to_local_path


def _get_client() -> OpenAI:
    """Lazy client so importing this module never requires a key; the route
    surfaces a clean 400 when none is configured."""
    key = OPENAI_API_KEY or os.getenv("API_GPT_KEY", "")
    if not key:
        raise ValueError("OpenAI API key is not configured (API_GPT_KEY).")
    return OpenAI(api_key=key)

# ---- Meridian palette / geometry (mirror of meridian.js) --------------------
PAGE_W, PAGE_H = 960, 540
INK, BODY = "#1F2A3A", "#2A3542"
BLUE, SKY = "#3E6DB5", "#9DBBE6"
GRAY, MIST = "#57616F", "#D9E2EF"
SERIF, SANS = "Times-Roman", "Inter"

MAX_TEXT_CHARS = 15000
MAX_SLIDES = 10

# Inner slot of the slide-3 image frame (frame at 560,160 340×255, 12px inset)
IMG_SLOT = {"left": 572, "top": 172, "w": 316, "h": 231}


# ---- element factories ------------------------------------------------------

def _text(content, size, font, color, left, top, z=2, bold=False, italic=False):
    return {"category": "text", "content": content, "fontSize": size, "fontFamily": font,
            "color": color, "left": left, "top": top, "zIndex": z, "bold": bold, "italic": italic}


def _block(content, left, top, w, h, size, lh, color=BODY, font=SANS, z=2, bold=False,
           align="left", bullets=False, italic=False):
    return {"category": "textarea", "content": content, "left": left, "top": top,
            "width": w, "height": h, "fontSize": size, "lineHeight": lh, "letterSpacing": 0,
            "color": color, "fontFamily": font, "zIndex": z, "bold": bold, "italic": italic,
            "align": align, "bulletList": bullets}


def _line(left, top, w, h, color, z=1):
    return {"category": "line", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "zIndex": z}


def _rect(left, top, w, h, color, bw=1.5, z=1):
    return {"category": "rectangle", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "borderWidth": bw, "zIndex": z}


def _conn(source_id, target_id):
    return {"category": "connector", "source_id": source_id, "target_id": target_id,
            "backgroundColor": BLUE, "borderWidth": 1.5, "arrow": True, "zIndex": 6}


def _bullets_text(items):
    return "\n".join(f"• {b.lstrip('•- ').strip()}" for b in items if b and b.strip())


def _footer(page_no, deck_name):
    return [
        _line(80, 497, 800, 1, MIST),
        _text(f"{page_no:02d}", 10, SANS, GRAY, 862, 507),
        _text(deck_name[:40], 10, SANS, GRAY, 80, 507),
    ]


def _header(title):
    return [
        _text(title, 28, SERIF, INK, 80, 64, bold=True),
        _line(80, 106, 56, 3, BLUE, 2),
    ]


# ---- PDF text ---------------------------------------------------------------

def extract_pdf_text(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    chunks = [page.get_text() for page in doc]
    doc.close()
    text = "\n".join(chunks).strip()
    if not text:
        raise ValueError("The uploaded PDF contains no extractable text.")
    return text[:MAX_TEXT_CHARS]


# ---- image analysis ---------------------------------------------------------

def _image_dims(path: str):
    try:
        pix = fitz.Pixmap(path)
        return pix.width, pix.height
    except Exception:
        return 4, 3  # aspect fallback


def _image_src_url(file_path: str) -> str:
    if file_path.startswith(("http://", "https://")):
        return file_path
    return f"{BACKEND_URL}/{str(file_path).replace(chr(92), '/')}"


def analyze_images(image_rows) -> dict:
    """id → {src, caption, w, h}. Caption via OpenAI vision; falls back to the
    filename when the call fails so generation never dies on one image."""
    info = {}
    for row in image_rows:
        src = _image_src_url(row.file_path)
        local = image_src_to_local_path(src)
        w, h = _image_dims(local)
        caption = (row.filename or "image").rsplit(".", 1)[0]
        try:
            with open(local, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            mime = row.mime_type or "image/png"
            resp = _get_client().chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": [
                    {"type": "text", "text":
                        "In ONE sentence: what does this image show and what concept "
                        "could it illustrate on a presentation slide?"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"}},
                ]}],
                max_tokens=80,
                temperature=0.2,
            )
            caption = resp.choices[0].message.content.strip()
        except Exception:
            pass
        info[row.id] = {"src": src, "caption": caption, "w": w, "h": h}
    return info


# ---- slide plan (LLM) -------------------------------------------------------

def plan_deck(document_text: str, images: dict) -> dict:
    img_lines = "\n".join(f'- image_id {iid}: {meta["caption"]}' for iid, meta in images.items()) or "(none)"
    prompt = (
        "You are a presentation designer. Turn the DOCUMENT below into a slide deck plan.\n"
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "deck_title": "short deck title",\n'
        '  "slides": [\n'
        '    {"layout":"title","kicker":"COMPANY · 2026","title":"...","subtitle":"...","author":"..."},\n'
        '    {"layout":"agenda","title":"Agenda","items":[{"title":"...","detail":"one line"}]},   // 2-4 items\n'
        '    {"layout":"bullets","title":"...","bullets":["...", "..."]},                          // 3-5 bullets\n'
        '    {"layout":"image_right","title":"...","bullets":["..."],"image_id":123},              // needs an image\n'
        '    {"layout":"two_column","title":"...","left_title":"...","left_bullets":["..."],"right_title":"...","right_bullets":["..."]},\n'
        '    {"layout":"quote","quote":"...","attribution":"..."},\n'
        '    {"layout":"closing","title":"Thank you.","contact":"email · phone · site"}\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        f"- {MAX_SLIDES} slides MAX. First slide layout=title, last slide layout=closing.\n"
        "- Base every slide on the document's actual content; keep bullets short (max ~90 chars).\n"
        "- AVAILABLE IMAGES (use each at most once, ONLY where its caption genuinely matches the\n"
        "  slide's content, via an image_right slide with its image_id):\n"
        f"{img_lines}\n\n"
        f"DOCUMENT:\n{document_text}"
    )
    resp = _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=3500,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    plan = json.loads(resp.choices[0].message.content)
    if not isinstance(plan.get("slides"), list) or not plan["slides"]:
        raise ValueError("The AI returned an empty slide plan.")
    plan["slides"] = plan["slides"][:MAX_SLIDES]
    return plan


# ---- layout engine ----------------------------------------------------------

def _slide_title(s, page):
    els = [
        _line(0, 0, 14, 540, BLUE), _line(14, 0, 3, 540, SKY),
        _rect(700, 140, 180, 180, SKY, 1.5), _rect(730, 170, 180, 180, BLUE, 1.5),
        _line(676, 116, 14, 14, BLUE),
        _text((s.get("kicker") or "PRESENTATION").upper(), 11, SANS, BLUE, 84, 96, bold=True),
        _block(s.get("title") or "Untitled deck", 84, 150, 520, 120,
               44 if len(s.get("title") or "") <= 42 else 34, 52, INK, SERIF, bold=True),
        _line(84, 296, 110, 3, BLUE, 2),
    ]
    if s.get("subtitle"):
        els.append(_block(s["subtitle"], 84, 320, 480, 48, 15, 22, GRAY, SANS))
    if s.get("author"):
        els.append(_text(s["author"], 12, SANS, INK, 84, 452, bold=True))
    return els


def _slide_agenda(s, page, deck_name):
    items = (s.get("items") or [])[:4] or [{"title": "Agenda", "detail": ""}]
    n = len(items)
    box_w = 200 if n <= 3 else 190
    lefts = [80] if n == 1 else [round(80 + i * (800 - box_w) / (n - 1)) for i in range(n)]
    els = _header(s.get("title") or "Agenda")
    prev_id = None
    for i, (left, item) in enumerate(zip(lefts, items)):
        box_id = f"p{page}-ag{i}"
        els.append({**_rect(left, 210, box_w, 130, BLUE, 1.5, 2), "id": box_id})
        els.append(_text(f"{i + 1:02d}", 20, SERIF, BLUE, left + 18, 226, 3, bold=True))
        label = (item.get("title") or "").strip()
        detail = (item.get("detail") or "").strip()
        els.append(_block(f"{label}\n{detail}".strip(), left + 18, 268, box_w - 36, 56, 12.5, 18, BODY, SANS, 3))
        if prev_id:
            els.append(_conn(prev_id, box_id))
        prev_id = box_id
    return els + _footer(page, deck_name)


def _slide_bullets(s, page, deck_name):
    els = _header(s.get("title") or "")
    els.append(_block(_bullets_text(s.get("bullets") or []), 80, 160, 800, 300,
                      15, 26, BODY, SANS, bullets=True))
    return els + _footer(page, deck_name)


def _slide_image_right(s, page, deck_name, images):
    els = _header(s.get("title") or "")
    els.append(_block(_bullets_text(s.get("bullets") or []), 80, 160, 400, 240,
                      14, 24, BODY, SANS, bullets=True))
    els.append(_rect(548, 148, 340, 255, MIST, 1.5, 1))
    els.append(_rect(560, 160, 340, 255, BLUE, 1.5, 2))
    meta = images.get(s.get("image_id"))
    if meta:
        # fit inside the frame slot, preserving aspect, centered
        scale = min(IMG_SLOT["w"] / meta["w"], IMG_SLOT["h"] / meta["h"])
        w, h = round(meta["w"] * scale), round(meta["h"] * scale)
        left = IMG_SLOT["left"] + (IMG_SLOT["w"] - w) // 2
        top = IMG_SLOT["top"] + (IMG_SLOT["h"] - h) // 2
        els.append({"category": "image", "src": meta["src"], "img_id": s.get("image_id"),
                    "left": left, "top": top, "width": w, "height": h, "zIndex": 3})
        els.append(_text(meta["caption"][:80], 9.5, SANS, GRAY, 560, 430))
    else:
        els.append(_text("Image placeholder", 10.5, SANS, "#8894A5", 672, 278, 3))
    return els + _footer(page, deck_name)


def _slide_two_column(s, page, deck_name):
    els = _header(s.get("title") or "")
    els.append(_line(478, 160, 2, 270, MIST))
    els.append(_text(s.get("left_title") or "", 15, SANS, INK, 80, 162, bold=True))
    els.append(_block(_bullets_text(s.get("left_bullets") or []), 80, 192, 360, 230,
                      12.5, 20, BODY, SANS, bullets=True))
    els.append(_text(s.get("right_title") or "", 15, SANS, INK, 518, 162, bold=True))
    els.append(_block(_bullets_text(s.get("right_bullets") or []), 518, 192, 360, 230,
                      12.5, 20, BODY, SANS, bullets=True))
    return els + _footer(page, deck_name)


def _slide_quote(s, page, deck_name):
    els = [
        _text("“", 90, SERIF, SKY, 96, 96, 1),
        _block(s.get("quote") or "", 150, 180, 660, 130, 28, 40, INK, SERIF,
               align="center", italic=True),
        _line(430, 330, 100, 3, BLUE, 2),
    ]
    if s.get("attribution"):
        els.append(_block(f"— {s['attribution']}", 230, 352, 500, 24, 12.5, 17, GRAY, SANS, align="center"))
    return els + _footer(page, deck_name)


def _slide_closing(s, page, deck_name):
    els = [
        _rect(880, 44, 36, 36, SKY, 1), _line(864, 28, 12, 12, BLUE),
        _block(s.get("title") or "Thank you.", 230, 196, 500, 64, 46, 56, INK, SERIF,
               bold=True, align="center"),
        _line(430, 286, 100, 3, BLUE, 2),
    ]
    if s.get("contact"):
        els.append(_block(s["contact"], 230, 312, 500, 24, 12.5, 17, GRAY, SANS, align="center"))
    return els + _footer(page, deck_name)


_LAYOUTS = {
    "agenda": _slide_agenda,
    "bullets": _slide_bullets,
    "two_column": _slide_two_column,
    "quote": _slide_quote,
    "closing": _slide_closing,
}


def build_deck(plan: dict, images: dict) -> list[dict]:
    deck_name = plan.get("deck_title") or "Deck"
    elements = []
    for page, slide in enumerate(plan["slides"], start=1):
        layout = slide.get("layout") or "bullets"
        if layout == "title":
            els = _slide_title(slide, page)
        elif layout == "image_right":
            els = _slide_image_right(slide, page, deck_name, images)
        else:
            els = _LAYOUTS.get(layout, _slide_bullets)(slide, page, deck_name)
        for el in els:
            el["page"] = page
        elements.extend(els)
    return elements


def generate_deck(pdf_bytes: bytes, image_rows) -> dict:
    text = extract_pdf_text(pdf_bytes)
    images = analyze_images(image_rows)
    plan = plan_deck(text, images)
    elements = build_deck(plan, images)
    return {"title": plan.get("deck_title") or "Deck", "elements": elements}
