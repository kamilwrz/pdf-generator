"""Regent CV template generator.

Regent is a monochrome executive resume built around a high-contrast serif
masthead. The professional summary uses the same Montserrat face as record
copy so the lead paragraph reads as body text, not a second display block;
the remaining sections keep restrained sans-serif type, fine rules, and a
generous single column appropriate for applicant-tracking systems.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    _block,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
    _reserved_contact_last_row_top,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section


def _gen_regent(cv: dict) -> list[dict]:
    """Build a monochrome, single-column executive CV from normalized CV data.

    The summary uses the same compact 9.5-point / 11-point-leading body scale
    as record content so
    imported CVs keep a compact, predictable one-page rhythm.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#151515",
        "body": "#242424",
        "muted": "#6A6A6A",
        "rule": "#CFCFCF",
        "display": "CormorantGaramond",
        "sans": "Montserrat",
        # Regent icons are thin, neutral glyphs that remain legible at the
        # small contact-row size without introducing a colored accent.
        "icon_theme": "regent",
        "L": 62,
        "W": 471,
    }
    L, W = C["L"], C["W"]
    SANS, DISPLAY = C["sans"], C["display"]
    center_x = L + W / 2
    labels = _labels(cv)

    header: list[dict] = []
    cursor_y = 47.0
    name = _compact_text(cv.get("name"), 40)
    title = _compact_text(cv.get("title"), 78)
    name_index: int | None = None
    title_index: int | None = None

    if name:
        name_height = Builder.measure_block(name, W, 38, 41, DISPLAY, bold=True)
        name_index = len(header)
        header.append(
            _block(
                name, L, cursor_y, W, name_height, 38, 41, C["ink"], DISPLAY,
                zIndex=3, bold=True, align="left",
            )
        )
        cursor_y += name_height + 9.0

    title_top = cursor_y
    title_height = (
        Builder.measure_block(title, W, 9.5, 11, SANS)
        if title else 11.0
    )
    title_prototype = _block(
        title, L, title_top, W, title_height, 9.5, 11, C["ink"], SANS,
        zIndex=3, align="left",
    )
    title_prototype["letterSpacing"] = 2.0
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_height

    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=C["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=center_x,
        start_y=cursor_y + 18.0,
        max_width=W,
        text_fs=8.4,
        icon_size=10.5,
        text_color=C["muted"],
        font=SANS,
        char_width=5.0,
        icon_gap=11.0,
        item_pad=16.0,
        line_step=15.0,
        band_id="regent-contact",
    )
    header.extend(contact_elements)
    # Reserve two centered contact rows independently of the channels present
    # at generation time. A 24-point baseline gap leaves 13.5 points below
    # Regent's icons, so a wrapped second row never touches the hairline.
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    rule_y = contact_zone_bottom + 24.0
    header.append(_line(L, rule_y, W, 0.8, C["rule"], zIndex=2, page=1))
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
                name_default_uppercase=False,
                title_default_uppercase=True,
                band_top=title_top + title_height + 18.0,
                # Preserve Regent's existing 18 pt gap in an initially empty
                # masthead; `+` inserts only the missing title line.
                title_reclaim_pt=title_height if not title else None,
                contact_band_id="regent-contact",
            )
        )

    section_label_fs = 8.7
    section_chrome_h = section_label_fs + 6 + get_spacing().after_rule + 7
    # Absorb the four-point divider adjustment inside the existing masthead
    # whitespace and preserve the body's established starting coordinate.
    b = Builder(rule_y + SPACE_AFTER_HEADER_RULE + 1.0 - 4.0)

    def section(label: str) -> None:
        """Place a compact heading and hairline that travel as one chrome group."""
        y = b.y
        page = b.pg
        heading = _text(label, section_label_fs, SANS, C["ink"], L, y, zIndex=3, page=page)
        heading["bold"] = True
        heading["letterSpacing"] = 1.75
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        rule = _line(L, y + section_label_fs + 5.5, W, 0.8, C["rule"], zIndex=2, page=page)
        rule["flowRole"] = "section-chrome"
        b.els.append(rule)
        b.y = rule["top"] + rule["height"] + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    # Keep summary metrics and face identical to record copy. A serif lead
    # at this size looked like a second masthead and wrapped differently
    # from the Montserrat body below it.
    summary_fs, summary_lh = 9.5, 11
    if cv.get("summary"):
        b.need_section(
            section_chrome_h,
            b.measure_block(cv["summary"], W, summary_fs, summary_lh, SANS),
        )
        section(labels["summary"])
        b.block(cv["summary"], L, W, summary_fs, summary_lh, C["ink"], SANS)
        close_section()

    # All requested content textareas — professional summary, job and degree
    # lines, record descriptions, education copy, skills, and languages — use
    # 11 px leading. Metadata keeps its smaller standalone line metric.
    body_fs, body_lh = 9.5, 11.0

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=11, title_lh=11, meta_fs=8.3, meta_lh=11.5,
            body_fs=body_fs, body_lh=body_lh, meta_font=SANS,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                title_fs=11, title_lh=11, meta_fs=8.3, meta_lh=11.5,
                body_fs=body_fs, body_lh=body_lh, meta_font=SANS,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": C["body"], "accent": C["ink"]},
            L, W, SANS, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(
            section_chrome_h,
            _education_record_height(
                b, education_entries[0], W, SANS, degree_fs=10.5, degree_lh=11,
                meta_fs=8.3, meta_lh=11.5, body_fs=body_fs, body_lh=body_lh,
            ),
        )
        section(labels["education"])
        for index, education in enumerate(education_entries):
            _place_education_record(
                b, education, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10.5, degree_lh=11, meta_fs=8.3, meta_lh=11.5,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, C["body"], SANS, body_fs, body_lh,
        section_chrome_h=section_chrome_h,
    ):
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": C["body"], "accent": C["ink"]},
        L, W, SANS, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        decorations.append(
            {
                **_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page),
                "fixedToPage": True,
            }
        )
        decorations.append(
            {
                **_text(f"{page:02d}", 8, SANS, C["muted"], 510, 806, zIndex=2, page=page),
                "fixedToPage": True,
            }
        )
    return decorations + header + flow
