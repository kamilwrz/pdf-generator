"""Archive CV template generator.

Archive is a wide-sidebar editorial layout with a mineral-green paper palette.
It reuses Sterling's proven multi-page column planner and shared reflow metadata,
then applies an independent visual system at the template boundary. Keeping the
planner shared is intentional: editable records must continue to move as a
single flow, while the Archive-specific colors and typography remain isolated
from other templates.
"""
from __future__ import annotations

from copy import deepcopy

from app.services.cv_templates.templates.sterling import _gen_sterling


_COLOR_MAP = {
    "#F7F8FA": "#F3F0E9",
    "#26313F": "#202724",
    "#4A6FA5": "#6B7C72",
    "#33517A": "#4E6258",
    "#6B7684": "#65706B",
    "#EDF1F6": "#E6E5DD",
    "#C7CFDA": "#C9C5BA",
}


def _gen_archive(cv: dict) -> list[dict]:
    """Return Archive elements filled with ``cv``.

    Sterling supplies the established wide-sidebar placement and continuation
    page behavior. This function deep-copies that result before changing visual
    properties, so the source generator's element dictionaries and any caller
    state remain untouched.
    """
    elements = deepcopy(_gen_sterling(cv))

    for element in elements:
        for field in ("color", "backgroundColor"):
            value = element.get(field)
            if value in _COLOR_MAP:
                element[field] = _COLOR_MAP[value]

        # Archive uses Lora for the display name and Inter for all operational
        # text. Both families are registered by the PDF renderer and are
        # available to the browser canvas font selector.
        if element.get("fontFamily") == "CormorantGaramond":
            element["fontFamily"] = "Lora"
        elif element.get("fontFamily") in {"Montserrat", "JetBrainsMono"}:
            element["fontFamily"] = "Inter"

        # Reuse Sterling's icon assets until a separate Archive icon theme is
        # needed. Asset identity does not affect the editable layout contract.
        if element.get("category") == "image":
            element["alt"] = element.get("alt") or "Contact icon"

    return elements
