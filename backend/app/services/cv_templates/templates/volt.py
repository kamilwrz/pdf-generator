from __future__ import annotations

"""Volt CV template generator (icon dark)."""

from app.services.cv_generator_primitives import SPACE_AFTER_MASTHEAD, SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels, _skills_inline_content
from app.services.cv_templates.shared.icons import _icon, _icon_key_for_label

def _gen_volt(cv: dict) -> list[dict]:
    C = {'paper': '#0F1218', 'ink': '#E8ECF0', 'accent': '#E8A838', 'mute': '#8B93A0', 'body': '#C5CCD6', 'rule': '#2A3140', 'chip': '#1A2030', 'display': 'Montserrat', 'sans': 'Montserrat', 'mono': 'JetBrainsMono', 'layout': 'volt', 'icon_theme': 'volt', 'L': 78, 'W': 469, 'icon_x': 48, 'start': 155}
    L, W = (C['L'], C['W'])
    SANS, DISP, MONO = (C['sans'], C['display'], C['mono'])
    ICON = C['icon_theme']
    lbl = _labels(cv)
    header: list[dict] = []
    skip_sidebar_extras: set[int] = set()
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)
    email = _compact_text(cv.get('email'), 42)
    phone = _compact_text(cv.get('phone'), 24)
    location = _compact_text(cv.get('location'), 28)
    start_y = float(C['start'])
    chip_h, contact_icon, contact_fs = (20.0, 15.0, 7.8)
    header = [_text(name, 32, SANS, C['ink'], 48, 36, zIndex=3, bold=True), _text(title, 9, MONO, C['accent'], 50, 78, zIndex=3)]
    header[1]['letterSpacing'] = 1.2
    x = 48.0
    chip_top = 108.0
    for key, value, width in (('email', email, 168), ('phone', phone, 148), ('location', location, 120)):
        if not value:
            continue
        text_top = chip_top + (chip_h - contact_fs) / 2
        header.append(_rect(x, chip_top, width, chip_h, C['chip'], 1, zIndex=1))
        header.append(_icon(ICON, key, x + 6, text_top, contact_icon))
        header.append(_text(value, contact_fs, MONO, C['body'], x + 6 + contact_icon + 6, text_top, zIndex=3))
        x += width + 8
    start_y = chip_top + chip_h + SPACE_AFTER_MASTHEAD
    b = Builder(start_y)
    label_fs = 8.4
    section_icon = 15.0
    volt_chip = 20.0
    SECTION_CHROME = section_chrome_height(label_fs) + volt_chip

    def section(label: str) -> None:
        key = _icon_key_for_label(label)
        y = b.y
        page = b.pg
        text_top = y + (volt_chip - label_fs) / 2
        icon_left = C['icon_x'] + (volt_chip - section_icon) / 2
        b.els.append(_rect(C['icon_x'], y, volt_chip, volt_chip, C['chip'], 1, zIndex=1, page=page))
        b.els.append(_icon(ICON, key, icon_left, text_top, section_icon, page=page))
        heading = _text(label, label_fs, SANS, C['accent'], 78, text_top, zIndex=3, page=page)
        heading['letterSpacing'] = 1.35
        b.els.append(heading)
        b.y = y + volt_chip
        b.gap(2)
        b.line(L, W, 1, C['rule'])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)
    BODY_FS, BODY_LH = (9.4, 13.4)

    def experience_height(job: dict) -> float:
        meta_font = MONO
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
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=MONO, after_gap=SPACE_RECORD if index < len(jobs) - 1 else None)
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(SECTION_CHROME, _education_record_height(b, education_entries[0], W, SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=9.2, body_lh=13.2))
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(b, edu, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=9.2, body_lh=13.2, after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None)
        close_section()
    if cv.get('skills'):
        skills_fs = 9.3
        skills = _skills_inline_content(cv['skills'])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, skills_fs, 13.4, SANS))
        section(lbl['skills'])
        b.block(skills, L, W, skills_fs, 13.4, C['body'], SANS)
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(0, 0, 595, 4, C['accent'], zIndex=2, page=page), 'fixedToPage': True}, {**_line(48, 800, 499, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, MONO, C['mute'], 522, 808, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
