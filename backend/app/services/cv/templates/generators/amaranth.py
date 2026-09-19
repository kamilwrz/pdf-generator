"""Amaranth CV template generator.

Amaranth is a warm, single-column executive résumé built around a deep
bordeaux/claret palette, an elegant Playfair Display masthead, a Roboto body,
and one recurring decorative motif: the rounded rectangle. That motif appears
as a rounded-cornered photo slot in the top-right of the masthead, a rounded
claret chip behind every section label, and a softly tinted rounded field
behind the summary. Nothing else in the application chrome adopts these shapes;
they belong to the authored document only.

Structurally Amaranth is a close sibling of Vellum and Meridian and reuses
their proven layout machinery rather than re-implementing it:

* Experience and education records reuse Meridian's exact-anchor date rail
  (``_meridian_place_experience`` and Vellum's degree-first education variant).
  Period and city are non-flowing overlays pinned to the *exact* top of a real
  content line, so live reflow, record reordering, spacing changes, and
  pagination cannot leave a date stranded at a stale coordinate. See
  ``generators/meridian.py`` for the full rationale behind that contract.
* The masthead reuses the shared contact band, masthead-identity, and wrapped
  name-fit helpers, so name-case toggling, add/hide title, hide/show photo, and
  contact add/delete all behave exactly as they do in the other single-column
  templates.
* The summary field reuses the generic ``section-background`` overlay contract
  (``flowRole: "section-background"``): the rounded tint shares the summary's
  keep-together group and is re-pinned and re-sized to follow the summary
  textarea as it grows or shrinks during editing.

Appearance palettes and text-size presets are intentionally not wired up in this
first version. The Appearance panel is released template by template
(``SectionsPanel`` opts each id in individually), so Amaranth ships with a
single authored claret palette and simply does not expose that tab yet. The
page-chrome anchor still records ``appearanceTemplateId``/``appearanceSettings``
so a future Appearance module can recognise existing Amaranth documents without
a data migration.
"""
from __future__ import annotations

from app.services.cv.layout.primitives import (
    Builder,
    _block,
    _line,
    _rect,
    _text,
    _text_width,
    get_spacing,
)
from app.services.cv.templates.shared.contact import (
    _contact_channel_items,
    _place_bounded_stack_icon_contacts,
    _reserved_contact_last_row_top,
    build_contact_band_anchor,
)
from app.services.cv.templates.shared.extras import _extra_sections
from app.services.cv.templates.shared.icons import _icon
from app.services.cv.templates.shared.masthead import (
    fit_wrapped_name_element,
    tag_masthead_identity,
)
from app.services.cv.templates.shared.text import (
    _compact_text,
    _labels,
    _place_skills_section,
)
from app.services.cv.templates.generators.meridian import (
    _meridian_experience_height,
    _meridian_place_experience,
)
from app.services.cv.templates.generators.vellum import (
    _vellum_education_height,
    _vellum_place_education,
)

# Page column geometry. The left edge and content width match Vellum so the
# reused record/rail helpers keep the same measured line breaks.
_LEFT = 58.0
_WIDTH = 479.0
# The name/title/contact stack is constrained to the left column so a long name
# wraps within it and never crosses under the top-right photo slot.
_HEADER_WIDTH = 344.0

# Rounded-rectangle photo slot in the top-right of the masthead. The outer
# ornament is a slightly larger rounded claret plate that stays visible as a
# print-like border after a user photo fills the inner frame.
_PHOTO_W = 104.0
_PHOTO_H = 122.0
_PHOTO_LEFT = _LEFT + _WIDTH - _PHOTO_W  # right edge aligns with the content column
_PHOTO_TOP = 38.0
_PHOTO_FRAME_RADIUS = 14.0
_PHOTO_ORNAMENT_INSET = 4.0
_PHOTO_ORNAMENT_RADIUS = 18.0

