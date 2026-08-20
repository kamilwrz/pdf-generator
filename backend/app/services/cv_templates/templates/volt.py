from __future__ import annotations

"""Volt CV template generator (icon dark)."""

from app.services.cv_generator_primitives import get_spacing, SPACE_AFTER_MASTHEAD, Builder, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section
from app.services.cv_templates.shared.icons import _icon, _icon_key_for_label
from app.services.cv_templates.shared.contact import _contact_channel_items, _place_chip_icon_contacts, build_contact_band_anchor
from app.services.cv_templates.shared.masthead import tag_masthead_identity

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
    chip_h, contact_icon, contact_fs = (20.0, 15.0, 7.8)
    header = [_text(name, 32, SANS, C['ink'], 48, 36, zIndex=3, bold=True), _text(title, 9, MONO, C['accent'], 50, 78, zIndex=3)]
    header[1]['letterSpacing'] = 1.2
    # Track the masthead name/title positions so they can be re-pointed after the
    # flowRole comprehension below copies every element into a new dict (that copy
    # would otherwise discard the tags added later by `tag_masthead_identity`).
    # The title element always exists here, but only manage it when the CV
    # actually carries a title.
    name_index = 0
    title_index = 1 if title else None
    # Chip row wraps to a second band when social links join phone/email/location.
    # Shared placer tags each rect/icon/label triple + emits a reflow descriptor
    # so the client contact-channel manager can add/remove/edit chips. Volt owns
    # its `_rect`/`_icon` helpers, so they are passed in as builders.
    contact_els, contact_bottom, contact_descriptor = _place_chip_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv, email_limit=36, social_limit=28),
        start_x=48.0,
        start_y=108.0,
        right_limit=547.0,
        chip_h=chip_h,
        icon_size=contact_icon,
        text_fs=contact_fs,
        text_color=C['body'],
        chip_color=C['chip'],
        font=MONO,
        rect_builder=lambda x, y, w, h, c: _rect(x, y, w, h, c, 1, zIndex=1),
        icon_builder=lambda key, left, top, size: _icon(ICON, key, left, top, size),
        band_id="contact-main",
    )
    header.extend(contact_els)
    # Chip contacts + name/title must not enter section packing on rhythm edits.
    header = [{**element, "flowRole": "masthead"} for element in header]
    # Append after the masthead spread so the anchor keeps its "masthead-anchor"
    # flowRole rather than being overwritten to "masthead".
    header.append(build_contact_band_anchor(contact_descriptor))
    # Re-point the name/title references at their post-comprehension copies and
    # tag them for the masthead identity manager. Volt bakes no uppercase into the
    # name or title; `band_top` matches the contact band's `start_y` (108.0) so the
    # client can compute the title-hide reflow delta.
    name_el = header[name_index]
    title_el = header[title_index] if title_index is not None else None
    header.append(tag_masthead_identity(
        name_el, title_el,
        band_id="masthead-main", name_default_uppercase=False,
        title_default_uppercase=False, band_top=108.0,
        contact_band_id="contact-main",
    ))
    start_y = contact_bottom + chip_h + SPACE_AFTER_MASTHEAD
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
        chip = _rect(C['icon_x'], y, volt_chip, volt_chip, C['chip'], 1, zIndex=1, page=page)
        chip['flowRole'] = 'section-chrome'
        b.els.append(chip)
        icon = _icon(ICON, key, icon_left, text_top, section_icon, page=page)
        icon['flowRole'] = 'section-chrome'
        b.els.append(icon)
        heading = _text(label, label_fs, SANS, C['accent'], 78, text_top, zIndex=3, page=page)
        heading['letterSpacing'] = 1.35
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        b.y = y + volt_chip
        b.gap(2)
        b.line(L, W, 1, C['rule'])
        b.els[-1]['flowRole'] = 'section-chrome'
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)
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
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=MONO, after_gap=get_spacing().record if index < len(jobs) - 1 else None)
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body'], 'accent': C['accent']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)
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
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body'], 'accent': C['accent']}, L, W, SANS, fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(0, 0, 595, 4, C['accent'], zIndex=2, page=page), 'fixedToPage': True}, {**_line(48, 800, 499, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, MONO, C['mute'], 522, 808, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
