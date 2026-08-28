"""Meridian CV template generator.

Meridian is a premium single-column executive resume in the same family as
Regent (serif masthead, restrained sans-serif body, generous single column
kept ATS-friendly), but built around a deep navy/steel-blue palette instead
of Regent's monochrome ink, a noticeably more compact body type scale, and a
short accent-blue tick under every section rule that gives the page its own
identity instead of reading as a Regent recolor.

Experience and education records use a two-column layout: the left column
flows normally (title/degree, company/school, bullets — one textarea per
line, exactly like the shared `_place_experience_record` helper other
single-column templates use), while dates and location are pinned to a
separate right-hand rail, stacked one above the other (never sharing a line
with the left column). The rail elements carry `flowRole: "record-overlay"`
and `autoHeight: False` — the same technique Axis's date gutter already uses
in production (see `templates/axis.py`, `_place_gutter`) — so they ride along
with the record on reflow/pagination without being mistaken for the next
line in the left column's linear flow.

Each rail line is pinned to the *exact* top Y of the left-column line it
annotates (period next to the title line, city next to the company line; or
city next to the school line, period next to the degree line) rather than a
computed offset from the record's start. This matters because the frontend's
reflow (`textareaReflow.js`, `recordOverlayAnchor`) re-anchors an overlay by
finding a same-`flowGroup` textarea whose top matches the overlay's *original*
top within ~3px, then re-pins the overlay at that anchor's *new* top after
reflow. An overlay whose top is merely "record start + a guessed offset"
matches no real content line, so `recordOverlayAnchor` cannot find its anchor
and it freezes at its original position — invisibly breaking section
reordering, spacing changes, and any edit that grows/shrinks an earlier
line. Anchoring to the exact top of a genuine content line keeps reordering
and spacing changes correct, the same guarantee Axis and Harbor already rely
on for their own overlays.

An earlier version paired title+period and company+city as literal same-row
blocks (broke live reflow entirely, since that reflow assumes one flowing
element per line in the left column); a later revision fixed that but placed
the second rail line at a guessed `top + lineHeight + gap` offset that did
not match any real content line's top (broke re-anchoring specifically,
though not initial placement). Both are now replaced by this
exact-anchor-top approach.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    get_spacing,
    _block,
    _line,
    _text,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_centered_icon_contacts,
    _reserved_contact_last_row_top,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.records import _education_bullets, _education_school
from app.services.cv_templates.shared.text import _bullets, _compact_text, _labels, _place_skills_section

# Meridian's own masthead rhythm. Kept as local literals (not routed through
# `get_spacing()`, which is the shared per-document density knob every
# template reads for section/record/stack gaps) so this template's header can
# be visibly tighter than Regent's without changing any other template's
# spacing.
_NAME_TO_TITLE_GAP = 6.0
_TITLE_TO_CONTACT_GAP = 14.0
_CONTACT_TO_RULE_GAP = 24.0
_MASTHEAD_TO_CONTENT_GAP = 14.0
_SECTION_TICK_WIDTH = 18.0

# Right-hand date/location rail: a fixed-width overlay column separated from
# the flowing left content column by a small gap.
_RECORD_RIGHT_W = 130.0
_RECORD_GAP = 12.0


def _meridian_place_rail_line(
    b: "Builder", anchor_top: float, page: int, text: str,
    fs: float, lh: float, color: str, font: str, x: float, width: float,
) -> None:
    """Pin one rail line to the exact top Y of the content line it annotates.

    Tagged `flowRole: "record-overlay"` with `autoHeight: False` — matching
    Axis's `_place_gutter` — so the frontend's linear reflow of the left
    content column never repositions or collides with it. Critically,
    `anchor_top` must equal a real content textarea's top (not a computed
    offset): the frontend's `recordOverlayAnchor` re-pins this element by
    matching that top against same-`flowGroup` textareas, so an unmatched
    top leaves the element frozen in place after reordering or a spacing
    change (see the module docstring).
    """
    if not text:
        return
    el = _block(text, x, anchor_top, width, lh, fs, lh, color, font,
                zIndex=3, page=page, align="right")
    el["autoHeight"] = False
    el["flowRole"] = "record-overlay"
    b.els.append(el)


def _meridian_experience_height(
    b: "Builder", job: dict, width: float, font: str, *,
    title_fs: float, title_lh: float, meta_fs: float, meta_lh: float,
    body_fs: float, body_lh: float,
) -> float:
    """Measured height of one experience record's left content column.

    The right-hand date/location rail is a fixed-height overlay that does not
    contribute to this measurement (mirrors Axis's date gutter).
    """
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    title = str(job.get("title") or "").strip()
    company = str(job.get("company") or "").strip()
    bullets = _bullets(job)

    height = 0.0
    if title:
        height += b.measure_block(title, content_w, title_fs, title_lh, font, bold=True, min_h=title_lh)
    if company:
        if height:
            height += get_spacing().stack
        height += b.measure_block(company, content_w, meta_fs, meta_lh, font, min_h=meta_lh)
    if bullets:
        if height:
            height += get_spacing().stack
        # Bullets span the full section width (matching the decorative
        # heading rule), not the narrower rail-avoiding column: they always
        # render below the title/company lines, past the rail's fixed
        # vertical extent, so there is no horizontal collision risk.
        height += b.measure_block(bullets, width, body_fs, body_lh, font, bulletList=True, min_h=body_lh)
    return height


def _meridian_place_experience(
    b: "Builder", job: dict, left: float, width: float, *,
    ink: str, muted: str, body: str, font: str,
    title_fs: float, title_lh: float, meta_fs: float, meta_lh: float,
    body_fs: float, body_lh: float, after_gap: float | None = None,
) -> None:
    """Render title → company → bullets in the left column; period above city on the right rail.

    `period` is pinned to the title line's exact top; `city` is pinned to
    whichever line actually follows it (company, or bullets when company is
    absent) so both rail lines stay correctly anchored for reflow. If neither
    a company nor a bullet line follows the title, `city` is dropped rather
    than pinned to a guessed offset with no real anchor (see module
    docstring).
    """
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    rail_x = left + content_w + _RECORD_GAP
    title = str(job.get("title") or "").strip()
    company = str(job.get("company") or "").strip()
    period = str(job.get("period") or "").strip()
    city = str(job.get("city") or "").strip()
    bullets = _bullets(job)
    height = _meridian_experience_height(
        b, job, width, font, title_fs=title_fs, title_lh=title_lh,
        meta_fs=meta_fs, meta_lh=meta_lh, body_fs=body_fs, body_lh=body_lh,
    )
    with b.keep_together(height):
        title_top, page = b.y, b.pg
        second_line_top: float | None = None
        placed = False
        if title:
            b.block(title, left, content_w, title_fs, title_lh, ink, font, bold=True, min_h=title_lh)
            placed = True
        if company:
            if placed:
                b.gap(get_spacing().stack)
                second_line_top = b.y
            b.block(company, left, content_w, meta_fs, meta_lh, muted, font, min_h=meta_lh)
            placed = True
        if bullets:
            if placed:
                b.gap(get_spacing().stack)
                if second_line_top is None:
                    second_line_top = b.y
            b.block(bullets, left, width, body_fs, body_lh, body, font, bulletList=True)
        _meridian_place_rail_line(b, title_top, page, period, meta_fs, meta_lh, muted, font, rail_x, _RECORD_RIGHT_W)
        if second_line_top is not None:
            _meridian_place_rail_line(
                b, second_line_top, page, city, meta_fs, meta_lh, muted, font, rail_x, _RECORD_RIGHT_W,
            )
    if after_gap is not None:
        b.gap(after_gap)


def _meridian_education_height(
    b: "Builder", edu: dict, width: float, font: str, *,
    degree_fs: float, degree_lh: float, meta_fs: float, meta_lh: float,
    body_fs: float, body_lh: float,
) -> float:
    """Measured height of one education record's left content column.

    The right-hand city/period rail is a fixed-height overlay that does not
    contribute to this measurement (mirrors Axis's date gutter).
    """
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    school = _education_school(edu)
    degree = str(edu.get("degree") or "").strip()
    bullets = _education_bullets(edu)

    height = 0.0
    if school:
        height += b.measure_block(school, content_w, degree_fs, degree_lh, font, min_h=degree_lh)
    if degree:
        if height:
            height += get_spacing().stack
        height += b.measure_block(degree, content_w, degree_fs, degree_lh, font, bold=True, min_h=degree_lh)
    if bullets:
        if height:
            height += get_spacing().stack
        # Bullets span the full section width (matching the decorative
        # heading rule) — see the identical note in `_meridian_experience_height`.
        height += b.measure_block(bullets, width, body_fs, body_lh, font, bulletList=True, min_h=body_lh)
    return height


def _meridian_place_education(
    b: "Builder", edu: dict, left: float, width: float, *,
    ink: str, muted: str, body: str, font: str,
    degree_fs: float, degree_lh: float, meta_fs: float, meta_lh: float,
    body_fs: float, body_lh: float, after_gap: float | None = None,
) -> None:
    """Render school → degree (bold) → bullets in the left column; city above period on the right rail.

    Row order matches the common letterhead convention (school first, then
    the bold diploma title) rather than the shared helper's degree-first
    order — Meridian's defining structural difference from Regent. `city` is
    pinned to the school line's exact top; `period` is pinned to whichever
    line actually follows it (degree, or bullets when degree is absent) so
    both rail lines stay correctly anchored for reflow. If neither a degree
    nor a bullet line follows the school, `period` is dropped rather than
    pinned to a guessed offset with no real anchor (see module docstring).
    """
    content_w = width - _RECORD_RIGHT_W - _RECORD_GAP
    rail_x = left + content_w + _RECORD_GAP
    school = _education_school(edu)
    degree = str(edu.get("degree") or "").strip()
    city = str(edu.get("city") or "").strip()
    period = str(edu.get("period") or "").strip()
    bullets = _education_bullets(edu)
    height = _meridian_education_height(
        b, edu, width, font, degree_fs=degree_fs, degree_lh=degree_lh,
        meta_fs=meta_fs, meta_lh=meta_lh, body_fs=body_fs, body_lh=body_lh,
    )
    with b.keep_together(height):
        school_top, page = b.y, b.pg
        second_line_top: float | None = None
        placed = False
        if school:
            b.block(school, left, content_w, degree_fs, degree_lh, ink, font, min_h=degree_lh)
            placed = True
        if degree:
            if placed:
                b.gap(get_spacing().stack)
                second_line_top = b.y
            b.block(degree, left, content_w, degree_fs, degree_lh, ink, font, bold=True, min_h=degree_lh)
            placed = True
        if bullets:
            if placed:
                b.gap(get_spacing().stack)
                if second_line_top is None:
                    second_line_top = b.y
            b.block(bullets, left, width, body_fs, body_lh, body, font, bulletList=True)
        _meridian_place_rail_line(b, school_top, page, city, meta_fs, meta_lh, muted, font, rail_x, _RECORD_RIGHT_W)
        if second_line_top is not None:
            _meridian_place_rail_line(
                b, second_line_top, page, period, meta_fs, meta_lh, muted, font, rail_x, _RECORD_RIGHT_W,
            )
    if after_gap is not None:
        b.gap(after_gap)


def _gen_meridian(cv: dict) -> list[dict]:
    """Build a navy/steel-blue, single-column executive CV from normalized CV data.

    Body, summary, and record copy sit a full size step below Regent's so a
    denser, more paragraph-heavy CV still reads as an elegant one-page brief.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#1B2A41",
        "body": "#33475A",
        "muted": "#7A8699",
        "rule": "#D7DEE6",
        "accent": "#3D5A80",
        "display": "CormorantGaramond",
        "sans": "Montserrat",
        # Meridian reuses Regent's thin, neutral contact glyphs: they are
        # colorless silhouettes designed to sit under any ink color, so no
        # new icon asset set is needed for the navy/steel-blue palette.
        "icon_theme": "regent",
        "L": 62,
        "W": 471,
    }
    L, W = C["L"], C["W"]
    SANS, DISPLAY = C["sans"], C["display"]
    center_x = L + W / 2
    labels = _labels(cv)

    header: list[dict] = []
    cursor_y = 47.0
    name = _compact_text(cv.get("name"), 40)
    title = _compact_text(cv.get("title"), 78)
    name_index: int | None = None
    title_index: int | None = None

    if name:
        name_height = Builder.measure_block(name, W, 34, 37, DISPLAY, bold=True)
        name_index = len(header)
        header.append(
            _block(
                name, L, cursor_y, W, name_height, 34, 37, C["ink"], DISPLAY,
                zIndex=3, bold=True, align="left",
            )
        )
        cursor_y += name_height + _NAME_TO_TITLE_GAP

    title_top = cursor_y
    title_height = (
        Builder.measure_block(title, W, 9, 12.5, SANS)
        if title else 13.0
    )
    title_prototype = _block(
        title, L, title_top, W, title_height, 9, 12.5, C["accent"], SANS,
        zIndex=3, align="left",
    )
    title_prototype["letterSpacing"] = 2.0
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_height

    contact_elements, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=C["icon_theme"],
        items=_contact_channel_items(cv),
        center_x=center_x,
        start_y=cursor_y + _TITLE_TO_CONTACT_GAP,
        max_width=W,
        text_fs=8.0,
        icon_size=10.0,
        text_color=C["muted"],
        font=SANS,
        char_width=5.0,
        icon_gap=11.0,
        item_pad=16.0,
        line_step=13.5,
        band_id="meridian-contact",
    )
    header.extend(contact_elements)
    # Meridian keeps its compact editorial rhythm, but the divider is measured
    # from a stable two-row contact zone. Ten-point icons retain 14 points of
    # visible clearance while the first body section stays at its original Y.
    contact_zone_bottom = _reserved_contact_last_row_top(
        contact_bottom, contact_descriptor, minimum_rows=2,
    )
    rule_y = contact_zone_bottom + _CONTACT_TO_RULE_GAP
    header.append(_line(L, rule_y, W, 0.8, C["rule"], zIndex=2, page=1))
    header = [{**element, "flowRole": "masthead"} for element in header]
    header.append(build_contact_band_anchor(contact_descriptor))

    name_element = header[name_index] if name_index is not None else None
    title_element = header[title_index] if title_index is not None else None
    if name_element is not None:
        header.append(
            tag_masthead_identity(
                name_element,
                title_element,
                title_prototype=title_prototype,
                band_id="masthead-main",
                name_default_uppercase=False,
                title_default_uppercase=True,
                band_top=title_top + title_height + _TITLE_TO_CONTACT_GAP,
                # The no-title layout already owns the authored contact gap,
                # so materialising the slot must add only its line height.
                title_reclaim_pt=title_height if not title else None,
                contact_band_id="meridian-contact",
            )
        )

    section_label_fs = 8.2
    section_chrome_h = section_label_fs + 6 + get_spacing().after_rule + 7
    b = Builder(rule_y + _MASTHEAD_TO_CONTENT_GAP)

    def section(label: str) -> None:
        """Place a compact heading, hairline, and a short accent-blue tick."""
        y = b.y
        page = b.pg
        heading = _text(label, section_label_fs, SANS, C["ink"], L, y, zIndex=3, page=page)
        heading["bold"] = True
        heading["letterSpacing"] = 1.6
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        rule_top = y + section_label_fs + 5.5
        rule = _line(L, rule_top, W, 0.8, C["rule"], zIndex=2, page=page)
        rule["flowRole"] = "section-chrome"
        b.els.append(rule)
        # Premium marker: a short accent-blue tick sitting on the hairline,
        # distinguishing Meridian's section chrome from Regent's plain
        # full-width rule.
        tick = _line(L, rule_top, _SECTION_TICK_WIDTH, 1.6, C["accent"], zIndex=3, page=page)
        tick["flowRole"] = "section-chrome"
        b.els.append(tick)
        b.y = rule_top + rule["height"] + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    # Meridian's body scale sits a full step below Regent's (9.5/11) so denser
    # CVs still read as a restrained, premium single page. Summary uses the
    # same Montserrat face as record copy so the lead is not a second display block.
    summary_fs, summary_lh = 8.6, 11.0
    if cv.get("summary"):
        b.need_section(
            section_chrome_h,
            b.measure_block(cv["summary"], W, summary_fs, summary_lh, SANS),
        )
        section(labels["summary"])
        b.block(cv["summary"], L, W, summary_fs, summary_lh, C["ink"], SANS)
        close_section()

    body_fs, body_lh = 8.6, 11.0

    def experience_height(job: dict) -> float:
        return _meridian_experience_height(
            b, job, W, SANS, title_fs=10.3, title_lh=13.0, meta_fs=7.9, meta_lh=10.8,
            body_fs=body_fs, body_lh=body_lh,
        )

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(section_chrome_h, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _meridian_place_experience(
                b, job, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                title_fs=10.3, title_lh=13.0, meta_fs=7.9, meta_lh=10.8,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": C["body"], "accent": C["accent"]},
            L, W, SANS, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(
            section_chrome_h,
            _meridian_education_height(
                b, education_entries[0], W, SANS, degree_fs=9.8, degree_lh=12.5,
                meta_fs=7.9, meta_lh=10.8, body_fs=body_fs, body_lh=body_lh,
            ),
        )
        section(labels["education"])
        for index, education in enumerate(education_entries):
            _meridian_place_education(
                b, education, L, W, ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=9.8, degree_lh=12.5, meta_fs=7.9, meta_lh=10.8,
                body_fs=body_fs, body_lh=body_lh,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, C["body"], SANS, body_fs, body_lh,
        section_chrome_h=section_chrome_h,
    ):
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": C["body"], "accent": C["accent"]},
        L, W, SANS, fs=body_fs, lh=body_lh, section_chrome_h=section_chrome_h,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        decorations.append(
            {
                **_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page),
                "fixedToPage": True,
            }
        )
        decorations.append(
            {
                **_text(f"{page:02d}", 8, SANS, C["accent"], 510, 806, zIndex=2, page=page),
                "fixedToPage": True,
            }
        )
    return decorations + header + flow
