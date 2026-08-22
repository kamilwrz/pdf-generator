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
inherits the packer-safety guarantees provided by the shared record-placement
helpers without needing to re-derive them.

Continuation pages can also receive sidebar content: the balance-driven
planner in `column_planner.py` generalizes to one bucket per page the main
column already occupies, so a rail that would otherwise sit empty next to
page-2+ content can carry a short section instead — see
docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_data import skill_groups
from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    PAGE_TOP,
    _line,
    _text,
)
from app.services.cv_templates.shared.column_planner import (
    MainMeasurement,
    PlaceableSection,
    plan_columns_multi_page,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
    build_contact_band_anchor,
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

    # ── Masthead: centered "letterhead" — name / title / icon contact row —
    # closed by a horizontal rule that separates it from the two-column body
    # below. Every element carries flowRole "masthead" (exempt from all
    # section packing), so centering it is free of the column-detection
    # concerns that apply to section headings. The contact row uses the same
    # centered icon-band placer as other Iconic templates (`shared/contact.py`)
    # instead of one mid-dot-joined textarea, so each channel keeps its own
    # short, non-wrapping label and glyph; the band's descriptor lets the
    # client contact-channel manager add/remove/relayout channels the same way
    # Cardinal/Nova do. ───────────────────────────────────────────────────────
    NAME_FS, NAME_LH = (30.0, 34.0)
    TITLE_FS, TITLE_LH = (11.5, 15.0)
    CONTACT_FS, CONTACT_LH = (9.4, 13.5)
    CONTACT_ICON = 13.0
    MAST_TOP = 46.0
    CONTACT_BAND_ID = 'sterling-contact'

    name = _compact_text(cv.get('name'), 40)
    title = _compact_text(cv.get('title'), 60).upper()
    contact_items = _contact_channel_items(cv)

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

    contact_descriptor: dict | None = None
    if contact_items:
        contact_els, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
            theme='sterling',
            items=contact_items,
            center_x=PAGE_CENTER,
            start_y=cursor_y,
            max_width=LETTERHEAD_W,
            text_fs=CONTACT_FS,
            icon_size=CONTACT_ICON,
            text_color=C['muted'],
            font=SANS,
            band_id=CONTACT_BAND_ID,
        )
        header.extend(contact_els)
        # `contact_bottom` is the TOP of the last contact row (see
        # `_place_centered_icon_contacts`'s contract); add the row's own
        # content height to land back on "bottom of masthead content", the
        # same cursor contract the name/title blocks above already use.
        cursor_y = contact_bottom + max(CONTACT_ICON, CONTACT_LH)

    rule_y = cursor_y + 20.0
    header.append(_line(SIDE_L, rule_y, (595.0 - 50.0) - SIDE_L, 1, C['rule'], zIndex=1))
    header = [{**element, 'flowRole': 'masthead'} for element in header]
    # Appended after the masthead-tagging comprehension so the anchor keeps its
    # own "masthead-anchor" flowRole instead of being overwritten to "masthead"
    # (matches Cardinal's contact-band anchor placement).
    if contact_descriptor is not None:
        header.append(build_contact_band_anchor(contact_descriptor))

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

    def section(b: "Builder", label: str) -> None:
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

    def close_section(b: "Builder") -> None:
        b.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            probe, job, MAIN_W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
            meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
        )

    # ── Section placement. Measure each present section in both column widths
    # and let the shared planner partition them so every page the main column
    # occupies is as balanced as possible. Experience is anchored to the main
    # column; each sidebar bucket is a hard per-page fit; the main column may
    # paginate. See
    # docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md
    probe = Builder(content_top)
    candidates = _sidebar_candidates(cv, lbl)
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

    def _sidebar_extra_indices_for(main_keys: list[str]) -> set[int]:
        """Extra-section indices the planner routed out of ``main_keys``.

        Every ``_sidebar_candidates`` key ends up in exactly one of
        ``plan.main`` or a sidebar bucket (``ColumnPlan`` is a disjoint
        cover), so anything with an ``extra_index`` absent from
        ``main_keys`` was placed in some sidebar bucket and must be skipped
        by ``_extra_sections``'s own placement-based iteration below to
        avoid rendering it twice.
        """
        main_set = set(main_keys)
        return {
            candidate['extra_index']
            for candidate in candidates
            if candidate['key'] not in main_set and isinstance(candidate.get('extra_index'), int)
        }

    def _render_main_column(
        order: list[str], b: "Builder", skip_indices: set[int],
        start_pages: dict[str, int] | None = None,
    ) -> None:
        """Render one ordered main-column section list into ``b``.

        Shared verbatim between the throwaway measurement pass
        (``measure_main``, called by ``plan_columns_multi_page`` to learn how
        many pages a candidate ``main`` order needs, and the real page each
        section starts on) and the final render, so the page count and start
        pages the planner reasons about always match what the document draws.

        When ``start_pages`` is provided, each explicitly-handled section key
        records the 1-indexed page its heading lands on (after any page break
        ``need_section`` forces). Simple extras rendered in bulk by
        ``_extra_sections`` are intentionally not tracked — the planner only
        rails main-affinity leftovers (Education), which are handled here.
        """
        def section_fn(label: str):
            return section(b, label)

        for key in order:
            if key == 'summary' and cv.get('summary'):
                b.need_section(SECTION_CHROME, Builder.measure_block(cv['summary'], MAIN_W, BODY_FS, BODY_LH, SANS))
                if start_pages is not None:
                    start_pages[key] = b.pg
                section(b, lbl['summary'])
                b.block(cv['summary'], MAIN_L, MAIN_W, BODY_FS, BODY_LH, C['ink'], SANS)
                close_section(b)
            elif key == 'experience' and cv.get('experience'):
                jobs = cv['experience']
                b.need_section(SECTION_CHROME, experience_height(jobs[0]))
                if start_pages is not None:
                    start_pages[key] = b.pg
                section(b, lbl['experience'])
                for index, job in enumerate(jobs):
                    _place_experience_record(
                        b, job, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                        title_fs=TITLE_FS2, title_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                        body_fs=BODY_FS, body_lh=BODY_LH,
                        after_gap=get_spacing().record if index < len(jobs) - 1 else None,
                    )
                close_section(b)
                # Record-kind extras (projects/references) live right after Experience.
                _extra_sections(
                    b, cv, 'after_experience', section_fn, {'body': C['ink'], 'accent': C['accent']},
                    MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
                    skip_indices=skip_indices, section_chrome_h=SECTION_CHROME,
                )
            elif key == 'education' and edu_entries:
                b.need_section(SECTION_CHROME, _education_record_height(
                    b, edu_entries[0], MAIN_W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                    meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
                ))
                if start_pages is not None:
                    start_pages[key] = b.pg
                section(b, lbl['education'])
                for index, edu in enumerate(edu_entries):
                    _place_education_record(
                        b, edu, MAIN_L, MAIN_W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                        degree_fs=TITLE_FS2, degree_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                        body_fs=BODY_FS, body_lh=BODY_LH,
                        after_gap=get_spacing().record if index < len(edu_entries) - 1 else None,
                    )
                close_section(b)
            elif key == 'skills':
                if start_pages is not None:
                    start_pages[key] = b.pg
                if _place_skills_section(
                    b, cv, section_fn, MAIN_L, MAIN_W, C['ink'], SANS, BODY_FS, BODY_LH,
                    section_chrome_h=SECTION_CHROME,
                ):
                    close_section(b)

        # Simple extras (languages / interests / certifications) the planner left
        # in the main column render here; those routed to any sidebar bucket
        # are skipped via `skip_indices`.
        _extra_sections(
            b, cv, 'after_skills', section_fn, {'body': C['ink'], 'accent': C['accent']},
            MAIN_L, MAIN_W, SANS, fs=BODY_FS, lh=BODY_LH,
            skip_indices=skip_indices, section_chrome_h=SECTION_CHROME,
        )

    def measure_main(order: list[str]) -> MainMeasurement:
        """Render ``order`` into a throwaway ``Builder`` and report its pagination.

        Used only by ``plan_columns_multi_page`` to learn how many pages a
        candidate ``main`` assignment needs and the real page each section
        starts on; the elements it produces are discarded. Passing an ``order``
        of only the anchored keys makes this render the main-column *skeleton*
        (Experience + record-style extras), whose page span is independent of
        movable placement.
        """
        probe_builder = Builder(content_top)
        start_pages: dict[str, int] = {}
        _render_main_column(
            order, probe_builder, _sidebar_extra_indices_for(order), start_pages,
        )
        # Height the main column consumed, for a single-page render (the only
        # case the orchestrator reads it): final cursor minus the starting top.
        content_height = float(probe_builder.y) - content_top
        return MainMeasurement(
            pages_used=probe_builder.pg,
            start_page_by_key=start_pages,
            content_height=content_height,
        )

    def fit_sidebar_page1(keys: list[str]) -> set[str]:
        """Keys the page-1 rail can actually place, via the real auto-fit fitter.

        Mirrors ``_render_sidebar_bucket``'s page-1 path (summary consumes the
        top of the rail at its fixed size; the rest go through
        ``_fit_sidebar_sections``, which shrinks each section down the font
        ladder to fit the remaining space) but only reports which keys fit, so
        the planner's page-collapse pass can move a spilled section (e.g.
        Education) into the page-1 sidebar when — and only when — it genuinely
        fits once shrunk. Never over-commits, so nothing can be dropped.
        """
        key_set = set(keys)
        cursor = content_top
        placed: set[str] = set()
        if 'summary' in key_set and cv.get('summary'):
            body_h = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
            cursor = content_top + CHROME_GAP + body_h + 26.0
            placed.add('summary')
        cand_lookup = {candidate['key']: candidate for candidate in candidates}
        planned = [cand_lookup[key] for key in keys if key in cand_lookup]
        _, placed_keys = _fit_sidebar_sections(
            planned, width=SIDE_W, start_y=cursor, bottom_y=760, font=SANS,
        )
        placed.update(placed_keys)
        return placed

    plan = plan_columns_multi_page(
        descriptors,
        page1_sidebar_budget=sidebar_budget,
        continuation_sidebar_budget=760.0 - PAGE_TOP,
        page1_main_budget=main_budget,
        measure_main=measure_main,
        fit_sidebar_page1=fit_sidebar_page1,
    )
    sidebar_extra_indices = _sidebar_extra_indices_for(plan.main)

    def _render_sidebar_bucket(page: int, keys: list[str], start_y: float) -> tuple[list[dict], list[str]]:
        """Render one page's sidebar rail content for the planner-assigned ``keys``.

        Summary keeps its distinct inline rendering (fixed body font size,
        not the auto-fit ladder ``_fit_sidebar_sections`` uses for the rest)
        on whichever page the planner places it; every other candidate goes
        through the shared fitting mechanism. This is the exact page-1 logic
        run once per bucket, not a page-2 special case — page 1 differs only
        in ``start_y``.

        Fitting follows ``keys`` order (planner reading order), not
        ``_sidebar_candidates`` order. Candidates list skills before
        education; honouring that filled the leftover rail with a Skills
        kicker and left the list to start the next page. Keys that do not
        fit intact (kicker plus at least two body lines) are returned so
        the caller can spill them onto the next existing rail.
        """
        key_set = set(keys)
        elements: list[dict] = []
        cursor = start_y
        if 'summary' in key_set and cv.get('summary'):
            elements.extend(sidebar_kicker(lbl['summary'], cursor))
            body_top = cursor + CHROME_GAP
            body_h = Builder.measure_block(cv['summary'], SIDE_W, SIDE_SUMMARY_FS, SIDE_SUMMARY_LH, SANS)
            elements.append({
                'category': 'textarea', 'content': cv['summary'], 'left': SIDE_L, 'top': body_top,
                'width': SIDE_W, 'height': body_h, 'fontSize': SIDE_SUMMARY_FS, 'lineHeight': SIDE_SUMMARY_LH,
                'letterSpacing': 0, 'color': C['ink'], 'fontFamily': SANS, 'zIndex': 3, 'page': page,
                'bold': False, 'italic': False, 'align': 'left', 'bulletList': False,
                'autoHeight': True, 'preserveInitialLayout': True,
            })
            cursor = body_top + body_h + 26.0

        by_key = {candidate['key']: candidate for candidate in candidates}
        bucket_planned = [by_key[key] for key in keys if key in by_key]
        fitted_sections, placed_keys = _fit_sidebar_sections(
            bucket_planned, width=SIDE_W, start_y=cursor, bottom_y=760, font=SANS,
        )
        for section_data in fitted_sections:
            top = float(section_data['top'])
            elements.extend(sidebar_kicker(section_data['title'], top))
            # Education becomes diploma / school / meta / bullet elements; flat
            # sections (skills, languages, …) stay a single textarea.
            elements.extend(_fitted_sidebar_body_elements(
                section_data,
                left=SIDE_L,
                width=SIDE_W,
                ink=C['ink'],
                muted=C['muted'],
                body=C['ink'],
                font=SANS,
            ))

        unfitted = [
            key for key in keys
            if key != 'summary' and key in by_key and key not in placed_keys
        ]
        stamped = [{
            **element,
            'page': page,
            'flowRole': element.get('flowRole', 'content'),
            'flowLane': 'sidebar',
        } for element in elements]
        return stamped, unfitted

    # ── Sidebar: one bucket per page the planner used. Spill sections that
    # did not fit intact (orphan kicker) onto the next existing rail rather
    # than leaving the heading in the page-1 footer. Never invent a page.
    sidebar: list[dict] = []
    spill: list[str] = []
    for page in sorted(plan.sidebar_by_page.keys()):
        keys: list[str] = []
        seen: set[str] = set()
        for key in (*spill, *plan.sidebar_by_page[page]):
            if key in seen:
                continue
            seen.add(key)
            keys.append(key)
        start_y = content_top if page == 1 else PAGE_TOP
        els, spill = _render_sidebar_bucket(page, keys, start_y)
        sidebar.extend(els)

    # ── Main column for the planned main set, in canonical reading order. Each
    # anchored/movable "primary" section (summary, experience, education, skills)
    # dispatches to its existing renderer; simple extras routed to main are
    # emitted by `_extra_sections` inside `_render_main_column`. ──────────────
    b = Builder(content_top)
    _render_main_column(plan.main, b, sidebar_extra_indices)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + sidebar + flow] or [1])

    # ── Page chrome. Rail fill + vertical divider are full-page-height on every
    # page so canvas `cloneFixedPageDecorations` (live overflow / transfer) copies
    # a single vertical strip onto page 2 — never the letterhead top bar.
    #
    # On page 1 a full-width letterhead band (same tint as the rail) covers the
    # divider through the centered masthead (`repeatOnContinuation: false`).
    # Without that cover a full-height divider would cut through the name/title/
    # contact, which span across x = SIDEBAR_W. Reusing the rail tint makes the
    # top band and the left rail read as one continuous field. ─────────────────
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        # Full-height rail + divider on every page (including page 1).
        page_decorations.append(
            {**_line(0, 0, SIDEBAR_W, 842, C['sidebar_bg'], zIndex=1, page=page),
             'fixedToPage': True}
        )
        page_decorations.append(
            {**_line(SIDEBAR_W, 0, DIVIDER_W, 842, C['rule'], zIndex=1, page=page),
             'fixedToPage': True}
        )
        if page == 1:
            # Page-1-only band sits above the divider so the letterhead stays
            # uncut; omitted from continuation clones.
            page_decorations.append({
                **_line(0, 0, 595, rule_y, C['sidebar_bg'], zIndex=2, page=1),
                'fixedToPage': True,
                'repeatOnContinuation': False,
            })
        page_decorations.append(
            {**_text(f'{page:02d}', 9, SANS, C['muted'], 545.0 - 14.0, 806, page=page),
             'fixedToPage': True}
        )
    return page_decorations + header + sidebar + flow
