from __future__ import annotations

"""Blueprint CV template generator.

A technical-schematic single column, adapted from the "Industry" Claude
Design system (steel-blue accent, square corners, hairline "+" registration
marks on framed objects). The masthead sits inside a bordered frame with a
crosshair mark at each corner, echoing the source system's `.blueprint` /
`.corner` component. Section headings are left-aligned condensed labels on a
full-column hairline rule (accent-300). Records, skills and languages reuse
the shared `Builder` / `_place_experience_record` / `_place_education_record`
/ `_place_skills_section` machinery every other single-column template uses.

Font note: the source design specifies Barlow Condensed (headings) over
Barlow (body). Neither is among this app's registered PDF/canvas font
families (see `pdf_generator.py`'s font registration block and
`canvasFont.js`), and adding a new family touches shared font
infrastructure used by every template. Inter — the closest registered
grotesk to Barlow's proportions — stands in for both, with bold, uppercase,
wide-letter-spaced headings approximating the condensed, technical feel.

An earlier revision drew the date on the same row as the record title
(right-aligned, matching the source design's `.role` pattern) and drew
skills / languages as individually positioned outline tags and badge rows.
All three were reverted: `sectionStructure.js`'s structural packer
(`packDocumentSections` / `applyFlowSpacing`, run on every Add Section,
reorder, and Sections-panel rhythm change) always re-stacks a section's body
elements SEQUENTIALLY by reading order — it has no concept of two elements
sharing one visual row. Verified with a direct repro: after `appendSectionAtEnd`,
a same-row date drifted 18px below its title, and the tag-tray text drifted
hundreds of px down the page (see the removed code's own regression for the
counter-example). Elements tagged `flowRole: "masthead"` are the only ones
exempt (skipped from section packing entirely), which is why the framed
masthead below is safe. Every other visual must stay one-element-per-row.

Layout decisions are deterministic Python (never sent to the model).
"""

from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _line,
    _rect,
    _text,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _compact_text,
    _contact_line,
    _labels,
    _place_skills_section,
)


def _gen_blueprint(cv: dict) -> list[dict]:
    """Framed masthead, ruled section labels, shared stacked body content."""
    C = {
        'paper': '#F2F2F3', 'ink': '#1D1F20',
        'accent_deep': '#416180', 'accent_pale': '#B5D9FD',
        'neutral_700': '#5D5D60', 'neutral_800': '#424244',
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
    # wrapper around the CV's header block). Every element below is tagged
    # `flowRole: "masthead"`, which is what makes it immune to the structural
    # packer (see module docstring) — safe to keep multi-element geometry here.
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

    # ── Section identity: condensed label + full-column hairline. Heading and
    # rule are the only body-adjacent elements safe to co-locate on one visual
    # band, because both are explicitly `flowRole: "section-chrome"` — the
    # packer's chrome path preserves their exact relative offsets from the
    # heading rather than re-stacking them (see `compactChromeCluster`'s
    # "explicitlyOwned" fast path in `sectionStructure.js`). That guarantee
    # does NOT extend to ordinary body text (see module docstring), so every
    # record/skill/language block below stays one plain element per row. ────
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
    TITLE_FS2, TITLE_LH2 = (10.8, 13.8)
    META_FS, META_LH = (8.4, 11.8)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=TITLE_FS2, title_lh=TITLE_LH2,
            meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
        )

    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, BODY_FS, BODY_LH, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, BODY_FS, BODY_LH, C['ink'], SANS)
        close_section()

    if cv.get('experience'):
        jobs = cv['experience']
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W, ink=C['ink'], muted=C['neutral_700'], body=C['ink'], font=SANS,
                title_fs=TITLE_FS2, title_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['ink']}, L, W, SANS,
                        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)

    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], W, SANS, degree_fs=TITLE_FS2, degree_lh=TITLE_LH2,
                meta_fs=META_FS, meta_lh=META_LH, body_fs=BODY_FS, body_lh=BODY_LH,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W, ink=C['ink'], muted=C['neutral_700'], body=C['ink'], font=SANS,
                degree_fs=TITLE_FS2, degree_lh=TITLE_LH2, meta_fs=META_FS, meta_lh=META_LH,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, C['ink'], SANS, BODY_FS, BODY_LH,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()

    # `_extra_sections` also renders `cv["languages"]` (normalized into an
    # `after_skills` extra section by `normalize_cv_data`) as a plain bulleted
    # block — matching how every other single-column template presents
    # languages, and the only representation this packer moves safely.
    _extra_sections(b, cv, 'after_skills', section, {'body': C['ink']}, L, W, SANS,
                    fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)

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
