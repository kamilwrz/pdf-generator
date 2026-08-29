"""Cadenza CV template generator.

Cadenza translates a traditional editorial resume into CV Studio's editable
canvas model: a centered serif identity, pale full-width section bands, and a
single ATS-friendly reading column. A narrow copper registration mark gives
the otherwise quiet bands a recognisable signature without turning decorative
chrome into a second visual system.

Experience and education use the same exact-anchor date rail as Meridian.
Dates are non-flowing overlays pinned to the genuine title/degree textarea top,
so browser reflow and section reordering preserve the visible two-column row
instead of leaving dates behind at stale coordinates.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    _block,
    _line,
    _text,
    _text_width,
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
_SECTION_BAND_H = 18.0
_SECTION_MARK_W = 3.0


def _cadenza_education_height(
    b: Builder,
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
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    degree = str(education.get("degree") or "").strip()
    school = _education_school(education)
    bullets = _education_bullets(education)
    height = 0.0
    if degree:
        height += b.measure_block(
            degree, content_w, degree_fs, degree_lh, font,
            bold=True, min_h=degree_lh,
        )
    if school:
        if height:
            height += get_spacing().stack
        height += b.measure_block(
            school, content_w, meta_fs, meta_lh, font,
            italic=True, min_h=meta_lh,
        )
    if bullets:
        if height:
            height += get_spacing().stack
        height += b.measure_block(
            bullets, width, body_fs, body_lh, font,
            bulletList=True, min_h=body_lh,
        )
    return height


def _cadenza_place_education(
    b: Builder,
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
    """Place degree/school left and period/city on exact matching right anchors."""
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    rail_x = left + content_w + _RECORD_GAP
    degree = str(education.get("degree") or "").strip()
    school = _education_school(education)
    period = str(education.get("period") or "").strip()
    city = str(education.get("city") or "").strip()
    bullets = _education_bullets(education)
    height = _cadenza_education_height(
        b, education, width, font,
        degree_fs=degree_fs, degree_lh=degree_lh,
        meta_fs=meta_fs, meta_lh=meta_lh,
        body_fs=body_fs, body_lh=body_lh,
    )

    with b.keep_together(height):
        degree_top, page = b.y, b.pg
        second_line_top: float | None = None
        placed = False
        if degree:
            b.block(
                degree, left, content_w, degree_fs, degree_lh, ink, font,
                bold=True, min_h=degree_lh,
            )
            placed = True
        if school:
            if placed:
                b.gap(get_spacing().stack)
                second_line_top = b.y
            b.block(
                school, left, content_w, meta_fs, meta_lh, muted, font,
                italic=True, min_h=meta_lh,
            )
            placed = True
        if bullets:
            if placed:
                b.gap(get_spacing().stack)
                if second_line_top is None:
                    second_line_top = b.y
            b.block(
                bullets, left, width, body_fs, body_lh, body, font,
                bulletList=True,
            )

        # The period intentionally shares the degree's exact top coordinate.
        # Meridian's record-overlay contract then re-pins it after live edits.
        _meridian_place_rail_line(
            b, degree_top, page, period, meta_fs, meta_lh, muted, font,
            rail_x, _RECORD_RIGHT_W,
        )
        if second_line_top is not None:
            _meridian_place_rail_line(
                b, second_line_top, page, city, meta_fs, meta_lh, muted, font,
                rail_x, _RECORD_RIGHT_W,
            )
    if after_gap is not None:
        b.gap(after_gap)


def _gen_cadenza(cv: dict) -> list[dict]:
    """Build the warm, restrained Cadenza editorial CV from normalized data."""
    palette = {
        "paper": "#FFFEFB",
        "ink": "#263238",
        "body": "#42494B",
        "muted": "#72797B",
        "band": "#E8EDEE",
        "rule": "#CCD4D5",
        "accent": "#9B735A",
        "display": "PlayfairDisplay",
        "body_font": "Lora",
        "sans": "Montserrat",
        "icon_theme": "cadenza",
        "left": 58.0,
        "width": 479.0,
    }
    left, width = palette["left"], palette["width"]
    center_x = left + width / 2.0
    display = palette["display"]
    body_font = palette["body_font"]
    sans = palette["sans"]
    labels = _labels(cv)

    header: list[dict] = []
    cursor_y = 47.0
    name = _compact_text(cv.get("name"), 46)
    title = _compact_text(cv.get("title"), 82)
    name_index: int | None = None
    title_index: int | None = None

    if name:
        name_height = Builder.measure_block(name, width, 27.5, 32.0, display, bold=True)
        name_index = len(header)
        name_element = _block(
            name, left, cursor_y, width, name_height, 27.5, 32.0,
            palette["ink"], display, zIndex=3, bold=True, align="center",
        )
        name_element["letterSpacing"] = 3.6
        header.append(name_element)
        cursor_y += name_height + 5.0

    title_top = cursor_y
    title_height = Builder.measure_block(title, width, 8.2, 11.0, sans) if title else 11.0
    title_prototype = _block(
        title, left, title_top, width, title_height, 8.2, 11.0,
        palette["accent"], sans, zIndex=3, align="center",
    )
    title_prototype["letterSpacing"] = 2.1
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_height

    contact_start_y = cursor_y + 12.0
    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=palette["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=center_x,
        start_y=contact_start_y,
        max_width=width,
        text_fs=7.2,
        icon_size=9.0,
        text_color=palette["muted"],
        font=sans,
        char_width=4.5,
        icon_gap=10.5,
        item_pad=14.0,
        line_step=13.0,
        band_id="cadenza-contact",
    )
    header.extend(contact_elements)
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    divider_y = contact_zone_bottom + 24.0
    divider = _line(left, divider_y, width, 0.8, palette["rule"], zIndex=2, page=1)
    header.append(divider)
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
                # Keep the latent and rendered title specs geometrically
                # identical. The empty-title layout may draw contacts higher,
                # but materialising the title must restore the authored slot.
                band_top=title_top + title_height + 12.0,
                title_reclaim_pt=title_height if not title else None,
                contact_band_id="cadenza-contact",
            )
        )

    section_label_fs = 7.4
    section_chrome_h = _SECTION_BAND_H + get_spacing().after_rule
    builder = Builder(divider_y + 19.0)

    def section(label: str) -> None:
        """Place a pale editorial band with one restrained copper register mark."""
        y, page = builder.y, builder.pg
        band = _line(left, y, width, _SECTION_BAND_H, palette["band"], zIndex=1, page=page)
        mark = _line(left, y, _SECTION_MARK_W, _SECTION_BAND_H, palette["accent"], zIndex=2, page=page)
        visible_label_width = _text_width(label, sans, section_label_fs)
        visible_label_width += max(len(label) - 1, 0) * 1.8
        heading = _text(
            label, section_label_fs, sans, palette["ink"],
            left + (width - visible_label_width) / 2.0, y + 5.1,
            zIndex=3, page=page, bold=True,
        )
        heading["letterSpacing"] = 1.8
        for element in (band, mark, heading):
            element["flowRole"] = "section-chrome"
        builder.els.extend([band, mark, heading])
        builder.y = y + _SECTION_BAND_H + get_spacing().after_rule

    def close_section() -> None:
        builder.gap(get_spacing().section)

    body_fs, body_lh = 8.4, 11.2
    if cv.get("summary"):
        summary_height = builder.measure_block(
            cv["summary"], width, body_fs, body_lh, body_font,
        )
        builder.need_section(section_chrome_h, summary_height)
        section(labels["summary"])
        builder.block(
            cv["summary"], left, width, body_fs, body_lh,
            palette["body"], body_font,
        )
        close_section()

    def experience_height(job: dict) -> float:
        return _meridian_experience_height(
            builder, job, width, body_font,
            title_fs=9.6, title_lh=12.4,
            meta_fs=7.7, meta_lh=10.4,
            body_fs=body_fs, body_lh=body_lh,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        builder.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _meridian_place_experience(
                builder, job, left, width,
                ink=palette["ink"], muted=palette["muted"],
                body=palette["body"], font=body_font,
                title_fs=9.6, title_lh=12.4,
                meta_fs=7.7, meta_lh=10.4,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            builder, cv, "after_experience", section,
            {"body": palette["body"], "accent": palette["accent"]},
            left, width, body_font, fs=body_fs, lh=body_lh,
            section_chrome_h=section_chrome_h,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        first_education_height = _cadenza_education_height(
            builder, education_entries[0], width, body_font,
            degree_fs=9.3, degree_lh=12.0,
            meta_fs=7.7, meta_lh=10.4,
            body_fs=body_fs, body_lh=body_lh,
        )
        builder.need_section(section_chrome_h, first_education_height)
        section(labels["education"])
        for index, education in enumerate(education_entries):
            _cadenza_place_education(
                builder, education, left, width,
                ink=palette["ink"], muted=palette["muted"],
                body=palette["body"], font=body_font,
                degree_fs=9.3, degree_lh=12.0,
                meta_fs=7.7, meta_lh=10.4,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=(
                    get_spacing().record
                    if index < len(education_entries) - 1
                    else None
                ),
            )
        close_section()

    if _place_skills_section(
        builder, cv, section, left, width, palette["body"], body_font,
        body_fs, body_lh, section_chrome_h=section_chrome_h,
    ):
        close_section()

    _extra_sections(
        builder, cv, "after_skills", section,
        {"body": palette["body"], "accent": palette["accent"]},
        left, width, body_font, fs=body_fs, lh=body_lh,
        section_chrome_h=section_chrome_h,
    )

    flow = builder.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        decorations.append({
            **_line(0, 0, 595, 842, palette["paper"], zIndex=0, page=page),
            "fixedToPage": True,
        })
        decorations.append({
            **_line(left, 796, width, 0.7, palette["rule"], zIndex=1, page=page),
            "fixedToPage": True,
        })
        decorations.append({
            **_text(
                f"{page:02d}", 7.2, sans, palette["accent"],
                center_x - 5.0, 806, zIndex=2, page=page,
            ),
            "fixedToPage": True,
        })
        if page > 1 and name:
            continuation_name = _text(
                name, 9.0, display, palette["ink"], left, 30,
                zIndex=2, page=page, bold=True,
            )
            continuation_name["letterSpacing"] = 2.2
            continuation_name["textTransform"] = "uppercase"
            continuation_name["fixedToPage"] = True
            continuation_name["flowRole"] = "fixed"
            decorations.append(continuation_name)
            decorations.append({
                **_line(left, 50, width, 0.7, palette["rule"], zIndex=1, page=page),
                "fixedToPage": True,
            })
    return decorations + header + flow
