from __future__ import annotations

"""Nova CV template generator (icon single-column)."""

from app.services.cv_generator_primitives import get_spacing, SPACE_AFTER_HEADER_RULE, Builder, _line, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section
from app.services.cv_templates.shared.icons import _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_wrapping_icon_contacts,
)

def _gen_nova(cv: dict) -> list[dict]:
    C = {'paper': '#F7F1E8', 'ink': '#1A1612', 'accent': '#C45C26', 'mute': '#7A6550', 'body': '#2C241C', 'rule': '#E0D2C0', 'display': 'PlayfairDisplay', 'sans': 'Montserrat', 'mono': 'Montserrat', 'layout': 'nova', 'icon_theme': 'nova', 'L': 68, 'W': 479, 'icon_x': 48, 'start': 162}
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
    ICON = C['icon_theme']
    lbl = _labels(cv)
    header: list[dict] = []
    skip_sidebar_extras: set[int] = set()
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)
    contact_fs, contact_icon = (8.4, 14.0)
    header = [_text(name, 34, DISP, C['ink'], 48, 42, zIndex=3, bold=True), _text(title, 9.2, SANS, C['accent'], 50, 88, zIndex=3)]
    header[1]['letterSpacing'] = 1.8
    # Wrap extra social contacts onto a second line and move the header rule /
    # flow start with the contact band so body text never overlaps icons.
    contact_els, contact_bottom = _place_wrapping_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv, email_limit=42),
        start_x=50.0,
        start_y=118.0,
        right_limit=547.0,
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=C['mute'],
        font=SANS,
        char_width=5.2,
        icon_gap=16.0,
        item_pad=14.0,
        line_step=16.0,
    )
    header.extend(contact_els)
    header_rule_y = contact_bottom + 26.0
    header.append(_line(48, header_rule_y, 499, 1, C['rule'], zIndex=2))
    # Name, title, contacts, and divider stay out of section packing — otherwise
    # rhythm knobs treat a phone line as a heading (rule sits just below).
    header = [{**element, "flowRole": "masthead"} for element in header]
    start_y = header_rule_y + 1.0 + SPACE_AFTER_HEADER_RULE
    b = Builder(start_y)
    label_fs = 8.5
    section_icon = 14.0
    SECTION_CHROME = section_chrome_height(label_fs) + 16

    def section(label: str) -> None:
        key = _icon_key_for_label(label)
        y = b.y
        page = b.pg
        icon = _icon_beside(ICON, key, C['icon_x'], y, label_fs, section_icon, page=page)
        icon['flowRole'] = 'section-chrome'
        b.els.append(icon)
        heading = _text(label, label_fs, SANS, C['accent'], L, y, zIndex=3, page=page)
        heading['letterSpacing'] = 1.45
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        b.y = y + label_fs * 1.35
        b.gap(2)
        b.line(L, W, 1, C['rule'])
        b.els[-1]['flowRole'] = 'section-chrome'
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)
    BODY_FS, BODY_LH = (9.4, 13.4)

    def experience_height(job: dict) -> float:
        meta_font = SANS
        return _experience_record_height(b, job, W, SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=meta_font)
    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, BODY_FS, BODY_LH, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, BODY_FS, BODY_LH, C['body'], SANS)
        close_section()
    if cv.get('experience'):
        jobs = cv['experience']
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS, after_gap=get_spacing().record if index < len(jobs) - 1 else None)
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(SECTION_CHROME, _education_record_height(b, education_entries[0], W, SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=9.2, body_lh=13.2))
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(b, edu, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=9.2, body_lh=13.2, after_gap=get_spacing().record if index < len(education_entries) - 1 else None)
        close_section()
    if _place_skills_section(
        b, cv, section, L, W, C['body'], SANS, 9.3, 13.4,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(0, 0, 595, 6, C['accent'], zIndex=2, page=page), 'fixedToPage': True}, {**_line(48, 800, 499, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['mute'], 522, 808, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
