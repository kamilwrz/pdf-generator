import base64
import json
import fitz
from openai import OpenAI
from app.core.config import OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)


# ── PDF → images ─────────────────────────────────────────────────────────────

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


# ── CV data extraction ────────────────────────────────────────────────────────

def extract_cv_data(pdf_bytes: bytes) -> dict:
    images = _pdf_to_b64_images(pdf_bytes)
    if not images:
        raise ValueError("Could not render any pages from the uploaded PDF.")

    content: list[dict] = [
        {
            "type": "text",
            "text": (
                "You are a precise CV data extractor. "
                "Read every page of the CV and return ONLY a JSON object — "
                "no markdown, no extra keys:\n"
                '{"name":"","title":"","email":"","phone":"","location":"",'
                '"summary":"","experience":[{"title":"","company":"","period":"","bullets":[]}],'
                '"education":[{"degree":"","period":"","detail":""}],"skills":[]}\n\n'
                "Rules:\n"
                "- experience: include EVERY job, sorted newest first\n"
                "- bullets: include ALL bullet points for each job (no limit)\n"
                "- skills: include all, as flat list of strings\n"
                "- Return ONLY valid JSON."
            ),
        }
    ]
    for b64 in images:
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}}
        )

    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": content}],
        max_tokens=3000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


# ── Template visual DNA ───────────────────────────────────────────────────────
# Each entry has:
#   "static"  – decorative elements always present (sidebar, frame, band…) as canvas JSON
#   "style"   – natural-language description of the visual language for content elements

