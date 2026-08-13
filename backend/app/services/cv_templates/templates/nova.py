from __future__ import annotations

"""Nova CV template generator (icon single-column + masthead photo)."""

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    get_spacing,
    SPACE_AFTER_HEADER_RULE,
    Builder,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section
from app.services.cv_templates.shared.icons import _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_stacked_icon_contacts,
)


def _gen_nova(cv: dict) -> list[dict]:
    # Content column shifted +16pt so section icons + headings sit further right
    # than the legacy L=68 / icon_x=48 band (matches the annotated Nova mock).
    C = {
        'paper': '#F7F1E8',
        'ink': '#1A1612',
        'accent': '#C45C26',
        'mute': '#7A6550',
        'body': '#2C241C',
        'rule': '#E0D2C0',
        'display': 'PlayfairDisplay',
        'sans': 'Montserrat',
        'mono': 'Montserrat',
        'layout': 'nova',
        'icon_theme': 'nova',
        'L': 84.0,
        'W': 463.0,
        'icon_x': 64.0,
        'start': 210.0,
    }
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
    ICON = C['icon_theme']
    lbl = _labels(cv)
    skip_sidebar_extras: set[int] = set()

    # ── Masthead: name left, stacked contacts under name, photo top-right ──
    # Name sits a few pt left of the content column for a stronger letterhead.
    NAME_LEFT = 36.0
    NAME_TOP = 40.0
    NAME_FS = 34.0
    TITLE_FS = 9.2
    CONTACT_FS, CONTACT_ICON = (8.4, 14.0)
    PHOTO_SIZE = 104.0
    PHOTO_LEFT = L + W - PHOTO_SIZE  # flush with content right edge
    PHOTO_TOP = 34.0
    PHOTO_INSET = 0.0  # photo fully covers the slot (objectFit: cover)

    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)

    header: list[dict] = []
    name_el = _text(name, NAME_FS, DISP, C['ink'], NAME_LEFT, NAME_TOP, zIndex=3, bold=True)
    header.append(name_el)
    # Contacts sit ~12pt under the name (one channel per row). Job title lives
    # under the photo so it does not push the stacked contact band down.
    contact_start = NAME_TOP + NAME_FS * 1.05 + 12.0

    # Cap contact column so rows do not run under the photo.
    contact_els, contact_bottom = _place_stacked_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv, email_limit=42),
        start_x=NAME_LEFT + 2.0,
        start_y=contact_start,
        text_fs=CONTACT_FS,
        icon_size=CONTACT_ICON,
        text_color=C['mute'],
        font=SANS,
        icon_gap=16.0,
        line_step=18.0,
    )
    header.extend(contact_els)

    photo_bottom = PHOTO_TOP + PHOTO_SIZE
    title_bottom = photo_bottom
    if title:
        # Compact role line under the portrait, right-aligned to the photo.
        title_el = _text(
            title, TITLE_FS, SANS, C['accent'], PHOTO_LEFT, photo_bottom + 8.0, zIndex=3,
        )
        title_el['letterSpacing'] = 1.8
        title_el['width'] = PHOTO_SIZE
        title_el['align'] = 'right'
        header.append(title_el)
        title_bottom = photo_bottom + 8.0 + TITLE_FS * 1.35

    masthead_bottom = max(contact_bottom + CONTACT_FS * 1.35, title_bottom)
    # Extra breathing room under the taller masthead before the first section.
    header_rule_y = masthead_bottom + 22.0

    photo_frame = {
        **_rect(
            PHOTO_LEFT, PHOTO_TOP, PHOTO_SIZE, PHOTO_SIZE,
            C['rule'], 1.0, zIndex=3,
        ),
        'id': 'nova-photo-frame',
        'photoSlot': 'frame',
        'photoShape': 'rect',
        'flowRole': 'masthead',
    }
    photo_image = {
        'category': 'image',
        'src': f'{BACKEND_URL}/template-assets/nova-portrait.png',
        'width': PHOTO_SIZE - 2 * PHOTO_INSET,
        'height': PHOTO_SIZE - 2 * PHOTO_INSET,
        'left': PHOTO_LEFT + PHOTO_INSET,
        'top': PHOTO_TOP + PHOTO_INSET,
        'zIndex': 2,
        'page': 1,
        'id': 'nova-photo-image',
        'photoSlot': 'image',
        'objectFit': 'cover',
        'alignWithText': False,
        'flowRole': 'masthead',
    }
    header.extend([photo_frame, photo_image])
    header.append(_line(48, header_rule_y, 499, 1, C['rule'], zIndex=2))
    header = [{**element, 'flowRole': 'masthead'} for element in header]

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
        heading = _text(
            label, label_fs, SANS, C['accent'], L, y, zIndex=3, page=page, bold=True,
        )
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
        return _experience_record_height(
            b, job, W, SANS,
            title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
            body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
        )

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
            _place_experience_record(
                b, job, L, W,
                ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
                body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, 'after_experience', section,
            {'body': C['body'], 'accent': C['accent']},
            L, W, SANS, fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
        )
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], W, SANS,
                degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5,
                body_fs=9.2, body_lh=13.2,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5,
                body_fs=9.2, body_lh=13.2,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()
    if _place_skills_section(
        b, cv, section, L, W, C['body'], SANS, 9.3, 13.4,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(
        b, cv, 'after_skills', section,
        {'body': C['body'], 'accent': C['accent']},
        L, W, SANS, fs=9.3, lh=13.4,
        skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME,
    )
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True},
            {**_line(0, 0, 595, 6, C['accent'], zIndex=2, page=page), 'fixedToPage': True},
            {**_line(48, 800, 499, 1, C['rule'], page=page), 'fixedToPage': True},
            {**_text(f'{page:02d}', 8, SANS, C['mute'], 522, 808, page=page), 'fixedToPage': True},
        ]
    return page_decorations + header + flow
