"""Vestige CV template generator.

Vestige adapts the proven multi-page sidebar flow used by Sterling into a
narrow, typographic editorial layout. Its left rail owns contact details and
compact profile sections; the right column holds the name, role, summary, and
experience. Geometry is intentionally transformed after Sterling's deterministic
section planner runs, so the established sidebar overflow and record-packing
behaviour remain intact.

Contact channels and masthead identity (name-case toggle, show/hide title) are
NOT reused from Sterling's output. Sterling positions its contact row as one
centered band tied to the title's Y (via `_place_centered_icon_contacts`'s
"centered" descriptor); simply repositioning those elements would leave a
descriptor on the client that describes the wrong layout mode, so any
add/remove-channel edit would re-lay the band as a centered row instead of
Vestige's left-rail stack. Vestige instead builds its own contact rail directly
from `cv` via `_place_stacked_icon_contacts` (the same "stacked" mode Nova
uses) and its own `tag_masthead_identity` anchor, so both features work
through the same generic client-side reflow every other template relies on.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import Builder
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_stacked_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.templates.sterling import _gen_sterling

# Sterling's own main-column geometry (`sterling.py`'s `MAIN_L` / `MAIN_W`).
# Needed to proportionally re-translate `grid-member` cells (the languages
# grid) instead of collapsing them onto one box — see the transform loop.
_STERLING_MAIN_L = 245.0
_STERLING_MAIN_W = 300.0


def _gen_vestige(cv: dict) -> list[dict]:
    """Return a narrow-left-rail, monochrome executive CV element graph.

    The source template already partitions sidebar content independently from
    the main record flow. This function only restyles and repositions those
    stable semantic regions; it does not infer layout from text content.
    """
    elements = _gen_sterling(cv)
    old_sidebar_width = 210.0
    sidebar_width = 174.0
    main_left = 210.0
    main_width = 335.0
    sidebar_left = 27.0
    sidebar_content_width = 122.0
    main_scale = main_width / _STERLING_MAIN_W
    # Section-heading type scale: smaller than Sterling's 14 / 9.4 so the
    # narrower two-column measure still reads as a quiet editorial rail.
    main_heading_fs = 13.0
    sidebar_heading_fs = 8.4
    colors = {
        "#F7F8FA": "#FFFFFF",
        "#EDF1F6": "#F4F4F2",
        "#26313F": "#1B1B1A",
        "#4A6FA5": "#3E3E3C",
        "#33517A": "#262625",
        "#6B7684": "#747472",
        "#C7CFDA": "#D7D7D4",
    }

    transformed: list[dict] = []
    name_element: dict | None = None
    title_element: dict | None = None
    for source in elements:
        element = dict(source)
        category = element.get("category")
        flow_role = element.get("flowRole")
        flow_lane = element.get("flowLane")

        # Sterling's own contact row and its centered-band anchor are dropped
        # entirely here — Vestige rebuilds its contact rail from `cv` after
        # this loop (see module docstring for why reusing them is unsafe).
        if flow_role == "masthead" and category in {"image", "text"} and element.get("contactChannel"):
            continue
        if flow_role == "masthead-anchor" and element.get("contactBandId") == "sterling-contact":
            continue

        for field in ("color", "backgroundColor"):
            if element.get(field) in colors:
                element[field] = colors[element[field]]

        # Replace Sterling's blue-gray contact glyphs with Vestige's neutral
        # icon set. The image path remains a standard template asset and is
        # therefore resolved identically by the canvas and ReportLab renderer.
        if category == "image" and "/template-assets/iconic/sterling/" in str(element.get("src")):
            element["src"] = str(element["src"]).replace("/iconic/sterling/", "/iconic/vestige/")

        # Full-height rail and divider establish the narrow, quiet left column.
        if (
            category == "line"
            and element.get("fixedToPage")
            and element.get("left") == 0
            and element.get("width") == old_sidebar_width
        ):
            element["width"] = sidebar_width
        elif (
            category == "line"
            and element.get("fixedToPage")
            and element.get("left") == old_sidebar_width
            and element.get("height") == 842
        ):
            element["left"] = sidebar_width

        # The prior full-width tinted letterhead is intentionally removed.
        # Vestige uses white space around a right-column masthead instead.
        if (
            category == "line"
            and element.get("fixedToPage")
            and element.get("left") == 0
            and element.get("width") == 595
            and element.get("top") == 0
            and 100 < float(element.get("height", 0)) < 250
        ):
            element["left"] = sidebar_width
            element["width"] = 595.0 - sidebar_width
            element["backgroundColor"] = "#FFFFFF"

        # Section heading labels shrink to Vestige's quieter type scale. Only
        # the label text, never its hairline/tick (same flowRole, category
        # "line"), and never the sidebar body copy that shares this flowRole.
        if category == "text" and flow_role == "section-chrome":
            element["fontSize"] = main_heading_fs
        elif category == "text" and flow_role == "sidebar-chrome":
            element["fontSize"] = sidebar_heading_fs

        # Sidebar section chrome and content move down to make room for the
        # visible contact list, then scale into the narrower rail.
        if flow_lane == "sidebar" or flow_role == "sidebar-chrome":
            element["left"] = sidebar_left + (float(element.get("left", sidebar_left)) - 34.0) * 0.8
            if "width" in element and float(element["width"]) <= 160:
                element["width"] = min(float(element["width"]) * 0.8, sidebar_content_width)
            # Keep the first profile section below the last possible contact
            # row while retaining the compact vertical rhythm expected from a
            # narrow editorial rail. A previous 112pt offset created a large
            # unowned gap that became obvious with imported, content-heavy CVs.
            element["top"] = float(element.get("top", 0)) + 42.0
            if flow_role == "sidebar-chrome" and category == "line":
                element["width"] = 16.0
            # The narrower width invalidates Sterling's measured `height`
            # (wrapped at the original, wider column); recompute it so the
            # very first render already matches what "Dopasuj automatycznie"
            # / any later repack derives from live geometry. Without this, the
            # generator's own authored gap disagreed with the client's
            # corrected box height on first mount, then "snapped" once a
            # repack recomputed gaps from the true (now-matching) heights —
            # which read as spacing changing after using Układ CV.
            if category == "textarea" and "height" in element:
                element["height"] = Builder.measure_block(
                    element.get("content", ""),
                    element["width"],
                    element.get("fontSize", 9.0),
                    element.get("lineHeight", element.get("fontSize", 9.0) * 1.35),
                    element.get("fontFamily", "Montserrat"),
                    bold=bool(element.get("bold", False)),
                    bulletList=bool(element.get("bulletList", False)),
                )

        # Main-column content gains a more generous measure after the rail
        # narrows. This improves reading rhythm without changing record groups.
        # `grid-member` cells (the languages grid) must NOT be reset to one
        # shared box — each column needs its own translated position, or every
        # cell in a row collapses onto the same rectangle.
        if flow_role == "grid-member" and category == "textarea" and flow_lane != "sidebar":
            if float(element.get("left", 0)) >= old_sidebar_width:
                original_left = float(element["left"])
                element["left"] = main_left + (original_left - _STERLING_MAIN_L) * main_scale
                if "width" in element:
                    element["width"] = float(element["width"]) * main_scale
        elif flow_role == "section-chrome" or (
            category == "textarea" and flow_lane != "sidebar" and flow_role not in {"masthead", "masthead-anchor"}
        ):
            if float(element.get("left", 0)) >= old_sidebar_width:
                element["left"] = main_left
                if "width" in element:
                    element["width"] = main_width

        # Move personal identity to the main column; Sterling's contact row
        # was already dropped above and is rebuilt from `cv` after this loop.
        if flow_role == "masthead" and category == "textarea":
            element["left"] = main_left
            element["width"] = main_width
            element["align"] = "left"
            if element.get("fontFamily") == "CormorantGaramond":
                element["fontSize"] = 34.0
                element["lineHeight"] = 38.0
                name_element = element
            else:
                element["fontSize"] = 9.5
                element["lineHeight"] = 13.0
                element["letterSpacing"] = 1.8
                title_element = element
        elif flow_role == "masthead" and category == "line":
            element["left"] = main_left
            element["top"] = 132.0
            element["width"] = main_width
            element["backgroundColor"] = "#D7D7D4"

        transformed.append(element)

    # ── Rebuild the contact rail directly from `cv` (see module docstring) ──
    contact_items = _contact_channel_items(cv)
    contact_els, _contact_bottom, contact_descriptor = _place_stacked_icon_contacts(
        theme="vestige",
        items=contact_items,
        start_x=sidebar_left,
        start_y=46.0,
        text_fs=7.7,
        icon_size=9.5,
        text_color="#747472",
        font="Montserrat",
        icon_gap=13.0,
        line_step=16.0,
        band_id="vestige-contact",
    )
    for element in contact_els:
        element["flowRole"] = "masthead"
    transformed.extend(contact_els)
    if contact_items:
        transformed.append(build_contact_band_anchor(contact_descriptor))

    # ── Masthead identity: name-case toggle + show/hide title ──
    # `band_top` is where the main column's own content resumes after the
    # masthead (the first `section-chrome` top); the contact rail is a
    # parallel, independent sidebar column and is intentionally NOT passed as
    # `contact_band_id` — its rows are anchored near the page top and do not
    # move when the title is hidden, unlike templates whose contact row sits
    # directly under the title.
    if name_element is not None:
        main_section_tops = [
            float(el.get("top", 0.0))
            for el in transformed
            if el.get("flowRole") == "section-chrome"
        ]
        band_top = (
            min(main_section_tops)
            if main_section_tops
            else float(name_element.get("top", 0.0)) + 60.0
        )
        transformed.append(
            tag_masthead_identity(
                name_element,
                title_element,
                band_id="vestige-masthead",
                name_default_uppercase=False,
                title_default_uppercase=True,
                band_top=band_top,
                contact_band_id=None,
            )
        )

    return transformed
