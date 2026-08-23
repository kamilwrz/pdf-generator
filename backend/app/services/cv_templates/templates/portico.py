from __future__ import annotations

"""Portico CV template generator (centered masthead, icon single-column body)."""

from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    section_chrome_height,
    _block,
    _line,
    _rect,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.icons import _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section


def _gen_portico(cv: dict) -> list[dict]:
    """Centered masthead with photo slot; left-aligned icon body below.

    Name, square profile slot, title, and the contact row are centered on the
    page. Everything below the header rule — summary, experience, education,
    skills, extras — is a left-aligned single-column body with icon-in-gutter
    section headings, matching the Nova body structure.
    """
    C = {
        'paper': '#FCFBF8', 'ink': '#22221F', 'accent': '#7C6A52',
        'mute': '#83786B', 'body': '#2A2A28', 'rule': '#E4DED2',
        'display': 'Montserrat', 'sans': 'Montserrat', 'section_font': 'Inter',
        'icon_theme': 'portico',
        'L': 76, 'W': 443, 'icon_x': 54,
    }
    L, W = (C['L'], C['W'])
    SANS, DISP, SECTION_FONT = (C['sans'], C['display'], C['section_font'])
    ICON = C['icon_theme']
    # Page center given the symmetric L/W margins (76 + 443/2 = 297.5 of 595).
    CENTER_X = L + W / 2.0
    lbl = _labels(cv)

    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)
    name_fs, name_lh = (29, 12)
    title_fs, title_lh = (10, 12)
    # Centered portrait-aspect photo well — empty in the editor; gallery click
    # fills it. Taller than wide (not a square crop) so a normal headshot
    # doesn't look squeezed. The well itself paints the page's own paper
    # colour (invisible until filled) with a hairline rule-coloured frame and
    # softly rounded corners, instead of a visible tinted box + heavy ink
    # border.
    PHOTO_WIDTH = 78.0
    PHOTO_HEIGHT = 100.0
    PHOTO_LEFT = CENTER_X - PHOTO_WIDTH / 2.0
    PHOTO_RADIUS = 6.0

    header: list[dict] = []
    cursor_y = 18.0
    # Track the masthead name/title elements' positions in `header` so they can
    # be re-pointed after the flowRole comprehension below copies every element
    # into a new dict (that comprehension would otherwise discard mutations
    # made later by `tag_masthead_identity`).
    name_index: int | None = None
    title_index: int | None = None
    if name:
        name_h = Builder.measure_block(name, W, name_fs, name_lh, DISP, bold=True)
        name_index = len(header)
        header.append(_block(name, L, cursor_y, W, name_h, name_fs, name_lh, C['ink'], DISP,
                              zIndex=3, bold=True, align='center'))
        cursor_y += name_h + 8.0

    photo_top = cursor_y
    photo_well = {
        **_rect(
            PHOTO_LEFT, photo_top, PHOTO_WIDTH, PHOTO_HEIGHT,
            C['paper'], 0, filled=True, borderRadius=PHOTO_RADIUS, zIndex=2,
        ),
        'id': 'portico-photo-well',
        'photoSlot': 'ornament',
        'flowRole': 'masthead',
    }
    photo_frame = {
        **_rect(
            PHOTO_LEFT, photo_top, PHOTO_WIDTH, PHOTO_HEIGHT,
            C['rule'], 0.75, borderRadius=PHOTO_RADIUS, zIndex=3,
        ),
        'id': 'portico-photo-frame',
        'photoSlot': 'frame',
        'photoShape': 'rect',
        'flowRole': 'masthead',
    }
    header.extend([photo_well, photo_frame])
    cursor_y = photo_top + PHOTO_HEIGHT + 10.0

    if title:
        title_h = Builder.measure_block(title, W, title_fs, title_lh, SANS)
        title_el = _block(title, L, cursor_y, W, title_h, title_fs, title_lh, C['accent'], SANS,
                           zIndex=3, align='center')
        title_el['letterSpacing'] = 2.0
        title_index = len(header)
        header.append(title_el)
        cursor_y += title_h

    # Contact row re-centers itself around CENTER_X and wraps a second
    # centered line for CVs with many social/contact channels, unlike the
    # left-anchored `_place_wrapping_icon_contacts` used by Nova/Cardinal.
    contact_fs, contact_icon = (8.4, 12.0)
    contact_els, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv),
        center_x=CENTER_X,
        start_y=cursor_y + 10.0,
        max_width=W,
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=C['mute'],
        font=SANS,
        char_width=5.2,
        icon_gap=13.0,
        item_pad=16.0,
        line_step=15.0,
        band_id="contact-main",
    )
    header.extend(contact_els)
    header_rule_y = contact_bottom + 16.0
    header.append(_line(L, header_rule_y, W, 1, C['rule'], zIndex=2))
    # Name, photo slot, title, contacts, and divider stay out of section packing.
    header = [{**element, "flowRole": "masthead"} for element in header]
    # Append the band anchor AFTER the masthead spread so its own flowRole
    # ("masthead-anchor") survives instead of being overwritten to "masthead".
    header.append(build_contact_band_anchor(contact_descriptor))
    # Re-point the name/title references at their post-comprehension copies
    # (see the comment above `name_index`) and tag them for the masthead
    # identity manager. Portico never bakes uppercase into the name or title.
    name_el = header[name_index] if name_index is not None else None
    title_el = header[title_index] if title_index is not None else None
    if name_el is not None:
        header.append(tag_masthead_identity(
            name_el, title_el,
            band_id="masthead-main", name_default_uppercase=False,
            title_default_uppercase=False, band_top=cursor_y + 10.0,
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
        # Section labels and record titles are both intentionally bold. The
        # shared experience-record helper already gives job positions this
        # weight; keeping the section chrome at regular weight made Portico's
        # hierarchy look visually inverted in a content-dense CV.
        heading = _text(label, label_fs, SECTION_FONT, C['accent'], L, y, zIndex=3, page=page, bold=True)
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

    BODY_FS, BODY_LH = (9.0, 12.0)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=11, title_lh=12, meta_fs=8.5, meta_lh=12,
            body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
        )

    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, BODY_FS, BODY_LH, SANS))
        section(lbl['summary'])
        # Summary is left-aligned like every other body section; only the
        # masthead (name / title / contact row) is centered.
        b.block(cv['summary'], L, W, BODY_FS, BODY_LH, C['body'], SANS)
        close_section()
    if cv.get('experience'):
        jobs = cv['experience']
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                title_fs=11, title_lh=12, meta_fs=8.5, meta_lh=12,
                body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body'], 'accent': C['accent']}, L, W, SANS,
                         fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], W, SANS, degree_fs=10.4, degree_lh=12,
                meta_fs=8.5, meta_lh=12, body_fs=9.0, body_lh=12,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                degree_fs=10.4, degree_lh=12, meta_fs=8.5, meta_lh=12,
                body_fs=9.0, body_lh=12,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()
    if _place_skills_section(
        b, cv, section, L, W, C['body'], SANS, 9.0, 12.0,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body'], 'accent': C['accent']}, L, W, SANS,
                     fs=9.0, lh=12.0, section_chrome_h=SECTION_CHROME)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True},
            {**_line(L, 800, W, 1, C['rule'], page=page), 'fixedToPage': True},
            {**_text(f'{page:02d}', 8, SANS, C['mute'], L + W - 15, 808, page=page), 'fixedToPage': True},
        ]
    return page_decorations + header + flow
