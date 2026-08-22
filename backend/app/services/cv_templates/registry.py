"""Registry of individual CV template generators."""
from __future__ import annotations

from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.templates.nova import _gen_nova
from app.services.cv_templates.templates.volt import _gen_volt
from app.services.cv_templates.templates.monument import _gen_monument
from app.services.cv_templates.templates.tessera import _gen_tessera
from app.services.cv_templates.templates.slate import _gen_slate
from app.services.cv_templates.templates.portico import _gen_portico
from app.services.cv_templates.templates.atrium import _gen_atrium
from app.services.cv_templates.templates.sterling import _gen_sterling
from app.services.cv_templates.templates.regent import _gen_regent
from app.services.cv_templates.templates.vestige import _gen_vestige
from app.services.cv_templates.templates.meridian import _gen_meridian

TEMPLATE_LAYOUTS: dict[str, frozenset[str]] = {
    "monument": frozenset({"single"}),
    "nova": frozenset({"icons"}),
    "volt": frozenset({"icons", "dark"}),
    "tessera": frozenset({"sidebar", "icons"}),
    "slate": frozenset({"sidebar", "icons"}),
    "portico": frozenset({"icons"}),
    "atrium": frozenset({"single", "icons"}),
    "sterling": frozenset({"sidebar"}),
    "regent": frozenset({"single", "icons"}),
    "vestige": frozenset({"sidebar", "icons"}),
    "meridian": frozenset({"single", "icons"}),
}

_GENERATORS = {
    "nova": _gen_nova,
    "volt": _gen_volt,
    "monument": _gen_monument,
    "tessera": _gen_tessera,
    "slate": _gen_slate,
    "portico": _gen_portico,
    "atrium": _gen_atrium,
    "sterling": _gen_sterling,
    "regent": _gen_regent,
    "vestige": _gen_vestige,
    "meridian": _gen_meridian,
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
