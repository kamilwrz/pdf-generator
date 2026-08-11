from __future__ import annotations

"""Cardinal CV template generator.

Cardinal is an image-free single-column composition with neutral line-art icons,
cardinal-red typography, and section rules that continue from the optical
midline of each heading. Icons begin on the body column instead of hanging into
the margin, giving every section one clean left edge.
"""

from app.services.cv_generator_primitives import get_spacing, SPACE_AFTER_HEADER_RULE, Builder, _line, _text
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section
from app.services.cv_templates.shared.icons import _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_wrapping_icon_contacts,
)

def _gen_cardinal(cv: dict) -> list[dict]:
    C = {'paper': '#FCFBF9', 'ink': '#24201E', 'accent': '#9E2532', 'mute': '#6E6E6E', 'body': '#333333', 'rule': '#8A8A8A', 'display': 'Times-Roman', 'sans': 'Helvetica', 'mono': 'Helvetica', 'layout': 'cardinal', 'icon_theme': 'cardinal', 'L': 72, 'W': 473, 'icon_x': 72, 'start': 162}
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
    ICON = C['icon_theme']
    lbl = _labels(cv)
    header: list[dict] = []
    skip_sidebar_extras: set[int] = set()
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 56)
    contact_fs, contact_icon = (8.6, 13.0)
    header = [_text(name, 30, DISP, C['ink'], L, 50, zIndex=3), _text(title, 9.6, SANS, C['accent'], L, 92, zIndex=3)]
    header[0]['letterSpacing'] = 0.15
    header[1]['letterSpacing'] = 1.55
    contact_els, contact_bottom = _place_wrapping_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv, email_limit=42),
        start_x=float(C['icon_x']),
        start_y=118.0,
        right_limit=545.0,
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=C['body'],
        font=SANS,
        char_width=5.4,
        icon_gap=16.0,
        item_pad=20.0,
        line_step=16.0,
    )
    header.extend(contact_els)
    header_rule_y = contact_bottom + 24.0
    header.append(_line(L, header_rule_y, W, 1, C['rule'], zIndex=2))
    # Keep the icon contact band out of applyFlowSpacing section membership.
    header = [{**element, "flowRole": "masthead"} for element in header]
    start_y = header_rule_y + 1.0 + SPACE_AFTER_HEADER_RULE
    b = Builder(start_y)
    label_fs = 11.2
    label_tracking = 1.05
    section_icon = 16.5
    heading_x = L + 22
    rule_height = 0.8
    # Inter Bold's cap height is 1490/2048 em. PDF text uses a baseline at
    # `top + 0.34em`, so the visible cap centre is near `top`, not `top + 0.5em`.
    # Half the rule thickness is removed to centre the rectangle itself.
    cap_midline_offset = label_fs * (0.34 - (1490 / 2048) / 2) - rule_height / 2
    SECTION_CHROME = label_fs + 10 + get_spacing().after_rule

    def section(label: str) -> None:
        """Place icon, label, and an optically centered trailing hairline."""
        key = _icon_key_for_label(label)
        y = b.y
        page = b.pg
        icon = _icon_beside(ICON, key, L, y, label_fs, section_icon, page=page)
        icon['flowRole'] = 'section-chrome'
        b.els.append(icon)
        heading = _text(label, label_fs, SANS, C['accent'], heading_x, y, zIndex=3, page=page)
        heading['letterSpacing'] = label_tracking
        heading['bold'] = True
        heading['flowRole'] = 'section-chrome'
        # Authored chrome depth before after_rule. The trailing midline hairline
        # sits beside the label (not under it), so applyFlowSpacing must read
        # this height — otherwise chromeBottom collapses to fontSize×1.35 and
        # "Pod nagłówkiem" appears to measure from the misplaced hairline.
        heading['height'] = label_fs + 10
        b.els.append(heading)
        # Approximate the tracked cap width so the rule starts after the label
        # with a stable 14 pt breathing gap. The rule sits at cap mid-height,
        # turning heading and line into one horizontal composition.
        label_width = len(label) * (label_fs * 0.58 + label_tracking)
        rule_left = min(heading_x + label_width + 14, L + W - 54)
        rule = _line(
            rule_left, y + cap_midline_offset, L + W - rule_left, rule_height,
            C['rule'], page=page,
        )
        rule['flowRole'] = 'section-chrome'
        # Opt-in signal for the shared packer: this hairline lives on the
        # heading midline, so after_rule must not treat it as chromeBottom.
        rule['chromeAlign'] = 'midline'
        b.els.append(rule)
        b.y = y + label_fs + 10
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)
    BODY_FS, BODY_LH = (9.6, 13.8)

    def experience_height(job: dict) -> float:
        meta_font = SANS
        return _experience_record_height(b, job, W, SANS, title_fs=11.2, title_lh=13.8, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=meta_font)
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
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS, title_fs=11.2, title_lh=13.8, meta_fs=8.5, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS, after_gap=get_spacing().record if index < len(jobs) - 1 else None)
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
        b, cv, section, L, W, C['body'], SANS, BODY_FS, BODY_LH,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH, skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [{**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(72, 800, 473, 1, C['rule'], page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['mute'], 522, 806, page=page), 'fixedToPage': True}]
    return page_decorations + header + flow
