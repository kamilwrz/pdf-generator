"""Vestige CV template generator.

Vestige adapts the proven multi-page sidebar flow used by Sterling into a
narrow, typographic editorial layout. Its left rail owns contact details and
compact profile sections; the right column holds the name, role, summary, and
experience. Geometry is intentionally transformed after Sterling's deterministic
section planner runs, so the established sidebar overflow and record-packing
behaviour remain intact.
"""
from __future__ import annotations

from app.services.cv_templates.templates.sterling import _gen_sterling


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
    contact_top_by_channel = {
        "phone": 104.0,
        "email": 120.0,
        "linkedin": 136.0,
        "location": 152.0,
        "github": 168.0,
        "website": 184.0,
    }
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
    for source in elements:
        element = dict(source)
        category = element.get("category")
        flow_role = element.get("flowRole")
        flow_lane = element.get("flowLane")

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

        # Main-column content gains a more generous measure after the rail
        # narrows. This improves reading rhythm without changing record groups.
        if flow_role == "section-chrome" or (
            category == "textarea" and flow_lane != "sidebar" and flow_role not in {"masthead", "masthead-anchor"}
        ):
            if float(element.get("left", 0)) >= old_sidebar_width:
                element["left"] = main_left
                if "width" in element:
                    element["width"] = main_width

        # Move personal identity to the main column and expose every contact
        # channel in the rail as an independent icon-and-label row.
        if flow_role == "masthead" and category == "textarea":
            element["left"] = main_left
            element["width"] = main_width
            element["align"] = "left"
            if element.get("fontFamily") == "CormorantGaramond":
                element["fontSize"] = 34.0
                element["lineHeight"] = 38.0
            else:
                element["fontSize"] = 9.5
                element["lineHeight"] = 13.0
                element["letterSpacing"] = 1.8
        elif flow_role == "masthead" and category in {"image", "text"} and element.get("contactChannel"):
            channel = element["contactChannel"]
            row_top = contact_top_by_channel.get(channel, 244.0)
            element["top"] = row_top
            if category == "image":
                element["left"] = sidebar_left
                element["width"] = 9.5
                element["height"] = 9.5
            else:
                element["left"] = sidebar_left + 13.0
                element["fontSize"] = 7.7
                element["color"] = "#747472"
        elif flow_role == "masthead" and category == "line":
            element["left"] = main_left
            element["top"] = 132.0
            element["width"] = main_width
            element["backgroundColor"] = "#D7D7D4"

        # The old centered-band anchor must not reposition the deliberately
        # left-rail contact rows after a user edits a channel.
        if flow_role == "masthead-anchor" and element.get("contactBandId") == "sterling-contact":
            continue

        transformed.append(element)

    return transformed