# Rounded section-label chip. Height, padding, and radius are shared by every
# section heading so the motif reads as one deliberate pattern.
_CHIP_H = 17.0
_CHIP_PAD_X = 11.0
_CHIP_RADIUS = 6.0
_CHIP_LABEL_FS = 7.6
_CHIP_LABEL_TRACKING = 2.0
# Baseline offset (from the chip top) that vertically centres the uppercase
# label. The canvas and PDF both treat a point-text element's `top` as its
# glyph baseline, so centring means placing the baseline half a cap height below
# the chip's vertical centre. Roboto's cap height is ~0.71 em; uppercase labels
# have no descenders, so the visible cap band is centred by this offset.
_CHIP_CAP_RATIO = 0.71
_CHIP_LABEL_BASELINE = round(_CHIP_H / 2 + _CHIP_CAP_RATIO * _CHIP_LABEL_FS / 2, 2)

# Masthead divider hairline and its short rounded claret accent bar. The accent
# is vertically centred on the hairline (the rule runs through its middle in
# both the canvas and the PDF) and confined to the left of the portrait, so a
# contact-driven reflow that raises the divider cannot draw it under the photo.
# Both elements are pinned to the reflowed divider through the flow descriptor's
# `accentBarId` / `accentBarDeltaTop`, so they never separate when contacts change.
_DIVIDER_H = 0.8
_ACCENT_W = 40.0
_ACCENT_H = 3.2
_ACCENT_DELTA_TOP = round((_DIVIDER_H - _ACCENT_H) / 2.0, 2)  # -1.2: centre on the rule

# Summary rounded field padding (points). The reflow contract keeps the top
# inset constant and grows the bottom with the summary text, so both paddings
# stay symmetric as the user edits.
_SUMMARY_PAD_TOP = 6.0
_SUMMARY_PAD_BOTTOM = 9.0
_SUMMARY_PAD_X = 12.0
_SUMMARY_RADIUS = 12.0


def _chip_width(label: str) -> float:
    """Rounded chip width that fully contains the tracked, uppercased label.

    ``_text_width`` measures glyph advance only, so the per-gap letter spacing
    is added explicitly; otherwise a widely tracked label would overflow the
    chip on the right. A short minimum keeps single-word chips from looking
    pinched.
    """
    rendered = label.upper()
    glyphs = _text_width(rendered, "Roboto", _CHIP_LABEL_FS)
    tracking = _CHIP_LABEL_TRACKING * max(len(rendered) - 1, 0)
    return max(glyphs + tracking + 2 * _CHIP_PAD_X, 54.0)


