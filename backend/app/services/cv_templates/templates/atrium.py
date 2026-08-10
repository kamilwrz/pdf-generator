from __future__ import annotations

"""Atrium CV template generator.

A central-axis, editorial single column. Unlike Portico (the other centered
masthead) the *whole* section identity is centered — headings sit on the page
axis with a printer's-mark ornament instead of a left icon + full-width rule —
and the content column is narrower with heavier side margins. The visual
language is a "registration mark" system built only from thin `line` rules: a
crosshair terminates the masthead, and a short broken rule sits under each
centered heading. Body copy stays left-aligned inside the centered column for
readability. Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    _block,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section

from reportlab.pdfbase.pdfmetrics import stringWidth

from app.services.pdf_generator import PDF_Generator


def _centered_left(label: str, font: str, font_size: float, letter_spacing: float,
                   center_x: float) -> float:
    """Left X so `label` (rendered with `letter_spacing`) is centered on `center_x`.

    Section headings are plain ``text`` elements — the same category every other
    template's headings use, so the shared section packer / textarea reflow keep
    the heading glued to its body. Centering is therefore a matter of computing
    the left X from the real glyph width (ReportLab metrics, like the centered
    contact placer) plus the inter-letter tracking, never a wide centered
    ``textarea`` (which the generic reflow does not treat as chrome and would
    detach on any pack).
    """
    try:
        draw_font, _, _ = PDF_Generator._resolve_font(font, False, False)
        width = stringWidth(label, draw_font, font_size)
    except Exception:
        width = len(label) * font_size * 0.55
    width += max(0, len(label) - 1) * letter_spacing
    return center_x - width / 2.0


def _gen_atrium(cv: dict) -> list[dict]:
    """Centered-axis masthead + centered section identity; left-aligned body."""
    C = {
        'paper': '#FBFAF7', 'ink': '#242521', 'accent': '#556158',
        'mute': '#78796F', 'body': '#2C2C29', 'rule': '#E5E3DB',
        'display': 'PlayfairDisplay', 'sans': 'Montserrat', 'icon_theme': 'atrium',
        # Narrower content column, heavier symmetric margins than Portico
        # (L=76/W=443): stronger side whitespace gives the gallery feeling.
        'L': 90, 'W': 415,
    }
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
    ICON = C['icon_theme']
    ACCENT, RULE = (C['accent'], C['rule'])
    CENTER_X = L + W / 2.0  # 90 + 415/2 = 297.5, the page's true center
    lbl = _labels(cv)

    def _crosshair(center_x: float, y: float, *, page: int = 1) -> list[dict]:
        """Printer's registration mark: `────  +  ────`.

        Two thin hairlines flank a small plus built from a short horizontal and
        vertical rule. This is the masthead terminator — deliberately not a full
        header rule (Portico) and not a diamond/dot (Harbor/Axis/Tessera).
        """
        seg, gap, plus = 44.0, 13.0, 7.0
        return [
            _line(center_x - gap - seg, y, seg, 1, ACCENT, zIndex=2, page=page),
            _line(center_x + gap, y, seg, 1, ACCENT, zIndex=2, page=page),
            _line(center_x - plus / 2.0, y, plus, 1, ACCENT, zIndex=2, page=page),
            _line(center_x - 0.5, y - (plus - 1) / 2.0, 1, plus, ACCENT, zIndex=2, page=page),
        ]

    # ── Masthead (centered name / title / contact band) ──────────────────────
    name = _compact_text(cv.get('name'), 34)
    title = _compact_text(cv.get('title'), 60)
    name_fs, name_lh = (30, 34)
    title_fs, title_lh = (9.5, 13)

    header: list[dict] = []
    cursor_y = 62.0
    if name:
        name_h = Builder.measure_block(name, W, name_fs, name_lh, DISP, bold=True)
        header.append(_block(name, L, cursor_y, W, name_h, name_fs, name_lh, C['ink'], DISP,
                             zIndex=3, bold=True, align='center'))
        cursor_y += name_h + 9.0
    if title:
        title_h = Builder.measure_block(title, W, title_fs, title_lh, SANS)
        title_el = _block(title, L, cursor_y, W, title_h, title_fs, title_lh, ACCENT, SANS,
                          zIndex=3, align='center')
        title_el['letterSpacing'] = 2.4
        header.append(title_el)
        cursor_y += title_h

    contact_fs, contact_icon = (8.2, 11.5)
    contact_els, contact_bottom = _place_centered_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv, email_limit=42),
        center_x=CENTER_X,
        start_y=cursor_y + 15.0,
        max_width=W,
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=C['mute'],
        font=SANS,
        char_width=5.2,
        icon_gap=13.0,
        item_pad=16.0,
        line_step=15.0,
    )
    header.extend(contact_els)
    terminator_y = contact_bottom + 21.0
    header.extend(_crosshair(CENTER_X, terminator_y))
    # Masthead never joins section packing — a short phone line above a rule
    # would otherwise be mistaken for a heading by the rhythm knobs.
    header = [{**element, "flowRole": "masthead"} for element in header]

    # ── Section identity: centered heading + short broken rule (no icon) ──────
    # The heading is a plain `text` element (not a wide centered textarea), so it
    # participates in the shared section packer exactly like Cardinal/Nova/Portico
    # headings — centering is encoded in the computed left X, not the category.
    label_fs = 9.0
    label_ls = 1.9
    SECTION_CHROME = label_fs + 6 + get_spacing().after_rule + 6

    def section(label: str) -> None:
        y = b.y
        page = b.pg
        heading_x = _centered_left(label, SANS, label_fs, label_ls, CENTER_X)
        heading = _text(label, label_fs, SANS, ACCENT, heading_x, y, zIndex=3, page=page)
        heading['letterSpacing'] = label_ls
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        # Short broken rule ("── ──") centered on the axis, a few px below the
        # heading baseline. `text` renders with line-height 1, so its box is ~fs.
        sep_y = y + label_fs + 5.0
        seg, gap = (15.0, 6.0)
        for lx in (CENTER_X - gap / 2.0 - seg, CENTER_X + gap / 2.0):
            separator = _line(lx, sep_y, seg, 1, RULE, zIndex=2, page=page)
            separator['flowRole'] = 'section-chrome'
            b.els.append(separator)
        b.y = sep_y + 1 + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    start_y = terminator_y + 1.0 + SPACE_AFTER_HEADER_RULE
    b = Builder(start_y)

    BODY_FS, BODY_LH = (9.3, 13.4)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
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
                b, job, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
                body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body']}, L, W, SANS,
                        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], W, SANS, degree_fs=10.4, degree_lh=13,
                meta_fs=8.5, meta_lh=11.5, body_fs=9.2, body_lh=13.2,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
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
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS,
                    fs=9.3, lh=13.4, section_chrome_h=SECTION_CHROME)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        # Centered footer page number (Portico puts its number at the right edge).
        page_decorations.append(
            {**_text(f'{page:02d}', 8, SANS, C['mute'], CENTER_X - 6, 806, page=page),
             'fixedToPage': True}
        )
        # Continuation pages carry only a small centered crosshair near the top
        # edge instead of repeating the masthead.
        if page > 1:
            for mark in _crosshair(CENTER_X, 48, page=page):
                page_decorations.append({**mark, 'fixedToPage': True})
    return page_decorations + header + flow