_TEMPLATES: dict[str, dict] = {

    "finance": {
        "static": [],   # pure single-column; all elements generated
        "style": """\
TEMPLATE: Finance — classic conservative single column
CANVAS: 595 × 842 pt. left_margin=50, content_width=495.

COLORS:  ink=#16243A  subtitle=#5A6B7B  gray=#6B7280  gold=#B08D57  body=#2B2B2B
FONTS:   section headings = Times-Roman bold uppercase; body/bullets = Inter

HEADER (start at top=54):
  • Name:      fontSize=30  fontFamily=Times-Roman  color=#16243A  bold=true
  • Title:     fontSize=14  fontFamily=Times-Roman  color=#5A6B7B  (2pt gap after name)
  • Contact:   fontSize=9.5 fontFamily=Inter        color=#5A6B7B  format: "email · phone · city"  (4pt gap)
  • Separator: line left=50 width=495 height=1.5 color=#16243A  (8pt gap after contact)

SECTION PATTERN (for Summary / Experience / Education / Skills):
  gap_before_heading = 16pt (first section) or 20pt (subsequent)
  • Heading:    fontSize=12  fontFamily=Times-Roman  color=#16243A  bold=true  UPPERCASE
    (6pt gap below heading)
  • Gold bar:   line left=50 width=70 height=2 color=#B08D57
    (10pt gap below bar)
  • Content (10pt below bar)

PER-JOB block (repeat for EVERY job in experience):
  • Job title:  fontSize=11  fontFamily=Inter  color=#16243A  bold=true
    (2pt gap)
  • Company·Period: fontSize=9.5  fontFamily=Inter  color=#6B7280
    format: "Company Name   ·   Period"
    (2pt gap)
  • Bullets textarea:
      fontSize=10  lineHeight=14  fontFamily=Inter  color=#2B2B2B
      width=495   height = (num_bullets × 14) + 4
      content: "• bullet1\\n• bullet2\\n• bullet3"
  gap after job block = 12pt

SUMMARY textarea:   fontSize=10.5 lineHeight=15 fontFamily=Inter color=#2B2B2B width=495
SKILLS textarea:    fontSize=10   lineHeight=15 fontFamily=Inter color=#2B2B2B width=495
EDUCATION block:    degree fontSize=11 Inter bold #16243A, period fontSize=9.5 Inter #6B7280
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
TEMPLATE: Nocturne — modern bold single column with dark header band (already placed, top 0-160pt)
CANVAS: 595 × 842 pt. left_margin=50, content_width=495.

COLORS:  ink=#1F2933  coral=#F25F4C  gray=#6B7280  body=#1F2933  light=#AEB6BD
FONTS:   all Inter

HEADER (inside the dark band, top=56 to top=140 — white text on dark):
  • Name:    fontSize=32  fontFamily=Inter  color=#FFFFFF  bold=true  top=56
  • Title:   fontSize=14  fontFamily=Inter  color=#F25F4C  top≈98  (gap: name height + 4)
  • Contact: fontSize=9.5 fontFamily=Inter  color=#AEB6BD  format: "email · phone · city"

CONTENT starts at top=192 (below the band):

SECTION PATTERN:
  gap_before_heading = 16pt (first) or 20pt (others)
  • Heading:  fontSize=12  fontFamily=Inter  color=#1F2933  bold=true  UPPERCASE
    (2pt gap)
  • Coral bar: line left=50 width=40 height=2 color=#F25F4C
    (10pt gap below bar)

PER-JOB block (repeat for EVERY job):
  • Job title:  fontSize=11  fontFamily=Inter  color=#1F2933  bold=true  (2pt gap)
  • Company·Period: fontSize=9.5  fontFamily=Inter  color=#6B7280  (2pt gap)
  • Bullets textarea: fontSize=10 lineHeight=14 color=#1F2933 fontFamily=Inter
    width=495  height=(num_bullets×14)+4
  gap after block = 12pt

SUMMARY:  fontSize=10.5 lineHeight=15 Inter color=#1F2933 width=495
SKILLS:   fontSize=10   lineHeight=15 Inter color=#1F2933 width=495
EDUCATION: degree fontSize=11 Inter bold #1F2933, period 9.5pt Inter #6B7280
""",
    },

    "ampersand": {
        "static": [
            {"category": "line", "left": 0, "top": 0, "width": 9, "height": 842,
             "backgroundColor": "#7B2D3A", "zIndex": 0, "page": 1},
        ],
        "style": """\
TEMPLATE: Ampersand — editorial serif, thin wine left stripe (already placed, x=0 width=9)
CANVAS: 595 × 842 pt. left_margin=50, content_width=497.

COLORS:  ink=#2A2320  wine=#7B2D3A  gray=#8A7F78  rule=#E0D7D1  body=#3A332E
FONTS:   headings & body = Times-Roman

HEADER (top=58):
  • Name:    fontSize=31  fontFamily=Times-Roman  color=#2A2320  bold=true
  • Title:   fontSize=14  fontFamily=Times-Roman  color=#7B2D3A  italic=true  (gap: name_h + 4)
  • Contact: fontSize=9.5 fontFamily=Times-Roman  color=#8A7F78
  • Rule:    line left=50 width=497 height=1 color=#E0D7D1  (8pt after contact)

CONTENT starts ~16pt after the rule:

SECTION HEADING (no accent bar — just bold heading):
  gap_before = 18pt
  • fontSize=12  fontFamily=Times-Roman  color=#2A2320  bold=true  UPPERCASE

PER-JOB block (EVERY job):
  • Job title:  fontSize=11.5  fontFamily=Times-Roman  color=#2A2320  bold=true  (2pt gap)
  • Period:     fontSize=9.5   fontFamily=Times-Roman  color=#8A7F78  italic=true  (2pt gap)
  • Company (if separate): fontSize=9.5 Times-Roman #8A7F78  (2pt gap)
  • Bullets textarea: fontSize=10.5 lineHeight=15 Times-Roman color=#3A332E
    width=497  height=(num_bullets×15)+4
  gap after block = 12pt

SUMMARY:  fontSize=11 lineHeight=16 Times-Roman color=#3A332E width=497
SKILLS:   fontSize=10.5 lineHeight=15 Times-Roman color=#3A332E width=497
EDUCATION: degree 11pt Times-Roman bold #2A2320, period 9.5pt Times-Roman italic #8A7F78
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
            {"category": "line", "left": 566, "top": 28, "width": 1,   "height": 786,
             "backgroundColor": "#D8CDBA", "zIndex": 1, "page": 1},
        ],
        "style": """\
TEMPLATE: Education — academic, centered headings, thin border frame (already placed)
CANVAS: 595 × 842 pt. left_margin=55, content_width=485. Centered text where noted.

COLORS:  ink=#2E2A25  sage=#4E7A6B  flank=#CBB89E  gray=#6B7280  body=#2B2B2B
FONTS:   section headings = Times-Roman bold uppercase; body = Inter

HEADER (centered, top=52):
  • Name:    fontSize=28  fontFamily=Times-Roman  color=#2E2A25  bold=true
    left ≈ (595 - estimated_text_width) / 2  (estimate ~10pt/char for 28pt Times-Roman)
  • Title:   fontSize=13  fontFamily=Times-Roman  color=#4E7A6B  centered  (gap: name_h+4)
  • Contact: fontSize=9.5 fontFamily=Inter color=#6B7280 centered
  • Sage divider: line left=248 width=100 height=1.5 color=#4E7A6B  (8pt after contact)

CONTENT starts ~16pt after divider:

SECTION PATTERN (flanked heading):
  gap_before = 18pt
  • Heading:   fontSize=12  fontFamily=Times-Roman  color=#2E2A25  bold=true  UPPERCASE  centered
  • Left flank:  line left=90  width=150 height=1 color=#CBB89E  (at heading baseline +4)
  • Right flank: line left=355 width=150 height=1 color=#CBB89E  (same top)
  (10pt below heading)

PER-JOB block (EVERY job), left-aligned at left=55:
  • Job title:  fontSize=11  fontFamily=Inter  color=#2E2A25  bold=true  (2pt gap)
  • Company·Period: fontSize=9.5  fontFamily=Inter  color=#6B7280  (2pt gap)
  • Bullets textarea: fontSize=10 lineHeight=14 Inter color=#2B2B2B
    width=485  height=(num_bullets×14)+4
  gap after block = 12pt

SUMMARY:  fontSize=10.5 lineHeight=15 Inter color=#2B2B2B width=485
SKILLS:   fontSize=10   lineHeight=15 Inter color=#2B2B2B width=485
EDUCATION: degree 11pt Inter bold #2E2A25, period 9.5pt Inter #6B7280
""",
    },

    "it": {
        "static": [
            # sidebar background
            {"category": "line", "left": 0, "top": 0, "width": 190, "height": 842,
             "backgroundColor": "#0F2A33", "zIndex": 0, "page": 1},
            # photo placeholder
            {"category": "line", "left": 43, "top": 38,  "width": 104, "height": 104,
             "backgroundColor": "#2BB3C0", "zIndex": 1, "page": 1},
            {"category": "line", "left": 45, "top": 40,  "width": 100, "height": 100,
             "backgroundColor": "#14333D", "zIndex": 2, "page": 1},
            {"category": "text", "content": "PHOTO", "fontSize": 10, "fontFamily": "Inter",
             "color": "#6E8C92", "left": 78, "top": 84, "zIndex": 3, "page": 1,
             "bold": False, "italic": False},
        ],
        "style": """\
TEMPLATE: IT — modern two-column. Dark teal sidebar (left 0-190pt, already placed). Main column right.
CANVAS: 595 × 842 pt.

SIDEBAR (left=28, width=150, zIndex=3 — on top of dark background):
  • Name:   fontSize=18  fontFamily=Inter  color=#FFFFFF  bold=true  top=158
  • Role:   fontSize=11  fontFamily=Inter  color=#2BB3C0  top≈182
  • "CONTACT" label: fontSize=10 Inter color=#9FB8BC bold=true  top=218
  • Teal bar: line left=28 width=40 height=2 color=#2BB3C0  top=232
  • Contact textarea (email, phone, location, github one per line):
      left=28 top=242 width=148 fontFamily=Inter fontSize=9 lineHeight=15 color=#C9D8DA
      height=(num_lines×15)+4
  • "SKILLS" label: fontSize=10 Inter color=#9FB8BC bold=true  (20pt after contact block)
  • Teal bar: line left=28 width=40 height=2  (2pt below label)
  • Skills textarea (one skill per line):
      left=28 width=148 fontFamily=Inter fontSize=9 lineHeight=15 color=#C9D8DA
      height=(num_skills×15)+4

MAIN COLUMN (left=220, width=330):
  CONTENT starts at top=48.

  SECTION PATTERN:
    gap_before = 16pt (first) or 20pt (others)
    • Heading:   fontSize=12  fontFamily=Inter  color=#1F2937  bold=true  UPPERCASE  left=220
    • Teal bar:  line left=220 width=60 height=2 color=#2BB3C0  (2pt below heading)
    (10pt below bar)

  PER-JOB block (EVERY job), left=220:
    • Job title:     fontSize=11  Inter  color=#1F2937  bold=true  (2pt gap)
    • Company·Period: fontSize=9.5 Inter color=#6B7280  (2pt gap)
    • Bullets textarea: fontSize=10 lineHeight=14 Inter color=#3A4753
      left=220 width=330  height=(num_bullets×14)+4
    gap after block = 12pt

  SUMMARY:   left=220 width=330 fontSize=10.5 lineHeight=15 Inter color=#3A4753
  EDUCATION: degree 11pt Inter bold #1F2937, period 9.5pt Inter #6B7280, left=220
  NO skills section in main column (skills are in sidebar)
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
TEMPLATE: Blueprint — technical two-column. Divider at x=205 (already placed).
CANVAS: 595 × 842 pt.

HEADER (full width, top=56):
  • Name:  fontSize=30  fontFamily=Inter  color=#1A2530  bold=true  left=50
  • Role:  fontSize=12  fontFamily=Courier  color=#2B6CB0  format:"// job_title"  left=50  (gap: name_h+4)
  • Contact line: fontSize=9.5 Inter color=#6B7280  format:"email · phone · city"  left=50  (4pt gap)
  Header separator: already placed (line top=138)

LEFT COLUMN (left=50, width=148):
  Starts at top=176.
  • "CONTACT" label:  fontSize=10 Courier color=#2B6CB0 bold=true
    (4pt gap, then contact textarea)
  • Contact textarea: one item per line, fontSize=8.5 Inter color=#3A4753 lineHeight=13 width=148
  • "SKILLS" label:   fontSize=10 Courier color=#2B6CB0 bold=true  (18pt after contact)
    (4pt gap)
  • Skills textarea:  one skill per line, fontSize=9 Inter color=#3A4753 lineHeight=15 width=148
  • "EDUCATION" label if there's room (optional — can also go in main column)

MAIN COLUMN (left=225, width=320):
  Starts at top=176.

  SECTION PATTERN:
    gap_before = 16pt
    • Label:  fontSize=10  fontFamily=Courier  color=#2B6CB0  bold=true  left=225
    (10pt below label)

  PER-JOB block (EVERY job), left=225:
    • Job title:      fontSize=11  Inter  color=#1A2530  bold=true  (2pt gap)
    • Company·Period: fontSize=9.5 Inter  color=#6B7280  (2pt gap)
    • Bullets textarea: fontSize=10 lineHeight=14 Inter color=#3A4753
      left=225 width=320  height=(num_bullets×14)+4
    gap after block = 12pt

  EDUCATION in main column (left=225):
    degree 11pt Inter bold #1A2530, period 9.5pt Inter #6B7280
""",
    },
}


# ── GPT-driven layout generation ──────────────────────────────────────────────

def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """
    Ask GPT-4o to generate the complete canvas-element list for the given template
    and CV data.  Static decorative elements (sidebar bands, frame lines) are always
    added by Python; GPT generates every content element with computed positions.
    """
    cfg = _TEMPLATES.get(template_id)
    if cfg is None:
        raise ValueError(f"Unknown template '{template_id}'. Available: {list(_TEMPLATES)}")

    static_els = cfg["static"]
    style_desc  = cfg["style"]

    prompt = f"""\
You are a precise CV layout engine for a canvas editor. Your job is to generate
every content element for the resume — with exact pixel positions — so the result
is clean, well-spaced, and professional.

════════════════════════════════════════════
TEMPLATE VISUAL GUIDE
════════════════════════════════════════════
{style_desc}

════════════════════════════════════════════
CANDIDATE CV DATA  (include EVERYTHING — every job, every bullet, all skills)
════════════════════════════════════════════
{json.dumps(cv_data, ensure_ascii=False, indent=2)}

════════════════════════════════════════════
CANVAS RULES
════════════════════════════════════════════
• A4 page: 595 × 842 pt.
• Page overflow: when the NEXT element's top would exceed 802 (= 842 − 40 margin),
  set page=2 and reset the running y to 40. Continue generating on page 2.
• text element: after placing it, advance running_y by (fontSize × 1.35)
• line element: does NOT advance running_y
• textarea element: after placing it, advance running_y by height
• Track running_y carefully — every element's "top" must equal running_y at the
  moment you place it.

════════════════════════════════════════════
ELEMENT SCHEMAS (output these exact keys)
════════════════════════════════════════════
Text:
  {{"category":"text","content":"VALUE","fontSize":N,"fontFamily":"Inter|Times-Roman|Roboto|Courier",
    "color":"#HEX","left":N,"top":N,"zIndex":2,"page":1,"bold":false,"italic":false}}

Textarea:
  {{"category":"textarea","content":"VALUE","left":N,"top":N,"width":N,"height":N,
    "fontSize":N,"lineHeight":N,"letterSpacing":0,"color":"#HEX","fontFamily":"NAME",
    "zIndex":2,"page":1,"bold":false,"italic":false,"align":"left"}}

Line:
  {{"category":"line","left":N,"top":N,"width":N,"height":N,
    "backgroundColor":"#HEX","zIndex":1,"page":1}}

════════════════════════════════════════════
CRITICAL REQUIREMENTS
════════════════════════════════════════════
1. Include EVERY job from the candidate data. Do not drop any.
2. Include ALL bullet points for each job.
3. Include every education entry and all skills.
4. Calculate textarea heights from bullet counts: height = (n_lines × lineHeight) + 4
5. Recalculate running_y after every text/textarea you place.
6. Use the EXACT hex colors and font names from the template guide.
7. Do NOT include the static decorative elements — they are added separately.

Return ONLY this JSON object, no markdown, no explanation:
{{"elements": [ ... all content elements ... ]}}
"""

    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=8000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    raw = json.loads(resp.choices[0].message.content)
    content_els = raw.get("elements", [])

    return static_els + content_els
