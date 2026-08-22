"""Meridian CV template generator.

Meridian is a premium single-column executive resume in the same family as
Regent (serif masthead, restrained sans-serif body, generous single column
kept ATS-friendly), but built around a deep navy/steel-blue palette instead
of Regent's monochrome ink, a noticeably more compact body type scale, and a
short accent-blue tick under every section rule that gives the page its own
identity instead of reading as a Regent recolor.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _block,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
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

# Meridian's own masthead rhythm. Kept as local literals (not routed through
# `get_spacing()`, which is the shared per-document density knob every
# template reads for section/record/stack gaps) so this template's header can
# be visibly tighter than Regent's without changing any other template's
# spacing.
_NAME_TO_TITLE_GAP = 6.0
_TITLE_TO_CONTACT_GAP = 14.0
_CONTACT_TO_RULE_GAP = 14.0
_MASTHEAD_TO_CONTENT_GAP = 24.0
_SECTION_TICK_WIDTH = 18.0


def _gen_meridian(cv: dict) -> list[dict]:
    """Build a navy/steel-blue, single-column executive CV from normalized CV data.

    Body, summary, and record copy sit a full size step below Regent's so a
    denser, more paragraph-heavy CV still reads as an elegant one-page brief.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#1B2A41",
        "body": "#33475A",
        "muted": "#7A8699",
        "rule": "#D7DEE6",
        "accent": "#3D5A80",
        "display": "CormorantGaramond",
        "sans": "Montserrat",
        # Meridian reuses Regent's thin, neutral contact glyphs: they are
        # colorless silhouettes designed to sit under any ink color, so no
        # new icon asset set is needed for the navy/steel-blue palette.
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
        name_height = Builder.measure_block(name, W, 34, 37, DISPLAY, bold=True)
        name_index = len(header)
        header.append(
            _block(
                name, L, cursor_y, W, name_height, 34, 37, C["ink"], DISPLAY,
                zIndex=3, bold=True, align="left",
            )
        )
        cursor_y += name_height + _NAME_TO_TITLE_GAP

    if title:
        title_height = Builder.measure_block(title, W, 9, 12.5, SANS)
        title_index = len(header)
        title_el = _block(
            title, L, cursor_y, W, title_height, 9, 12.5, C["accent"], SANS,
            zIndex=3, align="left",
        )
        title_el["letterSpacing"] = 2.0
        header.append(title_el)
        cursor_y += title_height

    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=C["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=center_x,
        start_y=cursor_y + _TITLE_TO_CONTACT_GAP,
        max_width=W,
        text_fs=8.0,
        icon_size=10.0,
        text_color=C["muted"],
        font=SANS,
        char_width=5.0,
        icon_gap=11.0,
        item_pad=16.0,
        line_step=13.5,
        band_id="meridian-contact",
    )
    header.extend(contact_elements)
    rule_y = contact_bottom + _CONTACT_TO_RULE_GAP
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
                band_id="masthead-main",
                name_default_uppercase=False,
                title_default_uppercase=True,
                band_top=cursor_y + _TITLE_TO_CONTACT_GAP,
                contact_band_id="meridian-contact",
            )
        )

    section_label_fs = 8.2
    section_chrome_h = section_label_fs + 6 + get_spacing().after_rule + 7
    b = Builder(rule_y + _MASTHEAD_TO_CONTENT_GAP)

    def section(label: str) -> None:
        """Place a compact heading, hairline, and a short accent-blue tick."""
        y = b.y
        page = b.pg
        heading = _text(label, section_label_fs, SANS, C["ink"], L, y, zIndex=3, page=page)
        heading["bold"] = True
        heading["letterSpacing"] = 1.6
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        rule_top = y + section_label_fs + 5.5
        rule = _line(L, rule_top, W, 0.8, C["rule"], zIndex=2, page=page)
        rule["flowRole"] = "section-chrome"
        b.els.append(rule)
        # Premium marker: a short accent-blue tick sitting on the hairline,
        # distinguishing Meridian's section chrome from Regent's plain
        # full-width rule.
        tick = _line(L, rule_top, _SECTION_TICK_WIDTH, 1.6, C["accent"], zIndex=3, page=page)
        tick["flowRole"] = "section-chrome"
        b.els.append(tick)
        b.y = rule_top + rule["height"] + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    # Meridian's body scale sits a full step below Regent's (9.5/14) so denser
    # CVs still read as a restrained, premium single page.
    summary_fs, summary_lh = 8.6, 12.0
    if cv.get("summary"):
        b.need_section(
            section_chrome_h,
            b.measure_block(cv["summary"], W, summary_fs, summary_lh, DISPLAY),
        )
        section(labels["summary"])
        b.block(cv["summary"], L, W, summary_fs, summary_lh, C["ink"], DISPLAY)
        close_section()

    body_fs, body_lh = 8.6, 12.0

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=10.3, title_lh=13.0, meta_fs=7.9, meta_lh=10.8,
            body_fs=body_fs, body_lh=body_lh, meta_font=SANS,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                title_fs=10.3, title_lh=13.0, meta_fs=7.9, meta_lh=10.8,
                body_fs=body_fs, body_lh=body_lh, meta_font=SANS,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": C["body"], "accent": C["accent"]},
            L, W, SANS, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(
            section_chrome_h,
            _education_record_height(
                b, education_entries[0], W, SANS, degree_fs=9.8, degree_lh=12.5,
                meta_fs=7.9, meta_lh=10.8, body_fs=body_fs, body_lh=body_lh,
            ),
        )
        section(labels["education"])
        for index, education in enumerate(education_entries):
            _place_education_record(
                b, education, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=9.8, degree_lh=12.5, meta_fs=7.9, meta_lh=10.8,
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
        b, cv, "after_skills", section, {"body": C["body"], "accent": C["accent"]},
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
                **_text(f"{page:02d}", 8, SANS, C["accent"], 510, 806, zIndex=2, page=page),
                "fixedToPage": True,
            }
        )
    return decorations + header + flow
