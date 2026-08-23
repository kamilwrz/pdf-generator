"""Regenerate frontend template starters from the backend generators.

Uses a shared Julia Bernat demo persona (AML/compliance analyst — three roles,
one degree, five skills, three languages) so picker previews match
`/ai/fill_template` and follow the generator's SPACE_* rhythm. Field lengths
track the previous shared demo so page-1 mockups stay full. Starters keep
page-1 elements only (mockups and the template picker show a single A4). Image
URLs are stored relative and absolutised at load time via API_BASE_URL — same
pattern as atrium.js.

Run from repo root:

    python scripts/regenerate_template_starters.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_TEMPLATES = REPO_ROOT / "frontend" / "src" / "templates"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.cv_generator import generate_resume  # noqa: E402

# Shared demo persona — fictional AML/compliance analyst sized to fill landing
# mockups. Field lengths stay close to the previous shared demo so every
# generator still packs Summary → Experience → Education → Skills → Languages
# onto page 1 of the picker preview.
DEMO_CV = {
    "name": "Julia Bernat",
    "title": "Analityczka AML i Compliance",
    "email": "julia.bernat@email.com",
    "phone": "+48 512 340 780",
    "location": "Warszawa",
    "linkedin": "linkedin.com/in/jbernat",
    "github": "github.com/jbernat",
    "website": "juliabernat.pl",
    "summary": (
        "Analityczka AML łącząca wiedzę regulacyjną z dyscypliną wykonania. "
        "Prowadzę monitoring transakcji i raporty SAR, dbając o jakość analiz "
        "oraz terminowość decyzji bez utraty dokładności."
    ),
    "experience": [
        {
            # ``title`` (not ``role``) — ``normalize_cv_data`` only maps
            # title/position into the experience record title field.
            "title": "Analityczka AML",
            "company": "Crestmont Advisory",
            "city": "Warszawa",
            "period": "2022 – obecnie",
            "bullets": [
                "Prowadzi monitoring transakcji i analizę alertów AML dla klientów firmowych.",
                "Realizuje CDD/EDD oraz przygotowuje dokumentację zgodną z wymogami FIU.",
                "Wspiera zespół L2 przy eskalacjach spraw o podwyższonym ryzyku AML.",
            ],
        },
        {
            "title": "Analityczka KYC",
            "company": "Baltic Trust Bank",
            "city": "Warszawa",
            "period": "2019 – 2022",
            "bullets": [
                "Weryfikowała profile klientów oraz screening PEP, sanctions i media.",
                "Utrzymywała jakość raportów SAR oraz terminowość odpowiedzi na RFI.",
            ],
        },
        {
            "title": "Specjalistka Obsługi Klienta",
            "company": "Helios Services",
            "city": "Kraków",
            "period": "2016 – 2019",
            "bullets": [
                "Obsługiwała zamówienia i weryfikację danych klientów na rynkach DACH.",
            ],
        },
    ],
    "education": [
        {
            "degree": "Licencjat Prawa",
            "school": "UW Warszawa",
            "period": "2012 – 2016",
        },
    ],
    "skills": [
        "AML/KYC",
        "Monitoring",
        "CDD/EDD",
        "Raporty SAR",
        "Analiza transakcyjna",
    ],
    "languages": [
        {"name": "Polski", "level": "ojczysty"},
        {"name": "Angielski", "level": "C1"},
        {"name": "Niemiecki", "level": "B2"},
    ],
}

# Monument uses denser chrome; trim bullets so every section still lands on
# page 1 of the mockup without losing the persona.
COMPACT_DEMO_CV = {
    **DEMO_CV,
    "summary": (
        "Analityczka AML łącząca wiedzę regulacyjną z dyscypliną wykonania. "
        "Prowadzę monitoring transakcji i raporty SAR, dbając o jakość analiz."
    ),
    # Trim bullets further so Monument still fits page 1 with the four-column
    # languages grid (and Portico's taller centered photo masthead).
    "experience": [
        {
            **DEMO_CV["experience"][0],
            "bullets": DEMO_CV["experience"][0]["bullets"][:1],
        },
        {
            **DEMO_CV["experience"][1],
            "bullets": DEMO_CV["experience"][1]["bullets"][:1],
        },
        {
            **DEMO_CV["experience"][2],
            # Preserve three roles in the picker preview, but leave the oldest
            # role concise so Monument's taller 80×107 photo masthead does not
            # push the final languages section to a second page.
            "bullets": [],
        },
    ],
}

# Portico's centered photo masthead is taller; use the compacted bullet set
# so the picker mockup still shows every section on page 1.
COMPACT_TEMPLATE_IDS = frozenset({"monument", "portico"})

REGENT_DEMO_CV = {
    "name": "Aleksandra Nowak",
    "title": "Strategy & Operations Manager",
    "email": "aleksandra.nowak@example.com",
    "phone": "+48 000 000 000",
    "location": "Warszawa, Polska",
    "linkedin": "linkedin.com/in/aleksandra-nowak-demo",
    "summary": (
        "Managerka strategii i operacji z ponad 7-letnim doświadczeniem w doradztwie oraz transformacji biznesowej. "
        "Specjalizuję się w analizie procesów, projektowaniu modeli operacyjnych i prowadzeniu inicjatyw zwiększających "
        "efektywność organizacji. Łączę analityczne podejście z umiejętnością przekładania danych na konkretne decyzje "
        "biznesowe."
    ),
    "experience": [
        {
            "title": "Strategy & Operations Manager",
            "company": "Northbridge Advisory",
            "location": "Warszawa",
            "period": "01/2023 – obecnie",
            "bullets": [
                "Prowadzę projekty transformacyjne dla klientów z sektora finansowego, technologicznego i usług profesjonalnych.",
                "Projektuję modele operacyjne, identyfikuję obszary optymalizacji i przygotowuję rekomendacje dla kadry zarządzającej.",
                "Koordynuję zespoły projektowe oraz odpowiadam za prezentację wyników i wdrożenie uzgodnionych działań.",
            ],
        },
        {
            "title": "Senior Business Analyst",
            "company": "Vantage Partners",
            "location": "Warszawa",
            "period": "06/2020 – 12/2022",
            "bullets": [
                "Analizowałam procesy biznesowe i dane operacyjne, identyfikując możliwości automatyzacji oraz redukcji kosztów.",
                "Tworzyłam modele finansowe, dashboardy KPI i materiały decyzyjne dla klientów oraz zespołów projektowych.",
            ],
        },
        {
            "title": "Business Analyst",
            "company": "Orion Consulting Group",
            "location": "Kraków",
            "period": "09/2017 – 05/2020",
            "bullets": [
                "Wspierałam projekty strategiczne poprzez analizę rynku, benchmarking konkurencji i przygotowywanie rekomendacji.",
                "Opracowywałam raporty zarządcze oraz prezentacje wykorzystywane podczas warsztatów z klientami.",
            ],
        },
    ],
    "education": [
        {
            "degree": "Magister zarządzania",
            "school": "Uniwersytet Ekonomiczny w Krakowie",
            "location": "Kraków",
            "period": "2015 – 2017",
            "description": "Specjalizacja: strategia przedsiębiorstwa i zarządzanie zmianą.",
        },
        {
            "degree": "Licencjat ekonomii",
            "school": "Uniwersytet Ekonomiczny w Krakowie",
            "location": "Kraków",
            "period": "2012 – 2015",
            "description": "",
        },
    ],
    "skills": [
        "Strategia biznesowa",
        "Business Analysis",
        "Optymalizacja procesów",
        "Operating Model",
        "Analiza danych",
        "Financial Modeling",
        "Power BI",
        "Excel",
        "SQL",
        "Stakeholder Management",
    ],
    "languages": [
        {"name": "Polski", "level": "ojczysty"},
        {"name": "Angielski", "level": "C1"},
        {"name": "Niemiecki", "level": "B2"},
    ],
}

# template_id -> (js filename, export const name, layouts blurb for docstring)
# iconic.js exports volt from one module.
TEMPLATES = [
    "portico",
    "volt",
    "tessera",
    "slate",
    "monument",
    "atrium",
    "sterling",
    "regent",
    "vestige",
    "meridian",
]

DOC_BLURBS = {
    "portico": (
        "Portico template (`layouts: [\"icons\"]`).\n"
        " *\n"
        " * Centered masthead with icon contact chrome; left-aligned body with\n"
        " * icon-in-gutter section headings."
    ),
    "nova": (
        "Nova template (`layouts: [\"icons\"]`).\n"
        " *\n"
        " * Warm editorial masthead with Playfair + Montserrat and icon chrome."
    ),
    "volt": (
        "Volt template (`layouts: [\"icons\", \"dark\"]`).\n"
        " *\n"
        " * Dark amber signal chips with Montserrat + JetBrains Mono."
    ),
    "tessera": (
        "Tessera template (`layouts: [\"sidebar\", \"icons\"]`).\n"
        " *\n"
        " * Mosaic sidebar with rectangular photo and coral accent tiles."
    ),
    "slate": (
        "Slate template (`layouts: [\"sidebar\", \"icons\"]`).\n"
        " *\n"
        " * Steel blueprint sidebar with rectangular photo and grid chrome."
    ),
    "monument": (
        "Monument template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Monochrome editorial single column with strong rules and plates."
    ),
    "atrium": (
        "Atrium template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Centered-axis editorial single column with graphite-sage accents."
    ),
    "sterling": (
        "Sterling template (`layouts: [\"sidebar\"]`).\n"
        " *\n"
        " * Institutional two-column layout with wide sidebar rail."
    ),
    "regent": (
        "Regent template (`layouts: [\"single\", \"icons\"]`).\n"
        " *\n"
        " * Monochrome executive editorial layout with compact Montserrat summary copy."
    ),
    "vestige": (
        "Vestige template (`layouts: [\"sidebar\", \"icons\"]`).\n"
        " *\n"
        " * Narrow neutral-gray sidebar with a classical editorial main column."
    ),
    "meridian": (
        "Meridian template (`layouts: [\"single\", \"icons\"]`).\n"
        " *\n"
        " * Premium navy/steel-blue single column with a compact Montserrat summary\n"
        " * and an accent-blue tick under every section rule."
    ),
}

STARTER_PERSONAS = {
    "regent": "Aleksandra Nowak — strategy & operations manager with three roles, two degrees, ten skills, and three languages",
    "meridian": "Aleksandra Nowak — strategy & operations manager with three roles, two degrees, ten skills, and three languages",
}

LOCALHOST_ASSET = re.compile(r"^https?://[^/]+(/template-assets/.+)$")


def relativize_assets(elements: list[dict]) -> list[dict]:
    """Store image src as a site-root path so the frontend can prepend API_BASE_URL."""
    out: list[dict] = []
    for element in elements:
        item = dict(element)
        src = item.get("src")
        if isinstance(src, str):
            match = LOCALHOST_ASSET.match(src)
            if match:
                item["src"] = match.group(1)
            elif src.startswith("http://localhost:8000/template-assets/"):
                item["src"] = src[len("http://localhost:8000") :]
        out.append(item)
    return out


def tag_flow_roles(elements: list[dict]) -> list[dict]:
    """Mirror the hand-authored export map: untagged body becomes flowing content.

    Generators already stamp masthead / section-chrome / sidebar-chrome / fixed
    page chrome. Remaining text and shapes need ``flowRole: "content"`` so the
    editor packer and Add-section sampler treat them as body, matching the
    previous helper-authored starters.
    """
    out: list[dict] = []
    for element in elements:
        item = dict(element)
        if item.get("fixedToPage") or item.get("flowRole"):
            out.append(item)
            continue
        item["flowRole"] = "content"
        if item.get("category") == "textarea":
            item.setdefault("preserveInitialLayout", True)
            item.setdefault("autoHeight", True)
        out.append(item)
    return out


def js_module(template_id: str, elements: list[dict], *, const_name: str | None = None) -> str:
    """Build an atrium-style starter module from generator output."""
    const = const_name or f"{template_id.upper()}_ELEMENTS"
    export = f"{template_id}Template"
    blur = DOC_BLURBS[template_id]
    persona = STARTER_PERSONAS.get(
        template_id,
        "Julia Bernat — three roles, one degree, five skills, and three languages",
    )
    elements_json = json.dumps(elements, ensure_ascii=False, indent=2)
    # Keep trailing commas out of the array assignment style used elsewhere.
    return f"""/**
 * {blur}
 *
 * This static starter is the backend generator's own output
 * (`backend/app/services/cv_templates/templates/{template_id}.py`) for
 * representative demo content ({persona}, sized to fit page 1 of the mockup), so the
 * picker preview matches what `/ai/fill_template` produces pixel-for-pixel.
 * Image `src` values are stored relative and get the API base prepended at
 * load time. The array already carries `flowRole` / `flowGroup` /
 * `preserveInitialLayout` from the generator, so it is exported as-is (only
 * the image src is absolutised).
 */
