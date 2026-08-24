"""Cadenza CV template generator.

Cadenza is an original editorial sidebar layout built for dense, professional
CVs. It keeps Sterling's proven multi-page sidebar planner, while replacing
the visual language with a Swiss-inspired cream, white, black, and taupe
system. Its composition is deliberately unlike the reference artwork: a quiet
white information rail sits on warm paper, with a restrained geometry set
(rectangle, circle, ellipse, and rules) framing the page rather than serving
as a collage.

The inherited planner is intentional. It preserves editable sidebar lanes,
record flow groups, pagination, and continuation-page behavior. Presentation
changes are applied only after Sterling has produced those structural
guarantees, so switching to Cadenza never turns decorative geometry into
movable CV content.
"""
from __future__ import annotations

from copy import deepcopy

from app.services.cv_generator_primitives import _circle, _ellipse, _line, _rect
from app.services.cv_templates.templates.sterling import _gen_sterling


_COLOR_MAP = {
    "#F7F8FA": "#F5F1E8",
    "#26313F": "#000000",
    "#4A6FA5": "#B38B6D",
    "#33517A": "#000000",
    "#6B7684": "#808080",
    "#EDF1F6": "#FFFFFF",
    "#C7CFDA": "#B38B6D",
}


def _fixed(element: dict, *, repeat: bool = True) -> dict:
    """Mark page furniture as non-editable and safe to clone on overflow."""
    result = {**element, "fixedToPage": True}
    if not repeat:
        result["repeatOnContinuation"] = False
    return result


def _cadenza_geometry(page: int) -> list[dict]:
    """Return Cadenza's page furniture without entering either content lane.

    The elements are sparse by design: they establish a recognisable rhythm
    while leaving the document's text-first reading order and ATS extraction
    untouched. All supported geometric primitives appear as fixed chrome.
    """
    geometry = [
        _fixed(_rect(20, 22, 36, 36, "#B38B6D", borderWidth=1.2, zIndex=2, page=page)),
        _fixed(_circle(33, 35, 10, "#B38B6D", filled=True, zIndex=3, page=page)),
        _fixed(_ellipse(468, 27, 84, 19, "#B38B6D", borderWidth=1.1, zIndex=2, page=page)),
        _fixed(_line(468, 55, 84, 1.0, "#B38B6D", zIndex=2, page=page)),
        _fixed(_rect(548, 772, 18, 18, "#B38B6D", filled=True, zIndex=2, page=page)),
        _fixed(_circle(553, 777, 8, "#F5F1E8", filled=True, zIndex=3, page=page)),
    ]
    # The upper ornaments belong to the first page's letterhead only; keeping
    # continuation pages quieter avoids visual noise near spillover records.
    if page != 1:
        return geometry[4:]
    return geometry


def _gen_cadenza(cv: dict) -> list[dict]:
    """Build Cadenza from normalized CV data with a sidebar-safe layout."""
    elements = deepcopy(_gen_sterling(cv))
    for element in elements:
        for field in ("color", "backgroundColor"):
            if element.get(field) in _COLOR_MAP:
                element[field] = _COLOR_MAP[element[field]]

        # A high-contrast Lora masthead and neutral Inter body keep the editorial
        # hierarchy clear without borrowing any reference template typography.
        if element.get("fontFamily") == "CormorantGaramond":
            element["fontFamily"] = "Lora"
        elif element.get("fontFamily") in {"Montserrat", "JetBrainsMono"}:
            element["fontFamily"] = "Inter"

        if element.get("category") == "image":
            element["alt"] = element.get("alt") or "Contact icon"

    pages = max((element.get("page", 1) for element in elements), default=1)
    geometry = [
        item
        for page in range(1, pages + 1)
        for item in _cadenza_geometry(page)
    ]
    # Append after Sterling's page-band elements. The renderer preserves order
    # for equal z-index values, so the first-page ornaments are not hidden by
    # the inherited white letterhead surface.
    return elements + geometry
