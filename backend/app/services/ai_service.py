import base64
import json
import math
import fitz
from openai import OpenAI
from app.core.config import OPENAI_API_KEY
from app.services.cv_data import normalize_cv_data
from app.services.openai_pricing import usage_from_response

_client = OpenAI(api_key=OPENAI_API_KEY)
_EXTRACT_MODEL = "gpt-4o"


# ── PDF → images ──────────────────────────────────────────────────────────────

def _pdf_to_b64_images(pdf_bytes: bytes, max_pages: int = 3) -> list[str]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72))
        out.append(base64.b64encode(pix.tobytes("png")).decode())
    doc.close()
    return out


# ── CV data extraction ─────────────────────────────────────────────────────────

def extract_cv_data(pdf_bytes: bytes) -> tuple[dict, dict]:
    """Extract structured CV data. Returns (cv_data, usage_cost)."""
    images = _pdf_to_b64_images(pdf_bytes)
    if not images:
        raise ValueError("Nie udało się wyrenderować żadnej strony z przesłanego pliku PDF.")

    content: list[dict] = [
        {
            "type": "text",
            "text": (
                "Jesteś precyzyjnym ekstraktorem danych z CV. "
                "Przeczytaj każdą stronę CV i zwróć WYŁĄCZNIE obiekt JSON — bez markdown:\n"
                "{\n"
                '  "name":"","title":"","email":"","phone":"","location":"",\n'
                '  "summary":"",\n'
                '  "experience":[{"title":"","company":"","period":"","bullets":[]}],\n'
                '  "education":[{"school":"","city":"","degree":"","period":"","description":""}],\n'
                '  "skills":[],\n'
                '  "language":"Polish",\n'
                '  "labels":{"summary":"PODSUMOWANIE ZAWODOWE","experience":"DOŚWIADCZENIE ZAWODOWE","education":"WYKSZTAŁCENIE","skills":"UMIEJĘTNOŚCI"},\n'
                '  "extra_sections":[{"title":"","kind":"languages|certifications|interests|other","placement":"after_skills","items":[]}]\n'
                "}\n\n"
                "Zasady:\n"
                "- experience: WSZYSTKIE stanowiska od najnowszego; WSZYSTKIE punkty (bez limitu)\n"
                "- education: WSZYSTKIE wpisy od najnowszego. Dla każdego wpisu:\n"
                "  school = uczelnia/szkoła, city = miasto, degree = kierunek/tytuł/dyplom,\n"
                "  period = lata, description = opis pod dyplomem (specjalizacja, praca dyplomowa,\n"
                "  osiągnięcia, dodatkowy tekst — NIE wklejaj go do school/degree).\n"
                "  Jeśli w CV nie ma opisu, description zostaw jako pusty string.\n"
                "- language: główny język CV (np. 'Polish', 'English', 'German')\n"
                "- labels: zawsze zwracaj cztery standardowe nagłówki po polsku, WIELKIMI LITERAMI:\n"
                "  'PODSUMOWANIE ZAWODOWE', 'DOŚWIADCZENIE ZAWODOWE', 'WYKSZTAŁCENIE', 'UMIEJĘTNOŚCI'.\n"
                "- extra_sections: każda sekcja CV NIEobjęta experience/education/skills/summary.\n"
                "  Przykłady: Certyfikaty, Języki, Projekty, Nagrody, Publikacje,\n"
                "  Wolontariat, Zainteresowania, Referencje, Kursy, Szkolenia — tytuł po polsku, WIELKIMI LITERAMI.\n"
                "  kind: 'languages' dla sekcji języków, 'certifications' dla certyfikatów/licencji/kursów,\n"
                "        'interests' dla zainteresowań/hobby, 'other' dla pozostałych sekcji.\n"
                "  placement: 'after_experience' dla sekcji z punktami (projekty, nagrody, wolontariat);\n"
                "             'after_skills' dla zwartych list (języki, certyfikaty, zainteresowania).\n"
                "  items: płaska lista stringów (jeden element na string).\n"
                "- Zachowaj oryginalny język treści CV, ale etykiety i tytuły dodatkowych sekcji zwracaj po polsku.\n"
                "- Zwróć WYŁĄCZNIE poprawny JSON."
            ),
        }
    ]
    for b64 in images:
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}}
        )

    resp = _client.chat.completions.create(
        model=_EXTRACT_MODEL,
        messages=[{"role": "user", "content": content}],
        max_tokens=3000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    usage = usage_from_response(resp, model=_EXTRACT_MODEL, action="extract_cv")
    return normalize_cv_data(json.loads(resp.choices[0].message.content)), usage


# ── Post-processing: fix textarea heights from actual content ─────────────────

def _fix_heights_and_reflow(elements: list[dict]) -> list[dict]:
    """
    Recalculate every textarea's height from its actual content lines and
    propagate the height delta downward so elements don't overlap.

    Column grouping (left // 210):
      • 0  → left column  (single-col templates or sidebar in two-col)
      • 1+ → main / right column
    """
    els = [dict(e) for e in elements]

    # process in top-to-bottom order within each page+column
    els.sort(key=lambda e: (e.get("page", 1), e.get("left", 0) // 210, e.get("top", 0)))

    for i, el in enumerate(els):
        if el.get("category") != "textarea":
            continue

        content = el.get("content", "") or ""
        lh      = float(el.get("lineHeight") or 14)
        w       = float(el.get("width")      or 200)
        fs      = float(el.get("fontSize")   or 10)

        # characters that fit on one line (Inter metrics ≈ 0.52 × fontSize)
        cpl = max(10, int(w / (fs * 0.52)))

        actual_lines = 0
        for raw_line in content.split("\n"):
            stripped = raw_line.strip()
            if not stripped:
                actual_lines += 1          # blank line still takes vertical space
            else:
                actual_lines += max(1, math.ceil(len(stripped) / cpl))

        new_h = round(max(actual_lines, 1) * lh + 6)   # +6 px padding top+bottom
        old_h = float(el.get("height") or new_h)
        delta = new_h - old_h

        els[i]["height"] = new_h

        if abs(delta) < 0.5:
            continue

        # shift every element that sits below this one in the same page+column
        el_page = el.get("page", 1)
        el_top  = el.get("top",  0)
        el_col  = el.get("left", 0) // 210

        for j, other in enumerate(els):
            if j == i:
                continue
            if (other.get("page", 1) == el_page
                    and other.get("top",  0) >  el_top
                    and other.get("left", 0) // 210 == el_col):
                els[j]["top"] = round(other["top"] + delta, 1)

    return els


# ── Template visual DNA ────────────────────────────────────────────────────────

_TEMPLATES: dict[str, dict] = {

    "finance": {
        "static": [],
        "style": """\
LAYOUT: single column  |  left=50  content_width=495  start_y=54
COLORS:  ink=#16243A  sub=#5A6B7B  gray=#6B7280  gold=#B08D57  body=#2B2B2B
FONTS:   headings=Times-Roman (bold, UPPERCASE)   body/bullets=Inter

HEADER (top=54):
  name      fontSize=30  Times-Roman  #16243A  bold=true
  title     fontSize=14  Times-Roman  #5A6B7B                (gap after name = 4)
  contact   fontSize=9.5 Inter        #5A6B7B  "email · phone · city"  (gap=4)
  separator line left=50 width=495 height=1.5 #16243A        (gap after contact=8)

SECTION PATTERN (first section gap=16, subsequent=22):
  heading   fontSize=12  Times-Roman  #16243A  bold=true  UPPERCASE
  gold_bar  line left=50 width=70 height=2 #B08D57            (2pt below heading)
  [10pt gap, then content]

PER JOB (repeat for EVERY job):
  job_title  fontSize=11  Inter  #16243A  bold=true
  company    fontSize=9.5 Inter  #6B7280  "Company   ·   Period"  (2pt gap)
  bullets    textarea: fontSize=10 lineHeight=14 Inter #2B2B2B width=495
             content: "• bullet1\\n• bullet2\\n• bullet3"
             HEIGHT = (number_of_newlines+1) × 14 + 6      ← count \\n chars exactly
  [gap 14pt after bullets before next job]

SUMMARY textarea:  fontSize=10.5 lineHeight=15 Inter #2B2B2B width=495
SKILLS  textarea:  fontSize=10   lineHeight=15 Inter #2B2B2B width=495  skills joined " · "
EDUCATION:  degree fontSize=11 Inter bold #16243A  |  period 9.5pt Inter #6B7280  (gap 10 between entries)
""",
    },

    "nocturne": {
        "static": [
            {"category": "line", "left": 0, "top": 0, "width": 595, "height": 160,
             "backgroundColor": "#1F2933", "zIndex": 0, "page": 1},
            {"category": "line", "left": 50, "top": 120, "width": 56, "height": 4,
             "backgroundColor": "#F25F4C", "zIndex": 1, "page": 1},
        ],
        "style": """\
LAYOUT: single column  |  left=50  content_width=495
COLORS:  ink=#1F2933  coral=#F25F4C  gray=#6B7280  body=#1F2933  light=#AEB6BD
FONTS:   all Inter

HEADER (inside dark band — white/coral text):
  name     fontSize=32  Inter  #FFFFFF  bold=true  top=56
  title    fontSize=14  Inter  #F25F4C             (gap=4 after name)
  contact  fontSize=9.5 Inter  #AEB6BD  "email · phone · city"  (gap=4)

CONTENT starts at top=192 (below band):

SECTION PATTERN (first gap=0, subsequent=22):
  heading   fontSize=12  Inter  #1F2933  bold=true  UPPERCASE
  coral_bar line left=50 width=40 height=2 #F25F4C   (2pt below heading)
  [10pt gap, then content]

PER JOB (EVERY job):
  job_title  fontSize=11  Inter  #1F2933  bold=true
  company    fontSize=9.5 Inter  #6B7280  "Company   ·   Period"  (2pt gap)
  bullets    textarea: fontSize=10 lineHeight=14 Inter #1F2933 width=495
             HEIGHT = (number_of_newlines+1) × 14 + 6
  [gap 14pt]

SUMMARY: fontSize=10.5 lineHeight=15 Inter #1F2933 width=495
SKILLS:  fontSize=10   lineHeight=15 Inter #1F2933 width=495  skills joined " · "
EDUCATION: degree 11pt Inter bold #1F2933  |  period 9.5pt Inter #6B7280  (gap 10)
""",
    },

    "ampersand": {
        "static": [
            {"category": "line", "left": 0, "top": 0, "width": 9, "height": 842,
             "backgroundColor": "#7B2D3A", "zIndex": 0, "page": 1},
        ],
        "style": """\
LAYOUT: single column  |  left=50  content_width=497  (wine left-stripe already placed)
COLORS:  ink=#2A2320  wine=#7B2D3A  gray=#8A7F78  rule=#E0D7D1  body=#3A332E
FONTS:   all Times-Roman

HEADER (top=58):
  name     fontSize=31  Times-Roman  #2A2320  bold=true
  title    fontSize=14  Times-Roman  #7B2D3A  italic=true  (gap=4)
  contact  fontSize=9.5 Times-Roman  #8A7F78  "email · phone · city"  (gap=4)
  rule     line left=50 width=497 height=1 #E0D7D1                     (gap=8 after contact)

CONTENT starts ~16pt after rule:

SECTION (gap=20 before):
  heading   fontSize=12  Times-Roman  #2A2320  bold=true  UPPERCASE

PER JOB (EVERY job):
  job_title  fontSize=11.5  Times-Roman  #2A2320  bold=true  (gap=2)
  period     fontSize=9.5   Times-Roman  #8A7F78  italic=true  (gap=2)
  company    fontSize=9.5   Times-Roman  #8A7F78  (if company field not empty, gap=2)
  bullets    textarea: fontSize=10.5 lineHeight=15 Times-Roman #3A332E width=497
             HEIGHT = (number_of_newlines+1) × 15 + 6
  [gap 14pt]

SUMMARY: fontSize=11 lineHeight=16 Times-Roman #3A332E width=497
SKILLS:  fontSize=10.5 lineHeight=15 Times-Roman #3A332E width=497
EDUCATION: degree 11pt Times-Roman bold #2A2320  |  period 9.5pt italic #8A7F78  (gap 10)
""",
    },

    "education": {
        "static": [
            {"category": "line", "left": 28, "top": 28,  "width": 539, "height": 1,
             "backgroundColor": "#D8CDBA", "zIndex": 1, "page": 1},
            {"category": "line", "left": 28, "top": 813, "width": 539, "height": 1,
             "backgroundColor": "#D8CDBA", "zIndex": 1, "page": 1},
            {"category": "line", "left": 28, "top": 28,  "width": 1,   "height": 786,
             "backgroundColor": "#D8CDBA", "zIndex": 1, "page": 1},
            {"category": "line", "left": 566,"top": 28,  "width": 1,   "height": 786,
             "backgroundColor": "#D8CDBA", "zIndex": 1, "page": 1},
        ],
        "style": """\
LAYOUT: single column centered  |  left=55  content_width=485  (thin frame already placed)
COLORS:  ink=#2E2A25  sage=#4E7A6B  flank=#CBB89E  gray=#6B7280  body=#2B2B2B
FONTS:   headings=Times-Roman  body=Inter

HEADER (centered, top=52):
  name     fontSize=28  Times-Roman  #2E2A25  bold=true
           center it: left = (595 - len(name)*13) / 2  (estimate 13pt per char at 28pt)
  title    fontSize=13  Times-Roman  #4E7A6B  centered same formula  (gap=4)
  contact  fontSize=9.5 Inter        #6B7280  centered               (gap=4)
  divider  line left=248 width=100 height=1.5 #4E7A6B                (gap=8)

CONTENT starts ~16pt after divider:

SECTION PATTERN (gap=20 before):
  heading    fontSize=12  Times-Roman  #2E2A25  bold=true  UPPERCASE  centered (left≈(595-len*6)/2)
  left_flank  line left=90  width=150 height=1 #CBB89E  (same top as heading baseline +4)
  right_flank line left=355 width=150 height=1 #CBB89E  (same top)
  [10pt gap below]

PER JOB (EVERY job), left-aligned at left=55:
  job_title  fontSize=11  Inter  #2E2A25  bold=true
  company    fontSize=9.5 Inter  #6B7280  "Company   ·   Period"  (gap=2)
  bullets    textarea: fontSize=10 lineHeight=14 Inter #2B2B2B width=485 left=55
             HEIGHT = (number_of_newlines+1) × 14 + 6
  [gap 14pt]

SUMMARY: fontSize=10.5 lineHeight=15 Inter #2B2B2B width=485 left=55
SKILLS:  fontSize=10   lineHeight=15 Inter #2B2B2B width=485 left=55
EDUCATION: degree 11pt Inter bold #2E2A25  |  period 9.5pt Inter #6B7280  (gap 10)
""",
    },

    "it": {
        "static": [
            {"category": "line", "left": 0, "top": 0, "width": 190, "height": 842,
             "backgroundColor": "#0F2A33", "zIndex": 0, "page": 1},
            {"category": "line", "left": 43, "top": 38,  "width": 104, "height": 104,
             "backgroundColor": "#2BB3C0", "zIndex": 1, "page": 1},
            {"category": "line", "left": 45, "top": 40,  "width": 100, "height": 100,
             "backgroundColor": "#14333D", "zIndex": 2, "page": 1},
            {"category": "text", "content": "PHOTO", "fontSize": 10, "fontFamily": "Inter",
             "color": "#6E8C92", "left": 78, "top": 84, "zIndex": 3, "page": 1,
             "bold": False, "italic": False},
        ],
        "style": """\
LAYOUT: two-column  |  sidebar left=28 width=148 zIndex=3  |  main left=220 width=330
COLORS:  teal=#2BB3C0  white=#FFFFFF  light=#C9D8DA  mute=#9FB8BC  ink=#1F2937  gray=#6B7280  body=#3A4753
FONTS:   Inter throughout  (all sidebar elements use zIndex=3)

SIDEBAR (all elements zIndex=3, on top of dark background):
  name     top=158  fontSize=18  #FFFFFF  bold=true  left=28
  role     top≈182  fontSize=11  #2BB3C0             left=28  (gap=4 after name)
  "CONTACT" label  fontSize=10  #9FB8BC  bold=true  top=218  left=28
  teal bar  line left=28 width=40 height=2 #2BB3C0  top=232
  contact textarea  left=28 top=242 width=148  fontSize=9 lineHeight=15 #C9D8DA
    content: "email\\nphone\\ncity\\ngithub (if known)"
    HEIGHT = (number_of_newlines+1) × 15 + 6
  "SKILLS" label  fontSize=10  #9FB8BC  bold=true  left=28  (20pt after contact textarea)
  teal bar  line left=28 width=40 height=2  (2pt below label)
  skills textarea  left=28 width=148  fontSize=9 lineHeight=15 #C9D8DA
    content: one skill per line
    HEIGHT = num_skills × 15 + 6

MAIN COLUMN (left=220):
  CONTENT starts at top=48.
  SECTION PATTERN (gap=20):
    heading   fontSize=12  Inter  #1F2937  bold=true  UPPERCASE  left=220
    teal_bar  line left=220 width=60 height=2 #2BB3C0  (2pt below heading)
    [10pt gap]

  PER JOB (EVERY job):
    job_title  fontSize=11  Inter  #1F2937  bold=true  left=220
    company    fontSize=9.5 Inter  #6B7280  "Company   ·   Period"  left=220  (gap=2)
    bullets    textarea: fontSize=10 lineHeight=14 Inter #3A4753 left=220 width=330
               HEIGHT = (number_of_newlines+1) × 14 + 6
    [gap 14pt]

  SUMMARY: left=220 width=330  fontSize=10.5 lineHeight=15 Inter #3A4753
  EDUCATION: degree 11pt Inter bold #1F2937 left=220  |  period 9.5pt Inter #6B7280  (gap 10)
  (do NOT add a skills section in the main column — skills are in the sidebar)
""",
    },

    "blueprint": {
        "static": [
            {"category": "line", "left": 50, "top": 138, "width": 495, "height": 1.5,
             "backgroundColor": "#1A2530", "zIndex": 1, "page": 1},
            {"category": "line", "left": 205, "top": 160, "width": 1, "height": 645,
             "backgroundColor": "#D8DEE4", "zIndex": 1, "page": 1},
        ],
        "style": """\
LAYOUT: two-column  |  left_col left=50 width=148  |  main_col left=225 width=320
        header separator at top=138 already placed; divider at x=205 already placed
COLORS:  ink=#1A2530  blue=#2B6CB0  gray=#6B7280  body=#3A4753  div=#D8DEE4
FONTS:   labels=Courier  body=Inter

HEADER (top=56, full width):
  name     fontSize=30  Inter  #1A2530  bold=true  left=50
  role     fontSize=12  Courier #2B6CB0  "// job_title"  left=50  (gap after name=4)
  contact  fontSize=9.5 Inter  #6B7280  "email · phone · city"  left=50  (gap=4)
  (separator line top=138 already placed)

LEFT COLUMN (left=50, starts at top=176):
  "CONTACT" label  fontSize=10 Courier #2B6CB0 bold=true  top=176
  contact textarea  left=50 top=190 width=148  fontSize=8.5 Inter #3A4753 lineHeight=13
    one item per line: email, phone, location, linkedin/github if known
    HEIGHT = (number_of_newlines+1) × 13 + 6
  "SKILLS" label   fontSize=10 Courier #2B6CB0 bold=true  (20pt after contact textarea)
  skills textarea  left=50 width=148 fontSize=9 Inter #3A4753 lineHeight=15
    one skill per line
    HEIGHT = num_skills × 15 + 6
  "TOOLS" label (optional subset of skills: Git, Linux, Docker etc)  if skills long enough

MAIN COLUMN (left=225, starts at top=176):
  SECTION PATTERN (gap=18):
    label  fontSize=10 Courier #2B6CB0 bold=true  left=225
    [10pt gap]

  PER JOB (EVERY job):
    job_title  fontSize=11  Inter  #1A2530  bold=true  left=225
    company    fontSize=9.5 Inter  #6B7280  "Company · Period"  left=225  (gap=2)
    bullets    textarea: fontSize=10 lineHeight=14 Inter #3A4753 left=225 width=320
               HEIGHT = (number_of_newlines+1) × 14 + 6
    [gap 14pt]

  EDUCATION: degree 11pt Inter bold #1A2530 left=225  |  period 9.5pt Inter #6B7280  (gap 10)
""",
    },
}


# ── Layout generation ──────────────────────────────────────────────────────────

def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """
    Generate the complete canvas-element list for the given template and CV data.

    Layout is handled by the deterministic Python engine in cv_generator.py so
    elements are always cleanly stacked and aligned. GPT is used only for the
    earlier extraction step (turning the uploaded PDF into structured data).
    """
    from app.services.cv_generator import generate_resume as _python_layout
    # The deterministic builder sizes and paginates its own flowing text. A
    # second generic reflow cannot distinguish decorative slots from a content
    # column, so it can shift labels and frames out of their intended layout.
    return _python_layout(template_id, cv_data)