import API_BASE_URL from "../services/api.js";

const {const} = {elements_json};

export const {export} = {const}.map((element) => (
  element.category === "image" && typeof element.src === "string" && element.src.startsWith("/template-assets")
    ? {{ ...element, src: `${{API_BASE_URL}}${{element.src}}` }}
    : element
));
"""


def iconic_module(nova_elements: list[dict], volt_elements: list[dict]) -> str:
    """Nova + Volt share iconic.js; emit both dumps in one file."""
    nova_json = json.dumps(nova_elements, ensure_ascii=False, indent=2)
    volt_json = json.dumps(volt_elements, ensure_ascii=False, indent=2)
    return f"""/**
 * Icon-driven static layouts (Nova, Volt).
 *
 * Both starters are the backend generators' own output for representative demo
 * content (Julia Bernat — three roles, one degree, five skills, and three
 * languages), so the picker preview matches `/ai/fill_template` pixel-for-pixel.
 * Image `src` values are stored relative and get the API base prepended at
 * load time. Icons live under `/template-assets/iconic/<theme>/`.
 */
import API_BASE_URL from "../services/api.js";

const NOVA_ELEMENTS = {nova_json};

const VOLT_ELEMENTS = {volt_json};

const withAbsoluteAssets = (elements) => elements.map((element) => (
  element.category === "image" && typeof element.src === "string" && element.src.startsWith("/template-assets")
    ? {{ ...element, src: `${{API_BASE_URL}}${{element.src}}` }}
    : element
));

