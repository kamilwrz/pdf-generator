"""
PDF CV extraction via OpenAI vision and resume generation entrypoints.

`extract_cv_data` rasterises the first pages of an uploaded PDF, sends them to
gpt-4o, and normalises the JSON into the shared `cv_data` shape.
`generate_resume` is re-exported from `cv_generator` for route convenience.
"""

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
    """Rasterise up to `max_pages` at 150 DPI for the vision extract prompt."""
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
                '  "linkedin":"","github":"","website":"",\n'
                '  "summary":"",\n'
                '  "experience":[{"title":"","company":"","period":"","bullets":[]}],\n'
                '  "education":[{"school":"","city":"","degree":"","period":"","description":""}],\n'
                '  "skills":[] | [{"category":"","items":[]}],\n'
                '  "language":"Polish",\n'
                '  "labels":{"summary":"PODSUMOWANIE ZAWODOWE","experience":"DOŚWIADCZENIE ZAWODOWE","education":"WYKSZTAŁCENIE","skills":"UMIEJĘTNOŚCI"},\n'
                '  "extra_sections":[{"title":"","kind":"languages|certifications|interests|projects|references|awards|publications|volunteering|other","placement":"after_skills","items":[]}]\n'
                "}\n\n"
                "Zasady:\n"
                "- linkedin / github / website: linki kontaktowe z nagłówka CV.\n"
                "  linkedin = profil LinkedIn (URL lub ścieżka /in/...), github = GitHub,\n"
                "  website = osobista strona / portfolio (nie LinkedIn i nie GitHub).\n"
                "  Puste stringi, gdy brak w CV. Nie wklejaj tych URL-i do email/phone/location.\n"
                "- experience: WSZYSTKIE stanowiska od najnowszego; WSZYSTKIE punkty (bez limitu)\n"
                "- education: WSZYSTKIE wpisy od najnowszego. Dla każdego wpisu:\n"
                "  school = uczelnia/szkoła, city = miasto, degree = kierunek/tytuł/dyplom,\n"
                "  period = lata, description = opis pod dyplomem (specjalizacja, praca dyplomowa,\n"
                "  osiągnięcia, dodatkowy tekst — NIE wklejaj go do school/degree).\n"
                "  Jeśli w CV nie ma opisu, description zostaw jako pusty string.\n"
                "  degree NIE może być samym okresem — period trzymaj w polu period.\n"
                "- skills — DWA DOZWOLONE KSZTAŁTY:\n"
                "  A) Płaska lista stringów, gdy CV ma jedną listę bez podsekcji\n"
                "     (np. sama 'UMIEJĘTNOŚCI' / 'SKILLS' / 'OBSŁUGA KOMPUTERA' z chipami).\n"
                "     Angielski nagłówek 'SKILLS' bez podkategorii = kształt A (płaskie stringi),\n"
                "     NIGDY jeden obiekt {\"category\":\"SKILLS\",\"items\":[…]}.\n"
                "  B) Lista obiektów {\"category\":\"Nazwa\",\"items\":[\"chip\",\"…\"]} TYLKO gdy CV ma\n"
                "     co najmniej DWIE podsekcje lub osobne rodziny umiejętności. Wówczas:\n"
                "     * labels.skills = 'UMIEJĘTNOŚCI' (nadrzędny nagłówek — ZAWSZE),\n"
                "     * category = dokładna nazwa podsekcji/rodziny (np. 'Bezpieczeństwo',\n"
                "       'Przemysł / OT', 'Programowanie i systemy', 'Umiejętności miękkie',\n"
                "       'Umiejętności twarde', 'Znane narzędzia'),\n"
                "     * category NIGDY nie może być 'SKILLS' / 'UMIEJĘTNOŚCI' / 'Obszary',\n"
                "     * items = osobne stringi (rozbij listy po przecinkach),\n"
                "     * wczytaj WSZYSTKIE podsekcje/rodziny, nie tylko pierwszą,\n"
                "     * NIE wrzucaj tych kategorii do extra_sections.\n"
                "  Jedna samotna podsekcja bez drugiej → kształt A (płaskie stringi).\n"
                "  Podsekcję 'Języki'/'Languages' wrzuć do languages, nie do skills.\n"
                "- language: główny język CV (np. 'Polish', 'English', 'German')\n"
                "- labels: summary/experience/education zawsze po polsku WIELKIMI LITERAMI:\n"
                "  'PODSUMOWANIE ZAWODOWE', 'DOŚWIADCZENIE ZAWODOWE', 'WYKSZTAŁCENIE'.\n"
                "  labels.skills = 'UMIEJĘTNOŚCI' gdy skills ma grupy/podsekcje; przy jednej\n"
                "  płaskiej liście = dokładny nagłówek z CV (np. 'OBSŁUGA KOMPUTERA').\n"
                "  Nigdy nie wstawiaj nazwy podsekcji (np. 'BEZPIECZEŃSTWO') jako labels.skills.\n"
                "- extra_sections: każda sekcja CV NIEobjęta experience/education/skills/summary.\n"
                "  Przykłady: Certyfikaty, Języki, Projekty, Nagrody, Publikacje,\n"
                "  Wolontariat, Zainteresowania, Referencje, Kursy, Szkolenia,\n"
                "  Szkolenia z cyberbezpieczeństwa — tytuł WIELKIMI LITERAMI, pełne punkty.\n"
                "  SZKOLENIA / TRENINGI / COURSES / TRAINING (np. 'SZKOLENIA Z CYBERBEZPIECZEŃSTWA'):\n"
                "  ZAWSZE osobny extra_sections, kind='certifications', placement='after_experience',\n"
                "  pełna lista punktów — NIGDY nie pomijaj tej sekcji.\n"
                "  NIE duplikuj skills ani podsekcji skills w extra_sections.\n"
                "  kind: 'languages' | 'certifications' | 'interests' | 'projects' | 'references' |\n"
                "        'awards' | 'publications' | 'volunteering' | 'other'.\n"
                "  placement: 'after_experience' dla sekcji rekordowych (projekty, nagrody, wolontariat,\n"
                "             referencje z opisem) ORAZ szkoleń/kursów; 'after_skills' dla zwartych list\n"
                "             (języki, certyfikaty-listy, zainteresowania).\n"
                "  items — ZALEŻY OD RODZAJU SEKCJI:\n"
                "  * languages / certifications / interests / zwarte listy: płaska lista stringów.\n"
                "  * projects / references / awards / publications / volunteering: lista OBIEKTÓW\n"
                "    {\"title\":\"nazwa\",\"subtitle\":\"opcjonalnie\",\"bullets\":[\"punkt\",\"...\"]}.\n"
                "    title = nazwa projektu/referencji (NIE wrzucaj tytułu jako zwykłego bulletu),\n"
                "    bullets = punkty opisu pod tytułem. Nie spłaszczaj tytułu i opisu do jednej listy.\n"
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
        # Dense multi-section CVs (soft/hard/tools + long experience) need headroom
        # so the model does not truncate mid-list and drop skill-family points.
        max_tokens=8000,
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
