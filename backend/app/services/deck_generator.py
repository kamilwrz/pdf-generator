"""AI deck generation: uploaded PDF text + vision-captioned gallery images →
slide plan (LLM) → deterministic 960×540 layout in one of the deck themes.
Geometry + themes mirror the frontend's templates/meridian.js (makeDeckTemplate
+ DECK_THEMES). Keep the two in sync.

Pipeline (route /ai/generate_deck):
  extract_pdf_text → analyze_images → plan_deck → build_deck(theme)
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
        raise ValueError("Klucz API OpenAI nie jest skonfigurowany (API_GPT_KEY).")
    return OpenAI(api_key=key)


# ---- themes (mirror of DECK_THEMES in meridian.js) --------------------------
DECK_THEMES = {
    "meridian": {
        "name": "Meridian", "dark": False, "bg": "#FFFFFF",
        "ink": "#1F2A3A", "body": "#2A3542", "accent": "#3E6DB5", "soft": "#9DBBE6",
        "gray": "#57616F", "mist": "#D9E2EF", "placeholder": "#8894A5",
        "display": "Times-Roman", "sans": "Inter",
    },
    "onyx": {
        "name": "Onyx", "dark": True, "bg": "#14181F",
        "ink": "#F2F5F9", "body": "#C7CFDA", "accent": "#F25F4C", "soft": "#7A8494",
        "gray": "#8B94A3", "mist": "#2A313C", "placeholder": "#6C7686",
        "display": "Inter", "sans": "Inter",
    },
    "verdant": {
        "name": "Verdant", "dark": False, "bg": "#FFFFFF",
        "ink": "#1E2B24", "body": "#2F3E35", "accent": "#3E7A5E", "soft": "#A8C8B8",
        "gray": "#5F6B64", "mist": "#DCE7E0", "placeholder": "#8AA294",
        "display": "Helvetica", "sans": "Roboto",
    },
}

PAGE_W, PAGE_H = 960, 540
MAX_TEXT_CHARS = 60000
MAX_SLIDES = 60

# Planning model: newest reasoning-capable OpenAI model. Overridable via env
# (DECK_PLAN_MODEL) so a newer model id can be adopted without a code change.
PLAN_MODEL = os.getenv("DECK_PLAN_MODEL", "gpt-5.6")

# Inner slot of the image frame on image_right slides (frame 560,160 340×255, 12px inset)
IMG_SLOT = {"left": 572, "top": 172, "w": 316, "h": 231}


# ---- element factories ------------------------------------------------------

def _text(content, size, font, color, left, top, z=2, bold=False, italic=False):
    return {"category": "text", "content": content, "fontSize": size, "fontFamily": font,
            "color": color, "left": left, "top": top, "zIndex": z, "bold": bold, "italic": italic}


def _block(content, left, top, w, h, size, lh, color, font, z=2, bold=False,
           align="left", bullets=False, italic=False):
    return {"category": "textarea", "content": content, "left": left, "top": top,
            "width": w, "height": h, "fontSize": size, "lineHeight": lh, "letterSpacing": 0,
            "color": color, "fontFamily": font, "zIndex": z, "bold": bold, "italic": italic,
            "align": align, "bulletList": bullets, "autoHeight": True}


def _line(left, top, w, h, color, z=1):
    return {"category": "line", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "zIndex": z}


def _rect(left, top, w, h, color, bw=1.5, z=1):
    return {"category": "rectangle", "left": left, "top": top, "width": w, "height": h,
            "backgroundColor": color, "borderWidth": bw, "zIndex": z}


def _conn(source_id, target_id, T):
    return {"category": "connector", "source_id": source_id, "target_id": target_id,
            "backgroundColor": T["accent"], "borderWidth": 1.5, "arrow": True, "zIndex": 6}


def _bullets_text(items):
    return "\n".join(f"• {b.lstrip('•- ').strip()}" for b in items if b and b.strip())


def _bg(T):
    """Full-bleed background block for dark themes (zIndex 0, drawn first)."""
    return [_line(0, 0, PAGE_W, PAGE_H, T["bg"], 0)] if T["dark"] else []


def _footer(page_no, deck_name, T):
    return [
        _line(80, 497, 800, 1, T["mist"]),
        _text(f"{page_no:02d}", 10, T["sans"], T["gray"], 862, 507),
        _text(deck_name[:40], 10, T["sans"], T["gray"], 80, 507),
    ]


def _header(title, T):
    return [
        _text(title, 28, T["display"], T["ink"], 80, 64, bold=True),
        _line(80, 106, 56, 3, T["accent"], 2),
    ]


# ---- PDF text ---------------------------------------------------------------

def extract_pdf_text(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    chunks = [page.get_text() for page in doc]
    doc.close()
    text = "\n".join(chunks).strip()
    if not text:
        raise ValueError("Przesłany plik PDF nie zawiera tekstu do wyodrębnienia.")
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
                        "W JEDNYM zdaniu po polsku: co pokazuje ten obraz i jaki koncept "
                        "mógłby ilustrować na slajdzie prezentacji?"},
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
        "Jesteś starszym projektantem prezentacji i tworzysz OBSZERNĄ, merytoryczną\n"
        "prezentację edukacyjną na podstawie DOKUMENTU poniżej. Odbiorca powinien poznać\n"
        "całą treść dokumentu ze slajdów, bez czytania oryginału.\n"
        "Pisz po polsku. Zwróć WYŁĄCZNIE obiekt JSON:\n"
        "{\n"
        '  "deck_title": "krótki tytuł prezentacji",\n'
        '  "slides": [\n'
        '    {"layout":"title","kicker":"FIRMA · 2026","title":"...","subtitle":"...","author":"..."},\n'
        '    {"layout":"agenda","title":"Agenda","items":[{"title":"...","detail":"jedna linia"}]},   // 2-4 pozycje\n'
        '    {"layout":"bullets","title":"...","bullets":["...", "..."]},                          // 3-6 punktów\n'
        '    {"layout":"image_right","title":"...","bullets":["..."],"image_id":123},              // wymaga obrazu\n'
        '    {"layout":"two_column","title":"...","left_title":"...","left_bullets":["..."],"right_title":"...","right_bullets":["..."]},\n'
        '    {"layout":"quote","quote":"...","attribution":"..."},\n'
        '    {"layout":"closing","title":"Dziękuję.","contact":"email · telefon · strona"}\n'
        "  ]\n"
        "}\n\n"
        "Zasady pokrycia — głębia zamiast skrótów:\n"
        "- Obejmij CAŁY dokument. NIE streszczaj go nadmiernie: każda istotna sekcja,\n"
        "  koncepcja, argument, liczba i przykład z dokumentu musi mieć miejsce na slajdzie.\n"
        f"- Użyj tylu slajdów, ile wymaga treść — 20, 30, nawet 50 (twardy limit {MAX_SLIDES}).\n"
        "  Krótki dokument może wymagać tylko 8; gęsty powinien dostać znacznie więcej. Bez slajdów-wypełniaczy\n"
        "  i bez upychania trzech tematów na jednym slajdzie.\n"
        "- JEDEN temat na slajd. Gdy temat ma więcej niż ~6 punktów materiału, podziel go\n"
        "  na kolejne slajdy ('Temat (1/2)', 'Temat (2/2)').\n"
        "- Slajdy agendy jako separatory sekcji w długich deckach; two_column do porównań/kontrastów/przed-po;\n"
        "  quote dla naprawdę mocnego zdania z dokumentu.\n"
        "- Punkty: konkretne i szczegółowe (liczby, nazwy, związki przyczynowe z dokumentu),\n"
        "  maks. ~110 znaków każdy.\n"
        "- Pierwszy slajd layout=title, ostatni layout=closing.\n"
        "- DOSTĘPNE OBRAZY: każdy użyj co najwyżej raz, w slajdzie image_right, dokładnie\n"
        "  tam, gdzie treść slajdu pasuje do tego, co pokazuje obraz. Obraz stoi obok tekstu —\n"
        "  podpis nie jest renderowany, więc nie polegaj na podpisie:\n"
        f"{img_lines}\n\n"
        f"DOKUMENT:\n{document_text}"
    )
    resp = _get_client().chat.completions.create(
        model=PLAN_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=24000,
        response_format={"type": "json_object"},
    )
    plan = json.loads(resp.choices[0].message.content)
    if not isinstance(plan.get("slides"), list) or not plan["slides"]:
        raise ValueError("AI zwróciło pusty plan slajdów.")
    plan["slides"] = plan["slides"][:MAX_SLIDES]
    return plan


# ---- layout engine ----------------------------------------------------------

def _slide_title(s, page, T):
    title = s.get("title") or "Prezentacja bez tytułu"
    els = _bg(T) + [
        _line(0, 0, 14, 540, T["accent"]), _line(14, 0, 3, 540, T["soft"]),
        _rect(700, 140, 180, 180, T["soft"], 1.5), _rect(730, 170, 180, 180, T["accent"], 1.5),
        _line(676, 116, 14, 14, T["accent"]),
        _text((s.get("kicker") or "PREZENTACJA").upper(), 11, T["sans"], T["accent"], 84, 96, bold=True),
        _block(title, 84, 150, 520, 120, 44 if len(title) <= 42 else 34, 52, T["ink"], T["display"], bold=True),
        _line(84, 296, 110, 3, T["accent"], 2),
    ]
    if s.get("subtitle"):
        els.append(_block(s["subtitle"], 84, 320, 480, 48, 15, 22, T["gray"], T["sans"]))
    if s.get("author"):
        els.append(_text(s["author"], 12, T["sans"], T["ink"], 84, 452, bold=True))
    return els


def _slide_agenda(s, page, deck_name, T):
    items = (s.get("items") or [])[:4] or [{"title": "Agenda", "detail": ""}]
    n = len(items)
    box_w = 200 if n <= 3 else 190
    lefts = [80] if n == 1 else [round(80 + i * (800 - box_w) / (n - 1)) for i in range(n)]
    els = _bg(T) + _header(s.get("title") or "Agenda", T)
    prev_id = None
    for i, (left, item) in enumerate(zip(lefts, items)):
        box_id = f"p{page}-ag{i}"
        els.append({**_rect(left, 210, box_w, 130, T["accent"], 1.5, 2), "id": box_id})
        els.append(_text(f"{i + 1:02d}", 20, T["display"], T["accent"], left + 18, 226, 3, bold=True))
        label = (item.get("title") or "").strip()
        detail = (item.get("detail") or "").strip()
        els.append(_block(f"{label}\n{detail}".strip(), left + 18, 268, box_w - 36, 56, 12.5, 18, T["body"], T["sans"], 3))
        if prev_id:
            els.append(_conn(prev_id, box_id, T))
        prev_id = box_id
    return els + _footer(page, deck_name, T)


def _slide_bullets(s, page, deck_name, T):
    els = _bg(T) + _header(s.get("title") or "", T)
    els.append(_block(_bullets_text(s.get("bullets") or []), 80, 160, 800, 300,
                      15, 26, T["body"], T["sans"], bullets=True))
    return els + _footer(page, deck_name, T)


def _slide_image_right(s, page, deck_name, T, images):
    els = _bg(T) + _header(s.get("title") or "", T)
    els.append(_block(_bullets_text(s.get("bullets") or []), 80, 160, 400, 240,
                      14, 24, T["body"], T["sans"], bullets=True))
    els.append(_rect(548, 148, 340, 255, T["mist"], 1.5, 1))
    els.append(_rect(560, 160, 340, 255, T["accent"], 1.5, 2))
    meta = images.get(s.get("image_id"))
    if meta:
        # The image simply sits beside the matching text — the vision caption is
        # used only for slide matching and is never rendered on the slide.
        scale = min(IMG_SLOT["w"] / meta["w"], IMG_SLOT["h"] / meta["h"])
        w, h = round(meta["w"] * scale), round(meta["h"] * scale)
        left = IMG_SLOT["left"] + (IMG_SLOT["w"] - w) // 2
        top = IMG_SLOT["top"] + (IMG_SLOT["h"] - h) // 2
        els.append({"category": "image", "src": meta["src"], "img_id": s.get("image_id"),
                    "left": left, "top": top, "width": w, "height": h, "zIndex": 3})
    else:
        els.append(_text("Symbol zastępczy obrazu", 10.5, T["sans"], T["placeholder"], 672, 278, 3))
    return els + _footer(page, deck_name, T)


def _slide_two_column(s, page, deck_name, T):
    els = _bg(T) + _header(s.get("title") or "", T)
    els.append(_line(478, 160, 2, 270, T["mist"]))
    els.append(_text(s.get("left_title") or "", 15, T["sans"], T["ink"], 80, 162, bold=True))
    els.append(_block(_bullets_text(s.get("left_bullets") or []), 80, 192, 360, 230,
                      12.5, 20, T["body"], T["sans"], bullets=True))
    els.append(_text(s.get("right_title") or "", 15, T["sans"], T["ink"], 518, 162, bold=True))
    els.append(_block(_bullets_text(s.get("right_bullets") or []), 518, 192, 360, 230,
                      12.5, 20, T["body"], T["sans"], bullets=True))
    return els + _footer(page, deck_name, T)


def _slide_quote(s, page, deck_name, T):
    els = _bg(T) + [
        _text("“", 90, T["display"], T["soft"], 96, 96, 1),
        _block(s.get("quote") or "", 150, 180, 660, 130, 28, 40, T["ink"], T["display"],
               align="center", italic=True),
        _line(430, 330, 100, 3, T["accent"], 2),
    ]
    if s.get("attribution"):
        els.append(_block(f"— {s['attribution']}", 230, 352, 500, 24, 12.5, 17, T["gray"], T["sans"], align="center"))
    return els + _footer(page, deck_name, T)


def _slide_closing(s, page, deck_name, T):
    els = _bg(T) + [
        _rect(880, 44, 36, 36, T["soft"], 1), _line(864, 28, 12, 12, T["accent"]),
        _block(s.get("title") or "Dziękuję.", 230, 196, 500, 64, 46, 56, T["ink"], T["display"],
               bold=True, align="center"),
        _line(430, 286, 100, 3, T["accent"], 2),
    ]
    if s.get("contact"):
        els.append(_block(s["contact"], 230, 312, 500, 24, 12.5, 17, T["gray"], T["sans"], align="center"))
    return els + _footer(page, deck_name, T)


def build_deck(plan: dict, images: dict, template_id: str = "meridian") -> list[dict]:
    T = DECK_THEMES.get(template_id)
    if T is None:
        raise ValueError(f"Nieznany szablon prezentacji '{template_id}'. Dostępne: {', '.join(DECK_THEMES)}.")
    deck_name = plan.get("deck_title") or "Prezentacja"
    elements = []
    for page, slide in enumerate(plan["slides"], start=1):
        layout = slide.get("layout") or "bullets"
        if layout == "title":
            els = _slide_title(slide, page, T)
        elif layout == "agenda":
            els = _slide_agenda(slide, page, deck_name, T)
        elif layout == "image_right":
            els = _slide_image_right(slide, page, deck_name, T, images)
        elif layout == "two_column":
            els = _slide_two_column(slide, page, deck_name, T)
        elif layout == "quote":
            els = _slide_quote(slide, page, deck_name, T)
        elif layout == "closing":
            els = _slide_closing(slide, page, deck_name, T)
        else:
            els = _slide_bullets(slide, page, deck_name, T)
        for el in els:
            el["page"] = page
        elements.extend(els)
    return elements


def generate_deck(pdf_bytes: bytes, image_rows, template_id: str = "meridian") -> dict:
    if template_id not in DECK_THEMES:
        raise ValueError(f"Nieznany szablon prezentacji '{template_id}'. Dostępne: {', '.join(DECK_THEMES)}.")
    text = extract_pdf_text(pdf_bytes)
    images = analyze_images(image_rows)
    plan = plan_deck(text, images)
    elements = build_deck(plan, images, template_id)
    return {"title": plan.get("deck_title") or "Prezentacja", "elements": elements}
