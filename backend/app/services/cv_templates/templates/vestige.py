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

from app.services.cv_generator_primitives import Builder, _line, _rect, _text
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_stacked_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.templates.sterling import _gen_sterling

# Masthead photo slot geometry (see the empty-state photo-slot block below).
# Matches the exact placement a user positioned by hand in the live editor —
# flush against the page's right margin, above the masthead rule — rather
# than a value derived from the column math above.
_PHOTO_LEFT = 505.0
_PHOTO_TOP = 25.0
_PHOTO_W = 60.0
# Nova's own portrait well aspect ratio (100 x 124), reused here so the empty
# slot reads as a conventional headshot frame rather than an arbitrary box.
_PHOTO_H = round(_PHOTO_W * 124.0 / 100.0, 1)

# Static contact-section chrome. It deliberately sits outside the managed
# contact band, so removing the final optional channel never removes the label
# that identifies this fixed part of Vestige's sidebar.
_CONTACT_HEADING_TOP = 23.0
_CONTACT_START_TOP = 46.0
# Use one physical-point hairline throughout Vestige. Fractional-height rules
# can cover two device-pixel rows at some Y coordinates, making one sidebar
# divider look heavier than its neighbours at common canvas zooms.
_RULE_HEIGHT = 1.0

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
    # Uniform body line height for both columns, distinct from whatever
    # Sterling used per field (main body/bullets 13.8, record titles 14.0,
    # meta rails 11.8, sidebar summary 12.04, ...). Feeding one fixed value
    # into both the recomputed `height` below and the rendered CSS keeps the
    # two in agreement — see the cascading-shift comment below for why a
    # mismatch there used to overlap sidebar sections.
    sidebar_body_line_height = 12.0
    main_body_line_height = 12.0
    colors = {
        "#F7F8FA": "#FFFFFF",
        "#EDF1F6": "#F4F4F2",
        "#26313F": "#1B1B1A",
        "#4A6FA5": "#3E3E3C",
        "#33517A": "#262625",
        "#6B7684": "#747472",
        "#C7CFDA": "#D7D7D4",
    }

    # Sterling positions the main column's first heading using ITS OWN cursor,
    # which reserves room for a centered contact row under the title. Vestige
    # drops that row entirely (contacts move to the rebuilt sidebar rail), but
    # never reclaimed the vertical space it left behind — so the main column's
    # first heading sits an arbitrary, content-dependent distance below the
    # real end of the name/title stack (more contact channels in the ORIGINAL
    # cv push Sterling's cursor down further, so the gap is not even a fixed
    # offset). Besides the wasted whitespace, that arbitrary gap is exactly
    # what fed the `resolveFlowStart` bug below: recompute a name/title-scale
    # divider position and close the main column's gap down to a fixed,
    # reasonable one instead of trusting Sterling's inflated cursor.
    #
    # `Builder.measure_block` needs Vestige's own name/title font metrics
    # (34/38 and 9.5/13 — set again, identically, in the main loop below);
    # measuring here, before the loop, only to learn the stack's real bottom.
    def _raw_masthead_textarea(is_name: bool) -> dict | None:
        for el in elements:
            if el.get("flowRole") != "masthead" or el.get("category") != "textarea":
                continue
            if (el.get("fontFamily") == "CormorantGaramond") == is_name:
                return el
        return None

    raw_name = _raw_masthead_textarea(True)
    raw_title = _raw_masthead_textarea(False)
    stack_bottom = 0.0
    if raw_name is not None:
        name_height = Builder.measure_block(raw_name.get("content", ""), main_width, 34.0, 38.0, "CormorantGaramond")
        stack_bottom = max(stack_bottom, float(raw_name["top"]) + name_height)
    if raw_title is not None:
        title_height = Builder.measure_block(
            raw_title.get("content", ""), main_width, 9.5, 13.0, raw_title.get("fontFamily", "Montserrat"),
        )
        stack_bottom = max(stack_bottom, float(raw_title["top"]) + title_height)
    # Fixed gaps below the real name/title stack: enough room for the hairline
    # divider, then a comfortable clearance before the first section heading —
    # matching the rhythm every other masthead-driven template (Nova, etc.)
    # authors between its own closing rule and its first section.
    divider_top = stack_bottom + 12.0 if stack_bottom > 0 else 132.0
    desired_first_main_top = divider_top + 30.0

    # Align the sidebar's first section (its contact rail sits above this) with
    # the main column's first section, so both columns start their content at
    # the same Y. Sterling already places both columns' first heading at the
    # same cursor position right after the masthead rule; compute the actual
    # delta rather than assuming it (and rather than hardcoding a fixed
    # clearance for the rebuilt contact rail — see the rail's own header
    # comment for why a flat offset is unnecessary: even the maximum contact
    # channel count fits well within this gap).
    main_first_heading_tops = [
        float(el["top"]) for el in elements
        if el.get("page", 1) == 1 and el.get("category") == "text" and el.get("flowRole") == "section-chrome"
    ]
    sidebar_first_heading_tops = [
        float(el["top"]) for el in elements
        if el.get("page", 1) == 1 and el.get("category") == "text" and el.get("flowRole") == "sidebar-chrome"
    ]
    # How far every page-1 main-column element must shift (up or down) to
    # close the gap described above. Zero when there is no main-column heading
    # to re-anchor (e.g. every section transferred to the sidebar).
    main_shift = desired_first_main_top - min(main_first_heading_tops) if main_first_heading_tops else 0.0
    sidebar_offset = (
        (min(main_first_heading_tops) + main_shift) - min(sidebar_first_heading_tops)
        if main_first_heading_tops and sidebar_first_heading_tops
        else 0.0
    )

    transformed: list[dict] = []
    name_element: dict | None = None
    title_element: dict | None = None
    # Sterling authors each sidebar element's `top` sequentially, assuming its
    # ORIGINAL (wider, 152pt) column width. Narrowing that column to ~122pt
    # here makes body copy wrap onto more lines, so the recomputed `height`
    # below is taller than what Sterling planned for — but every element's
    # `top` is still the old, narrower-wrap position. Left uncorrected, a
    # taller-than-planned box overlaps the next section's heading below it
    # (only self-healing once the client's own reflow — "Układ CV" / a density
    # change — recomputes positions from real measured heights). This tracks,
    # per page, how far every subsequent sidebar element must shift down to
    # absorb the extra height already produced above it on that page.
    sidebar_shift_by_page: dict[int, float] = {}
    # Mirrors `sidebar_shift_by_page`, but for the main column: shrinking every
    # main-column textarea's line height to the uniform 12 px value below
    # changes its `height` by a different amount per box (depends on its own
    # line count), while every subsequent record's `top` is still Sterling's
    # ORIGINAL, now-stale cursor position. Left uncorrected, the *authored*
    # gap between two records becomes visibly uneven from record to record —
    # only self-healing once the client's own reflow ("Układ CV" / a density
    # change) repacks every gap from real measured heights. This tracks, per
    # page, how far every subsequent main-column element must shift to absorb
    # the height already reclaimed (or added) above it on that page.
    main_shift_by_page: dict[int, float] = {}
    # `grid-member` cells (the languages grid) share one row's `top` across
    # several sibling elements, unlike every other main-column element this
    # cascading shift was designed for (each its own row). Advancing
    # `main_shift_by_page` per CELL — instead of once per ROW, using the
    # row's tallest cell like `_place_languages_grid` itself does — gave each
    # cell in the same row a different cumulative shift as soon as their
    # recomputed heights differed even slightly, breaking the row apart
    # vertically. Tracks, per page, the in-progress row's original `top` and
    # the largest height delta seen among its cells so far; committed into
    # `main_shift_by_page` in one lump sum via `_commit_pending_grid_row`
    # once a different row (or non-grid content) is reached.
    grid_pending_row: dict[int, tuple[float, float]] = {}

    def _commit_pending_grid_row(page: int) -> None:
        pending = grid_pending_row.pop(page, None)
        if pending is not None:
            main_shift_by_page[page] = main_shift_by_page.get(page, 0.0) + pending[1]

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
            page = int(element.get("page", 1))
            carried_shift = sidebar_shift_by_page.get(page, 0.0)
            # `sidebar_offset` aligns the first sidebar section with the first
            # main-column section (computed above); `carried_shift` absorbs
            # any extra height already produced by earlier sidebar elements on
            # this page (see the accumulator's declaration above the loop).
            element["top"] = float(element.get("top", 0)) + sidebar_offset + carried_shift
            if flow_role == "sidebar-chrome" and category == "line":
                element["width"] = 16.0
                element["height"] = _RULE_HEIGHT
            # The narrower width invalidates Sterling's measured `height`
            # (wrapped at the original, wider column); recompute it so the
            # very first render already matches what "Dopasuj automatycznie"
            # / any later repack derives from live geometry. Without this, the
            # generator's own authored gap disagreed with the client's
            # corrected box height on first mount, then "snapped" once a
            # repack recomputed gaps from the true (now-matching) heights —
            # which read as spacing changing after using Układ CV. A fixed
            # 12 px line height (rather than each field's original Sterling
            # value) keeps this measurement and the rendered CSS in agreement.
            if category == "textarea" and "height" in element:
                original_height = float(element["height"])
                element["lineHeight"] = sidebar_body_line_height
                element["height"] = Builder.measure_block(
                    element.get("content", ""),
                    element["width"],
                    element.get("fontSize", 9.0),
                    sidebar_body_line_height,
                    element.get("fontFamily", "Montserrat"),
                    bold=bool(element.get("bold", False)),
                    bulletList=bool(element.get("bulletList", False)),
                )
                # Register with the accumulator so every later sidebar element
                # on this page inherits the extra (or reclaimed) space.
                sidebar_shift_by_page[page] = carried_shift + (element["height"] - original_height)

        # Main-column content gains a more generous measure after the rail
        # narrows. This improves reading rhythm without changing record groups.
        # `grid-member` cells (the languages grid) must NOT be reset to one
        # shared box — each column needs its own translated position, or every
        # cell in a row collapses onto the same rectangle.
        if flow_role == "grid-member" and category == "textarea" and flow_lane != "sidebar":
            page = int(element.get("page", 1))
            original_top = float(element.get("top", 0))
            pending = grid_pending_row.get(page)
            if pending is None or pending[0] != original_top:
                # A new row started (or this is the first grid-member cell):
                # commit the previous row's max delta before starting a fresh one.
                _commit_pending_grid_row(page)
                grid_pending_row[page] = (original_top, 0.0)
            if float(element.get("left", 0)) >= old_sidebar_width:
                original_left = float(element["left"])
                element["left"] = main_left + (original_left - _STERLING_MAIN_L) * main_scale
                if "width" in element:
                    element["width"] = float(element["width"]) * main_scale
            # `main_shift` (page 1 only) closes the gap Sterling left for its
            # own dropped contact row — see that computation's comment.
            # `main_shift_by_page` (committed one row at a time, above) absorbs
            # any height already reclaimed by earlier main-column elements on
            # this page — see the accumulator's declaration above the loop.
            element["top"] = original_top + main_shift_by_page.get(page, 0.0)
            if page == 1:
                element["top"] += main_shift
            # Uniform 12 px line height, recomputed at the (possibly rescaled)
            # width so the first render already matches the corrected height —
            # same reasoning as the sidebar recompute above.
            if "height" in element:
                original_height = float(element["height"])
                element["lineHeight"] = main_body_line_height
                element["height"] = Builder.measure_block(
                    element.get("content", ""),
                    element["width"],
                    element.get("fontSize", 9.0),
                    main_body_line_height,
                    element.get("fontFamily", "Montserrat"),
                    bold=bool(element.get("bold", False)),
                    bulletList=bool(element.get("bulletList", False)),
                )
                delta = element["height"] - original_height
                _, current_max = grid_pending_row[page]
                grid_pending_row[page] = (original_top, max(current_max, delta))
        elif flow_role == "section-chrome" or (
            category == "textarea" and flow_lane != "sidebar" and flow_role not in {"masthead", "masthead-anchor"}
        ):
            page = int(element.get("page", 1))
            _commit_pending_grid_row(page)
            if float(element.get("left", 0)) >= old_sidebar_width:
                element["left"] = main_left
                if "width" in element:
                    element["width"] = main_width
            main_carried_shift = main_shift_by_page.get(page, 0.0)
            element["top"] = float(element.get("top", 0)) + main_carried_shift
            if page == 1:
                element["top"] += main_shift
            if category == "textarea" and "height" in element:
                original_height = float(element["height"])
                element["lineHeight"] = main_body_line_height
                element["height"] = Builder.measure_block(
                    element.get("content", ""),
                    element["width"],
                    element.get("fontSize", 9.0),
                    main_body_line_height,
                    element.get("fontFamily", "Montserrat"),
                    bold=bool(element.get("bold", False)),
                    bulletList=bool(element.get("bulletList", False)),
                )
                main_shift_by_page[page] = main_carried_shift + (element["height"] - original_height)

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
            # Sterling's own `height` was measured at ITS font size/line
            # height (30/34 for the name, 11.5/15 for the title); recompute it
            # for Vestige's own, larger values immediately, same reasoning as
            # every other recomputed height above. Left stale, this box could
            # author a height shorter than its own single-line `lineHeight`
            # (34pt box, 38pt line height) — and, more importantly, understate
            # the masthead's real height to the client's structural packer
            # (`resolveFlowStart` in sectionStructure.js), which uses this
            # `height` to decide whether the divider→heading gap it observes
            # looks "authored" or "corrupted" and silently recomputes main
            # column positions when it thinks the latter.
            if "height" in element:
                element["height"] = Builder.measure_block(
                    element.get("content", ""),
                    element["width"],
                    element["fontSize"],
                    element["lineHeight"],
                    element.get("fontFamily", "Montserrat"),
                    bold=bool(element.get("bold", False)),
                )
        elif flow_role == "masthead" and category == "line":
            element["left"] = main_left
            element["width"] = main_width
            element["backgroundColor"] = "#D7D7D4"
            # Derived from the real name/title bottom (computed above the main
            # loop) instead of a fixed constant unrelated to Sterling's own,
            # content-dependent heading cursor — see `divider_top`'s comment.
            element["top"] = divider_top

        transformed.append(element)

    # ── Rebuild the contact rail directly from `cv` (see module docstring) ──
    # The heading is fixed masthead chrome rather than a contact-band member:
    # channel add/remove operations may reflow the rows, but the section label
    # and its short editorial rule must remain present and stationary.
    contact_heading = _text(
        "DANE KONTAKTOWE",
        8.4,
        "Montserrat",
        "#262625",
        sidebar_left,
        _CONTACT_HEADING_TOP,
        zIndex=3,
        page=1,
        bold=True,
    )
    contact_heading.update({"letterSpacing": 1.3, "flowRole": "masthead"})
    contact_rule = _line(
        sidebar_left,
        _CONTACT_HEADING_TOP + 13.5,
        16.0,
        _RULE_HEIGHT,
        "#3E3E3C",
        zIndex=2,
        page=1,
    )
    contact_rule["flowRole"] = "masthead"
    transformed.extend([contact_heading, contact_rule])

    contact_items = _contact_channel_items(cv)
    contact_els, _contact_bottom, contact_descriptor = _place_stacked_icon_contacts(
        theme="vestige",
        items=contact_items,
        start_x=sidebar_left,
        start_y=_CONTACT_START_TOP,
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
    # `band_top` only sets the descriptor's `blockPt` magnitude
    # (`band_top - title_top`) — the frontend's `hideTitle`/`showTitle`
    # (`mastheadIdentityOps.js`) always use the title's own `top` as the
    # shift BOUNDARY, regardless of `band_top`. For a single-column masthead
    # that boundary cleanly separates "beside/above the title" from "content
    # that follows it", so shifting everything at/below it is correct.
    # Vestige's masthead is split across two parallel columns: the contact
    # rail's rows straddle the title's Y (some above, e.g. phone/email at
    # 46/62, some below, e.g. a 4th+ channel at 94+), and the sidebar's own
    # sections sit well below it too. A nonzero `blockPt` would shift only
    # the rows below the title's Y — splitting the contact cluster apart and
    # dragging the whole sidebar up — which is exactly the layout breakage
    # (contacts misaligning) seen when toggling title visibility. Passing
    # `band_top` equal to the title's own top makes `blockPt` exactly 0, so
    # hiding/showing the title only toggles its presence — nothing else
    # (contacts, sidebar, or main column) is shifted.
    if name_element is not None:
        band_top = float(title_element["top"]) if title_element is not None else 0.0
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

    # ── Empty-state masthead photo slot ──
    # Outline + light fill so the empty slot reads as a drop target and the
    # whole box stays clickable; gallery upload covers it via cover-fit
    # (`applyProfilePhoto`, `frontend/src/utils/profilePhoto.js`). The client
    # recognizes the frame/glyph generically via the `photoSlot` field, not by
    # template-specific ids — see that module's `isProfilePhotoFrame` /
    # `isPortraitGlyph`. Mirrors Nova's three-element pattern (well, frame,
    # glyph) exactly; only the position, ink colour, and icon theme differ.
    photo_well = {
        **_rect(
            _PHOTO_LEFT, _PHOTO_TOP, _PHOTO_W, _PHOTO_H,
            "#F4F4F2", 0, filled=True, zIndex=2,
        ),
        "id": "vestige-photo-well",
        "photoSlot": "ornament",
        "flowRole": "masthead",
    }
    photo_frame = {
        **_rect(
            _PHOTO_LEFT, _PHOTO_TOP, _PHOTO_W, _PHOTO_H,
            "#D7D7D4", 1.0, zIndex=3,
        ),
        "id": "vestige-photo-frame",
        "photoSlot": "frame",
        "photoShape": "rect",
        "flowRole": "masthead",
    }
    photo_glyph = {
        **_icon(
            "vestige", "portrait",
            _PHOTO_LEFT + (_PHOTO_W - 24.0) / 2.0, _PHOTO_TOP + (_PHOTO_H - 24.0) / 2.0,
            24.0, zIndex=4,
        ),
        "id": "vestige-photo-glyph",
        "photoSlot": "glyph",
        "alignWithText": False,
        "flowRole": "masthead",
    }
    transformed.extend([photo_well, photo_frame, photo_glyph])

    return transformed
