"""Render the landing page's before/after "PO" mockup: a Sterling render of
the exact same CV content shown in the "PRZED" card (`Hero.jsx`'s
`.oldDocument` block — a real, dated Word-style CV for "Jan Kowalski"), so
the before/after pair reads as one real transformation instead of two
unrelated documents. Mirrors `render_iconic_mockups.py`'s pipeline.

Not part of the app build or test suite — run manually after editing the
`CV` dict below (keep it in sync with the literal text in `Hero.jsx`):

    python scripts/render_sterling_showcase.py
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from render_iconic_mockups import render_theme, rasterize_first_page  # noqa: E402
import regenerate_template_starters as R  # noqa: E402

CV = {
    "name": "Jan Kowalski",
    "title": "Specjalista ds administracji",
    "email": "jkowalski@wp.pl",
    "phone": "543 555 512",
    "location": "Warszawa",
    "experience": [
        {
            "title": "Specjalista",
            "company": "Ministerstwo Współpracy Międzynarodowej",
            "period": "2016 – obecnie",
            "bullets": [
                "Koordynacja projektów dotyczących współpracy międzynarodowej.",
                "Przygotowywanie dokumentacji konkursowej.",
                "Współpraca z instytucjami partnerskimi oraz organizacja programów wymiany i projektów edukacyjnych.",
            ],
        },
        {
            "title": "Starszy specjalista w Biurze Organizacyjnym",
            "company": "Ministerstwo Współpracy Międzynarodowej",
            "period": "IV.2010 – 2015",
            "bullets": [
                "Opiniowanie projektów dokumentów urzędowych.",
                "Koordynowanie materiałów dla kierownictwa.",
                "Koordynowanie przepływu dokumentacji oraz obsługa spotkań i posiedzeń zespołów międzyresortowych.",
            ],
        },
        {
            "title": "Staż",
            "company": "Europejskie Centrum Integracji w Brukseli",
            "period": "X–XII.2009",
            "bullets": [
                "Opracowanie raportu na temat imigracji w krajach Unii Europejskiej.",
            ],
        },
        {
            "title": "Starszy inspektor",
            "company": "Urząd Wojewódzki w Krakowie",
            "period": "I–VI.2008",
            "bullets": [
                "Przygotowywanie projektów decyzji administracyjnych.",
                "Prowadzenie dokumentacji spraw oraz udzielanie informacji interesantom w zakresie procedur administracyjnych.",
            ],
        },
        {
            "title": "Wolontariat",
            "company": "Europejski Dom Spotkań – Fundacja Nowy Staw w Lublinie",
            "period": "2003 – 2006",
            "bullets": [
                "Organizowanie i pomoc w koordynacji projektów młodzieżowych.",
                "Prowadzenie grup warsztatowych.",
                "Organizowanie spotkań i akcji informacyjnych.",
            ],
        },
    ],
    "education": [
        {
            "degree": "",
            "school": "Krajowa Akademia Służby Publicznej",
            "period": "2008 – 2010",
        },
        {
            "degree": "Administracja i stosunki międzynarodowe",
            "school": "Uniwersytet im. Jana Nowaka w Krakowie",
            "period": "2002 – 2007",
        },
    ],
    "skills": ["MS Office", "Excel", "PowerPoint"],
    "languages": [
        {"name": "Angielski", "level": "biegły"},
        {"name": "Francuski", "level": "B2"},
        {"name": "Rosyjski", "level": "komunikatywny"},
    ],
    "extra_sections": [
        {
            "title": "Zainteresowania",
            "kind": "interests",
            "placement": "after_skills",
            "items": [
                "Administracja publiczna",
                "Organizacja pracy urzędu",
                "Prawo administracyjne",
                "Archiwizacja dokumentów",
                "Współpraca międzyinstytucjonalna",
            ],
        },
    ],
}


def main() -> None:
    elements = R.generate_resume("sterling", CV)
    page_one = [e for e in elements if e.get("page", 1) == 1]
    spilled = len(elements) - len(page_one)
    if spilled:
        raise SystemExit(
            f"sterling-showcase: starter spilled {spilled} elements onto page 2; "
            "trim the CV dict so the mockup shows every section on page 1."
        )
    elements_data = R.tag_flow_roles(R.relativize_assets(page_one))

    for element in elements_data:
        src = element.get("src")
        if element.get("category") == "image" and isinstance(src, str) and src.startswith("/template-assets"):
            rel = src.lstrip("/").replace("template-assets", "template_assets", 1)
            element["src"] = str(BACKEND_DIR / rel)

    pdf_bytes = render_theme("sterling", elements_data)
    png_bytes = rasterize_first_page(pdf_bytes)
    out_path = REPO_ROOT / "frontend" / "public" / "template-mockups" / "sterling-showcase.png"
    out_path.write_bytes(png_bytes)
    print(f"wrote {out_path} ({len(png_bytes)} bytes)")


if __name__ == "__main__":
    main()
