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
    Given extracted CV data and a list of template element specs, ask GPT-4o to
    generate content for each text/textarea element that fits within its box.

    Each element includes its placeholder (revealing the field type), dimensions,
    and fontSize/lineHeight so GPT can estimate how many characters fit.

    Returns list of {"id": element_id, "content": filled_text}.
    """
    # Use the position index as a stable id — template specs have no element_id yet
    # (that is assigned by nanoid() on the frontend when they land on the canvas).
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
        fs = float(el.get("fontSize") or 12)
        lh = float(el.get("lineHeight") or (fs * 1.4))
        w = float(el.get("width") or 200)
        h = float(el.get("height") or lh)
        chars_per_line = max(8, int(w / (fs * 0.52)))
        num_lines = max(1, int(h / lh))
        specs.append({
            "id": str(idx),              # stable index, matched on the frontend
            "placeholder": el.get("content", ""),
            "category": el.get("category"),
            "max_chars": chars_per_line * num_lines,
            "max_lines": num_lines,
        })

    prompt = (
        "You are filling a visual CV template with real candidate data.\n"
        "Each element has a placeholder that shows WHAT goes there, and a character/line limit that MUST NOT be exceeded.\n\n"
        f"CANDIDATE DATA:\n{json.dumps(cv_data, ensure_ascii=False)}\n\n"
        f"ELEMENTS:\n{json.dumps(specs, ensure_ascii=False)}\n\n"
        "Rules:\n"
        "1. Use only data from CANDIDATE DATA — do not invent anything.\n"
        "2. Never exceed max_chars for any element. Write concisely; summarise if needed.\n"
        "3. For textarea multi-line content: separate lines with \\n, prefix bullet points with • \n"
        "4. For single-line text elements: no newlines.\n"
        "5. Dates: keep the exact format from the candidate data.\n"
        "6. If data is missing for a field, use empty string \"\".\n"
        "7. Skills: comma-separated on one line; stop before max_chars.\n"
        "8. Experience: use only the most recent entries if space is limited.\n"
        "9. Return ONLY this JSON object and nothing else:\n"
        '{"fills": [{"id": "element_id", "content": "text"}]}'
    )

    resp = _client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=3000,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    raw = json.loads(resp.choices[0].message.content)
    return raw.get("fills", [])
