"""Aurelia CV template generator.

Aurelia adapts the supplied olive-and-gold executive reference to CV Studio's
editable geometry. The identity sits inside one precise outline frame, contact
channels remain a managed icon band below it, and every section follows a
single ATS-friendly reading lane. Widely tracked labels and fine rules carry
the reference's editorial rhythm without reproducing its two-column body.

Experience and education reuse Meridian's exact-anchor record rail. Period and
city fields are non-flowing overlays pinned to genuine title/school textarea
tops, so typing, record reorder, density changes, and page packing cannot leave
metadata behind at stale coordinates.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    _block,
    _line,
    _rect,
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
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.text import (
    _compact_text,
    _labels,
    _place_skills_section,
)
from app.services.cv_templates.templates.meridian import (
    _meridian_education_height,
    _meridian_experience_height,
    _meridian_place_education,
    _meridian_place_experience,
)

_FRAME_TOP = 38.0
_FRAME_HEIGHT = 104.0
_SECTION_RULE_TOP = 14.5


def _gen_aurelia(cv: dict) -> list[dict]:
    """Build the framed, one-column Aurelia CV from normalized profile data.

    The returned graph contains only CV Studio primitives. Its outline frame,
    icon band, section chrome, record overlays, and fixed page furniture are
    therefore identical on the browser canvas and in ReportLab PDF export.
    """
    palette = {
        "paper": "#FFFFFF",
        "ink": "#31312F",
        "body": "#4A4B47",
        "muted": "#6A6C66",
        "rule": "#D6D1BC",
        "accent": "#98884D",
        "heading": "#353632",
        "font": "Montserrat",
        "icon_theme": "aurelia-gilded",
        "left": 58.0,
        "width": 479.0,
    }
    left, width = palette["left"], palette["width"]
    center_x = left + width / 2.0
    font = palette["font"]
    labels = _labels(cv)

    header: list[dict] = []
    frame = _rect(
        left,
        _FRAME_TOP,
        width,
        _FRAME_HEIGHT,
        palette["accent"],
        borderWidth=1.15,
        zIndex=1,
        page=1,
    )
    frame["id"] = "aurelia-masthead-frame"
    frame["flowRole"] = "masthead"
    frame["mastheadFrame"] = True
    header.append(frame)

    name = _compact_text(cv.get("name"), 48)
    title = _compact_text(cv.get("title"), 84)
    name_element: dict | None = None
    title_element: dict | None = None

    name_top = 57.0
    if name:
        name_height = Builder.measure_block(
            name, width - 32.0, 29.0, 33.0, font, min_h=33.0,
        )
        name_element = _block(
            name,
            left + 16.0,
            name_top,
            width - 32.0,
            name_height,
            29.0,
            33.0,
            palette["ink"],
            font,
            zIndex=3,
            align="center",
        )
        name_element["letterSpacing"] = 2.4
        name_element["flowRole"] = "masthead"
        header.append(name_element)

    # The title occupies a stable slot inside the frame. Hiding it must not
    # collapse the outline or pull the independent contact band into the box.
    title_top = 105.0
    title_height = Builder.measure_block(
        title, width - 48.0, 7.8, 10.8, font, min_h=10.8,
    ) if title else 11.0
    title_prototype = _block(
        title,
        left + 24.0,
        title_top,
        width - 48.0,
        title_height,
        7.8,
        10.8,
        palette["heading"],
        font,
        zIndex=3,
        align="center",
    )
    title_prototype["letterSpacing"] = 2.3
    title_prototype["flowRole"] = "masthead"
    if title:
        title_element = title_prototype
        header.append(title_element)

    contact_start_y = _FRAME_TOP + _FRAME_HEIGHT + 16.0
    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=palette["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=center_x,
        start_y=contact_start_y,
        max_width=width,
        text_fs=7.0,
        icon_size=9.0,
        text_color=palette["muted"],
        font=font,
        char_width=4.4,
        icon_gap=10.5,
        item_pad=14.0,
        line_step=13.0,
        band_id="aurelia-contact",
    )
    for element in contact_elements:
        element["flowRole"] = "masthead"
    header.extend(contact_elements)
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    divider_y = contact_zone_bottom + 24.0
    divider = _line(left, divider_y, width, 0.85, palette["rule"], zIndex=2, page=1)
    divider["flowRole"] = "masthead"
    divider["mastheadDivider"] = True
    header.append(divider)
    header.append(build_contact_band_anchor(contact_descriptor))

    if name_element is not None:
        header.append(
            tag_masthead_identity(
                name_element,
                title_element,
                title_prototype=title_prototype,
                band_id="aurelia-masthead",
                name_default_uppercase=True,
                title_default_uppercase=True,
                band_top=title_top + title_height,
                title_reclaim_pt=0.0,
                contact_band_id="aurelia-contact",
            )
        )

    builder = Builder(divider_y + 18.0)
    section_label_fs = 7.5
    section_chrome_h = _SECTION_RULE_TOP + 0.9 + get_spacing().after_rule

    def section(label: str) -> None:
        """Place a centered editorial label followed by one precise gold rule."""
        y, page = builder.y, builder.pg
        heading = _text(
            label,
            section_label_fs,
            font,
            palette["heading"],
            left,
            y,
            zIndex=3,
            page=page,
            bold=True,
        )
        heading["letterSpacing"] = 1.9
        heading["width"] = width
        heading["align"] = "center"
        rule = _line(
            left,
            y + _SECTION_RULE_TOP,
            width,
            0.9,
            palette["accent"],
            zIndex=2,
            page=page,
        )
        for element in (heading, rule):
            element["flowRole"] = "section-chrome"
        builder.els.extend([heading, rule])
        builder.y = y + section_chrome_h

    def close_section() -> None:
        builder.gap(get_spacing().section)

    body_fs, body_lh = 8.5, 11.2
    title_fs, title_lh = 9.7, 12.3
    meta_fs, meta_lh = 7.7, 10.4

    if cv.get("summary"):
        summary_height = builder.measure_block(
            cv["summary"], width, body_fs, body_lh, font,
        )
        builder.need_section(section_chrome_h, summary_height)
        section(labels["summary"])
        builder.block(
            cv["summary"], left, width, body_fs, body_lh,
            palette["body"], font,
        )
        close_section()

    def experience_height(job: dict) -> float:
        return _meridian_experience_height(
            builder,
            job,
            width,
            font,
            title_fs=title_fs,
            title_lh=title_lh,
            meta_fs=meta_fs,
            meta_lh=meta_lh,
            body_fs=body_fs,
            body_lh=body_lh,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        builder.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _meridian_place_experience(
                builder,
                job,
                left,
                width,
                ink=palette["ink"],
                muted=palette["muted"],
                body=palette["body"],
                font=font,
                title_fs=title_fs,
                title_lh=title_lh,
                meta_fs=meta_fs,
                meta_lh=meta_lh,
                body_fs=body_fs,
                body_lh=body_lh,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            builder,
            cv,
            "after_experience",
            section,
            palette,
            left,
            width,
            font,
            fs=body_fs,
            lh=body_lh,
            section_chrome_h=section_chrome_h,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        first_education_height = _meridian_education_height(
            builder,
            education_entries[0],
            width,
            font,
            degree_fs=9.4,
            degree_lh=12.0,
            meta_fs=meta_fs,
            meta_lh=meta_lh,
            body_fs=body_fs,
            body_lh=body_lh,
        )
        builder.need_section(section_chrome_h, first_education_height)
        section(labels["education"])
        for index, education in enumerate(education_entries):
            _meridian_place_education(
                builder,
                education,
                left,
                width,
                ink=palette["ink"],
                muted=palette["muted"],
                body=palette["body"],
                font=font,
                degree_fs=9.4,
                degree_lh=12.0,
                meta_fs=meta_fs,
                meta_lh=meta_lh,
                body_fs=body_fs,
                body_lh=body_lh,
                after_gap=(
                    get_spacing().record
                    if index < len(education_entries) - 1
                    else None
                ),
            )
        close_section()

    if _place_skills_section(
        builder,
        cv,
        section,
        left,
        width,
        palette["body"],
        font,
        body_fs,
        body_lh,
        section_chrome_h=section_chrome_h,
    ):
        close_section()

    _extra_sections(
        builder,
        cv,
        "after_skills",
        section,
        palette,
        left,
        width,
        font,
        fs=body_fs,
        lh=body_lh,
        section_chrome_h=section_chrome_h,
    )

    flow = builder.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_background = {
            **_line(0, 0, 595, 842, palette["paper"], zIndex=0, page=page),
            "fixedToPage": True,
        }
        if page == 1:
            page_background["appearanceTemplateId"] = "aurelia"
            page_background["appearanceSettings"] = {
                "palette": "gilded",
                "textSize": "M",
            }
        decorations.append(page_background)
        decorations.append({
            **_line(left, 796, width, 0.75, palette["rule"], zIndex=1, page=page),
            "fixedToPage": True,
        })
        decorations.append({
            **_text(
                f"{page:02d}",
                7.0,
                font,
                palette["heading"],
                center_x - 5.0,
                806,
                zIndex=2,
                page=page,
            ),
            "fixedToPage": True,
        })
        if page > 1 and name:
            continuation_name = _text(
                name,
                9.0,
                font,
                palette["ink"],
                left,
                30,
                zIndex=2,
                page=page,
            )
            continuation_name["letterSpacing"] = 2.0
            continuation_name["textTransform"] = "uppercase"
            continuation_name["fixedToPage"] = True
            continuation_name["flowRole"] = "fixed"
            decorations.append(continuation_name)
            decorations.append({
                **_line(left, 50, width, 0.75, palette["accent"], zIndex=1, page=page),
                "fixedToPage": True,
            })
    return decorations + header + flow
