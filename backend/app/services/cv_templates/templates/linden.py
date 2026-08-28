"""Linden CV template generator.

Linden translates the supplied botanical editorial reference into a restrained
application-native resume: warm ivory paper, a forest-green identity system,
a sand title band, a rectangular portrait, and a narrow information rail.
The visual treatment is original, while the underlying element graph reuses
Sterling's proven deterministic column planner so section transfer, record
grouping, density controls, and multi-page continuation remain reliable.

The profile photo and contact rail deliberately publish explicit client
contracts. Hiding the photo moves the ``DANE KONTAKTOWE`` label and contact
stack to the top of the rail, while the first sidebar section is measured from
the final contact row instead of a hard-coded offset. Restoring the photo is
lossless because the editor stores every authored coordinate before reflow.
"""
from __future__ import annotations

from copy import deepcopy

from app.services.cv_generator_primitives import Builder, _line, _rect, _text
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _measured_text_width,
    _place_stacked_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.text import _compact_text
from app.services.cv_templates.templates.sterling import (
    SIDEBAR_SECTION_RULE_HEIGHT,
    _gen_sterling,
)


PAPER = "#FBFAF6"
INK = "#252823"
FOREST = "#285548"
FOREST_DEEP = "#1E4037"
MUTED = "#70766F"
RAIL = "#F2EFE6"
SAND = "#E5DDCB"
RULE = "#D3CCBC"
DISPLAY = "CormorantGaramond"
SANS = "Montserrat"

SIDEBAR_LEFT = 34.0
SIDEBAR_WIDTH = 152.0
MAIN_LEFT = 245.0
MAIN_WIDTH = 300.0
PHOTO_LEFT = 41.0
PHOTO_TOP = 31.0
PHOTO_WIDTH = 126.0
PHOTO_HEIGHT = 144.0
CONTACT_LABEL_TOP = 190.0
CONTACT_START_TOP = 216.0
CONTACT_LINE_STEP = 15.0
CONTACT_SECTION_GAP = 32.0
NAME_MAX_FONT_SIZE = 29.0
NAME_MIN_FONT_SIZE = 22.0
NAME_MAX_LETTER_SPACING = 2.6
NAME_SAFE_WIDTH = MAIN_WIDTH - 14.0

_COLOR_MAP = {
    "#F7F8FA": PAPER,
    "#26313F": INK,
    "#4A6FA5": FOREST,
    "#33517A": FOREST_DEEP,
    "#6B7684": MUTED,
    "#EDF1F6": RAIL,
    "#C7CFDA": RULE,
}


def _contact_section_start(cv: dict) -> float:
    """Return the first safe sidebar-section Y for the current contact count."""
    rows = max(1, len(_contact_channel_items(cv)))
    last_row_top = CONTACT_START_TOP + (rows - 1) * CONTACT_LINE_STEP
    return last_row_top + 11.0 + CONTACT_SECTION_GAP


def _fixed(element: dict, *, repeat: bool = True) -> dict:
    """Mark decorative page furniture as non-flowing canvas chrome."""
    result = {**element, "fixedToPage": True}
    if not repeat:
        result["repeatOnContinuation"] = False
    return result


def _fit_name_typography(name: str) -> tuple[float, float, float]:
    """Fit Linden's uppercase identity line inside the main column.

    The canvas applies uppercase with CSS while the stored content remains in
    its authored case. Uppercase glyphs and the editorial tracking are wider
    than the mixed-case string measured by a normal textarea, so the surname
    could wrap into a clipped second line on the first render. Measure the
    actual uppercase display form and scale the font plus tracking together,
    retaining a small browser/PDF metrics safety margin and a premium minimum
    display size.

    Returns ``(font_size, line_height, letter_spacing)`` in points.
    """
    display_name = name.upper()
    measured_glyphs = _measured_text_width(display_name, DISPLAY, NAME_MAX_FONT_SIZE)
    if measured_glyphs is None:
        measured_glyphs = len(display_name) * NAME_MAX_FONT_SIZE * 0.58
    measured_width = measured_glyphs + max(0, len(display_name) - 1) * NAME_MAX_LETTER_SPACING
    scale = min(1.0, NAME_SAFE_WIDTH / max(NAME_SAFE_WIDTH, measured_width))
    font_size = max(NAME_MIN_FONT_SIZE, round(NAME_MAX_FONT_SIZE * scale, 2))
    letter_spacing = round(NAME_MAX_LETTER_SPACING * (font_size / NAME_MAX_FONT_SIZE), 2)
    line_height = round(font_size * 1.086, 2)
    return font_size, line_height, letter_spacing