def _gen_amaranth(cv: dict) -> list[dict]:
    """Build a bordeaux/claret, single-column executive CV from normalized data.

    The whole document is one ATS-friendly reading column: masthead, summary,
    skills, experience, education, then any custom sections. Dates and locations
    ride a fixed right-hand rail; section labels sit in rounded claret chips.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#2C1A22",       # warm near-black for the name and record titles
        "accent": "#78304A",    # claret: chips, title, accent bar, page numbers
        "ornament": "#9A5568",  # softer claret for the photo ornament plate
        "body": "#3A2E33",
        "muted": "#7E6870",
        "field": "#F5EDEF",     # blush tint behind the summary and inside chips
        "photo_bg": "#EFE4E8",  # empty photo-slot fill
        "rule": "#E4D8DC",
        "chip_text": "#FFFFFF",
        "display": "PlayfairDisplay",
        "sans": "Roboto",
        # Reuse the pre-tinted Vellum burgundy glyph set: it carries both the
        # six contact icons and the portrait placeholder, and its ink is the
        # closest available match to this palette's claret accent.
        "icon_theme": "vellum-burgundy",
    }
    L, W = _LEFT, _WIDTH
    display, sans = C["display"], C["sans"]
    labels = _labels(cv)

    header: list[dict] = []
    cursor_y = 44.0
    name = str(cv.get("name") or "").strip()
    title = _compact_text(cv.get("title"), 72)
    name_index: int | None = None
    title_index: int | None = None

    # --- Name: Playfair Display, title-case, wrapped inside the left column ---
    if name:
        name_index = len(header)
        name_element = _block(
            name, L, cursor_y, _HEADER_WIDTH, 34.0, 27.0, 33.0,
            C["ink"], display, zIndex=3, bold=True,
        )
        name_element["letterSpacing"] = 0.4
        # Reserve wrap height for the real casing/tracking before placing the
        # title and contacts, so a two-line name pushes them down correctly.
        fit_wrapped_name_element(name_element, uppercase=False)
        header.append(name_element)
        cursor_y += name_element["height"] + 5.0

    # --- Title: Roboto, tracked uppercase, claret ---
    title_top = cursor_y
    title_height = (
        Builder.measure_block(title, _HEADER_WIDTH, 8.2, 11.5, sans)
        if title else 11.5
    )
    title_prototype = _block(
        title, L, title_top, _HEADER_WIDTH, title_height, 8.2, 11.5,
        C["accent"], sans, zIndex=3,
    )
    title_prototype["letterSpacing"] = 2.4
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_height

    # --- Contacts: bounded multiline icon stack inside the left column ---
    contact_elements, contact_bottom, contact_descriptor = _place_bounded_stack_icon_contacts(
        theme=C["icon_theme"],
        items=_contact_channel_items(cv),
        start_x=L,
        start_y=cursor_y + 11.0,
        max_width=_HEADER_WIDTH,
        text_fs=7.0,
        line_height=10.4,
        icon_size=11.0,
        text_color=C["muted"],
        font=sans,
        icon_gap=14.0,
        line_step=13.0,
        band_id="amaranth-contact",
    )
    header.extend(contact_elements)
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    # The divider clears both the contact stack and the photo slot, so the body
    # never starts beside the portrait regardless of how few contacts exist.
    divider_y = max(contact_zone_bottom + 22.0, _PHOTO_TOP + _PHOTO_H + 18.0)
    contact_descriptor["flow"] = {
        "dividerId": "amaranth-masthead-divider", "dividerGap": 22.0,
        # The accent bar rides the divider: the contact-band reflow re-pins it to
        # the divider's new top plus this fixed offset, keeping the rule centred
        # through the bar after any contact edit.
        "accentBarId": "amaranth-masthead-accent", "accentBarDeltaTop": _ACCENT_DELTA_TOP,
        "bodyGap": 14.0, "minimumRows": 2,
        "minimumBodyTop": _PHOTO_TOP + _PHOTO_H + 18.0,
        "bodyTop": max(divider_y + 14.0, _PHOTO_TOP + _PHOTO_H + 32.0),
        "spacing": get_spacing().as_spacing_px(),
    }

    # Masthead divider: a thin hairline confined to the text column (its right
    # edge stops short of the portrait) with a short rounded claret accent bar
    # centred on it at the left end — the rounded motif carried into the header.
    divider_right = _PHOTO_LEFT - 16.0
    header.append(
        {**_line(L + 46.0, divider_y, divider_right - (L + 46.0), _DIVIDER_H,
                 C["rule"], zIndex=2, page=1),
         "id": "amaranth-masthead-divider"}
    )
    header.append(
        {**_rect(L, divider_y + _ACCENT_DELTA_TOP, _ACCENT_W, _ACCENT_H, C["accent"],
                 filled=True, borderRadius=_ACCENT_H / 2.0, zIndex=3, page=1),
         "id": "amaranth-masthead-accent"}
    )

    # --- Rounded-rectangle photo slot (top-right). Every member is tagged so
    # hide/show and raster replacement stay lossless, matching Vellum/Slate. ---
    photo_outer = {
        **_rect(
            _PHOTO_LEFT - _PHOTO_ORNAMENT_INSET, _PHOTO_TOP - _PHOTO_ORNAMENT_INSET,
            _PHOTO_W + 2 * _PHOTO_ORNAMENT_INSET, _PHOTO_H + 2 * _PHOTO_ORNAMENT_INSET,
            C["ornament"], filled=True, borderRadius=_PHOTO_ORNAMENT_RADIUS,
            zIndex=2, page=1,
        ),
        "photoSlot": "ornament",
        "appearanceColorRole": "ornament",
        "fixedToPage": True,
        "repeatOnContinuation": False,
    }
    # The empty-slot fill is a *separate* well, not the frame itself. The frame
    # below is an outline only. This matters for photo application: the shared
    # `applyProfilePhoto` layers a user image at `frame.zIndex - 1` (the "outline
    # frame lets its border show" contract used by Slate/Linden). A filled frame
    # at that z would paint an opaque plate on top of the image and hide it, so
    # the fill lives one layer under the applied photo instead.
    photo_well = {
        **_rect(
            _PHOTO_LEFT, _PHOTO_TOP, _PHOTO_W, _PHOTO_H, C["photo_bg"],
            filled=True, borderRadius=_PHOTO_FRAME_RADIUS, zIndex=3, page=1,
        ),
        "photoSlot": "ornament",
        "appearanceColorRole": "photo",
        "fixedToPage": True,
        "repeatOnContinuation": False,
    }
    portrait_size = 46.0
    photo_glyph = {
        **_icon(
            C["icon_theme"], "portrait",
            _PHOTO_LEFT + (_PHOTO_W - portrait_size) / 2,
            _PHOTO_TOP + (_PHOTO_H - portrait_size) / 2,
            portrait_size, zIndex=4,
        ),
        "id": "amaranth-photo-glyph",
        "photoSlot": "glyph",
        "photoShape": "rect",
        "alignWithText": False,
        "fixedToPage": True,
        "repeatOnContinuation": False,
    }
    photo_glyph["height"] = portrait_size
    # Outline-only anchor frame. Its stroke uses the well colour so it stays
    # invisible while empty (the claret ornament plate is the visible border),
    # but it still carries the rounded radius that the applied photo inherits and
    # the `photoSlot: "frame"` tag the gallery detects. Its zIndex sits above the
    # well and glyph so the user image (placed at zIndex - 1) covers the well.
    photo_frame = {
        **_rect(
            _PHOTO_LEFT, _PHOTO_TOP, _PHOTO_W, _PHOTO_H, C["photo_bg"],
            borderWidth=1.0, filled=False, borderRadius=_PHOTO_FRAME_RADIUS,
            zIndex=5, page=1,
        ),
        "id": "amaranth-photo-frame",
        "photoSlot": "frame",
        "photoShape": "rect",
        "fixedToPage": True,
        "repeatOnContinuation": False,
    }
    header.extend([photo_outer, photo_well, photo_glyph, photo_frame])

    header = [{**element, "flowRole": "masthead"} for element in header]
    body_start = contact_descriptor["flow"]["bodyTop"]
    header.append(build_contact_band_anchor(contact_descriptor))

    name_element = header[name_index] if name_index is not None else None
    title_element = header[title_index] if title_index is not None else None
    if name_element is not None:
        header.append(
            tag_masthead_identity(
                name_element,
                title_element,
                title_prototype=title_prototype,
                band_id="masthead-main",
                # Playfair reads best in title case; the tracked claret role line
                # keeps the uppercase treatment.
                name_default_uppercase=False,
                title_default_uppercase=True,
                band_top=title_top + title_height + 11.0,
                title_reclaim_pt=title_height if not title else None,
                contact_band_id="amaranth-contact",
            )
        )

    # Section chrome advance: rounded chip height plus the shared after-rule gap.
    section_chrome_h = _CHIP_H + get_spacing().after_rule
    b = Builder(body_start)

    def section(label: str) -> None:
        """Place a rounded claret chip with a tracked white section label."""
        y, page = b.y, b.pg
        chip_w = _chip_width(label)
        chip = _rect(
            L, y, chip_w, _CHIP_H, C["accent"],
            filled=True, borderRadius=_CHIP_RADIUS, zIndex=2, page=page,
        )
        chip["flowRole"] = "section-chrome"
        chip["appearanceColorRole"] = "accent"
        heading = _text(
            label, _CHIP_LABEL_FS, sans, C["chip_text"],
            L + _CHIP_PAD_X, y + _CHIP_LABEL_BASELINE,
            zIndex=3, page=page, bold=True,
        )
        heading["letterSpacing"] = _CHIP_LABEL_TRACKING
        heading["flowRole"] = "section-chrome"
        heading["appearanceColorRole"] = "headingOnAccent"
        b.els.extend([chip, heading])
        b.y = y + _CHIP_H + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    body_fs, body_lh = 8.5, 11.2

    # --- Summary: rounded blush field that tracks the summary textarea ---
    if cv.get("summary"):
        summary_height = b.measure_block(cv["summary"], W, body_fs, body_lh, sans)
        b.need_section(section_chrome_h, summary_height + _SUMMARY_PAD_BOTTOM)
        section(labels["summary"])
        with b.keep_together(summary_height):
            body_top, page = b.y, b.pg
            # The rounded field is a non-flowing mate of the summary textarea.
            # Sharing the keep-together group and the section-background role
            # lets the frontend re-pin and grow it with the text without ever
            # counting its height as a second content row. The top inset is
            # preserved on reflow while the bottom padding grows with the copy,
            # keeping both paddings symmetric during editing.
            summary_field = _rect(
                L - _SUMMARY_PAD_X, body_top - _SUMMARY_PAD_TOP,
                W + 2 * _SUMMARY_PAD_X,
                summary_height + _SUMMARY_PAD_TOP + _SUMMARY_PAD_BOTTOM,
                C["field"], filled=True, borderRadius=_SUMMARY_RADIUS,
                zIndex=1, page=page,
            )
            summary_field.update({
                "id": "amaranth-summary-field",
                "flowRole": "section-background",
                "appearanceColorRole": "field",
            })
            b.els.append(summary_field)
            b.block(cv["summary"], L, W, body_fs, body_lh, C["body"], sans)
        close_section()

    # --- Skills before career history: an immediate capability scan ---
    if _place_skills_section(
        b, cv, section, L, W, C["body"], sans, body_fs, body_lh,
        section_chrome_h=section_chrome_h,
    ):
        close_section()

    # --- Experience: title/company/bullets left, period/city on the rail ---
    def experience_height(job: dict) -> float:
        return _meridian_experience_height(
            b, job, W, sans, title_fs=10.0, title_lh=12.8,
            meta_fs=7.7, meta_lh=10.4, body_fs=body_fs, body_lh=body_lh,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _meridian_place_experience(
                b, job, L, W, ink=C["ink"], muted=C["muted"], body=C["body"],
                font=sans, title_fs=10.0, title_lh=12.8, meta_fs=7.7, meta_lh=10.4,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, "after_experience", section,
            {"body": C["body"], "accent": C["accent"]},
            L, W, sans, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
        )

    # --- Education: degree-first, reusing Vellum's rail placement ---
    if cv.get("education"):
        entries = cv["education"]
        first_height = _vellum_education_height(
            b, entries[0], W, sans, degree_fs=9.6, degree_lh=12.2,
            meta_fs=7.7, meta_lh=10.4, body_fs=body_fs, body_lh=body_lh,
        )
        b.need_section(section_chrome_h, first_height)
        section(labels["education"])
        for index, education in enumerate(entries):
            _vellum_place_education(
                b, education, L, W, ink=C["ink"], muted=C["muted"], body=C["body"],
                font=sans, degree_fs=9.6, degree_lh=12.2, meta_fs=7.7, meta_lh=10.4,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(entries) - 1 else None,
            )
        close_section()

    _extra_sections(
        b, cv, "after_skills", section,
        {"body": C["body"], "accent": C["accent"]},
        L, W, sans, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_background = {
            **_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page),
            "fixedToPage": True,
        }
        if page == 1:
            # Persist the authored appearance intent on stable page chrome so a
            # future Appearance module recognises existing Amaranth documents
            # without a migration. Amaranth keeps paper white by design.
            page_background["appearanceTemplateId"] = "amaranth"
            page_background["appearanceSettings"] = {
                "palette": "claret",
                "textSize": "M",
            }
        decorations.append(page_background)
        decorations.append({
            **_line(L, 796, W, 0.7, C["rule"], zIndex=1, page=page),
            "fixedToPage": True,
        })
        decorations.append({
            **_text(f"{page:02d}", 7.4, sans, C["accent"], 517.0, 806,
                    zIndex=2, page=page),
            "fixedToPage": True,
        })
    return decorations + header + flow
