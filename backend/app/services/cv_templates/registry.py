"""Registry of individual CV template generators."""
from __future__ import annotations

from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.templates.ledger import _gen_ledger
from app.services.cv_templates.templates.nimbus import _gen_nimbus
from app.services.cv_templates.templates.cinder import _gen_cinder
from app.services.cv_templates.templates.signal import _gen_signal
from app.services.cv_templates.templates.kernel import _gen_kernel
from app.services.cv_templates.templates.regent import _gen_regent
from app.services.cv_templates.templates.aldine import _gen_aldine
from app.services.cv_templates.templates.harbor import _gen_harbor
from app.services.cv_templates.templates.obsidian import _gen_obsidian
from app.services.cv_templates.templates.nova import _gen_nova
from app.services.cv_templates.templates.ridge import _gen_ridge
from app.services.cv_templates.templates.loom import _gen_loom
from app.services.cv_templates.templates.volt import _gen_volt
from app.services.cv_templates.templates.monument import _gen_monument
from app.services.cv_templates.templates.words import _gen_words
from app.services.cv_templates.templates.cardinal import _gen_cardinal
from app.services.cv_templates.templates.tessera import _gen_tessera

TEMPLATE_LAYOUTS: dict[str, frozenset[str]] = {
    "ledger": frozenset({"single"}),
    "nimbus": frozenset({"single"}),
    "cinder": frozenset({"single"}),
    "signal": frozenset({"single"}),
    "kernel": frozenset({"single"}),
    "regent": frozenset({"single"}),
    "aldine": frozenset({"single"}),
    "monument": frozenset({"single"}),
    "words": frozenset({"single"}),
    "cardinal": frozenset({"icons"}),
    "harbor": frozenset({"sidebar", "icons"}),
    "obsidian": frozenset({"sidebar", "dark"}),
    "nova": frozenset({"icons"}),
    "ridge": frozenset({"icons"}),
    "loom": frozenset({"sidebar", "icons"}),
    "volt": frozenset({"icons", "dark"}),
    "tessera": frozenset({"sidebar", "icons"}),
}

_GENERATORS = {
    "ledger": _gen_ledger,
    "nimbus": _gen_nimbus,
    "cinder": _gen_cinder,
    "signal": _gen_signal,
    "kernel": _gen_kernel,
    "regent": _gen_regent,
    "aldine": _gen_aldine,
    "harbor": _gen_harbor,
    "obsidian": _gen_obsidian,
    "nova": _gen_nova,
    "ridge": _gen_ridge,
    "loom": _gen_loom,
    "volt": _gen_volt,
    "monument": _gen_monument,
    "words": _gen_words,
    "cardinal": _gen_cardinal,
    "tessera": _gen_tessera,
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