def _gen_linden(cv: dict) -> list[dict]:
    """Build the Linden editorial sidebar layout from normalized CV data."""
    sidebar_start = _contact_section_start(cv)
    source = deepcopy(
        _gen_sterling(
            cv,
            anchored_main_sections=frozenset({"summary", "experience"}),
            page1_sidebar_start=sidebar_start,
            sidebar_section_rule_height=SIDEBAR_SECTION_RULE_HEIGHT,
        )
    )

    # The derived layout keeps Sterling's semantic lanes and record groups but
    # owns all page-one masthead geometry. Remove the source letterhead and its
    # centered contact band before applying Linden's independent identity rail.
    body: list[dict] = []
    for element in source:
        if element.get("flowRole") in {"masthead", "masthead-anchor"}:
            continue
        if (
            element.get("fixedToPage")
            and int(element.get("page", 1)) == 1
            and element.get("category") == "line"
            and float(element.get("left", 0)) == 0
            and float(element.get("top", 0)) == 0
            and float(element.get("width", 0)) == 595
            and 0 < float(element.get("height", 0)) < 842
        ):
            # Sterling's full-width letterhead cover is replaced by Linden's
            # smaller sand band. Paper and rail backgrounds remain intact.
            continue

        for field in ("color", "backgroundColor"):
            if element.get(field) in _COLOR_MAP:
                element[field] = _COLOR_MAP[element[field]]

        if element.get("flowRole") in {"section-chrome", "sidebar-chrome"}:
            if element.get("category") == "text":
                element["fontFamily"] = DISPLAY
                element["fontSize"] = 10.2 if element.get("flowRole") == "section-chrome" else 9.4
                element["bold"] = False
                element["letterSpacing"] = 1.55
                element["color"] = FOREST_DEEP
            elif element.get("category") == "line":
                element["backgroundColor"] = FOREST if float(element.get("width", 0)) < 80 else RULE
                if element.get("flowRole") == "sidebar-chrome":
                    # Keep Linden's inherited section ticks aligned with its
                    # one-point contact rule. Reasserting the derived-template
                    # contract here prevents future Sterling styling changes
                    # from silently reintroducing mixed rail weights.
                    element["height"] = SIDEBAR_SECTION_RULE_HEIGHT

        if element.get("fontFamily") == "Montserrat":
            element["fontFamily"] = SANS
        body.append(element)

    # Move only page-one main-flow content to its editorial start. Sidebar
    # content was already planned against ``sidebar_start`` above; continuation
    # pages retain Sterling's safe PAGE_TOP placement.
    first_main_top = min(
        (
            float(element["top"])
            for element in body
            if int(element.get("page", 1)) == 1
            and element.get("flowRole") == "section-chrome"
            and element.get("category") == "text"
        ),
        default=190.0,
    )

    name_content = _compact_text(cv.get("name"), 54)
    title_content = _compact_text(cv.get("title"), 84)
    name_top = 39.0
    name_font_size, name_line_height, name_letter_spacing = _fit_name_typography(name_content)
    name_height = Builder.measure_block(
        name_content.upper(), MAIN_WIDTH, name_font_size, name_line_height, DISPLAY
    )
    band_top = max(92.0, name_top + name_height + 6.0)
    title_top = band_top + 12.0
    title_height = Builder.measure_block(title_content, MAIN_WIDTH, 9.2, 12.5, SANS)
    title_box_height = title_height if title_content else 13.0
    desired_main_top = max(190.0, title_top + title_height + 40.0)
    main_shift = desired_main_top - first_main_top

    transformed: list[dict] = []
    for element in body:
        if (
            int(element.get("page", 1)) == 1
            and not element.get("fixedToPage")
            and element.get("flowLane") != "sidebar"
            and element.get("flowRole") != "sidebar-chrome"
            and float(element.get("left", 0)) >= 210.0
        ):
            element["top"] = float(element.get("top", 0)) + main_shift
        transformed.append(element)

    masthead: list[dict] = []
    name_element: dict | None = None
    title_element: dict | None = None
    title_band = {
        **_rect(210.0, band_top, 385.0, 38.0, SAND, filled=True, zIndex=2, page=1),
        "flowRole": "masthead",
        "titleDecoration": "identity-band",
    }
    if title_content:
        masthead.append(title_band)
    if name_content:
        name_element = {
            "category": "textarea",
            "content": name_content,
            "left": MAIN_LEFT,
            "top": name_top,
            "width": MAIN_WIDTH,
            "height": name_height,
            "fontSize": name_font_size,
            "lineHeight": name_line_height,
            "letterSpacing": name_letter_spacing,
            "color": FOREST_DEEP,
            "fontFamily": DISPLAY,
            "zIndex": 5,
            "page": 1,
            "bold": False,
            "italic": False,
            "align": "left",
            "bulletList": False,
            "autoHeight": True,
            "preserveInitialLayout": True,
            "flowRole": "masthead",
        }
        masthead.append(name_element)
    title_prototype = {
        "category": "textarea",
        "content": title_content,
        "left": MAIN_LEFT,
        "top": title_top,
        "width": MAIN_WIDTH,
        "height": title_box_height,
        "fontSize": 9.2,
        "lineHeight": 12.5,
        "letterSpacing": 1.25,
        "color": FOREST_DEEP,
        "fontFamily": SANS,
        "zIndex": 5,
        "page": 1,
        "bold": False,
        "italic": True,
        "align": "left",
        "bulletList": False,
        "autoHeight": True,
        "preserveInitialLayout": True,
        "flowRole": "masthead",
    }
    if title_content:
        title_element = title_prototype
        masthead.append(title_element)
    if name_element is not None:
        # A zero reclaim keeps the parallel contact rail and body stationary
        # when the title is hidden; only the title itself is toggled.
        identity_anchor = tag_masthead_identity(
            name_element,
            title_element,
            title_prototype=title_prototype,
            band_id="linden-masthead",
            name_default_uppercase=True,
            title_default_uppercase=False,
            band_top=title_top,
            title_reclaim_pt=0.0,
            contact_band_id=None,
            title_decorations=[title_band],
        )
        # The editorial header intentionally keeps a generous clear zone below
        # the sand identity band. The browser's structural packer consumes this
        # contract after section reorder/density changes instead of treating
        # the authored gap as corruption and collapsing it.
        identity_anchor["mainFlowStart"] = desired_main_top
        masthead.append(identity_anchor)

    contact_items = _contact_channel_items(cv)
    contacts, _contact_bottom, contact_descriptor = _place_stacked_icon_contacts(
        theme="linden",
        items=contact_items,
        start_x=SIDEBAR_LEFT,
        start_y=CONTACT_START_TOP,
        text_fs=7.5,
        icon_size=9.5,
        text_color=MUTED,
        font=SANS,
        icon_gap=14.0,
        line_step=CONTACT_LINE_STEP,
        band_id="linden-contact",
    )
    contact_descriptor["sidebarSectionGap"] = CONTACT_SECTION_GAP
    contact_descriptor["photoHidden"] = {
        "mode": "stacked",
        "anchor": {"startX": SIDEBAR_LEFT, "startY": 64.0},
    }
    masthead.extend(contacts)
    masthead.append(build_contact_band_anchor(contact_descriptor))

    contact_label = _text(
        "DANE KONTAKTOWE", 9.5, DISPLAY, FOREST_DEEP,
        SIDEBAR_LEFT, CONTACT_LABEL_TOP, zIndex=5, page=1,
    )
    contact_label.update({
        "letterSpacing": 1.55,
        "flowRole": "masthead",
        "profilePhotoHiddenTop": 38.0,
    })
    contact_rule = _line(
        SIDEBAR_LEFT,
        CONTACT_LABEL_TOP + 14.0,
        56.0,
        SIDEBAR_SECTION_RULE_HEIGHT,
        FOREST,
        zIndex=4,
        page=1,
    )
    contact_rule.update({"flowRole": "masthead", "profilePhotoHiddenTop": 52.0})
    masthead.extend([contact_label, contact_rule])

    photo_well = {
        **_rect(PHOTO_LEFT, PHOTO_TOP, PHOTO_WIDTH, PHOTO_HEIGHT, "#F8F5ED", filled=True, zIndex=3),
        "id": "linden-photo-well",
        "photoSlot": "ornament",
        "flowRole": "masthead",
    }
    photo_frame = {
        **_rect(PHOTO_LEFT, PHOTO_TOP, PHOTO_WIDTH, PHOTO_HEIGHT, FOREST, borderWidth=1.2, zIndex=4),
        "id": "linden-photo-frame",
        "photoSlot": "frame",
        "photoShape": "rect",
        "flowRole": "masthead",
    }
    photo_glyph = {
        **_icon(
            "linden", "portrait",
            PHOTO_LEFT + (PHOTO_WIDTH - 30.0) / 2.0,
            PHOTO_TOP + (PHOTO_HEIGHT - 30.0) / 2.0,
            30.0,
            zIndex=5,
        ),
        "id": "linden-photo-glyph",
        "photoSlot": "glyph",
        "alignWithText": False,
        "flowRole": "masthead",
    }
    masthead.extend([photo_well, photo_frame, photo_glyph])

    pages = max((int(element.get("page", 1)) for element in transformed), default=1)
    # The sand title band already separates identity from body. A second rule
    # above the first section duplicated that boundary and crossed the visual
    # rhythm when body sections were reordered.
    furniture: list[dict] = []
    for page in range(1, pages + 1):
        furniture.extend([
            _fixed(
                _line(
                    SIDEBAR_LEFT,
                    806.0,
                    SIDEBAR_WIDTH,
                    SIDEBAR_SECTION_RULE_HEIGHT,
                    RULE,
                    zIndex=2,
                    page=page,
                )
            ),
            _fixed(_rect(34.0, 798.0, 7.0, 7.0, FOREST, filled=True, zIndex=3, page=page)),
        ])

    return transformed + furniture + masthead
