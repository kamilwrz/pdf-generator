from __future__ import annotations

"""Nova CV template generator (icon single-column + masthead photo)."""

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
from app.services.cv_templates.shared.icons import _icon, _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_stacked_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.masthead import tag_masthead_identity


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

    # ── Masthead: name + role left, stacked contacts, portrait top-right ──
    # Matches the editorial Nova mock: name left of the body column, muted
    # job line under the name, contacts ~12pt below that stack, portrait slot
    # on the right that the profile photo fully covers (objectFit: cover).
    NAME_LEFT = 32.0
    NAME_TOP = 36.0
    NAME_FS = 34.0
    TITLE_FS = 9.0
    CONTACT_FS, CONTACT_ICON = (8.4, 14.0)
    # Portrait slot (empty rectangle). The editor starter has only this frame;
    # clicking it opens the gallery. The marketing mockup injects a demo photo
    # at render time — generators must not embed a profile raster.
    PHOTO_W, PHOTO_H = (100.0, 124.0)
    PHOTO_LEFT = L + W - PHOTO_W  # flush with content right edge
    PHOTO_TOP = 30.0

    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)

    header: list[dict] = []
    # Track the masthead name/title positions so they can be re-pointed after the
    # flowRole comprehension below copies every element into a new dict (that copy
    # would otherwise discard the tags added later by `tag_masthead_identity`).
    name_index = len(header)
    header.append(_text(name, NAME_FS, DISP, C['ink'], NAME_LEFT, NAME_TOP, zIndex=3, bold=True))

    # Role sits directly under the name (left column), not under the photo.
    cursor_y = NAME_TOP + NAME_FS * 1.05
    title_index: int | None = None
    if title:
        cursor_y += 6.0
        title_el = _text(
            title, TITLE_FS, SANS, C['mute'], NAME_LEFT, cursor_y, zIndex=3,
        )
        title_el['letterSpacing'] = 1.6
        title_index = len(header)
        header.append(title_el)
        cursor_y += TITLE_FS * 1.35

    # One contact channel per row, ~12pt under the name/title stack.
    contact_start = cursor_y + 12.0
    contact_els, contact_bottom, contact_descriptor = _place_stacked_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv),
        start_x=NAME_LEFT + 2.0,
        start_y=contact_start,
        text_fs=CONTACT_FS,
        icon_size=CONTACT_ICON,
        text_color=C['mute'],
        font=SANS,
        icon_gap=16.0,
        line_step=17.0,
        band_id="contact-main",
    )
    header.extend(contact_els)

    photo_bottom = PHOTO_TOP + PHOTO_H
    masthead_bottom = max(contact_bottom + CONTACT_FS * 1.25, photo_bottom)
    # Breathing room under the masthead before the first section (kept tight
    # enough that the Julia Bernat demo still fits page 1 of the mockup).
    header_rule_y = masthead_bottom + 18.0

    # Outline + light fill so the empty slot reads as a drop target and the
    # whole box stays clickable. Gallery upload covers the well via cover-fit.
    photo_well = {
        **_rect(
            PHOTO_LEFT, PHOTO_TOP, PHOTO_W, PHOTO_H,
            '#EDE4D8', 0, filled=True, zIndex=2,
        ),
        'id': 'nova-photo-well',
        'photoSlot': 'ornament',
        'flowRole': 'masthead',
    }
    photo_frame = {
        **_rect(
            PHOTO_LEFT, PHOTO_TOP, PHOTO_W, PHOTO_H,
            C['rule'], 1.0, zIndex=3,
        ),
        'id': 'nova-photo-frame',
        'photoSlot': 'frame',
        'photoShape': 'rect',
        'flowRole': 'masthead',
    }
    # Use Nova's terracotta icon palette for the empty-state portrait glyph.
    # The gallery replaces this semantic glyph with the selected raster while
    # retaining the cream well and raising the frame outline above the photo.
    photo_glyph = {
        **_icon(C['icon_theme'], 'portrait', PHOTO_LEFT + 29, PHOTO_TOP + 41, 42, zIndex=4),
        'id': 'nova-photo-glyph',
        'photoSlot': 'glyph',
        'alignWithText': False,
        'flowRole': 'masthead',
    }
    header.extend([photo_well, photo_frame, photo_glyph])
    header.append(_line(48, header_rule_y, 499, 1, C['rule'], zIndex=2))
    header = [{**element, 'flowRole': 'masthead'} for element in header]
    # Append the band anchor after the masthead spread so its own flowRole
    # ("masthead-anchor") is preserved rather than overwritten to "masthead".
    header.append(build_contact_band_anchor(contact_descriptor))
    # Re-point the name/title references at their post-comprehension copies and
    # tag them for the masthead identity manager. Nova bakes no uppercase into the
    # name or title; `band_top` matches the contact band's `start_y`
    # (`contact_start`) so the client can compute the title-hide reflow delta.
    name_el = header[name_index]
    title_el = header[title_index] if title_index is not None else None
    header.append(tag_masthead_identity(
        name_el, title_el,
        band_id="masthead-main", name_default_uppercase=False,
        title_default_uppercase=False, band_top=contact_start,
        contact_band_id="contact-main",
    ))

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
