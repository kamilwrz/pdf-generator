from __future__ import annotations

"""Sterling CV template generator.

An elegant, harmonious blue-gray two-column layout. The centered masthead
(serif display name, tracked uppercase title, mid-dot contact line) sits on a
full-width tinted "letterhead band", closed at the bottom by a horizontal rule
that separates it from the two-column body. The band reuses the rail tint and
the sidebar divider only begins at the band's bottom edge, so the divider never
runs up through the centered name/title/contact (which span the page center and
cross the sidebar column boundary). A wide sidebar rail carries Summary,
Education, Skills, and Languages (plus any other simple/flat extra section)
to the left of a thin vertical divider; the main column carries only
Experience (plus any record-style extras, e.g. Projects). One rule color
(`C['rule']`, a soft blue-gray) is reused for the masthead underline, the
sidebar divider, and every section rule, so the page reads as one coherent,
quiet system rather than a collection of separately-styled dividers.

Structural family: the same proven two-column shape as Tessera / Slate /
Harbor. Sidebar content lives on an independent `flowLane: "sidebar"`
cursor (`sectionStructure.js`'s `packSidebarLane`), with its kickers tagged
`flowRole: "sidebar-chrome"` so density knobs retarget the rail without it
ever entering the main-column packer (`listDocumentSections` /
`sameColumnAsHeading`). Sterling puts every "simple" (flat-list) section in
the sidebar via the shared, unfiltered `_sidebar_candidates` /
`_fit_sidebar_sections` fitting mechanism (Skills, Languages, and any
flattenable extras), with Education as the one structured exception that
mechanism already supports (`_education_sidebar_content`). Main column
records (Experience, and any record-kind extras `_sidebar_candidates` never
offers to the rail in the first place) reuse the shared
`_place_experience_record` / `_place_education_record` helpers unchanged —
no same-row or individually-positioned decoration was introduced, so this
inherits the packer-safety guarantees documented in `blueprint.py` without
needing to re-derive them.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_data import skill_groups
from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _line,
    _text,
)
from app.services.cv_templates.shared.column_planner import (
    PlaceableSection,
    plan_columns,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _fitted_sidebar_body_elements,
    _sidebar_candidates,
    _sidebar_education_type_sizes,
    _sidebar_wrapped_height,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
    _sidebar_education_entries,
    _sidebar_education_section_height,
)
from app.services.cv_templates.shared.text import (
    _compact_text,
    _contact_line,
    _labels,
    _language_entries,
    _measure_languages_grid_height,
    _measure_skills_body,
    _place_skills_section,
)


def _gen_sterling(cv: dict) -> list[dict]:
    """Centered letterhead masthead, wide sidebar rail, single-section main column."""
    C = {
        'paper': '#F7F8FA', 'ink': '#26313F',
        'accent': '#4A6FA5', 'accent_deep': '#33517A',
        'muted': '#6B7684', 'sidebar_bg': '#EDF1F6', 'rule': '#C7CFDA',
        'display': 'CormorantGaramond', 'sans': 'Montserrat',
    }
    SANS, DISPLAY = (C['sans'], C['display'])
    lbl = _labels(cv)

    # "szerszym sidebarem" — wide 210 pt rail (vs typical ~180 pt sidebars).
    SIDEBAR_W = 210.0
    DIVIDER_W = 1.0
    SIDE_L = 34.0
    SIDE_W = SIDEBAR_W - SIDE_L - 24.0  # 152
    MAIN_L = SIDEBAR_W + DIVIDER_W + 34.0  # 245
    MAIN_W = 595.0 - MAIN_L - 50.0  # 300
    PAGE_CENTER = 297.5
    LETTERHEAD_W = 460.0
    LETTERHEAD_L = PAGE_CENTER - LETTERHEAD_W / 2.0

    # ── Masthead: centered "letterhead" — name / title / contact — closed by a
    # horizontal rule that separates it from the two-column body below. Every
    # element carries flowRole "masthead" (exempt from all section packing),
    # so centering it is free of the column-detection concerns that apply to
    # section headings. ────────────────────────────────────────────────────
    NAME_FS, NAME_LH = (30.0, 34.0)
    TITLE_FS, TITLE_LH = (11.5, 15.0)
    CONTACT_FS, CONTACT_LH = (9.4, 13.5)
    MAST_TOP = 46.0

    name = _compact_text(cv.get('name'), 40)
    title = _compact_text(cv.get('title'), 60).upper()
    contact = _compact_text(_contact_line(cv), 130)

    header: list[dict] = []
    cursor_y = MAST_TOP
    if name:
        name_h = Builder.measure_block(name, LETTERHEAD_W, NAME_FS, NAME_LH, DISPLAY, bold=True)
        header.append({
            'category': 'textarea', 'content': name, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': name_h, 'fontSize': NAME_FS, 'lineHeight': NAME_LH,
            'letterSpacing': 0, 'color': C['ink'], 'fontFamily': DISPLAY, 'zIndex': 3,
            'page': 1, 'bold': True, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += name_h + 6.0
    if title:
        title_h = Builder.measure_block(title, LETTERHEAD_W, TITLE_FS, TITLE_LH, SANS)
        header.append({
            'category': 'textarea', 'content': title, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': title_h, 'fontSize': TITLE_FS, 'lineHeight': TITLE_LH,
            'letterSpacing': 2.0, 'color': C['accent'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += title_h + 10.0
    if contact:
        contact_h = Builder.measure_block(contact, LETTERHEAD_W, CONTACT_FS, CONTACT_LH, SANS)
        header.append({
            'category': 'textarea', 'content': contact, 'left': LETTERHEAD_L, 'top': cursor_y,
            'width': LETTERHEAD_W, 'height': contact_h, 'fontSize': CONTACT_FS, 'lineHeight': CONTACT_LH,
            'letterSpacing': 0.3, 'color': C['muted'], 'fontFamily': SANS, 'zIndex': 3,
            'page': 1, 'bold': False, 'italic': False, 'align': 'center', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor_y += contact_h

    rule_y = cursor_y + 20.0
    header.append(_line(SIDE_L, rule_y, (595.0 - 50.0) - SIDE_L, 1, C['rule'], zIndex=1))
    header = [{**element, 'flowRole': 'masthead'} for element in header]

    content_top = rule_y + 30.0

    # ── Type scale shared by both columns. Defined up front because the section
    # planner measures every section in both column widths before any rendering.
    KICKER_FS = 9.4
    BODY_FS, BODY_LH = (9.5, 13.8)
    # Sidebar body font: the top tier of `_fit_sidebar_sections`' auto-fit ladder
    # (`_SIDEBAR_FONT_SIZES[0]` = 8.3, paired line height `round(max(fs*1.45,
    # 11.0), 2)`), so the summary reads at the same size as the fitted sidebar
    # candidates (`test_summary_matches_experience_body_type_size`).
    SIDE_SUMMARY_FS, SIDE_SUMMARY_LH = (8.3, 12.04)
    CHROME_GAP = KICKER_FS * 1.2 + 5.0 + 1.4 + 10.0
    HEADING_FS = 14.0
    SECTION_CHROME = HEADING_FS * 1.05 + 6.0 + 1.0 + get_spacing().after_rule
    TITLE_FS2, TITLE_LH2 = (11.2, 14.0)
    META_FS, META_LH = (8.6, 11.8)
    # Per-section sidebar chrome advance used by `_fit_sidebar_sections`
    # (kicker 10 + tick gap 5 + trailing 18); the summary uses `CHROME_GAP`.
    SIDEBAR_CHROME = 10 + 5 + 18
    # Canonical reading order. Education sorts right after Experience for the
    # MAIN column; the sidebar keeps its own order because `_fit_sidebar_sections`
    # preserves the `_sidebar_candidates` sequence (education last there).
    RANK = {
        'summary': 0, 'experience': 1, 'education': 2,
        'skills': 3, 'languages': 4, 'certifications': 5, 'interests': 6,
    }

    def sidebar_kicker(label: str, top: float) -> list[dict]:
        heading = _text(label.upper(), KICKER_FS, SANS, C['accent_deep'], SIDE_L, top, zIndex=3, bold=True)
        heading['letterSpacing'] = 1.3
        heading['flowRole'] = 'sidebar-chrome'
        tick = _line(SIDE_L, top + KICKER_FS * 1.2 + 5.0, 22, 1.4, C['accent'], zIndex=2)
        tick['flowRole'] = 'sidebar-chrome'
        return [heading, tick]

    def section(label: str) -> None:
        y = b.y
        page = b.pg
        heading = _text(label, HEADING_FS, SANS, C['ink'], MAIN_L, y, zIndex=3, page=page, bold=True)
        heading['letterSpacing'] = 0.8
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        rule_line_y = y + HEADING_FS * 1.05 + 6.0
        rule = _line(MAIN_L, rule_line_y, MAIN_W, 1, C['rule'], zIndex=2, page=page)
        rule['flowRole'] = 'section-chrome'
        b.els.append(rule)
        b.y = rule_line_y + 1.0 + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
            meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
        )

    # ── Section placement. Measure each present section in both column widths
    # and let the shared planner partition them so page 1 is as balanced as
    # possible. Experience is anchored to the main column; the sidebar is a hard
    # page-1 fit; the main column may paginate. See
    # docs/superpowers/specs/2026-08-12-two-column-section-placement-design.md
    probe = Builder(content_top)
    candidates = _sidebar_candidates(cv, lbl)
    cand_by_key = {candidate['key']: candidate for candidate in candidates}
    edu_entries = _sidebar_education_entries(cv.get('education'))
    sidebar_budget = 760.0 - content_top
    main_budget = 770.0 - content_top

    def main_section_height(body_h: float) -> float:
        """Main-column advance for one section: heading chrome + body + gap."""
        return SECTION_CHROME + body_h + get_spacing().section

    descriptors: list[PlaceableSection] = []

    if cv.get('summary'):
        summary_side_body = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
        descriptors.append(PlaceableSection(
            'summary', RANK['summary'], 'sidebar',
            main_height=main_section_height(
                Builder.measure_block(cv['summary'], MAIN_W, BODY_FS, BODY_LH, SANS)
            ),
            # Summary's rail advance = kicker gap + body + trailing 26 (matches
            # the explicit placement below).
            sidebar_height=CHROME_GAP + summary_side_body + 26.0,
        ))

    if cv.get('experience'):
        jobs = cv['experience']
        exp_body = 0.0
        for index, job in enumerate(jobs):
            exp_body += _experience_record_height(
                probe, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            )
            if index < len(jobs) - 1:
                exp_body += get_spacing().record
        descriptors.append(PlaceableSection(
            'experience', RANK['experience'], 'main',
            main_height=main_section_height(exp_body), sidebar_height=None,
            anchored_main=True,
        ))

    for candidate in candidates:
        kind = candidate['kind']
        if kind == 'education':
            edu_type = _sidebar_education_type_sizes(SIDE_SUMMARY_FS, SIDE_SUMMARY_LH)
            side_h = _sidebar_education_section_height(
                candidate['entries'], SIDE_W, SANS, **edu_type,
            ) + SIDEBAR_CHROME
            edu_body = 0.0
            for index, edu in enumerate(edu_entries):
                edu_body += _education_record_height(
                    probe, edu, MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                    meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
                )
                if index < len(edu_entries) - 1:
                    edu_body += get_spacing().record
            descriptors.append(PlaceableSection(
                candidate['key'], RANK['education'], 'main',
                main_height=main_section_height(edu_body), sidebar_height=side_h,
            ))
            continue
        side_h = _sidebar_wrapped_height(
            candidate['content'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH,
            font=SANS, bulletList=bool(candidate.get('bulletList')),
        ) + SIDEBAR_CHROME
        if kind == 'skills':
            main_body = _measure_skills_body(
                probe, skill_groups(cv.get('skills')), MAIN_W, BODY_FS, BODY_LH, SANS,
            )
        elif kind == 'languages':
            main_body = _measure_languages_grid_height(
                probe, _language_entries(cv), MAIN_W, font=SANS, fs=BODY_FS, lh=BODY_LH,
            )
        else:  # interests / certifications → flat bullet block
            main_body = Builder.measure_block(
                candidate['content'], MAIN_W, BODY_FS, BODY_LH, SANS, bulletList=True,
            )
        descriptors.append(PlaceableSection(
            candidate['key'], RANK.get(kind, 6), 'sidebar',
            main_height=main_section_height(main_body), sidebar_height=side_h,
        ))

    plan = plan_columns(descriptors, sidebar_budget=sidebar_budget, main_budget=main_budget)
    sidebar_set = set(plan.sidebar)
    # Simple extras routed to the sidebar are skipped by `_extra_sections` in the
    # main column; those routed to main are rendered by it.
    sidebar_extra_indices = {
        cand_by_key[key]['extra_index']
        for key in sidebar_set
        if key in cand_by_key and isinstance(cand_by_key[key].get('extra_index'), int)
    }

    # ── Sidebar (page 1 only) for the planned sidebar set. ────────────────────
    sidebar: list[dict] = []
    cursor = content_top
    if 'summary' in sidebar_set and cv.get('summary'):
        sidebar.extend(sidebar_kicker(lbl['summary'], cursor))
        body_top = cursor + CHROME_GAP
        body_h = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
        sidebar.append({
            'category': 'textarea', 'content': cv['summary'], 'left': SIDE_L, 'top': body_top,
            'width': SIDE_W, 'height': body_h, 'fontSize': SIDE_SUMMARY_FS, 'lineHeight': SIDE_SUMMARY_LH,
            'letterSpacing': 0, 'color': C['ink'], 'fontFamily': SANS, 'zIndex': 3, 'page': 1,
            'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
            'autoHeight': True, 'preserveInitialLayout': True,
        })
        cursor = body_top + body_h + 26.0

    # The planner already guaranteed this subset fits the page-1 rail, so
    # `_fit_sidebar_sections` places all of them (it also assigns their fonts).
    sidebar_planned = [candidate for candidate in candidates if candidate['key'] in sidebar_set]
    fitted_sections, _ = _fit_sidebar_sections(
        sidebar_planned, width=SIDE_W, start_y=cursor, bottom_y=760, font=SANS,
    )
    for section_data in fitted_sections:
        top = float(section_data['top'])
        sidebar.extend(sidebar_kicker(section_data['title'], top))
        # Education becomes diploma / school / meta / bullet elements; flat
        # sections (skills, languages, …) stay a single textarea.
        sidebar.extend(_fitted_sidebar_body_elements(
            section_data,
            left=SIDE_L,
            width=SIDE_W,
            ink=C['ink'],
            muted=C['muted'],
            body=C['ink'],
            font=SANS,
        ))

    sidebar = [{
        **element,
        'page': 1,
        'flowRole': element.get('flowRole', 'content'),
        'flowLane': 'sidebar',
    } for element in sidebar]

    # ── Main column for the planned main set, in canonical reading order. Each
    # anchored/movable "primary" section (summary, experience, education, skills)
    # dispatches to its existing renderer; simple extras routed to main are
    # emitted by `_extra_sections` below. ─────────────────────────────────────
    b = Builder(content_top)
    for key in plan.main:
        if key == 'summary' and cv.get('summary'):
            b.need_section(SECTION_CHROME, Builder.measure_block(cv['summary'], MAIN_W, BODY_FS, BODY_LH, SANS))
            section(lbl['summary'])
            b.block(cv['summary'], MAIN_L, MAIN_W, BODY_FS, BODY_LH, C['ink'], SANS)
            close_section()
        elif key == 'experience' and cv.get('experience'):
            jobs = cv['experience']
            b.need_section(SECTION_CHROME, experience_height(jobs[0]))
            section(lbl['experience'])
            for index, job in enumerate(jobs):
                _place_experience_record(
                    b, job, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                    title_fs=TITLE_FS2, title_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                    body_fs=BODY_FS, body_lh=BODY_LH,
                    after_gap=get_spacing().record if index < len(jobs) - 1 else None,
                )
            close_section()
            # Record-kind extras (projects/references) live right after Experience.
            _extra_sections(
                b, cv, 'after_experience', section, {'body': C['ink'], 'accent': C['accent']},
                MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
                skip_indices=sidebar_extra_indices, section_chrome_h=SECTION_CHROME,
            )
        elif key == 'education' and edu_entries:
            b.need_section(SECTION_CHROME, _education_record_height(
                b, edu_entries[0], MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            ))
            section(lbl['education'])
            for index, edu in enumerate(edu_entries):
                _place_education_record(
                    b, edu, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                    degree_fs=TITLE_FS2, degree_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                    body_fs=BODY_FS, body_lh=BODY_LH,
                    after_gap=get_spacing().record if index < len(edu_entries) - 1 else None,
                )
            close_section()
        elif key == 'skills':
            if _place_skills_section(
                b, cv, section, MAIN_L, MAIN_W, C['ink'], SANS, BODY_FS, BODY_LH,
                section_chrome_h=SECTION_CHROME,
            ):
                close_section()

    # Simple extras (languages / interests / certifications) the planner left in
    # the main column render here; those routed to the sidebar are skipped.
    _extra_sections(
        b, cv, 'after_skills', section, {'body': C['ink'], 'accent': C['accent']},
        MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
        skip_indices=sidebar_extra_indices, section_chrome_h=SECTION_CHROME,
    )

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + sidebar + flow] or [1])

    # ── Page chrome. On page 1 a full-width "letterhead band" (the same tint as
    # the rail) sits behind the centered masthead, and BOTH the rail fill and the
    # vertical divider begin at the band's bottom edge (`rule_y`) instead of at
    # y = 0. Sterling centers the name/title/contact across the page, so those
    # lines cross the x = SIDEBAR_W column boundary; a full-height divider run
    # up from y = 0 would visually "cut" straight through the centered letterhead
    # (the reason this band exists). Reusing the rail tint makes the top band and
    # the left rail read as one continuous field — Sterling's single quiet system
    # — while the main column below the band stays on paper. Continuation pages
    # carry no masthead, so their rail and divider run the full page height. ────
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        if page == 1:
            # Full-width letterhead band, closed at the bottom by the masthead
            # rule that `header` already draws at `rule_y`.
            page_decorations.append(
                {**_line(0, 0, 595, rule_y, C['sidebar_bg'], zIndex=1, page=1), 'fixedToPage': True}
            )
            # Rail fill and divider start under the band so neither crosses the
            # centered masthead above them.
            page_decorations.append(
                {**_line(0, rule_y, SIDEBAR_W, 842 - rule_y, C['sidebar_bg'], zIndex=1, page=1),
                 'fixedToPage': True}
            )
            page_decorations.append(
                {**_line(SIDEBAR_W, rule_y, DIVIDER_W, 842 - rule_y, C['rule'], zIndex=2, page=1),
                 'fixedToPage': True}
            )
        else:
            # Continuation pages: no repeated letterhead or sidebar copy — only the
            # rail background/divider above and a quiet footer page number.
            page_decorations.append(
                {**_line(0, 0, SIDEBAR_W, 842, C['sidebar_bg'], zIndex=1, page=page), 'fixedToPage': True}
            )
            page_decorations.append(
                {**_line(SIDEBAR_W, 0, DIVIDER_W, 842, C['rule'], zIndex=2, page=page), 'fixedToPage': True}
            )
        page_decorations.append(
            {**_text(f'{page:02d}', 9, SANS, C['muted'], 545.0 - 14.0, 806, page=page),
             'fixedToPage': True}
        )
    return page_decorations + header + sidebar + flow
