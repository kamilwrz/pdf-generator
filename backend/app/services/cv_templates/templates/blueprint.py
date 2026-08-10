from __future__ import annotations

"""Blueprint CV template generator.

A technical-schematic single column, adapted from the "Industry" Claude
Design system (steel-blue accent, square corners, hairline "+" registration
marks on framed objects). The masthead sits inside a bordered frame with a
crosshair mark at each corner, echoing the source system's `.blueprint` /
`.corner` component. Section headings are left-aligned condensed labels on a
full-column hairline rule (accent-300); experience and education records put
their date on the same row as the title, right-aligned, like the design's
`.role` pattern. Skills render as square outline tags and languages as a
bordered row list with filled proficiency badges — both distinct component
shapes from every other single-column template, drawn with the shared
``_rect``/`_line`/`_text` primitives rather than new canvas categories.

Font note: the source design specifies Barlow Condensed (headings) over
Barlow (body). Neither is among this app's registered PDF/canvas font
families (see `pdf_generator.py`'s font registration block and
`canvasFont.js`), and adding a new family touches shared font
infrastructure used by every template. Inter — the closest registered
grotesk to Barlow's proportions — stands in for both, with bold, uppercase,
wide-letter-spaced headings approximating the condensed, technical feel.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _line,
    _rect,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _measured_text_width,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import (
    _education_bullet_items,
    _education_school,
)
from app.services.cv_templates.shared.text import (
    _bullets,
    _clean_list_items,
    _compact_text,
    _contact_line,
    _extra_section_kind,
    _labels,
)
from app.services.cv_data import skill_groups


def _gen_blueprint(cv: dict) -> list[dict]:
    """Framed masthead, ruled section labels, tag/badge chip components."""
    C = {
        'paper': '#F2F2F3', 'ink': '#1D1F20',
        'accent': '#5980A6', 'accent_deep': '#416180', 'accent_pale': '#B5D9FD',
        'neutral_700': '#5D5D60', 'neutral_800': '#424244', 'neutral_200': '#E7E7EA',
        'badge_bg': '#EEF6FF', 'badge_ink': '#2C455D',
        'sans': 'Inter',
        # 76 pt side margins keep the modular-grid feel of the source system's
        # wide gutters without starving the record column on A4.
        'L': 76, 'W': 443,
    }
    L, W = (C['L'], C['W'])
    SANS = C['sans']
    lbl = _labels(cv)

    # ── Corner registration marks: two hairlines per corner forming a small
    # "+", straddling the point they mark (matches `.corner::before/::after`,
    # which centers an 11px cross on each border corner via a -6px offset).
    def _corner_marks(x: float, y: float, w: float, h: float, color: str, *,
                       size: float = 10.0, stroke: float = 1.0, page: int = 1) -> list[dict]:
        marks: list[dict] = []
        for cx, cy in ((x, y), (x + w, y), (x, y + h), (x + w, y + h)):
            marks.append(_line(cx - stroke / 2.0, cy - size / 2.0, stroke, size, color, zIndex=3, page=page))
            marks.append(_line(cx - size / 2.0, cy - stroke / 2.0, size, stroke, color, zIndex=3, page=page))
        return marks

    # ── Masthead: name / title / contact framed in a bordered "blueprint"
    # box, corner marks outside the border (mirrors the source `.blueprint`
    # wrapper around the CV's header block). ────────────────────────────────
    FRAME_PAD_X, FRAME_PAD_Y = (20.0, 18.0)
    FRAME_TOP = 48.0
    inner_x = L + FRAME_PAD_X
    inner_w = W - FRAME_PAD_X * 2.0

    name = _compact_text(cv.get('name'), 34)
    title = _compact_text(cv.get('title'), 60).upper()
    contact = _compact_text(_contact_line(cv), 150)

    NAME_FS, NAME_LH = (27.0, 31.0)
    TITLE_FS, TITLE_LH = (11.5, 15.0)
    CONTACT_FS, CONTACT_LH = (9.4, 13.5)

    header: list[dict] = []
    cursor_y = FRAME_TOP + FRAME_PAD_Y
    if name:
        name_h = Builder.measure_block(name, inner_w, NAME_FS, NAME_LH, SANS, bold=True)
        header.append({
            'category': 'textarea', 'content': name, 'left': inner_x, 'top': cursor_y,
            'width': inner_w, 'height': name_h, 'fontSize': NAME_FS, 'lineHeight': NAME_LH,
            'letterSpacing': 0, 'color': C['ink'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': True, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += name_h + 4.0
    if title:
        title_h = Builder.measure_block(title, inner_w, TITLE_FS, TITLE_LH, SANS)
        title_el = {
            'category': 'textarea', 'content': title, 'left': inner_x, 'top': cursor_y,
            'width': inner_w, 'height': title_h, 'fontSize': TITLE_FS, 'lineHeight': TITLE_LH,
            'letterSpacing': 1.8, 'color': C['accent_deep'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        }
        header.append(title_el)
        cursor_y += title_h + 10.0
    if contact:
        contact_h = Builder.measure_block(contact, inner_w, CONTACT_FS, CONTACT_LH, SANS)
        header.append({
            'category': 'textarea', 'content': contact, 'left': inner_x, 'top': cursor_y,
            'width': inner_w, 'height': contact_h, 'fontSize': CONTACT_FS, 'lineHeight': CONTACT_LH,
            'letterSpacing': 0, 'color': C['neutral_800'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += contact_h

    frame_bottom = cursor_y + FRAME_PAD_Y
    frame_height = frame_bottom - FRAME_TOP
    header.append(_rect(L, FRAME_TOP, W, frame_height, C['accent_pale'], borderWidth=1, zIndex=2, page=1))
    header.extend(_corner_marks(L, FRAME_TOP, W, frame_height, C['neutral_700'], page=1))
    # Masthead never joins section packing (matches every other template's
    # header — the frame/corner marks would otherwise be mistaken for chrome).
    header = [{**element, 'flowRole': 'masthead'} for element in header]

    # ── Section identity: condensed label + full-column hairline ─────────────
    LABEL_FS = 10.2
    SECTION_CHROME = LABEL_FS * 1.05 + 4.0 + 1.0 + get_spacing().after_rule

    def section(label: str) -> None:
        y = b.y
        page = b.pg
        heading = _text(label, LABEL_FS, SANS, C['accent_deep'], L, y, zIndex=3, page=page)
        heading['bold'] = True
        heading['letterSpacing'] = 1.2
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        rule_y = y + LABEL_FS * 1.05 + 4.0
        rule = _line(L, rule_y, W, 1, C['accent_pale'], zIndex=2, page=page)
        rule['flowRole'] = 'section-chrome'
        b.els.append(rule)
        b.y = rule_y + 1.0 + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    start_y = frame_bottom + 22.0
    b = Builder(start_y)

    BODY_FS, BODY_LH = (9.5, 13.8)
    TITLE_ROW_FS, TITLE_ROW_LH = (10.8, 13.8)
    SUBTITLE_FS, SUBTITLE_LH = (8.8, 12.2)
    META_FS = 8.3
    META_ZONE, ROW_GAP = (118.0, 10.0)

    # ── One record: bold title, date right-aligned on the same row (the
    # design's `.role` pattern), then an accent subtitle (company / school),
    # then a body block. Local to this template — no other generator shares
    # a same-row title/date layout, so it does not belong in shared/records.py.
    def _record_height(title: str, subtitle: str, body_content: str, *, bulleted: bool) -> float:
        stack = get_spacing().stack
        height = b.measure_block(title, W, TITLE_ROW_FS, TITLE_ROW_LH, SANS, bold=True, min_h=TITLE_ROW_LH)
        if subtitle:
            height += stack + b.measure_block(subtitle, W, SUBTITLE_FS, SUBTITLE_LH, SANS, min_h=SUBTITLE_LH)
        if body_content:
            height += stack + b.measure_block(
                body_content, W, BODY_FS, BODY_LH, SANS, bulletList=bulleted, min_h=BODY_LH,
            )
        return height

    def _place_record(title: str, period: str, subtitle: str, body_content: str, *,
                       bulleted: bool, after_gap: float | None) -> None:
        stack = get_spacing().stack
        height = _record_height(title, subtitle, body_content, bulleted=bulleted)
        placed = False
        with b.keep_together(height):
            row_y = b.y
            page = b.pg
            title_w = (W - META_ZONE - ROW_GAP) if period else W
            if title:
                b.block(title, L, title_w, TITLE_ROW_FS, TITLE_ROW_LH, C['ink'], SANS,
                        bold=True, min_h=TITLE_ROW_LH)
                placed = True
            if period:
                meta_w = _measured_text_width(period, SANS, META_FS) or (len(period) * META_FS * 0.56)
                meta_el = _text(period, META_FS, SANS, C['neutral_700'], L + W - meta_w, row_y, zIndex=3, page=page)
                b.els.append(meta_el)
            if subtitle:
                if placed:
                    b.gap(stack)
                b.block(subtitle, L, W, SUBTITLE_FS, SUBTITLE_LH, C['accent_deep'], SANS, min_h=SUBTITLE_LH)
                placed = True
            if body_content:
                if placed:
                    b.gap(stack)
                b.block(body_content, L, W, BODY_FS, BODY_LH, C['ink'], SANS,
                        bulletList=bulleted, min_h=BODY_LH)
                placed = True
        if after_gap is not None and placed:
            b.gap(after_gap)

    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, BODY_FS, BODY_LH, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, BODY_FS, BODY_LH, C['ink'], SANS)
        close_section()

    if cv.get('experience'):
        jobs = cv['experience']

        def _job_subtitle(job: dict) -> str:
            return '   ·   '.join(filter(None, [job.get('company'), job.get('city')]))

        first_h = _record_height(
            jobs[0].get('title', ''), _job_subtitle(jobs[0]), _bullets(jobs[0]), bulleted=True,
        )
        b.need_section(SECTION_CHROME, first_h)
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_record(
                job.get('title', ''), str(job.get('period') or '').strip(),
                _job_subtitle(job), _bullets(job), bulleted=True,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['ink']}, L, W, SANS,
                        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)

    if cv.get('education'):
        education_entries = cv['education']

        def _edu_body(edu: dict) -> str:
            # Plain prose, not a bullet list — matches the source design's
            # `<p>` description under each diploma (no glyph column).
            return '\n'.join(_education_bullet_items(edu))

        first_h = _record_height(
            education_entries[0].get('degree', ''),
            _education_school(education_entries[0]),
            _edu_body(education_entries[0]), bulleted=False,
        )
        b.need_section(SECTION_CHROME, first_h)
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_record(
                str(edu.get('degree') or '').strip(), str(edu.get('period') or '').strip(),
                _education_school(edu), _edu_body(edu), bulleted=False,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    # ── Skills: square outline tags, wrap-packed left to right (the design's
    # `.tag-outline` chips) — a flat tray, not the grouped category layout
    # `_place_skills_section` draws for other templates. ─────────────────────
    TAG_FS = 8.5
    TAG_PAD_X, TAG_PAD_Y = (9.0, 4.0)
    TAG_GAP, TAG_ROW_GAP = (7.0, 7.0)
    TAG_ROW_H = TAG_FS + TAG_PAD_Y * 2.0

    def _skill_chip_width(text: str) -> float:
        measured = _measured_text_width(text, SANS, TAG_FS)
        return (measured if measured is not None else len(text) * TAG_FS * 0.56) + TAG_PAD_X * 2.0

    def _pack_skill_rows(chips: list[str]) -> list[list[tuple[str, float]]]:
        rows: list[list[tuple[str, float]]] = [[]]
        row_w = 0.0
        for chip in chips:
            chip_w = _skill_chip_width(chip)
            if rows[-1] and row_w + TAG_GAP + chip_w > W:
                rows.append([])
                row_w = 0.0
            if rows[-1]:
                row_w += TAG_GAP
            rows[-1].append((chip, chip_w))
            row_w += chip_w
        return [row for row in rows if row]

    skill_chips: list[str] = []
    for group in skill_groups(cv.get('skills')):
        skill_chips.extend(_clean_list_items(group.get('items')))

    if skill_chips:
        rows = _pack_skill_rows(skill_chips)
        rows_h = len(rows) * TAG_ROW_H + max(len(rows) - 1, 0) * TAG_ROW_GAP
        b.need_section(SECTION_CHROME, rows_h)
        section(lbl['skills'])
        page = b.pg
        y = b.y
        for row in rows:
            x = L
            for chip, chip_w in row:
                b.els.append(_rect(x, y, chip_w, TAG_ROW_H, C['accent'], borderWidth=1, zIndex=2, page=page))
                b.els.append(_text(chip, TAG_FS, SANS, C['accent'], x + TAG_PAD_X, y + TAG_PAD_Y - 0.5,
                                    zIndex=3, page=page))
                x += chip_w + TAG_GAP
            y += TAG_ROW_H + TAG_ROW_GAP
        b.y = y - TAG_ROW_GAP
        close_section()

    # ── Languages: bordered row list with a filled proficiency badge (the
    # design's `.lang-row` + `.tag-accent`) — a distinct component from the
    # skill tags above, so it is not folded into the same tray. ─────────────
    LANG_FS = 9.8
    LANG_PAD_Y = 6.5
    LANG_ROW_H = LANG_FS + LANG_PAD_Y * 2.0
    BADGE_FS = 8.0
    BADGE_PAD_X, BADGE_PAD_Y = (8.0, 3.0)

    languages: list[tuple[str, str]] = []
    for entry in cv.get('languages') or []:
        if isinstance(entry, dict):
            name_part = str(entry.get('name') or '').strip()
            level_part = str(entry.get('level') or '').strip()
        else:
            name_part, level_part = str(entry or '').strip(), ''
        if name_part:
            languages.append((name_part, level_part))

    if languages:
        rows_h = LANG_ROW_H * len(languages)
        b.need_section(SECTION_CHROME, rows_h)
        # No AI-supplied label exists for this section (DEFAULT_LABELS covers
        # only summary/experience/education/skills) — every template hardcodes
        # the Polish default here, matching `axis.py`'s precedent.
        section('JĘZYKI')
        page = b.pg
        y = b.y
        for index, (name_part, level_part) in enumerate(languages):
            name_el = _text(name_part, LANG_FS, SANS, C['ink'], L, y + LANG_PAD_Y, zIndex=3, page=page)
            # A short label sitting ~16px above a full-width divider otherwise
            # matches the untagged "heading + rule below" heuristic in
            # `sectionStructure.js` (isSectionHeading) and gets mistaken for a
            # phantom section title on every row but the last.
            name_el['flowRole'] = 'content'
            b.els.append(name_el)
            if level_part:
                badge_w = (
                    _measured_text_width(level_part, SANS, BADGE_FS) or len(level_part) * BADGE_FS * 0.6
                ) + BADGE_PAD_X * 2.0
                badge_h = BADGE_FS + BADGE_PAD_Y * 2.0
                badge_x = L + W - badge_w
                badge_y = y + (LANG_ROW_H - badge_h) / 2.0
                b.els.append({
                    **_rect(badge_x, badge_y, badge_w, badge_h, C['badge_bg'], borderWidth=0, zIndex=2, page=page),
                    'filled': True,
                })
                b.els.append(_text(level_part, BADGE_FS, SANS, C['badge_ink'], badge_x + BADGE_PAD_X,
                                    badge_y + BADGE_PAD_Y - 0.5, zIndex=3, page=page))
            if index < len(languages) - 1:
                divider = _line(L, y + LANG_ROW_H, W, 1, C['neutral_200'], zIndex=2, page=page)
                divider['flowRole'] = 'section-chrome'
                b.els.append(divider)
            y += LANG_ROW_H
        b.y = y
        close_section()

    # Extra / custom sections. `languages` and `skills` kinds are already
    # rendered above from their dedicated components, so they are skipped
    # here to avoid a duplicate plain-bullet render of the same data.
    skip_after_skills = {
        index for index, extra in enumerate(cv.get('extra_sections') or [])
        if _extra_section_kind(extra) in ('languages', 'skills')
    }
    _extra_sections(b, cv, 'after_skills', section, {'body': C['ink']}, L, W, SANS,
                    fs=BODY_FS, lh=BODY_LH, skip_indices=skip_after_skills,
                    section_chrome_h=SECTION_CHROME)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        # Continuation pages carry no repeated frame/corner marks — only a
        # quiet footer rule and page number, matching every other template's
        # "chrome once, on page 1 only" convention.
        page_decorations.append(
            {**_line(L, 783, W, 1, C['accent_pale'], zIndex=2, page=page), 'fixedToPage': True}
        )
        page_decorations.append(
            {**_text(f'{page:02d}', 8, SANS, C['neutral_700'], L + W - 14, 791, page=page),
             'fixedToPage': True}
        )
    return page_decorations + header + flow
