"""Regenerate frontend template starters from the backend generators.

Uses a shared Jan Kowalski demo persona (three roles, one degree, five skills,
three languages) so picker previews match `/ai/fill_template` and follow the
generator's SPACE_* rhythm. Starters keep page-1 elements only (mockups and the
template picker show a single A4). Image URLs are stored relative and absolutised
at load time via API_BASE_URL — same pattern as atrium.js / axis.js.

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

# Shared demo persona — matches atrium / axis / blueprint starters.
DEMO_CV = {
    "name": "Jan Kowalski",
    "title": "Dyrektor Strategii i Rozwoju",
    "email": "jan.kowalski@email.com",
    "phone": "+48 600 000 000",
    "location": "Warszawa",
    "linkedin": "linkedin.com/in/jkowalski",
    "github": "github.com/jkowalski",
    "website": "jankowalski.pl",
    "summary": (
        "Lider strategii łączący perspektywę biznesową z dyscypliną wykonania. "
        "Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą "
        "mierzalne rezultaty bez utraty jakości relacji."
    ),
    "experience": [
        {
            # ``title`` (not ``role``) — ``normalize_cv_data`` only maps
            # title/position into the experience record title field.
            "title": "Dyrektor Strategii",
            "company": "Northbridge Partners",
            "city": "Warszawa",
            "period": "2021 – obecnie",
            "bullets": [
                "Zaprojektował model wzrostu łączący cele finansowe z inicjatywami produktowymi.",
                "Uporządkował rytm decyzji zarządu oraz raportowanie strategiczne.",
                "Prowadzi mentoring liderów odpowiedzialnych za kluczowe programy.",
            ],
        },
        {
            "title": "Menedżer Rozwoju",
            "company": "Meridian Group",
            "city": "Kraków",
            "period": "2016 – 2021",
            "bullets": [
                "Rozwinął portfel projektów ekspansji na rynkach europejskich.",
                "Wprowadził standardy współpracy między sprzedażą, produktem i finansami.",
            ],
        },
        {
            "title": "Konsultant Strategiczny",
            "company": "Alpine Consulting",
            "city": "Kraków",
            "period": "2013 – 2016",
            "bullets": [
                "Prowadził projekty doradcze dla klientów z sektora finansowego i przemysłowego.",
            ],
        },
    ],
    "education": [
        {
            "degree": "Magister Zarządzania",
            "school": "SGH Warszawa",
            "period": "2011 – 2016",
        },
    ],
    "skills": [
        "Strategia",
        "Leadership",
        "P&L",
        "Negocjacje",
        "Transformacja organizacyjna",
    ],
    "languages": [
        {"name": "Polski", "level": "ojczysty"},
        {"name": "Angielski", "level": "C1"},
        {"name": "Francuski", "level": "B2"},
    ],
}

# Monument uses denser chrome; trim bullets so every section still lands on
# page 1 of the mockup without losing the persona.
COMPACT_DEMO_CV = {
    **DEMO_CV,
    "summary": (
        "Lider strategii łączący perspektywę biznesową z dyscypliną wykonania. "
        "Buduję zespoły, które podejmują czytelne decyzje i konsekwentnie dowożą "
        "mierzalne rezultaty."
    ),
    # Job titles now take a full record row (DEMO_CV used to omit them via the
    # invalid ``role`` key). Trim bullets further so Monument still fits page 1
    # with the four-column languages grid.
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

COMPACT_TEMPLATE_IDS = frozenset({"monument"})

# Nimbus uses larger Lora type (name 32 / headings+roles 14 / body 12 / meta 11),
# so the shared DEMO_CV spills page 1. Keep the same persona with fewer bullets.
NIMBUS_DEMO_CV = {
    **DEMO_CV,
    "summary": (
        "Lider strategii łączący perspektywę biznesową z dyscypliną wykonania."
    ),
    "experience": [
        {
            "title": DEMO_CV["experience"][0]["title"],
            "company": DEMO_CV["experience"][0]["company"],
            "city": DEMO_CV["experience"][0]["city"],
            "period": DEMO_CV["experience"][0]["period"],
            "bullets": DEMO_CV["experience"][0]["bullets"][:1],
        },
        {
            "title": DEMO_CV["experience"][1]["title"],
            "company": DEMO_CV["experience"][1]["company"],
            "city": DEMO_CV["experience"][1]["city"],
            "period": DEMO_CV["experience"][1]["period"],
            "bullets": DEMO_CV["experience"][1]["bullets"][:1],
        },
    ],
    "skills": DEMO_CV["skills"][:4],
    "languages": DEMO_CV["languages"][:2],
}

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
    "nimbus",
    "cinder",
    "atrium",
    "axis",
    "blueprint",
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
    "nimbus": (
        "Nimbus template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Light minimal single column with soft blue accents,\n"
        " * set entirely in Lora (name 32 / headings & roles 14 /\n"
        " * body 12 dark grey / meta 11). Masthead keeps the name\n"
        " * accent bar, square photo slot, contact under the photo,\n"
        " * 3 px rules, 56 px under the header divider."
    ),
    "cinder": (
        "Cinder template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Dark, high-contrast single column with ember-red accents."
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
    "blueprint": (
        "Blueprint template (`layouts: [\"single\"]`).\n"
        " *\n"
        " * Technical-schematic single column with steel-blue registration marks."
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
 * representative demo content (Jan Kowalski — three roles, one degree, five
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
 * content (Jan Kowalski — three roles, one degree, five skills, and three
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
        if template_id == "nimbus":
            cv = NIMBUS_DEMO_CV
        elif template_id in COMPACT_TEMPLATE_IDS:
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
