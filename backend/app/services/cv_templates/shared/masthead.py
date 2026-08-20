"""Masthead identity helpers for CV template generators (Phase 3).

Tags the name/title elements so the client masthead-identity manager can toggle
the name's case and hide/show the title, and emits a zero-footprint anchor
carrying the reflow descriptor. Mirrors `shared/contact.py`'s band-anchor model.
"""
from __future__ import annotations

from typing import Any


def build_masthead_identity_anchor(descriptor: dict[str, Any], *, page: int = 1) -> dict:
    """Zero-footprint anchor carrying a masthead identity descriptor.

    Empty ``content`` draws nothing; ``flowRole`` "masthead-anchor" keeps the
    structural section detector from treating it as a heading. The client reads
    ``mastheadIdentity`` off this element to toggle name case / title visibility.
    """
    return {
        "category": "text", "content": "",
        "left": 0, "top": 0, "width": 0, "height": 0,
        "fontSize": 1, "fontFamily": "Inter", "color": "#000000",
        "zIndex": 0, "page": page,
        "flowRole": "masthead-anchor",
        "mastheadIdentity": descriptor,
        "mastheadBandId": descriptor["id"],
    }


def tag_masthead_identity(
    name_el: dict,
    title_el: dict | None,
    *,
    band_id: str,
    name_default_uppercase: bool,
    band_top: float,
    title_default_uppercase: bool = False,
    contact_band_id: str | None = None,
) -> dict:
    """Stamp identity onto the name/title elements (in place) and build the anchor.

    ``name_default_uppercase`` / ``title_default_uppercase`` seed the reversible
    ``textTransform`` flag for templates whose design uppercases these lines, so
    the stored ``content`` stays original-case. ``band_top`` is the contact
    band's start Y; ``blockPt`` (the amount downstream flow shifts when the title
    is hidden) is ``band_top - title_top``.
    """
    name_el["mastheadRole"] = "name"
    name_el["mastheadBandId"] = band_id
    if name_default_uppercase:
        name_el["textTransform"] = "uppercase"

    title_spec: dict | None = None
    block_pt = 0.0
    if title_el is not None:
        title_el["mastheadRole"] = "title"
        title_el["mastheadBandId"] = band_id
        if title_default_uppercase:
            title_el["textTransform"] = "uppercase"
        title_top = float(title_el.get("top", 0.0))
        block_pt = float(band_top) - title_top
        title_spec = {
            "content": title_el.get("content", ""),
            "left": title_el.get("left"),
            "top": title_top,
            "fontSizePt": title_el.get("fontSize"),
            "fontFamily": title_el.get("fontFamily"),
            "colorHex": title_el.get("color"),
            "letterSpacing": title_el.get("letterSpacing"),
            "textTransform": title_el.get("textTransform", "none"),
            "bold": bool(title_el.get("bold", False)),
        }

    descriptor = {
        "id": band_id,
        "name": {"defaultUppercase": bool(name_default_uppercase)},
        "title": {"spec": title_spec, "blockPt": block_pt,
                  "present": title_el is not None},
        "contactBandId": contact_band_id,
    }
    return build_masthead_identity_anchor(descriptor)
