from __future__ import annotations

"""Atrium CV template generator.

A restrained editorial single column with a centered masthead. Name, title and
the icon contact band establish the page axis; a quiet segmented hairline closes
the header. Below it, left-aligned section labels sit on full-column dividers
with a short accent lead-in. The stable heading X keeps shared section packing
and Add-section (`deriveSectionStyle`) behavior unchanged while the wider column
and calmer type rhythm improve readability. Layout decisions are deterministic
Python (never sent to the model).

A frameless photo slot sits top-right of the masthead: unlike every other
photo-capable template, Atrium never draws a surrounding rect/circle frame
(see the "no framing shapes" identity this template's tests enforce), so only
a small silhouette glyph marks the slot until a photo is applied.
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
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.icons import _icon
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import _compact_text, _labels, _place_skills_section


def _gen_atrium(cv: dict) -> list[dict]:
    """Centered masthead + left-aligned section headings; left-aligned body."""
    C = {
        'paper': '#FBFAF7', 'ink': '#242521', 'accent': '#556158',
        'mute': '#78796F', 'body': '#2C2C29', 'rule': '#E5E3DB',
        'display': 'PlayfairDisplay', 'sans': 'Montserrat', 'icon_theme': 'atrium',
        # The 82 pt margins retain Atrium's gallery-like whitespace while giving
        # long body lines and contact rows enough room to breathe.
        'L': 82, 'W': 431,
    }
    L, W = (C['L'], C['W'])
    SANS, DISP = (C['sans'], C['display'])
    ICON = C['icon_theme']
    ACCENT, RULE = (C['accent'], C['rule'])
    CENTER_X = L + W / 2.0  # 82 + 431/2 = 297.5, the page's true center
    lbl = _labels(cv)

    def _header_rule(center_x: float, y: float, *, page: int = 1) -> list[dict]:
        """Return a centered hairline with a short sage segment at its axis.

        The three line primitives preserve Atrium's print-inspired identity
        without the previous crosshair, whose vertical stroke competed with the
        dense contact row and looked like an accidental registration artifact.
        """
        outer, center, gap = 34.0, 10.0, 7.0
        return [
            _line(center_x - center / 2.0 - gap - outer, y, outer, 1, RULE, zIndex=2, page=page),
            _line(center_x - center / 2.0, y, center, 1, ACCENT, zIndex=2, page=page),
            _line(center_x + center / 2.0 + gap, y, outer, 1, RULE, zIndex=2, page=page),
        ]

    # ── Masthead (centered name / title / contact band) ──────────────────────
    name = _compact_text(cv.get('name'), 34)
    title = _compact_text(cv.get('title'), 60)
    name_fs, name_lh = (31, 35)
    title_fs, title_lh = (9.2, 13)

    header: list[dict] = []
    cursor_y = 54.0
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

    # ── Photo slot: frameless, top-right of the masthead ──────────────────────
    # Atrium's identity forbids framing shapes (see the module docstring and
    # the "no rectangle/circle/ellipse primitives" guard in atrium.test.js), so
    # the profile photo has no surrounding rect/circle chrome — unlike every
    # other photo-capable template. Before a photo is applied, a small neutral
    # silhouette glyph marks the slot; `applyProfilePhoto`
    # (frontend/src/utils/profilePhoto.js) sizes the final photo to this
    # glyph's own bounds, since there is no separate frame element to measure.
    # Fixed pixel position (not derived from L/W): the portrait is the compact
    # 60 × 80 pt, 3:4 slot approved from the live editor (x=462, y=19).
    # `photoShape: "direct"` tells the gallery replacement path not to inset
    # the final raster, so the selected photo retains these exact dimensions.
    PHOTO_WIDTH = 60.0
    PHOTO_HEIGHT = 80.0
    PHOTO_LEFT = 462.0
    PHOTO_TOP = 19.0
    header.append({
        **_icon('atrium-accent', 'portrait', PHOTO_LEFT, PHOTO_TOP, PHOTO_WIDTH, zIndex=3),
        'id': 'atrium-photo-glyph',
        'photoSlot': 'glyph',
        'photoShape': 'direct',
        'alignWithText': False,
    })
    header[-1]['height'] = PHOTO_HEIGHT

    title_top = cursor_y
    title_h = (
        Builder.measure_block(title, W, title_fs, title_lh, SANS)
        if title else title_lh
    )
    title_prototype = _block(
        title, L, title_top, W, title_h, title_fs, title_lh, ACCENT, SANS,
        zIndex=3, align='center',
    )
    title_prototype['letterSpacing'] = 2.1
    if title:
        title_index = len(header)
        header.append(title_prototype)
        cursor_y += title_h

    contact_fs, contact_icon = (8.4, 10.5)
    contact_els, contact_bottom, contact_descriptor = _place_centered_icon_contacts(
        theme=ICON,
        items=_contact_channel_items(cv),
        center_x=CENTER_X,
        start_y=cursor_y + 16.0,
        max_width=W,
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=C['mute'],
        font=SANS,
        char_width=5.0,
        icon_gap=12.5,
        item_pad=18.0,
        line_step=16.0,
        band_id="contact-main",
    )
    header.extend(contact_els)
    # Contact labels render slightly deeper than their placement baseline. A
    # 26 pt baseline-to-rule interval leaves a calm ~15 pt visual clearance
    # below the second row instead of letting glyph descenders touch the rule.
    terminator_y = contact_bottom + 26.0
    header.extend(_header_rule(CENTER_X, terminator_y))
    # Masthead never joins section packing — a short phone line above a rule
    # would otherwise be mistaken for a heading by the rhythm knobs.
    header = [{**element, "flowRole": "masthead"} for element in header]
    # The band anchor must keep its own flowRole ("masthead-anchor"), so append it
    # AFTER the masthead spread above (which would otherwise overwrite it).
    header.append(build_contact_band_anchor(contact_descriptor))
    # Re-point the name/title references at their post-comprehension copies
    # (see the comment above `name_index`) and tag them for the masthead
    # identity manager. Atrium never bakes uppercase into the name or title.
    name_el = header[name_index] if name_index is not None else None
    title_el = header[title_index] if title_index is not None else None
    if name_el is not None:
        header.append(tag_masthead_identity(
            name_el, title_el,
            title_prototype=title_prototype,
            band_id="masthead-main", name_default_uppercase=False,
            title_default_uppercase=False,
            band_top=title_top + title_h + 16.0,
            # An existing title keeps Atrium's established 16 pt hide delta.
            # An initially empty slot needs only the title box height: its
            # contacts already include the authored 16 pt gap, so moving that
            # gap again on `+` would place them too low.
            title_reclaim_pt=16.0 if title else title_h,
            contact_band_id="contact-main",
        ))

    # ── Section identity: label + restrained full-column divider ─────────────
    # Headings are anchored at the content column left `L`, exactly like every
    # other single-column template. This keeps them glued to their body through
    # the shared section packer AND through Add-section / `deriveSectionStyle`
    # (which samples the heading's `left` and reuses it — a centered heading has
    # no stable left, so an added section landed off the column axis). The bold
    # accent label and two-tone divider create a clear scan line without adding
    # icons, frames, or sidebars. The centered masthead remains the page's axis.
    label_fs = 9.2
    label_ls = 1.25
    SECTION_CHROME = label_fs + 6 + get_spacing().after_rule + 6

    def section(label: str) -> None:
        y = b.y
        page = b.pg
        heading = _text(label, label_fs, SANS, ACCENT, L, y, zIndex=3, page=page)
        heading['letterSpacing'] = label_ls
        heading['bold'] = True
        heading['flowRole'] = 'section-chrome'
        b.els.append(heading)
        # A short sage lead-in identifies the section; the pale continuation
        # organizes the column without turning into a heavy underline.
        tick_y = y + label_fs + 5.0
        accent_rule = _line(L, tick_y, 18, 1.2, ACCENT, zIndex=2, page=page)
        accent_rule['flowRole'] = 'section-chrome'
        b.els.append(accent_rule)
        quiet_rule = _line(L + 26, tick_y, W - 26, 1, RULE, zIndex=2, page=page)
        quiet_rule['flowRole'] = 'section-chrome'
        b.els.append(quiet_rule)
        b.y = tick_y + 1.2 + get_spacing().after_rule

    def close_section() -> None:
        b.gap(get_spacing().section)

    # The enlarged contact-to-rule safety interval consumes 7 pt from the
    # existing whitespace below the rule. Keeping the original body start
    # preserves page capacity while retaining a generous 29 pt visual break.
    start_y = terminator_y + 1.0 + SPACE_AFTER_HEADER_RULE - 7.0
    b = Builder(start_y)

    BODY_FS, BODY_LH = (9.6, 14.1)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=10.8, title_lh=13.8, meta_fs=8.4, meta_lh=11.8,
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
                title_fs=10.8, title_lh=13.8, meta_fs=8.4, meta_lh=11.8,
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
                b, education_entries[0], W, SANS, degree_fs=10.2, degree_lh=13.2,
                meta_fs=8.4, meta_lh=11.8, body_fs=9.4, body_lh=13.8,
            ),
        )
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W, ink=C['ink'], muted=C['mute'], body=C['body'], font=SANS,
                degree_fs=10.2, degree_lh=13.2, meta_fs=8.4, meta_lh=11.8,
                body_fs=9.4, body_lh=13.8,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()
    if _place_skills_section(
        b, cv, section, L, W, C['body'], SANS, BODY_FS, BODY_LH,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body'], 'accent': C['accent']}, L, W, SANS,
                    fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME)

    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.append(
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}
        )
        # Centered footer page number.
        page_decorations.append(
            {**_text(f'{page:02d}', 8, SANS, C['mute'], CENTER_X - 6, 806, page=page),
             'fixedToPage': True}
        )
        # Continuation pages carry no top ornament — just the footer page number.
        # (An earlier build repeated the masthead crosshair here; it read as a
        # stray "+" floating above the first continued heading.)
    return page_decorations + header + flow