export const novaTemplate = withAbsoluteAssets(NOVA_ELEMENTS);
export const voltTemplate = withAbsoluteAssets(VOLT_ELEMENTS);
"""


def main() -> None:
    generated: dict[str, list[dict]] = {}
    for template_id in TEMPLATES:
        if template_id in ("regent", "meridian"):
            cv = REGENT_DEMO_CV
        elif template_id in COMPACT_TEMPLATE_IDS:
            cv = COMPACT_DEMO_CV
        else:
            cv = DEMO_CV
        elements = generate_resume(template_id, cv)
        page_one = [e for e in elements if e.get("page", 1) == 1]
        generated[template_id] = tag_flow_roles(relativize_assets(page_one))
        spilled = len(elements) - len(page_one)
        if spilled and template_id not in {"regent", "meridian"}:
            raise SystemExit(
                f"{template_id}: starter spilled {spilled} elements onto page 2; "
                "trim COMPACT_DEMO_CV / DEMO_CV so the mockup shows every section."
            )
        if spilled:
            print(
                f"{template_id}: starter spilled {spilled} elements onto page 2; "
                "keeping the page 1 mockup preview."
            )
        print(f"{template_id:10} page1={len(page_one):3}", flush=True)

    # Write single-template modules.
    for template_id in TEMPLATES:
        if template_id in ("nova", "volt"):
            continue
        path = FRONTEND_TEMPLATES / f"{template_id}.js"
        path.write_text(js_module(template_id, generated[template_id]), encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_ROOT)}", flush=True)

    iconic_path = FRONTEND_TEMPLATES / "iconic.js"
    iconic_path.write_text(
        iconic_module(generated["nova"], generated["volt"]),
        encoding="utf-8",
    )
    print(f"wrote {iconic_path.relative_to(REPO_ROOT)}", flush=True)


if __name__ == "__main__":
    main()
