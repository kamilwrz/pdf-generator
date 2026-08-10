from __future__ import annotations

"""Axis CV template generator (single-column timeline with a date gutter).

Mirrors the Enhancv "Oś czasu" (timeline) layout: a left-aligned masthead with
an orange accent, then sections whose Experience / Education records use a
three-band row — a narrow left date gutter, a filled marker dot with a vertical
connecting line, and the wide content column (teal role/degree titles + orange
company/school names). Summary, Skills, Languages, and extra "tools" sections
span the full content width.

The date gutter, marker dots and connecting lines are emitted as
``flowRole="record-overlay"`` elements: they are anchored to the record's top Y
in a different X column and therefore follow the record on reflow / pagination
without adding to its measured vertical height (the same mechanism Harbor uses
for its per-record date + location row).
"""

from reportlab.pdfbase.pdfmetrics import stringWidth

from app.services.cv_generator_primitives import (
    Builder,
    SPACE_AFTER_HEADER_RULE,
    get_spacing,
    section_chrome_height,
    _block,
    _circle,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import _contact_channel_items
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.records import (
    _education_bullets,
    _education_school,
)
from app.services.cv_templates.shared.text import _bullets, _compact_text, _labels
from app.services.pdf_generator import PDF_Generator


def _text_width(value: str, font: str, fs: float) -> float:
    """Rendered width of a label in points (falls back to a char estimate).

    Used for the wrapping skill chips and language columns so their underlines
    and column breaks line up with the real glyph extent rather than a guess.
    """
    try:
        draw_font, _, _ = PDF_Generator._resolve_font(font, False, False)
        return stringWidth(value, draw_font, fs)
    except Exception:
        return len(value) * fs * 0.55


def _gen_axis(cv: dict) -> list[dict]:
    C = {
        'navy': '#1B3357',    # name, section headings, dates, marker dots
        'orange': '#E2740C',  # title, company, school, diamonds, contact icons
        'teal': '#2E7391',    # role / degree titles, language names, skill chips
        'body': '#3D3D3D',    # summary and bullet copy
        'meta': '#8A8A8A',    # city / muted meta
        'rule': '#D7DBE0',    # header rule, timeline line, skill underlines
        'paper': '#FFFFFF',
        'icon_theme': 'axis',
    }
    SANS = 'Inter'
    ICON = C['icon_theme']
    lbl = _labels(cv)

    # ── Geometry (A4 595×842) ───────────────────────────────────────────────
    L = 54                 # page content left edge / section headings
    R = 541                # content right edge
    W = R - L              # 487 full-width column (summary, skills, languages)
    DATE_X = 54            # date gutter left
    DATE_W = 100           # gutter width (fits "01/2025 - 05/2025")
    DOT_D = 7              # marker dot diameter
    DOT_LEFT = 158         # dot left; centre ≈ 161.5
    LINE_X = 161           # vertical connecting line
    CONTENT_X = 182        # record content column left
    CONTENT_W = R - CONTENT_X  # 359

    # ── Header ──────────────────────────────────────────────────────────────
    name = _compact_text(cv.get('name'), 34).upper()
    title = _compact_text(cv.get('title'), 60)
    header: list[dict] = [
        {**_text(name, 23, SANS, C['navy'], L, 50, zIndex=3, bold=True), 'letterSpacing': 0.4},
        {**_text(title, 11.5, SANS, C['orange'], L, 82, zIndex=3, bold=True), 'letterSpacing': 0.3},
    ]
    # Single contact row that wraps to a second line for long / many channels so
    # real data never overruns the right margin. Orange icons sit on the label's
    # text line; both stay tagged "masthead" so rhythm packing does not mistake a
    # short phone value above the header rule for a section heading.
    contact_fs, contact_icon = 8.6, 11.0
    cx, cy = float(L), 104.0
    for key, value in _contact_channel_items(cv, email_limit=42, social_limit=36):
        if not value:
            continue
        advance = contact_icon + 4 + _text_width(value, SANS, contact_fs) + 16
        if cx > L and cx + advance > R:
            cx, cy = float(L), cy + 15
        header.append({
            **_icon(ICON, key, cx, cy, contact_icon, page=1),
            'flowRole': 'masthead',
        })
        header.append({
            **_text(value, contact_fs, SANS, C['body'], cx + contact_icon + 4, cy, zIndex=3),
            'flowRole': 'masthead',
        })
        cx += advance
    header = [{**element, 'flowRole': element.get('flowRole') or 'masthead'} for element in header]
    header_rule_y = cy + 20
    header.append({
        **_line(L, header_rule_y, W, 1, C['rule'], zIndex=2),
        'flowRole': 'masthead',
    })

    start_y = header_rule_y + 1.0 + SPACE_AFTER_HEADER_RULE
    b = Builder(start_y)
    HEAD_FS = 9.6
    SECTION_CHROME = section_chrome_height(HEAD_FS)

    def section(label: str) -> None:
        """Navy bold section heading (no underline rule — matches the reference)."""
        y = b.y
        page = b.pg
        heading = _text(label, HEAD_FS, SANS, C['navy'], L, y, zIndex=3, page=page, bold=True)
        heading['letterSpacing'] = 0.8
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        b.y = y + HEAD_FS * 1.35
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    # ── Timeline record (Experience / Education share this shape) ────────────
    def _place_gutter(top: float, page: int, period: str, city: str,
                      content_bottom: float, connect: bool) -> None:
        """Emit the left date gutter, marker dot and connecting line as overlays.

        All elements use ``record-overlay`` so they ride the record's top Y in
        the gutter column without inflating its measured height. When
        ``connect`` is True the vertical line extends one record gap past the
        content so consecutive markers read as one continuous timeline.
        """
        if period:
            date_el = _block(period, DATE_X, top, DATE_W, 11, 8.4, 11, C['navy'], SANS,
                             zIndex=3, page=page, bold=True)
            date_el['autoHeight'] = False
            date_el['flowRole'] = 'record-overlay'
            b.els.append(date_el)
        if city:
            city_el = _block(city, DATE_X, top + 12, DATE_W, 11, 8.0, 10.5, C['meta'], SANS,
                             zIndex=3, page=page)
            city_el['autoHeight'] = False
            city_el['flowRole'] = 'record-overlay'
            b.els.append(city_el)
        dot = _circle(DOT_LEFT, top + 3, DOT_D, C['navy'], filled=True, zIndex=3, page=page)
        dot['flowRole'] = 'record-overlay'
        b.els.append(dot)
        line_top = top + 3 + DOT_D
        line_bottom = content_bottom + (get_spacing().record if connect else 0.0)
        if line_bottom > line_top + 1:
            connector = _line(LINE_X, line_top, 1, line_bottom - line_top, C['rule'],
                              zIndex=2, page=page)
            connector['flowRole'] = 'record-overlay'
            b.els.append(connector)

    def _timeline_record(top_lines: list[tuple[str, float, float, str, bool]],
                         bullets: str, period: str, city: str, connect: bool) -> None:
        """Place one timeline record: content column + gutter overlays.

        ``top_lines`` is an ordered list of (text, fontSize, lineHeight, color,
        bold) rows drawn in the content column (role/degree title, company /
        school). ``bullets`` is the optional bullet block below them.
        """
        height = 0.0
        for text, fs, lh, _color, is_bold in top_lines:
            if not text:
                continue
            if height:
                height += get_spacing().stack
            height += b.measure_block(text, CONTENT_W, fs, lh, SANS, bold=is_bold, min_h=lh)
        if bullets:
            if height:
                height += get_spacing().stack
            height += b.measure_block(bullets, CONTENT_W, 9, 13.4, SANS, bulletList=True)

        with b.keep_together(height):
            top, page = b.y, b.pg
            placed = False
            for text, fs, lh, color, is_bold in top_lines:
                if not text:
                    continue
                if placed:
                    b.gap(get_spacing().stack)
                b.block(text, CONTENT_X, CONTENT_W, fs, lh, color, SANS, bold=is_bold, min_h=lh)
                placed = True
            if bullets:
                if placed:
                    b.gap(get_spacing().stack)
                b.block(bullets, CONTENT_X, CONTENT_W, 9, 13.4, C['body'], SANS, bulletList=True)
            content_bottom = b.y
            _place_gutter(top, page, period, city, content_bottom, connect)

    def _timeline_height(top_lines: list[tuple[str, float, float, str, bool]], bullets: str) -> float:
        height = 0.0
        for text, fs, lh, _color, is_bold in top_lines:
            if not text:
                continue
            if height:
                height += get_spacing().stack
            height += b.measure_block(text, CONTENT_W, fs, lh, SANS, bold=is_bold, min_h=lh)
        if bullets:
            if height:
                height += get_spacing().stack
            height += b.measure_block(bullets, CONTENT_W, 9, 13.4, SANS, bulletList=True)
        return height

    # ── Skill chips (wrapping row with an underline under each chip) ─────────
    def _place_skill_chips(skills: list[str]) -> None:
        chip_fs = 9.0
        row_step = 24.0
        pad = 22.0
        b.need(row_step)
        cx = float(L)
        cy = b.y
        for skill in skills:
            text_w = _text_width(skill, SANS, chip_fs)
            advance = text_w + pad
            if cx > L and cx + advance > R:
                cx = float(L)
                cy += row_step
            b.els.append(_text(skill, chip_fs, SANS, C['teal'], cx, cy, zIndex=3, page=b.pg))
            b.els.append(_line(cx, cy + 13, text_w + 4, 1, C['rule'], zIndex=2, page=b.pg))
            cx += advance
        b.y = cy + row_step

    # ── Language columns (name in teal, level in muted grey) ─────────────────
    def _place_languages(languages: list) -> None:
        lines: list[tuple[str, str]] = []
        for language in languages:
            if isinstance(language, dict):
                lang_name = str(language.get('name') or '').strip()
                level = str(language.get('level') or '').strip()
            else:
                lang_name, level = str(language or '').strip(), ''
            if lang_name:
                lines.append((lang_name, level))
        if not lines:
            return
        columns = 3
        col_w = W / columns
        row_step = 16.0
        b.need(row_step)
        cy = b.y
        for index, (lang_name, level) in enumerate(lines):
            col = index % columns
            if col == 0 and index > 0:
                cy += row_step
            x = L + col * col_w
            b.els.append(_text(lang_name, 9.0, SANS, C['teal'], x, cy, zIndex=3, page=b.pg, bold=True))
            if level:
                level_w = _text_width(level, SANS, 9.0)
                b.els.append(_text(level, 9.0, SANS, C['meta'], x + col_w - level_w - 18, cy, zIndex=3, page=b.pg))
        b.y = cy + row_step

    # ── Diamond "tools" list (orange diamond + teal item) ────────────────────
    def _place_diamond_list(items: list[str]) -> None:
        for item in items:
            b.need(15.0)
            y, page = b.y, b.pg
            icon = _icon(ICON, 'diamond', L, y, 9, page=page)
            icon['flowRole'] = 'record-overlay'
            b.els.append(icon)
            b.els.append(_text(item, 9.4, SANS, C['teal'], L + 16, y, zIndex=3, page=page, bold=True))
            b.y = y + 15.0

    # ── Summary ──────────────────────────────────────────────────────────────
    # Summary uses the same 9 pt as the experience bullets (project-wide rule,
    # enforced by test_summary_matches_experience_body_type_size).
    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, 9.0, 13.4, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, 9.0, 13.4, C['body'], SANS)
        close_section()

    # ── Experience (timeline) ────────────────────────────────────────────────
    if cv.get('experience'):
        jobs = cv['experience']
        first_lines = [
            (jobs[0].get('title', ''), 11.0, 14.0, C['teal'], True),
            (jobs[0].get('company', ''), 9.5, 12.5, C['orange'], True),
        ]
        b.need_section(SECTION_CHROME, _timeline_height(first_lines, _bullets(jobs[0])))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _timeline_record(
                [
                    (job.get('title', ''), 11.0, 14.0, C['teal'], True),
                    (job.get('company', ''), 9.5, 12.5, C['orange'], True),
                ],
                _bullets(job),
                str(job.get('period') or '').strip(),
                str(job.get('city') or '').strip(),
                connect=index < len(jobs) - 1,
            )
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        close_section()

    # ── Education (timeline) ─────────────────────────────────────────────────
    if cv.get('education'):
        entries = cv['education']

        def _edu_lines(edu: dict) -> list[tuple[str, float, float, str, bool]]:
            return [
                (str(edu.get('degree') or '').strip(), 10.6, 13.5, C['teal'], True),
                (_education_school(edu), 9.5, 12.5, C['orange'], True),
            ]

        b.need_section(SECTION_CHROME, _timeline_height(_edu_lines(entries[0]), _education_bullets(entries[0])))
        section(lbl['education'])
        for index, edu in enumerate(entries):
            _timeline_record(
                _edu_lines(edu),
                _education_bullets(edu),
                str(edu.get('period') or '').strip(),
                str(edu.get('city') or '').strip(),
                connect=index < len(entries) - 1,
            )
            if index < len(entries) - 1:
                b.gap(get_spacing().record)
        close_section()

    # ── Skills ───────────────────────────────────────────────────────────────
    if cv.get('skills'):
        skills = [str(skill).strip() for skill in cv['skills'] if str(skill).strip()]
        if skills:
            b.need_section(SECTION_CHROME, 24.0)
            section(lbl['skills'])
            _place_skill_chips(skills)
            close_section()

    # ── Languages ─────────────────────────────────────────────────────────────
    if cv.get('languages'):
        b.need_section(SECTION_CHROME, 16.0)
        section('JĘZYKI')
        _place_languages(cv['languages'])
        close_section()

    # ── Extra / custom sections as diamond lists (certifications, interests,
    # projects, …). `languages` is already rendered above from cv['languages'].
    # Generic skills aliases are folded into cv['skills'] by normalize_cv_data,
    # so kind 'skills' is skipped here. Distinct skill families (soft/hard/tools)
    # stay as kind 'other' and must still render below.
    from app.services.cv_templates.shared.extras import _flatten_extra_items
    from app.services.cv_templates.shared.text import _extra_section_kind

    def _render_extra(container: list) -> None:
        for extra in container or []:
            if _extra_section_kind(extra) in ('languages', 'skills'):
                continue
            items = _flatten_extra_items(extra.get('items'))
            extra_title = str(extra.get('title') or '').strip().upper()
            if not extra_title or not items:
                continue
            b.need_section(SECTION_CHROME, 15.0)
            section(extra_title)
            _place_diamond_list(items)
            close_section()

    # normalize_cv_data mirrors the same list into both `extra_sections` and
    # `custom_sections`; render only one to avoid duplicating every section.
    _render_extra(cv.get('extra_sections'))

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True},
            {**_line(L, 806, W, 1, C['rule'], zIndex=2, page=page), 'fixedToPage': True},
            {**_text(f'{page:02d}', 8, SANS, C['meta'], R - 15, 812, page=page), 'fixedToPage': True},
        ]
    return page_decorations + header + flow
