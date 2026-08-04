from __future__ import annotations

"""Loom CV template generator (icon sidebar)."""

from app.services.cv_generator_primitives import SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _block, _line, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections, _flatten_extra_items
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels
from app.services.cv_templates.shared.icons import _icon, _icon_beside, _icon_key_for_label

def _gen_loom(cv: dict) -> list[dict]:
    C = {'paper': '#FAF8F4', 'ink': '#1C241E', 'accent': '#C4A35A', 'mute': '#6B7368', 'body': '#2A322C', 'rule': '#DDD6C8', 'side': '#24352B', 'light': '#F3E6C8', 'display': 'CormorantGaramond', 'sans': 'Montserrat', 'mono': 'Montserrat', 'layout': 'loom', 'icon_theme': 'loom', 'L': 224, 'W': 323, 'icon_x': 204, 'start': 80}
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
    light = 'loom-light'
    contact_fs = 7.6
    side_head_fs = 7.4
    contact_icon = 11.0
    side_icon = 14.0
    side_text_x = 40.0
    side_body_w = 120.0
    side_body_fs = 7.8
    side_body_lh = 12.0
    side_section_gap = 12.0
    parts = (name or '').split(' ', 1)
    first = parts[0] if parts else name
    last = parts[1] if len(parts) > 1 else ''
    header = [_text(first, 22, DISP, C['light'], 24, 42, zIndex=3, bold=True), _text(last or ' ', 22, DISP, C['accent'], 24, 68, zIndex=3, bold=True), _text(title, 7.8, SANS, C['accent'], 24, 104, zIndex=3)]
    header[2]['letterSpacing'] = 1.3
    y = 140.0
    for key, value in (('email', email), ('phone', phone), ('location', location)):
        if not value:
            continue
        icon_top = y + (contact_fs - contact_icon) / 2.0
        contact_mark = _icon(light, key, 24, icon_top, contact_icon)
        contact_mark['alignWithText'] = False
        header.append(contact_mark)
        header.append(_text(value, contact_fs, SANS, C['light'], side_text_x, y, zIndex=3))
        y += 22.0

    def _loom_side_heading(icon_key: str, label: str, top: float) -> float:
        icon_top = top + (side_head_fs - side_icon) / 2.0
        mark = _icon(light, icon_key, 24, icon_top, side_icon)
        mark['alignWithText'] = False
        header.append(mark)
        side_label = _text(label, side_head_fs, SANS, C['accent'], side_text_x, top, zIndex=3)
        side_label['letterSpacing'] = 1.2
        header.append(side_label)
        return top + side_head_fs * 1.35 + 6.0

    def _loom_side_body(content: str, top: float, *, bullet_list: bool) -> float:
        height = Builder.measure_block(content, side_body_w, side_body_fs, side_body_lh, SANS, bulletList=bullet_list)
        header.append(_block(content, side_text_x, top, side_body_w, height, side_body_fs, side_body_lh, C['light'], SANS, zIndex=3, bulletList=bullet_list))
        return top + height + side_section_gap
    sidebar_y = max(y + 28.0, 240.0)
    if cv.get('skills'):
        sidebar_y = _loom_side_heading('skills', lbl['skills'], sidebar_y)
        skills_txt = '\n'.join((f'• {s}' for s in cv['skills'][:6]))
        sidebar_y = _loom_side_body(skills_txt, sidebar_y, bullet_list=True)
    for index, sec in enumerate(cv.get('extra_sections') or []):
        kind = (sec.get('kind') or '').lower()
        items = sec.get('items') or []
        if kind not in {'languages', 'references', 'interests'} or not items:
            continue
        key = _icon_key_for_label(sec.get('title') or kind)
        sidebar_y = _loom_side_heading(key, (sec.get('title') or kind).upper(), sidebar_y)
        flat_items = _flatten_extra_items(items)
        if kind == 'references':
            body = flat_items[0] if flat_items else 'Dostępne na życzenie'
            sidebar_y = _loom_side_body(body, sidebar_y, bullet_list=False)
        else:
            body = '\n'.join((f'• {item}' for item in flat_items[:5]))
            sidebar_y = _loom_side_body(body, sidebar_y, bullet_list=True)
        skip_sidebar_extras.add(index)
    start_y = 80.0
    b = Builder(start_y)
    label_fs = 8.5
    section_icon = 14.0
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
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(0, 0, 176, 842, C['side'], zIndex=1, page=page), 'fixedToPage': True}, {**_line(176, 0, 3, 842, C['accent'], zIndex=2, page=page), 'fixedToPage': True}, {**_line(204, 800, 343, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['mute'], 522, 808, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
