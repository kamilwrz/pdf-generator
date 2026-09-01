"""Registry of individual CV template generators."""
from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.templates.monument import _gen_monument
from app.services.cv_templates.templates.slate import _gen_slate
from app.services.cv_templates.templates.atrium import _gen_atrium
from app.services.cv_templates.templates.sterling import _gen_sterling
from app.services.cv_templates.templates.regent import _gen_regent
from app.services.cv_templates.templates.meridian import _gen_meridian
from app.services.cv_templates.templates.linden import _gen_linden
from app.services.cv_templates.templates.cadenza import _gen_cadenza
from app.services.cv_templates.templates.vellum import _gen_vellum
from app.services.cv_templates.templates.aurelia import _gen_aurelia


@dataclass(frozen=True)
class TemplateMetadata:
    """Public product metadata for one server-supported CV template.

    Generator callables and authored element packs are intentionally absent.
    Paid template geometry is materialized only by the entitlement-gated
    ``POST /ai/fill_template`` endpoint.
    """

    id: str
    name: str
    description: str
    tier: str
    layouts: tuple[str, ...]
    accent: str
    preview_path: str


TEMPLATE_CATALOG: tuple[TemplateMetadata, ...] = (
    TemplateMetadata(
        "monument", "Monument", "Monochromatyczny editorial", "pro",
        ("single",), "#343434", "/template-mockups/monument.png",
    ),
    TemplateMetadata(
        "slate", "Slate", "Stalowy sidebar, siatka i prostokątne zdjęcie", "pro",
        ("icons", "sidebar"), "#3E5C76", "/template-mockups/slate.png",
    ),
    TemplateMetadata(
        "atrium", "Atrium", "Architektoniczny editorial z sześcioma paletami Wyglądu", "pro",
        ("icons", "single"), "#556158", "/template-mockups/atrium.png",
    ),
    TemplateMetadata(
        "sterling", "Sterling", "Elegancki, niebiesko-szary układ z szerokim sidebarem", "free",
        ("sidebar",), "#4A6FA5", "/template-mockups/sterling.png",
    ),
    TemplateMetadata(
        "regent", "Regent", "Klasyczna monochromatyczna typografia executive", "pro",
        ("icons", "single"), "#151515", "/template-mockups/regent.png",
    ),
    TemplateMetadata(
        "meridian", "Meridian", "Granatowo-niebieski układ executive w jednej kolumnie", "free",
        ("icons", "single"), "#3D5A80", "/template-mockups/meridian.png",
    ),
    TemplateMetadata(
        "linden", "Linden", "Botaniczny editorial, prostokątne zdjęcie i leśna zieleń", "free",
        ("icons", "sidebar"), "#285548", "/template-mockups/linden.png",
    ),
    TemplateMetadata(
        "cadenza", "Cadenza", "Klasyczny editorial, pasy sekcji i prawa oś dat", "pro",
        ("icons", "single"), "#855C46", "/template-mockups/cadenza.png",
    ),
    TemplateMetadata(
        "vellum", "Vellum", "Portretowy editorial, miękkie pole résumé i prawa oś dat", "pro",
        ("icons", "single"), "#8A5E47", "/template-mockups/vellum.png",
    ),
    TemplateMetadata(
        "aurelia", "Aurelia", "Oliwkowo-złoty editorial z ramowym mastheadem", "pro",
        ("icons", "single"), "#98884D", "/template-mockups/aurelia.png",
    ),
)

TEMPLATE_LAYOUTS: dict[str, frozenset[str]] = {
    "monument": frozenset({"single"}),
    "slate": frozenset({"sidebar", "icons"}),
    "atrium": frozenset({"single", "icons"}),
    "sterling": frozenset({"sidebar"}),
    "regent": frozenset({"single", "icons"}),
    "meridian": frozenset({"single", "icons"}),
    "linden": frozenset({"sidebar", "icons"}),
    "cadenza": frozenset({"single", "icons"}),
    "vellum": frozenset({"single", "icons"}),
    "aurelia": frozenset({"single", "icons"}),
}

_GENERATORS = {
    "monument": _gen_monument,
    "slate": _gen_slate,
    "atrium": _gen_atrium,
    "sterling": _gen_sterling,
    "regent": _gen_regent,
    "meridian": _gen_meridian,
    "linden": _gen_linden,
    "cadenza": _gen_cadenza,
    "vellum": _gen_vellum,
    "aurelia": _gen_aurelia,
}


def public_template_catalog() -> list[dict]:
    """Return fresh public DTO dictionaries without executable layout data."""

    return [asdict(metadata) for metadata in TEMPLATE_CATALOG]


def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    """Return a full canvas element list for `template_id` filled with `cv_data`.

    Layout is deterministic Python (not LLM placement). One experience/education
    block is emitted per record; page overflow is handled by each template's Builder.
    Raises ValueError for unknown template ids.
    """
    fn = _GENERATORS.get(template_id)
    if fn is None:
        raise ValueError(
            f"Nieznany szablon '{template_id}'. "
            f"Dostępne: {list(_GENERATORS)}"
        )
    return fn(normalize_cv_data(cv_data))
