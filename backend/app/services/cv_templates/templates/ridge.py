from __future__ import annotations

"""Ridge CV template generator (icon accent rail)."""

from app.services.cv_generator_primitives import SPACE_AFTER_MASTHEAD, SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _line, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels, _bullet_list_content
from app.services.cv_templates.shared.icons import _icon_beside, _icon_key_for_label

def _gen_ridge(cv: dict) -> list[dict]:
    C = {'paper': '#F3F6F8', 'ink': '#15202B', 'accent': '#1F7A6C', 'mute': '#5A6B75', 'body': '#24323A', 'rule': '#D0DADF', 'display': 'Lora', 'sans': 'Montserrat', 'mono': 'Montserrat', 'layout': 'ridge', 'icon_theme': 'ridge', 'L': 56, 'W': 483, 'icon_x': 8, 'start': 188}
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
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
    contact_fs, contact_icon = (8.3, 14.0)
    header = [_text(name, 30, DISP, C['ink'], 56, 40, zIndex=3, bold=True), _text(title, 8.8, SANS, C['accent'], 58, 82, zIndex=3)]
    header[1]['letterSpacing'] = 1.4
    y = 112.0
    for key, value in (('email', email), ('phone', phone), ('location', location)):
        if not value:
            continue
        header.append(_icon_beside(ICON, key, 56, y, contact_fs, contact_icon))
        header.append(_text(value, contact_fs, SANS, C['mute'], 72, y, zIndex=3))
        y += 18
    start_y = y + SPACE_AFTER_MASTHEAD
    b = Builder(start_y)
    label_fs = 8.5
    section_icon = 15.0
    SECTION_CHROME = section_chrome_height(label_fs) + 16

    def section(label: str) -> None:
        key = _icon_key_for_label(label)
        y = b.y
        page = b.pg
        b.els.append(_icon_beside(ICON, key, C['icon_x'], y, label_fs, section_icon, page=page))
        heading = _text(label, label_fs, SANS, C['accent'], L, y, zIndex=3, page=page)
        heading['letterSpacing'] = 1.45
        b.els.append(heading)
        b.y = y + label_fs * 1.35
        b.gap(2)
        b.line(L, W, 1, C['rule'])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)
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
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS, after_gap=SPACE_RECORD if index < len(jobs) - 1 else None)
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
        skills = _bullet_list_content(cv['skills'])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, skills_fs, 13.4, SANS, bulletList=True))
        section(lbl['skills'])
        b.block(skills, L, W, skills_fs, 13.4, C['body'], SANS, bulletList=True)
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(0, 0, 28, 842, C['accent'], zIndex=1, page=page), 'fixedToPage': True}, {**_line(28, 0, 3, 842, '#9BCFC5', zIndex=1, page=page), 'fixedToPage': True}, {**_line(56, 800, 483, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['mute'], 520, 808, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
