from __future__ import annotations

"""Manifest CV template generator.

A flat, architectural sidebar layout adapted from the "Modernist" Claude
Design system: near-mono red (`#EC3013`) on ink/paper, zero corner radius,
strong 2px rules, Archivo-style heavy display type, a dark inverted header
band, and a light sidebar rail separated from the main column by a solid
divider. Proportions are carried over from the source design's own A4 page
(CSS px) to this app's A4 canvas (points) via the standard 0.75 (72/96 dpi)
ratio, since both are literally "A4".

Layout is a proven two-column shape (sidebar + main), the same structural
family as Tessera/Slate/Harbor: sidebar content is placed at literal,
manually-sequenced Y coordinates on page 1 only, using `_sidebar_candidates`
/ `_fit_sidebar_sections` (the same shared "fit complete sections into the
rail, spill overflow to main" mechanism Tessera uses). The main column uses
an ordinary `Builder` flow with the same left-anchored heading + full-width
rule shape every single-column template uses.

Font note: the source design specifies Archivo throughout. It is not among
this app's 8 registered PDF/canvas font families (see `blueprint.py`'s
module docstring for the full rationale behind substituting a registered
grotesk); Roboto stands in here — a different registered grotesk than
Blueprint's Inter, so the two templates read as distinct despite both
substituting for an unavailable display sans.

Packer-safety note (see `blueprint.py`'s module docstring for the discovery):
`sectionStructure.js`'s structural packer re-stacks a section's body content
sequentially by reading order on every Add Section / reorder / rhythm
change, with no concept of two elements sharing one visual row. The source
design's per-record "large ordinal number beside the role" and per-language
"five-segment proficiency bar" are both same-row, multi-element patterns
that would corrupt under that packer exactly like Blueprint's reverted
same-row date and tag/badge rows did. Both were adapted to safe,
one-element-per-row shapes: the ordinal is folded into the title text
("01 · Senior AML Analyst…", one textarea) and language proficiency is
folded into the sidebar's plain bulleted "Name — Level" line. The sidebar
column itself is a distinct case: kickers are tagged
`flowRole: "sidebar-chrome"` with `flowLane: "sidebar"`, so they never enter
`listDocumentSections` / the main packer (see `sectionStructure.js`'s
`sameColumnAsHeading` and `packSidebarLane`). Density knobs retarget the
rail on an independent vertical cursor; the Sections panel still does not
list or reorder sidebar blocks. Sidebar content is still built as a plain
top-to-bottom sequence here regardless.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import _measured_text_width
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _sidebar_candidates,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _place_education_record,
)
from app.services.cv_templates.shared.text import (
    _bullets,
    _compact_text,
    _labels,
    _place_skills_section,
)

# CSS px (the source design's own A4 page, 96 dpi) -> canvas pt (A4, 72 dpi).
PX = 0.75


def _gen_manifest(cv: dict) -> list[dict]:
    """Inverted header band, light sidebar rail, ruled main column."""
    C = {
        'paper': '#F3F2F2', 'ink': '#201E1D',
        'accent': '#EC3013', 'accent_deep': '#AE1800',
        'sidebar_bg': '#F8F4F4', 'neutral_700': '#605D5D',
        'sans': 'Roboto',
        'L': 42,
    }
    L = C['L']
    SANS = C['sans']
    lbl = _labels(cv)

    SIDEBAR_W = round(240 * PX)          # 180
    DIVIDER_W = 2
    SIDE_L = round(56 * PX)              # 42
    SIDE_W = SIDEBAR_W - SIDE_L - round(32 * PX)  # 180-42-24 = 114
    MAIN_L = SIDEBAR_W + DIVIDER_W + round(40 * PX)  # 212
    MAIN_W = 595 - MAIN_L - round(56 * PX)           # 595-212-42 = 341

    # ── Header band: inverted (ink background, paper text), full width, page 1
    # only. Every element carries flowRole "masthead" — exempt from section
    # packing — so the two-column (name block / contact block) arrangement is
    # safe regardless of what the structural packer does elsewhere. ──────────
    HEAD_PAD_X, HEAD_PAD_TOP, HEAD_PAD_BOTTOM = (round(56 * PX), round(48 * PX), round(40 * PX))
    NAME_FS, NAME_LH = (round(44 * PX), round(44 * PX * 1.05))
    EYEBROW_FS = round(11 * PX) + 0.3
    HEAD_TITLE_FS = round(15 * PX) + 0.25
    CONTACT_FS = round(13 * PX) + 0.25
    CONTACT_STEP = CONTACT_FS * 1.9

    name = _compact_text(cv.get('name'), 40)
    title = _compact_text(cv.get('title'), 60).upper()
    contact_lines = [value for value in (cv.get('email'), cv.get('phone'), cv.get('location')) if value]

    left_w = 595 - HEAD_PAD_X * 2 - 190  # leave room for the right-side contact column
    # PDF export paints in ARRAY order, not by `zIndex` (a canvas-editor-only
    # stacking hint) — the band background is appended first so it never
    # covers the name/title/contact text painted after it in the array.
    header: list[dict] = []
    cursor_y = HEAD_PAD_TOP
    header.append(_text('CURRICULUM VITAE', EYEBROW_FS, SANS, C['accent'], HEAD_PAD_X, cursor_y, zIndex=3, bold=True))
    header[-1]['letterSpacing'] = 2.2
    cursor_y += EYEBROW_FS * 1.3 + 8.0

    name_h = Builder.measure_block(name, left_w, NAME_FS, NAME_LH, SANS, bold=True)
    header.append({
        'category': 'textarea', 'content': name, 'left': HEAD_PAD_X, 'top': cursor_y,
        'width': left_w, 'height': name_h, 'fontSize': NAME_FS, 'lineHeight': NAME_LH,
        'letterSpacing': 0, 'color': C['paper'], 'fontFamily': SANS, 'zIndex': 3,
        'page': 1, 'bold': True, 'italic': False, 'align': 'left', 'bulletList': False,
        'autoHeight': True, 'preserveInitialLayout': True,
    })
    cursor_y += name_h + 6.0

    if title:
        title_h = Builder.measure_block(title, left_w, HEAD_TITLE_FS, HEAD_TITLE_FS * 1.3, SANS, bold=True)
        header.append({
            'category': 'textarea', 'content': title, 'left': HEAD_PAD_X, 'top': cursor_y,
            'width': left_w, 'height': title_h, 'fontSize': HEAD_TITLE_FS, 'lineHeight': HEAD_TITLE_FS * 1.3,
            'letterSpacing': 1.4, 'color': C['accent'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': True, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += title_h

    left_content_h = cursor_y - HEAD_PAD_TOP

    contact_x = 595 - HEAD_PAD_X
    right_cursor = HEAD_PAD_TOP + max(0.0, left_content_h - len(contact_lines) * CONTACT_STEP) if contact_lines else HEAD_PAD_TOP
    for value in contact_lines:
        line_w = _measured_text_width(value, SANS, CONTACT_FS) or (len(value) * CONTACT_FS * 0.56)
        header.append(_text(value, CONTACT_FS, SANS, C['paper'], contact_x - line_w, right_cursor, zIndex=3))
        right_cursor += CONTACT_STEP
    right_content_h = len(contact_lines) * CONTACT_STEP

    band_height = HEAD_PAD_TOP + max(left_content_h, right_content_h) + HEAD_PAD_BOTTOM
    band = _line(0, 0, 595, band_height, C['ink'], zIndex=1)
    header = [{**element, 'flowRole': 'masthead'} for element in [band, *header]]

    content_top = band_height + round(40 * PX)

    # ── Sidebar (page 1 only): summary placed unconditionally, then education /
    # languages / any other eligible extras fitted into the remaining budget via
    # the shared `_fit_sidebar_sections` (skills is excluded — it always renders
    # in the main column here, matching the source design). ──────────────────
    KICKER_FS = round(12 * PX) + 0.2
    # Same body type size as the main column (only the column WIDTH differs) —
    # `test_summary_matches_experience_body_type_size` requires the summary to
    # read at the same size as the experience body regardless of column.
    SIDE_BODY_FS, SIDE_BODY_LH = (round(13.5 * PX), round(round(13.5 * PX) * 1.4))

    def sidebar_kicker(label: str, top: float) -> list[dict]:
        heading = _text(label.upper(), KICKER_FS, SANS, C['ink'], SIDE_L, top, zIndex=3, bold=True)
        heading['letterSpacing'] = 1.1
        # Dedicated sidebar chrome role — never enters `listDocumentSections`
        # (main packer), but `packSidebarLane` / density knobs do retarget it.
        # See the module docstring's packer-safety note and sectionStructure.js.
        heading['flowRole'] = 'sidebar-chrome'
        rule = _line(SIDE_L, top + KICKER_FS * 1.2 + 4.0, SIDE_W, 2, C['ink'])
        rule['flowRole'] = 'sidebar-chrome'
        return [heading, rule]

    sidebar: list[dict] = []
    cursor = content_top
    if cv.get('summary'):
        sidebar.extend(sidebar_kicker(lbl['summary'], cursor))
        body_top = cursor + KICKER_FS * 1.2 + 4.0 + 2.0 + 8.0
        body_h = Builder.measure_block(cv['summary'], SIDE_W, SIDE_BODY_FS, SIDE_BODY_LH, SANS)
        sidebar.append({
            'category': 'textarea', 'content': cv['summary'], 'left': SIDE_L, 'top': body_top,
            'width': SIDE_W, 'height': body_h, 'fontSize': SIDE_BODY_FS, 'lineHeight': SIDE_BODY_LH,
            'letterSpacing': 0, 'color': C['ink'], 'fontFamily': SANS, 'zIndex': 3, 'page': 1,
            'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor = body_top + body_h + round(32 * PX)

    candidates = [c for c in _sidebar_candidates(cv, lbl) if c.get('kind') != 'skills']
    fitted_sections, sidebar_keys = _fit_sidebar_sections(
        candidates, width=SIDE_W, start_y=cursor, bottom_y=760,
    )
    sidebar_extra_indices = {
        section['extra_index']
        for section in fitted_sections
        if isinstance(section.get('extra_index'), int)
    }
    for section_data in fitted_sections:
        top = float(section_data['top'])
        sidebar.extend(sidebar_kicker(section_data['title'], top))
        sidebar.append({
            'category': 'textarea', 'content': section_data['content'], 'left': SIDE_L,
            'top': float(section_data['body_top']) + 6.0, 'width': SIDE_W,
            'height': float(section_data['body_height']), 'fontSize': float(section_data['fontSize']),
            'lineHeight': float(section_data['lineHeight']), 'letterSpacing': 0, 'color': C['ink'],
            'fontFamily': SANS, 'zIndex': 3, 'page': 1, 'bold': False, 'italic': False,
            'align': 'left', 'bulletList': bool(section_data.get('bulletList')),
            'autoHeight': True, 'preserveInitialLayout': True,
        })

    sidebar = [{
        **element,
        'page': 1,
        'flowRole': element.get('flowRole', 'content'),
        'flowLane': 'sidebar',
    } for element in sidebar]

    # ── Main column: ordinary Builder flow, left-anchored heading + full-width
    # ink rule (the same safe shape every single-column template uses). ──────
    HEADING_FS = round(20 * PX)
    SECTION_CHROME = HEADING_FS * 1.05 + 6.0 + 2.0 + get_spacing().after_rule

    def section(label: str) -> None:
        y = b.y
        page = b.pg
        heading = _text(label, HEADING_FS, SANS, C['ink'], MAIN_L, y, zIndex=3, page=page, bold=True)
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        rule_y = y + HEADING_FS * 1.05 + 6.0
        rule = _line(MAIN_L, rule_y, MAIN_W, 2, C['ink'], zIndex=2, page=page)
        rule['flowRole'] = 'section-chrome'
        b.els.append(rule)
        b.y = rule_y + 2.0 + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    b = Builder(content_top)

    ROLE_FS, ROLE_LH = (round(16 * PX), round(16 * PX * 1.3))
    ORG_FS, ORG_LH = (round(13.5 * PX), round(13.5 * PX * 1.3))
    META_FS, META_LH = (round(12 * PX), round(12 * PX * 1.35))
    BODY_FS, BODY_LH = (round(13.5 * PX), round(13.5 * PX * 1.4))

    # ── One experience record: numbered role title, org line, uppercase period
    # line, bullets — every line its own element, stacked sequentially inside
    # one `keep_together` atom (see module docstring: a same-row ordinal badge
    # was tried and reverted). ────────────────────────────────────────────────
    def _record_height(title: str, org: str, period: str, bullets: str) -> float:
        stack = get_spacing().stack
        height = b.measure_block(title, MAIN_W, ROLE_FS, ROLE_LH, SANS, bold=True, min_h=ROLE_LH)
        if org:
            height += stack + b.measure_block(org, MAIN_W, ORG_FS, ORG_LH, SANS, min_h=ORG_LH)
        if period:
            height += stack + b.measure_block(period, MAIN_W, META_FS, META_LH, SANS, min_h=META_LH)
        if bullets:
            height += stack + b.measure_block(bullets, MAIN_W, BODY_FS, BODY_LH, SANS, bulletList=True)
        return height

    def _place_record(ordinal: int, job: dict, *, after_gap: float | None) -> None:
        title = f"{ordinal:02d} · {job.get('title', '')}".strip()
        org = '   ·   '.join(filter(None, [job.get('company'), job.get('city')]))
        period = str(job.get('period') or '').strip().upper()
        bullets = _bullets(job)
        stack = get_spacing().stack
        height = _record_height(title, org, period, bullets)
        placed = False
        with b.keep_together(height):
            b.block(title, MAIN_L, MAIN_W, ROLE_FS, ROLE_LH, C['ink'], SANS, bold=True, min_h=ROLE_LH)
            placed = True
            if org:
                b.gap(stack)
                b.block(org, MAIN_L, MAIN_W, ORG_FS, ORG_LH, C['accent_deep'], SANS, min_h=ORG_LH)
            if period:
                b.gap(stack)
                meta_el_top = b.y
                b.block(period, MAIN_L, MAIN_W, META_FS, META_LH, C['neutral_700'], SANS, min_h=META_LH)
                b.els[-1]['letterSpacing'] = 0.6
            if bullets:
                b.gap(stack)
                b.block(bullets, MAIN_L, MAIN_W, BODY_FS, BODY_LH, C['ink'], SANS, bulletList=True)
        if after_gap is not None and placed:
            b.gap(after_gap)

    if cv.get('experience'):
        jobs = cv['experience']
        first_org = '   ·   '.join(filter(None, [jobs[0].get('company'), jobs[0].get('city')]))
        first_h = _record_height(
            f"01 · {jobs[0].get('title', '')}", first_org,
            str(jobs[0].get('period') or '').strip().upper(), _bullets(jobs[0]),
        )
        b.need_section(SECTION_CHROME, first_h)
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_record(
                index + 1, job,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['ink']}, MAIN_L, MAIN_W, SANS,
                        fs=BODY_FS, lh=BODY_LH, skip_indices=sidebar_extra_indices,
                        section_chrome_h=SECTION_CHROME)

    if cv.get('education') and 'education' not in sidebar_keys:
        # Fallback: education did not fit the sidebar budget, so it renders in
        # the main column instead of being truncated (matches Tessera).
        education_entries = cv['education']
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], MAIN_W, SANS, degree_fs=ROLE_FS, degree_lh=ROLE_LH,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, MAIN_L, MAIN_W, ink=C['ink'], muted=C['neutral_700'], body=C['ink'], font=SANS,
                degree_fs=ROLE_FS, degree_lh=ROLE_LH, meta_fs=META_FS, meta_lh=META_LH,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if 'skills' not in sidebar_keys and _place_skills_section(
        b, cv, section, MAIN_L, MAIN_W, C['ink'], SANS, BODY_FS, BODY_LH,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()

    _extra_sections(b, cv, 'after_skills', section, {'body': C['ink']}, MAIN_L, MAIN_W, SANS,
                    fs=BODY_FS, lh=BODY_LH, skip_indices=sidebar_extra_indices,
                    section_chrome_h=SECTION_CHROME)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + sidebar + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        page_decorations.append(
            {**_line(0, 0, SIDEBAR_W, 842, C['sidebar_bg'], zIndex=1, page=page), 'fixedToPage': True}
        )
        page_decorations.append(
            {**_line(SIDEBAR_W, 0, DIVIDER_W, 842, C['ink'], zIndex=2, page=page), 'fixedToPage': True}
        )
        # Continuation pages: no repeated header band or sidebar copy — only
        # the rail background/divider above and a quiet footer page number.
        page_decorations.append(
            {**_text(f'{page:02d}', 9, SANS, C['neutral_700'], 595 - round(56 * PX) - 14, 806, page=page),
             'fixedToPage': True}
        )
    return page_decorations + header + sidebar + flow
