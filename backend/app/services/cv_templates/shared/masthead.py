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
    title_prototype: dict | None = None,
    band_id: str,
    name_default_uppercase: bool,
    band_top: float,
    title_default_uppercase: bool = False,
    title_reclaim_pt: float | None = None,
    contact_band_id: str | None = None,
    title_decorations: list[dict] | None = None,
) -> dict:
    """Stamp identity onto the name/title elements (in place) and build the anchor.

    ``title_prototype`` is an unrendered, empty title element authored by the
    template generator. It is used only when the source CV has no title, so the
    descriptor still carries the exact category, geometry, typography, and
    casing needed by the editor's add-title action. Keeping the prototype next
    to the generator's real title construction avoids a second style registry
    that could drift from the template.

    ``name_default_uppercase`` / ``title_default_uppercase`` seed the reversible
    ``textTransform`` flag for templates whose design uppercases these lines, so
    the stored ``content`` stays original-case. ``band_top`` is the downstream
    masthead boundary used to derive ``blockPt``; for stacked layouts it is
    normally the contact band's start Y, while fixed/parallel layouts pass the
    title's own Y to opt out of reflow. Templates may pass ``title_reclaim_pt``
    when hiding the title should reclaim only part of the span. This keeps a
    deliberate visual buffer instead of pulling the next masthead row directly
    against the name.
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

    # An existing title is always the source of truth because its measured
    # height can depend on the real text. The prototype is only a latent
    # fallback for an initially empty profile and is never added to the output
    # element list by this helper.
    title_source = title_el if title_el is not None else title_prototype
    if title_source is not None:
        if title_default_uppercase:
            title_source["textTransform"] = "uppercase"
        title_top = float(title_source.get("top", 0.0))
        block_pt = float(band_top) - title_top
        # Capture the full box geometry, not just the text run. Centered
        # mastheads emit the title as a width-bounded, ``align: "center"``
        # textarea; without ``category``/``width``/``align`` the client can only
        # rebuild it as point text anchored at ``left``, which drops the
        # centering on re-add and makes it impossible to keep centered while
        # editing. ``height``/``lineHeight``/``autoHeight`` let the re-added box
        # match the original line metrics exactly.
        title_spec = {
            "category": title_source.get("category", "text"),
            "content": title_source.get("content", ""),
            "left": title_source.get("left"),
            "top": title_top,
            "width": title_source.get("width"),
            "height": title_source.get("height"),
            "fontSizePt": title_source.get("fontSize"),
            "lineHeight": title_source.get("lineHeight"),
            "fontFamily": title_source.get("fontFamily"),
            "colorHex": title_source.get("color"),
            "letterSpacing": title_source.get("letterSpacing"),
            "align": title_source.get("align"),
            "autoHeight": bool(title_source.get("autoHeight", False)),
            "preserveInitialLayout": bool(
                title_source.get("preserveInitialLayout", False)
            ),
            "textTransform": title_source.get("textTransform", "none"),
            "bold": bool(title_source.get("bold", False)),
            "italic": bool(title_source.get("italic", False)),
            "underline": bool(title_source.get("underline", False)),
            "zIndex": title_source.get("zIndex", 3),
        }

    decoration_specs: list[dict] = []
    for decoration in title_decorations or []:
        # Decorations supplied beside a real title are rendered elements and
        # therefore need semantic tags. With a latent prototype they remain
        # descriptor-only blueprints, preventing empty bars/pills from being
        # left behind in documents whose title is initially absent.
        if title_el is not None:
            decoration["mastheadRole"] = "title-decoration"
            decoration["mastheadBandId"] = band_id
        decoration_spec = {
            key: decoration[key]
            for key in (
                "category", "left", "top", "width", "height", "backgroundColor",
                "borderColor", "borderWidth", "borderRadius", "filled", "zIndex",
                "page", "flowRole", "titleDecoration",
            )
            if key in decoration
        }
        # A reconstructed title decoration is masthead chrome, even when its
        # initially empty prototype never passed through the generator's final
        # flow-role stamping loop. Persist the role in the blueprint so later
        # structural packing cannot mistake the restored pill/band for content.
        decoration_spec.setdefault("flowRole", "masthead")
        decoration_specs.append(decoration_spec)

    title_descriptor = {
        "spec": title_spec,
        "blockPt": block_pt,
        "present": title_el is not None,
        "decorations": decoration_specs,
    }
    if title_reclaim_pt is not None:
        # The editor falls back to blockPt for existing templates/documents.
        # Keeping this override explicit makes the reduced reflow reversible
        # without changing the authored geometry stored in blockPt.
        title_descriptor["reclaimPt"] = float(title_reclaim_pt)

    descriptor = {
        "id": band_id,
        "name": {"defaultUppercase": bool(name_default_uppercase)},
        "title": title_descriptor,
        "contactBandId": contact_band_id,
    }
    return build_masthead_identity_anchor(descriptor)
