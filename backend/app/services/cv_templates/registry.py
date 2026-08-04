"""Registry of individual CV template generators."""
from __future__ import annotations

from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.templates.ledger import _gen_ledger
from app.services.cv_templates.templates.nimbus import _gen_nimbus
from app.services.cv_templates.templates.cinder import _gen_cinder
from app.services.cv_templates.templates.rift import _gen_rift
from app.services.cv_templates.templates.signal import _gen_signal
from app.services.cv_templates.templates.vector import _gen_vector
from app.services.cv_templates.templates.kernel import _gen_kernel
from app.services.cv_templates.templates.relay import _gen_relay
from app.services.cv_templates.templates.scribe import _gen_scribe
from app.services.cv_templates.templates.regent import _gen_regent
from app.services.cv_templates.templates.aldine import _gen_aldine
from app.services.cv_templates.templates.merit import _gen_merit
from app.services.cv_templates.templates.moss import _gen_moss
from app.services.cv_templates.templates.harbor import _gen_harbor
from app.services.cv_templates.templates.obsidian import _gen_obsidian
from app.services.cv_templates.templates.raven import _gen_raven
from app.services.cv_templates.templates.graphite import _gen_graphite
from app.services.cv_templates.templates.onyx import _gen_onyx
from app.services.cv_templates.templates.nova import _gen_nova
from app.services.cv_templates.templates.ridge import _gen_ridge
from app.services.cv_templates.templates.loom import _gen_loom
from app.services.cv_templates.templates.volt import _gen_volt
from app.services.cv_templates.templates.monument import _gen_monument
from app.services.cv_templates.templates.words import _gen_words
from app.services.cv_templates.templates.cardinal import _gen_cardinal

TEMPLATE_LAYOUTS: dict[str, frozenset[str]] = {
    "ledger": frozenset({"single"}),
    "nimbus": frozenset({"single"}),
    "cinder": frozenset({"single"}),
    "rift": frozenset({"single"}),
    "signal": frozenset({"single"}),
    "vector": frozenset({"single"}),
    "kernel": frozenset({"single"}),
    "relay": frozenset({"single"}),
    "scribe": frozenset({"single"}),
    "regent": frozenset({"single"}),
    "aldine": frozenset({"single"}),
    "merit": frozenset({"single"}),
    "monument": frozenset({"single"}),
    "words": frozenset({"single"}),
    "cardinal": frozenset({"icons"}),
    "moss": frozenset({"sidebar"}),
    "harbor": frozenset({"sidebar", "icons"}),
    "obsidian": frozenset({"sidebar", "dark"}),
    "raven": frozenset({"dark"}),
    "graphite": frozenset({"dark"}),
    "onyx": frozenset({"dark"}),
    "nova": frozenset({"icons"}),
    "ridge": frozenset({"icons"}),
    "loom": frozenset({"sidebar", "icons"}),
    "volt": frozenset({"icons", "dark"}),
}

_GENERATORS = {
    "ledger": _gen_ledger,
    "nimbus": _gen_nimbus,
    "cinder": _gen_cinder,
    "rift": _gen_rift,
    "signal": _gen_signal,
    "vector": _gen_vector,
    "kernel": _gen_kernel,
    "relay": _gen_relay,
    "scribe": _gen_scribe,
    "regent": _gen_regent,
    "aldine": _gen_aldine,
    "merit": _gen_merit,
    "moss": _gen_moss,
    "harbor": _gen_harbor,
    "obsidian": _gen_obsidian,
    "raven": _gen_raven,
    "graphite": _gen_graphite,
    "onyx": _gen_onyx,
    "nova": _gen_nova,
    "ridge": _gen_ridge,
    "loom": _gen_loom,
    "volt": _gen_volt,
    "monument": _gen_monument,
    "words": _gen_words,
    "cardinal": _gen_cardinal,
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
