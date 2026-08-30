"""Registry of individual CV template generators."""
from __future__ import annotations

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
}


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
