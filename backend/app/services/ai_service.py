import base64
import json
import fitz  # PyMuPDF — already in venv
from openai import OpenAI
from app.core.config import OPENAI_API_KEY

_client = OpenAI(api_key=OPENAI_API_KEY)


def _pdf_to_b64_images(pdf_bytes: bytes, max_pages: int = 3) -> list[str]:
    """Render PDF pages to base64 PNG at 150 DPI. Works on scanned + formatted CVs."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    out = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72))
        out.append(base64.b64encode(pix.tobytes("png")).decode())
    doc.close()
    return out


def extract_cv_data(pdf_bytes: bytes) -> dict:
    """
    Send the uploaded CV (as rendered page images) to GPT-4o vision and extract
    structured data. Returns a dict ready for fill_template_elements().
    """
    images = _pdf_to_b64_images(pdf_bytes)
    if not images:
        raise ValueError("Could not render any pages from the uploaded PDF.")

    content: list[dict] = [
        {
            "type": "text",
            "text": (
                "You are a precise CV data extractor. "
                "Read the CV in the image(s) and return ONLY a JSON object with this exact structure — "
                "no markdown, no explanation, no extra keys:\n"
                '{"name":"","title":"","email":"","phone":"","location":"",'
                '"summary":"","experience":[{"title":"","company":"","period":"","bullets":[]}],'
                '"education":[{"degree":"","period":"","detail":""}],"skills":[]}\n\n'
                "Rules:\n"
                "- experience: sorted newest first, max 3 bullet points per job (most impactful only)\n"
                "- summary: max 2 sentences, first-person removed\n"
                "- skills: flat list of strings, max 12 items\n"
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
        max_tokens=2000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


def fill_template_elements(cv_data: dict, elements: list[dict]) -> list[dict]:
    """
    Fill template elements with extracted CV data.

    Uses the placeholder text of each element to infer its role (name, job title,
    experience block, skills, etc.) and fills it with the complete candidate data.
    No character-budget truncation — the canvas clips overflow and the user can
    resize any box, which is far better than silently losing data.
    """
    fillable = [
        (i, e) for i, e in enumerate(elements)
        if e.get("category") in ("text", "textarea")
        and e.get("content", "").strip()
        and not e.get("content", "").startswith("PHOTO")
    ]
    if not fillable:
        return []

    specs = []
    for idx, el in fillable:
        specs.append({
            "id": str(idx),
            "placeholder": el.get("content", ""),   # tells GPT what the field is
            "multiline": el.get("category") == "textarea",
        })

    prompt = (
        "You are filling a visual CV template with a real candidate's data.\n"
        "The 'placeholder' of each element shows you EXACTLY what kind of content belongs there "
        "(it is the template's sample text — e.g. 'ALEXANDER MORGAN' means this is the candidate's full name).\n\n"
        f"CANDIDATE DATA:\n{json.dumps(cv_data, ensure_ascii=False)}\n\n"
        f"ELEMENTS:\n{json.dumps(specs, ensure_ascii=False)}\n\n"
        "Rules:\n"
        "1. Use ONLY data from CANDIDATE DATA. Never invent anything.\n"
        "2. NEVER truncate names, titles, company names, or dates — always use the complete value.\n"
        "3. Experience: include EVERY job position from the candidate's experience list. "
        "   For a textarea that holds one job's bullets, use the job that matches the "
        "   template's positional order (1st block = most recent job, 2nd block = 2nd job, etc.).\n"
        "4. Bullet points in textareas: prefix each with '• ' and separate with \\n. "
        "   Include ALL bullets from CANDIDATE DATA for that job.\n"
        "5. For single-line text (multiline=false): output one line only, no \\n.\n"
        "6. Dates: keep the exact format from CANDIDATE DATA (e.g. '2019 – Present').\n"
        "7. Skills: list them comma-separated, include all of them.\n"
        "8. If a field has no matching data, output empty string \"\".\n"
        "9. Return ONLY this JSON and nothing else:\n"
        '{"fills": [{"id": "0", "content": "text"}, ...]}'
    )

    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    raw = json.loads(resp.choices[0].message.content)
    return raw.get("fills", [])
