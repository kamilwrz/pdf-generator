"""Vellum CV template generator.

Vellum adapts the reference resume's quiet editorial language to CV Studio's
editable canvas: an asymmetric identity masthead, a circular portrait that
balances the text block, a softly tinted summary field, widely tracked section
labels, and one ATS-friendly reading column. The restrained forest-and-copper
palette gives the document a distinct identity without reducing legibility.

Experience and education deliberately reuse Meridian/Cadenza's exact-anchor
date rail. Period and city labels are non-flowing overlays pinned to real
title/degree textarea tops, so spacing changes, record reorder, and browser
reflow cannot leave dates behind at stale coordinates. Continuation pages keep
only the footer rule and page number; the name and contact band remain a page-1
identity rather than being repeated as document content.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    _block,
    _circle,
    _line,
    _text,
    get_spacing,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
    _reserved_contact_last_row_top,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.records import _education_bullets, _education_school
from app.services.cv_templates.shared.text import (
    _compact_text,
    _labels,
    _place_skills_section,
)
from app.services.cv_templates.templates.meridian import (
    _meridian_experience_height,
    _meridian_place_experience,
    _meridian_place_rail_line,
)

_RECORD_RIGHT_W = 130.0
_RECORD_GAP = 12.0
_SECTION_RULE_TOP = 13.0


def _vellum_education_height(
    builder: Builder,
    education: dict,
    width: float,
    font: str,
    *,
    degree_fs: float,
    degree_lh: float,
    meta_fs: float,
    meta_lh: float,
    body_fs: float,
    body_lh: float,
) -> float:
    """Measure degree-first education copy while excluding the overlay rail."""
    content_width = width - _RECORD_RIGHT_W - _RECORD_GAP
    degree = str(education.get("degree") or "").strip()
    school = _education_school(education)
    bullets = _education_bullets(education)
    height = 0.0
    if degree:
        height += builder.measure_block(
            degree, content_width, degree_fs, degree_lh, font,
            bold=True, min_h=degree_lh,
        )
    if school:
        if height:
            height += get_spacing().stack
        height += builder.measure_block(
            school, content_width, meta_fs, meta_lh, font,
            italic=True, min_h=meta_lh,
        )
    if bullets:
        if height:
            height += get_spacing().stack
        height += builder.measure_block(
            bullets, width, body_fs, body_lh, font,
            bulletList=True, min_h=body_lh,
        )
    return height


def _vellum_place_education(
    builder: Builder,
    education: dict,
    left: float,
    width: float,
    *,
    ink: str,
    muted: str,
    body: str,
    font: str,
    degree_fs: float,
    degree_lh: float,
    meta_fs: float,
    meta_lh: float,
    body_fs: float,
    body_lh: float,
    after_gap: float | None = None,
) -> None:
    """Place degree/school left and period/city on matching right anchors."""
    content_width = width - _RECORD_RIGHT_W - _RECORD_GAP
    rail_x = left + content_width + _RECORD_GAP
    degree = str(education.get("degree") or "").strip()
    school = _education_school(education)
    period = str(education.get("period") or "").strip()
    city = str(education.get("city") or "").strip()
    bullets = _education_bullets(education)
    height = _vellum_education_height(
        builder, education, width, font,
        degree_fs=degree_fs, degree_lh=degree_lh,
        meta_fs=meta_fs, meta_lh=meta_lh,
        body_fs=body_fs, body_lh=body_lh,
    )

    with builder.keep_together(height):
        degree_top, page = builder.y, builder.pg
        second_line_top: float | None = None
        placed = False
        if degree:
            builder.block(
                degree, left, content_width, degree_fs, degree_lh, ink, font,
                bold=True, min_h=degree_lh,
            )
            placed = True
        if school:
            if placed:
                builder.gap(get_spacing().stack)
                second_line_top = builder.y
            builder.block(
                school, left, content_width, meta_fs, meta_lh, muted, font,
                italic=True, min_h=meta_lh,
            )
            placed = True
        if bullets:
            if placed:
                builder.gap(get_spacing().stack)
                if second_line_top is None:
                    second_line_top = builder.y
            builder.block(
                bullets, left, width, body_fs, body_lh, body, font,
                bulletList=True,
            )

        # Period shares the degree's true top, matching Meridian/Cadenza's
        # editor contract instead of relying on a visually guessed offset.
        _meridian_place_rail_line(
            builder, degree_top, page, period, meta_fs, meta_lh, muted, font,
            rail_x, _RECORD_RIGHT_W,
        )
        if second_line_top is not None:
            _meridian_place_rail_line(
                builder, second_line_top, page, city, meta_fs, meta_lh,
                muted, font, rail_x, _RECORD_RIGHT_W,
            )
    if after_gap is not None:
        builder.gap(after_gap)


def _gen_vellum(cv: dict) -> list[dict]:
    """Build the asymmetric, portrait-led Vellum editorial CV."""
    palette = {
        "paper": "#FFFEFA",
        "ink": "#20352F",
        "body": "#3E4944",
        "muted": "#6F7873",
        "band": "#E7ECE8",
        "rule": "#C8D1CC",
        "accent": "#A16049",
        "display": "CormorantGaramond",
        "body_font": "Lora",
        "sans": "Montserrat",
        "icon_theme": "cadenza",
        "left": 58.0,
        "width": 479.0,
    }
    left, width = palette["left"], palette["width"]
    display = palette["display"]
    body_font = palette["body_font"]
    sans = palette["sans"]
    labels = _labels(cv)

    # The text masthead occupies the left seven columns while the portrait
    # establishes an independent circular axis on the right. Contact wrapping
    # is constrained to the text column, so long labels never cross the photo.
    header_width = 348.0
    header_center_x = left + header_width / 2.0
    header: list[dict] = []
    cursor_y = 43.0
    name = _compact_text(cv.get("name"), 44)
    title = _compact_text(cv.get("title"), 72)
    name_index: int | None = None
    title_index: int | None = None

    if name:
        name_height = Builder.measure_block(
            name, header_width, 28.5, 32.0, display, bold=True,
        )
        name_index = len(header)
        name_element = _block(
            name, left, cursor_y, header_width, name_height, 28.5, 32.0,
            palette["ink"], display, zIndex=3, bold=True,
        )
        name_element["letterSpacing"] = 3.3
        header.append(name_element)
        cursor_y += name_height + 5.0

    title_top = cursor_y
    title_height = (
        Builder.measure_block(title, header_width, 8.0, 11.0, sans)
        if title else 11.0
    )
    title_prototype = _block(
        title, left, title_top, header_width, title_height, 8.0, 11.0,
        palette["accent"], sans, zIndex=3,
    )
    title_prototype["letterSpacing"] = 2.2
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_height

    contact_start_y = cursor_y + 11.0
    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=palette["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=header_center_x,
        start_y=contact_start_y,
        max_width=header_width,
        text_fs=6.9,
        icon_size=8.6,
        text_color=palette["muted"],
        font=sans,
        char_width=4.2,
        icon_gap=10.0,
        item_pad=12.0,
        line_step=12.5,
        band_id="vellum-contact",
    )
    header.extend(contact_elements)
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    divider_y = contact_zone_bottom + 24.0
    header.append(
        _line(left, divider_y, header_width, 0.8, palette["rule"], zIndex=2, page=1)
    )

    # The outer copper disc stays visible as a print-like halo after a user
    # photo fills the inner circular frame. Every member is semantically tagged
    # so hide/show and raster removal remain lossless in the editor.
    photo_outer = {
        **_circle(429.0, 32.0, 112.0, palette["accent"], filled=True, zIndex=2, page=1),
        "photoSlot": "ornament",
        "fixedToPage": True,
    }
    photo_frame = {
        **_circle(433.0, 36.0, 104.0, palette["band"], filled=True, zIndex=3, page=1),
        "id": "vellum-photo-frame",
        "photoSlot": "frame",
        "photoShape": "circle",
        "fixedToPage": True,
    }
    photo_glyph = {
        **_icon("monument", "portrait", 465.0, 68.0, 40.0, zIndex=4),
        "id": "vellum-photo-glyph",
        "photoSlot": "glyph",
        "photoShape": "circle",
        "alignWithText": False,
        "fixedToPage": True,
    }
    photo_glyph["height"] = 40.0
    header.extend([photo_outer, photo_frame, photo_glyph])

    header = [{**element, "flowRole": "masthead"} for element in header]
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
                name_default_uppercase=True,
                title_default_uppercase=True,
                band_top=title_top + title_height + 11.0,
                title_reclaim_pt=title_height if not title else None,
                contact_band_id="vellum-contact",
            )
        )

    section_label_fs = 7.4
    section_chrome_height = _SECTION_RULE_TOP + 1.2 + get_spacing().after_rule
    builder = Builder(divider_y + 12.0)

    def section(label: str, *, filled: bool = False) -> None:
        """Place a tracked label with either a tinted band or split hairline."""
        y, page = builder.y, builder.pg
        if filled:
            band = _line(0, y, 595, 20.0, palette["band"], zIndex=1, page=page)
            heading = _text(
                label, section_label_fs, sans, palette["ink"],
                left, y + 6.2, zIndex=3, page=page, bold=True,
            )
            heading["letterSpacing"] = 2.1
            for element in (band, heading):
                element["flowRole"] = "section-chrome"
            builder.els.extend([band, heading])
            builder.y = y + 20.0
            return

        heading = _text(
            label, section_label_fs, sans, palette["ink"],
            left, y, zIndex=3, page=page, bold=True,
        )
        heading["letterSpacing"] = 2.1
        accent_rule = _line(
            left, y + _SECTION_RULE_TOP, 24.0, 1.2,
            palette["accent"], zIndex=3, page=page,
        )
        long_rule = _line(
            left + 34.0, y + _SECTION_RULE_TOP + 0.2,
            width - 34.0, 0.8, palette["rule"], zIndex=2, page=page,
        )
        for element in (heading, accent_rule, long_rule):
            element["flowRole"] = "section-chrome"
        builder.els.extend([heading, accent_rule, long_rule])
        builder.y = y + _SECTION_RULE_TOP + 1.2 + get_spacing().after_rule

    def close_section() -> None:
        builder.gap(get_spacing().section)

    body_fs, body_lh = 8.35, 11.2
    if cv.get("summary"):
        summary_height = builder.measure_block(
            cv["summary"], width, body_fs, body_lh, body_font,
        )
        builder.need_section(20.0, summary_height)
        section(labels["summary"], filled=True)
        # The summary background is a non-flowing mate of the body textarea.
        # Giving both elements the same keep-together group and exact top lets
        # the structural packer translate the tint with its text without ever
        # counting the background height as a second content row.
        with builder.keep_together(summary_height):
            body_top, page = builder.y, builder.pg
            summary_background = _line(
                0, body_top, 595, summary_height + 8.0,
                palette["band"], zIndex=1, page=page,
            )
            # Unlike a date rail, this overlay must also paint the active
            # chrome-to-body gap introduced by the spacing controls. The
            # dedicated role lets both structural packing and live textarea
            # reflow extend the fill upward to the heading band while keeping
            # its lower padding attached to the summary copy.
            summary_background.update({
                "id": "vellum-summary-background",
                "flowRole": "section-background",
            })
            builder.els.append(summary_background)
            builder.block(
                cv["summary"], left, width, body_fs, body_lh,
                palette["body"], body_font,
            )
        close_section()

    # Skills precede career history, echoing the reference composition and
    # giving recruiters an immediate capability scan before the narrative.
    if _place_skills_section(
        builder, cv, section, left, width, palette["body"], body_font,
        body_fs, body_lh, section_chrome_h=section_chrome_height,
    ):
        close_section()

    def experience_height(job: dict) -> float:
        return _meridian_experience_height(
            builder, job, width, body_font,
            title_fs=9.7, title_lh=12.4,
            meta_fs=7.5, meta_lh=10.2,
            body_fs=body_fs, body_lh=body_lh,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        builder.need_section(section_chrome_height, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _meridian_place_experience(
                builder, job, left, width,
                ink=palette["ink"], muted=palette["muted"],
                body=palette["body"], font=body_font,
                title_fs=9.7, title_lh=12.4,
                meta_fs=7.5, meta_lh=10.2,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=(
                    get_spacing().record if index < len(jobs) - 1 else None
                ),
            )
        close_section()
        _extra_sections(
            builder, cv, "after_experience", section,
            {"body": palette["body"], "accent": palette["accent"]},
            left, width, body_font, fs=body_fs, lh=body_lh,
            section_chrome_h=section_chrome_height,
        )

    if cv.get("education"):
        entries = cv["education"]
        first_height = _vellum_education_height(
            builder, entries[0], width, body_font,
            degree_fs=9.3, degree_lh=12.0,
            meta_fs=7.5, meta_lh=10.2,
            body_fs=body_fs, body_lh=body_lh,
        )
        builder.need_section(section_chrome_height, first_height)
        section(labels["education"])
        for index, education in enumerate(entries):
            _vellum_place_education(
                builder, education, left, width,
                ink=palette["ink"], muted=palette["muted"],
                body=palette["body"], font=body_font,
                degree_fs=9.3, degree_lh=12.0,
                meta_fs=7.5, meta_lh=10.2,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=(
                    get_spacing().record if index < len(entries) - 1 else None
                ),
            )
        close_section()

    _extra_sections(
        builder, cv, "after_skills", section,
        {"body": palette["body"], "accent": palette["accent"]},
        left, width, body_font, fs=body_fs, lh=body_lh,
        section_chrome_h=section_chrome_height,
    )

    flow = builder.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        decorations.extend([
            {
                **_line(0, 0, 595, 842, palette["paper"], zIndex=0, page=page),
                "fixedToPage": True,
            },
            {
                **_line(left, 796, width, 0.7, palette["rule"], zIndex=1, page=page),
                "fixedToPage": True,
            },
            {
                **_text(
                    f"{page:02d}", 7.2, sans, palette["accent"],
                    517.0, 806, zIndex=2, page=page,
                ),
                "fixedToPage": True,
            },
        ])
    return decorations + header + flow
