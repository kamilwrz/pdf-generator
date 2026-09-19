"""Facet: white paper, angular olive inlays and two independently flowing lanes.

The shared column planner owns records, section transfer and pagination. This
presentation layer owns only document colours and vector ornaments; it does
not flatten content or introduce editor controls into the exported graph.
"""
from __future__ import annotations

from copy import deepcopy

from app.services.cv.templates.generators.sterling import _gen_sterling


COLORS = {
    "paper": "#FFFFFF", "ink": "#252C24", "accent": "#657537",
    "accentDeep": "#47552B", "muted": "#62685D",
    "sidebar": "#F3F5EC", "rule": "#CDD4BD",
}
_SOURCE_ROLES = {
    "#F7F8FA": "paper", "#26313F": "ink", "#4A6FA5": "accent",
    "#33517A": "accentDeep", "#6B7684": "muted",
    "#EDF1F6": "sidebar", "#C7CFDA": "rule",
}


def _facet_polygon(left, top, width, height, points, role, **metadata) -> dict:
    """Create normalized vector geometry shared by the canvas and PDF renderer."""
    return {
        "category": "polygon", "left": left, "top": top,
        "width": width, "height": height, "points": points,
        "filled": True, "backgroundColor": COLORS[role], "zIndex": 2,
        "page": 1, **metadata,
    }


def _gen_facet(cv: dict) -> list[dict]:
    """Generate editable Facet elements from normalized CV data.

    Reuse measured, complete-record pagination in both columns. Distinct colours
    identify semantic roles within each palette, including dark editions, without
    adding a second persistence contract. Page ornaments
    stay fixed; section inlays inherit their heading's lane/group and therefore
    travel with a reordered or repaginated section.
    """
    source = deepcopy(_gen_sterling(cv, masthead_font="BarlowCondensed", body_font="Lato"))
    output = []
    for element in source:
        for field in ("color", "backgroundColor", "borderColor"):
            role = _SOURCE_ROLES.get(element.get(field))
            if role:
                element[field] = COLORS[role]

        if element.get("appearanceTemplateId"):
            element["appearanceTemplateId"] = "facet"
            element["appearanceSettings"] = {"palette": "olive", "textSize": "M"}
        # The paper cover keeps the whole first-page identity region white.
        # Its original bounds already include any wrapped name/contact rows.
        if element.get("fixedToPage") and element.get("repeatOnContinuation") is False:
            element["backgroundColor"] = COLORS["paper"]

        for field in ("id", "contactBandId", "mastheadBandId"):
            if isinstance(element.get(field), str):
                element[field] = element[field].replace("sterling", "facet")
        if element.get("category") == "image":
            element["src"] = element["src"].replace("/sterling/", "/facet-olive/")
        if element.get("contactBand"):
            band = element["contactBand"]
            band["id"] = "facet-contact"
            band["text"]["colorHex"] = COLORS["muted"]
            band["icon"]["theme"] = "facet-olive"
        if element.get("mastheadIdentity"):
            identity = element["mastheadIdentity"]
            identity["id"] = "facet-masthead"
            if identity.get("contactBandId"):
                identity["contactBandId"] = "facet-contact"
            identity["title"]["spec"]["colorHex"] = COLORS["accent"]
        if element.get("mastheadRole") == "name":
            element["appearanceTypographyRole"] = "display"

        if element.get("flowRole") == "masthead" and element.get("category") == "line":
            # The ascending ribbon sits above a quiet baseline. Retaining the
            # native line lets the shared masthead reflow resize its paper cover
            # after contact/name edits without template-specific editor code.
            element["id"] = "facet-masthead-divider"
            output.append(_facet_polygon(
                element["left"], element["top"] - 16, element["width"], 18,
                [[0, .84], [1, 0], [1, .16], [0, 1]], "accent",
                flowRole="masthead", id="facet-masthead-ribbon",
            ))
        output.append(element)

        if element.get("category") == "line" and element.get("flowRole") in {"section-chrome", "sidebar-chrome"}:
            # Keep the marker within the existing rule footprint; it cannot
            # reserve extra flow height or cross into the adjacent text lane.
            output.append(_facet_polygon(
                element["left"], element["top"], 22, 1,
                [[0, 0], [1, 0], [.82, 1], [0, 1]], "accent",
                page=element.get("page", 1),
                **{key: element[key] for key in ("flowRole", "flowLane", "flowGroup") if key in element},
            ))

    pages = max((int(element.get("page", 1)) for element in source), default=1)
    for page in range(1, pages + 1):
        # Continuations use the same clipped corner language, kept entirely
        # inside the top/bottom margins reserved by the shared page planner.
        output.extend([
            _facet_polygon(477, 0, 118, 34, [[0, 0], [1, 0], [1, 1]], "accent",
                           fixedToPage=True, page=page, id=f"facet-corner-{page}"),
            _facet_polygon(446, 0, 108, 34, [[0, 0], [.16, 0], [1, 1], [.84, 1]], "rule",
                           fixedToPage=True, page=page),
            _facet_polygon(0, 810, 118, 32, [[0, 0], [1, 1], [0, 1]], "accent",
                           fixedToPage=True, page=page),
            _facet_polygon(70, 817, 82, 25, [[0, 0], [.2, 0], [1, 1], [.8, 1]], "rule",
                           fixedToPage=True, page=page),
        ])
    return output
