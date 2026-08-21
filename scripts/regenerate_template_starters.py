"""Regenerate frontend template starters from the backend generators.

Uses a shared Julia Bernat demo persona (AML/compliance analyst — three roles,
one degree, five skills, three languages) so picker previews match
`/ai/fill_template` and follow the generator's SPACE_* rhythm. Field lengths
track the previous shared demo so page-1 mockups stay full. Starters keep
page-1 elements only (mockups and the template picker show a single A4). Image
URLs are stored relative and absolutised at load time via API_BASE_URL — same
pattern as atrium.js / axis.js.

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
            "bullets": DEMO_CV["experience"][2]["bullets"][:1],
        },
    ],
}

# Portico's centered photo masthead is taller; use the compacted bullet set
# so the picker mockup still shows every section on page 1.
COMPACT_TEMPLATE_IDS = frozenset({"monument", "portico"})

# template_id -> (js filename, export const name, layouts blurb for docstring)
# iconic.js exports both nova and volt from one module.
TEMPLATES = [
    "portico",
    "nova",
    "volt",
    "cardinal",
    "harbor",
    "tessera",
    "slate",
    "monument",
    "atrium",
    "axis",
    "sterling",
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
    "cardinal": (
        "Cardinal template (`layouts: [\"icons\"]`).\n"
        " *\n"
        " * Oxblood accent with icon-in-gutter section headings."
    ),
    "harbor": (
        "Harbor template (`layouts: [\"sidebar\", \"icons\"]`).\n"
        " *\n"
        " * Two-column teal layout with circular photo slot and diamond list widgets."
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
    "axis": (
        "Axis template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Timeline single column with date gutter, skill chips, and a\n"
        " * four-column languages grid."
    ),
    "sterling": (
        "Sterling template (`layouts: [\"sidebar\"]`).\n"
        " *\n"
        " * Institutional two-column layout with wide sidebar rail."
    ),
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
    """Build an atrium/axis-style starter module from generator output."""
    const = const_name or f"{template_id.upper()}_ELEMENTS"
    export = f"{template_id}Template"
    blur = DOC_BLURBS[template_id]
    elements_json = json.dumps(elements, ensure_ascii=False, indent=2)
    # Keep trailing commas out of the array assignment style used elsewhere.
    return f"""/**
 * {blur}
 *
 * This static starter is the backend generator's own output
 * (`backend/app/services/cv_templates/templates/{template_id}.py`) for
 * representative demo content (Julia Bernat — three roles, one degree, five
 * skills, and three languages, sized to fit page 1 of the mockup), so the
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
        if template_id in COMPACT_TEMPLATE_IDS:
            cv = COMPACT_DEMO_CV
        else:
            cv = DEMO_CV
        elements = generate_resume(template_id, cv)
        page_one = [e for e in elements if e.get("page", 1) == 1]
        generated[template_id] = tag_flow_roles(relativize_assets(page_one))
        spilled = len(elements) - len(page_one)
        if spilled:
            raise SystemExit(
                f"{template_id}: starter spilled {spilled} elements onto page 2; "
                "trim COMPACT_DEMO_CV / DEMO_CV so the mockup shows every section."
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
