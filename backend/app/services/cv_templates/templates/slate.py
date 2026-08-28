"""Slate CV template: a steel-blue/graphite two-column sidebar with a
rectilinear "blueprint" decoration language.

Slate shares the proven Tessera information architecture (a fixed left rail that
owns the rectangular photo slot and as many complete compact sections as fit,
with overflow moving into the main column) but its visual identity is
deliberately distinct from Tessera. Where Tessera uses warm mosaic tiles, coral
circles, ochre ellipses, and a serif masthead, Slate uses a cool palette and
only filled/outlined rectangles: solid steel-blue heading badges with white
glyphs, a filled title pill, and drafting-style corner brackets around the
photo. There are no circles or ellipses — the
rectilinear vocabulary is the point of difference.

Contact is masthead-only (wrapping accent icon+label rows under the name/role
pill), never a duplicated KONTAKT block in the rail — same channel set and
placer as Tessera.
"""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    get_spacing,
    A4_H,
    SPACE_AFTER_HEADER_RULE,
    Builder,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_wrapping_icon_contacts,
    build_contact_band_anchor,
)
from app.services.cv_templates.shared.masthead import tag_masthead_identity
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _fitted_sidebar_body_elements,
    _sidebar_candidates,
)
from app.services.cv_templates.shared.icons import _icon, _icon_key_for_label
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _compact_text,
    _labels,
    _place_skills_section,
)


def _gen_slate(cv: dict) -> list[dict]:
    """Generate Slate's two-column, blueprint-style CV layout.

    The left rail owns the rectangular photo placeholder and as many complete
    compact sections as fit. Overflow sections move to the main column instead
    of being truncated. Contact lives only in the masthead as wrapping
    icon+label rows. Main-column records use Builder page flow and remain
    atomic through ``flowGroup`` tags.
    """
    colors = {
        "paper": "#FFFFFF",
        "sidebar": "#F1F4F8",
        "ink": "#1C2530",
        "body": "#3A424C",
        "muted": "#7A8794",
        "accent": "#3E5C76",
        "hairline": "#D3DAE2",
        "photo_bg": "#E7ECF2",
        "white": "#FFFFFF",
    }
    side_width = 178
    main_left, main_width = 218, 329
    side_left, side_body_width = 25, 128
    # Slate uses a single geometric sans throughout; the masthead differs from
    # Tessera's serif specifically to reinforce the cool, corporate identity.
    sans = "Montserrat"
    # White glyphs sit inside filled accent badges; accent glyphs sit bare on
    # the paper for masthead contacts and the photo placeholder.
    icon_theme = "slate"
    icon_theme_accent = "slate-accent"
    labels = _labels(cv)

    class SlateBuilder(Builder):
        """Use a compact continuation inset while preserving shared pagination."""

        def continuation_top(self) -> float:
            return 58.0

    def fixed_icon(theme: str, name: str, left: float, top: float, size: float = 12,
                   *, zIndex: int = 3) -> dict:
        """Return an exact-position icon for fixed chrome (no text-baseline shift)."""
        icon = _icon(theme, name, left, top, size, zIndex=zIndex)
        icon["alignWithText"] = False
        return icon

    def lock_chrome(element: dict) -> dict:
        # `repeatOnContinuation: False` matches Sterling's letterhead-band
        # convention (sterling.py): page-1-only chrome must opt out
        # explicitly, or the frontend's `cloneFixedPageDecorations`
        # (structureOperation.js) clones this `fixedToPage` photo cluster onto
        # any continuation page the canvas creates without its own generator-
        # authored chrome (e.g. overflow from the main ↔ sidebar section
        # transfer control) — duplicating the portrait frame on every later
        # page.
        return {**element, "fixedToPage": True, "locked": True, "repeatOnContinuation": False}

    # Rectangular photo placeholder with a drafting-style decoration: a light
    # tint fill, an offset "shadow" frame behind the main outline, two accent
    # corner registration squares, and a solid accent base bar. The portrait
    # glyph is separate so a user photo can replace it without removing the
    # surrounding decoration. Only this cluster is inert (fixedToPage + locked);
    # fitted sidebar sections stay editable.
    photo_left, photo_top, photo_width, photo_height = 33, 40, 112, 126
    portrait_size = 46
    # First sidebar section starts under the photo; contact no longer occupies
    # the rail, so reclaim that band for skills / languages / education.
    sidebar_sections_start = photo_top + photo_height + 28  # 194
    photo = [
        lock_chrome(_line(
            photo_left, photo_top, photo_width, photo_height, colors["photo_bg"], zIndex=1,
        )),
        lock_chrome(_rect(
            photo_left + 6, photo_top + 6, photo_width, photo_height,
            colors["hairline"], 0.9, zIndex=1,
        )),
        lock_chrome({
            **_rect(
                photo_left, photo_top, photo_width, photo_height,
                colors["ink"], 1.3, zIndex=3,
            ),
            "id": "slate-photo-frame",
            "photoSlot": "frame",
        }),
        lock_chrome({
            **fixed_icon(
                icon_theme_accent, "portrait",
                photo_left + (photo_width - portrait_size) / 2,
                photo_top + (photo_height - portrait_size) / 2,
                portrait_size,
            ),
            "id": "slate-photo-glyph",
            "photoSlot": "glyph",
        }),
        lock_chrome(_line(photo_left - 4, photo_top - 4, 9, 9, colors["accent"], zIndex=4)),
        lock_chrome(_line(
            photo_left + photo_width - 5, photo_top + photo_height - 5, 9, 9,
            colors["accent"], zIndex=4,
        )),
        lock_chrome(_line(
            photo_left, photo_top + photo_height + 4, photo_width, 4, colors["accent"], zIndex=2,
        )),
    ]
    # The entire drafting cluster is one user-facing photo slot. Tagging every
    # member lets hide/show remove the underlay, registration marks, and base
    # bar together with the frame and portrait glyph.
    photo = [{**element, "photoSlot": element.get("photoSlot", "ornament")} for element in photo]

    def sidebar_heading(label: str, icon_name: str, top: float) -> list[dict]:
        """Build a filled accent badge + white glyph + heading + short keyline."""
        badge = _line(side_left, top, 16, 16, colors["accent"], zIndex=2)
        glyph = fixed_icon(icon_theme, icon_name, side_left + 2, top + 2, 12)
        heading = _text(
            label, 7.6, sans, colors["ink"], side_left + 24, top + 3, zIndex=3, bold=True,
        )
        heading["letterSpacing"] = 0.85
        keyline = _line(side_left + 24, top + 16, 46, 1, colors["accent"], zIndex=2)
        # Sidebar chrome is packed by `packSidebarLane`, never by the main
        # column section list (see sectionStructure.js).
        return [
            {**element, "flowRole": "sidebar-chrome"}
            for element in (badge, glyph, heading, keyline)
        ]

    # Photo chrome only — contact is exclusively in the masthead (see below).
    sidebar_static: list[dict] = [*photo]

    # Slate follows the shared sidebar order (skills, languages, certifications,
    # interests, education). Every chosen section must fit in full; the remainder
    # is rendered in the main flow below experience.
    candidates = _sidebar_candidates(cv, labels)
    fitted_sections, sidebar_keys = _fit_sidebar_sections(
        candidates,
        width=side_body_width,
        start_y=sidebar_sections_start,
        # Sidebar bodies are lowered 6 px below the generic fitted heading
        # baseline to clear the 16 px badge, so reserve that offset here.
        bottom_y=760,
        font=sans,
    )
    sidebar_extra_indices = {
        section["extra_index"]
        for section in fitted_sections
        if isinstance(section.get("extra_index"), int)
    }
    for section_data in fitted_sections:
        icon_name = _icon_key_for_label(section_data["title"])
        top = float(section_data["top"])
        sidebar_static.extend(sidebar_heading(section_data["title"], icon_name, top))
        # Education becomes diploma / school / meta / bullet elements; flat
        # sections (skills, languages, …) stay a single textarea.
        sidebar_static.extend(_fitted_sidebar_body_elements(
            section_data,
            left=side_left,
            width=side_body_width,
            ink=colors["ink"],
            muted=colors["muted"],
            body=colors["body"],
            font=sans,
        ))

    # Masthead: geometric sans name, filled accent title pill, and wrapping
    # accent-icon contact channels (phone / email / socials / location).
    # Case is applied at draw time via the reversible `textTransform` flag
    # (see `tag_masthead_identity` below) instead of baking `.upper()` into the
    # stored content, so the masthead identity manager can toggle case without
    # losing the original-case name.
    name = _compact_text(cv.get("name"), 30)
    title = _compact_text(cv.get("title"), 48)
    contact_fs, contact_icon = 7.8, 11.0
    # Accent glyphs on white paper (slate white glyphs would vanish). Same
    # placer / channel order as Tessera so LinkedIn / GitHub / website wrap
    # onto a second row and push the header rule with them.
    contact_els, contact_bottom, contact_descriptor = _place_wrapping_icon_contacts(
        theme=icon_theme_accent,
        items=_contact_channel_items(cv),
        start_x=float(main_left),
        start_y=119.0,
        right_limit=float(main_left + main_width),
        text_fs=contact_fs,
        icon_size=contact_icon,
        text_color=colors["muted"],
        font=sans,
        char_width=5.0,
        icon_gap=15.0,
        item_pad=16.0,
        line_step=16.0,
        band_id="contact-main",
    )
    header_rule_y = contact_bottom + 22.0
    # Track the masthead name/title positions so they can be re-pointed after the
    # flowRole comprehension below copies every element into a new dict (that copy
    # would otherwise discard the tags added later by `tag_masthead_identity`).
    name_index = 0
    title_index: int | None = None
    # Keep the identity cluster close to the body: the 32 pt name-to-pill
    # offset leaves a deliberate optical gap while avoiding a top-heavy page.
    header = [
        _text(name, 24, sans, colors["ink"], main_left, 60, zIndex=3, bold=True),
    ]
    header[0]["letterSpacing"] = 0.4
    # Size the pill to the truncated title so tracked white text stays inside
    # the accent field. The extra 16 px covers small differences between the
    # deterministic estimate and the loaded browser font. With empty content,
    # keep this minimum-width pill and the title only as descriptor prototypes;
    # rendering them would leave a blank accent bar on the generated page.
    pill_width = max(120.0, min(float(main_width), len(title) * 5.4 + 40))
    title_bar = _line(main_left, 92, pill_width, 20, colors["accent"], zIndex=1)
    title_bar["titleDecoration"] = {
        "minWidth": 120.0, "maxWidth": float(main_width),
        "horizontalPadding": 24.0,
    }
    title_prototype = _text(
        title, 8.2, sans, colors["white"], main_left + 12, 98,
        zIndex=3, bold=True,
    )
    title_prototype["letterSpacing"] = 1.15
    if title:
        header.append(title_bar)
        title_index = len(header)
        header.append(title_prototype)
    header.extend([
        *contact_els,
        _line(main_left, header_rule_y, main_width, 1, colors["hairline"], zIndex=2),
    ])
    builder = SlateBuilder(header_rule_y + 1.0 + SPACE_AFTER_HEADER_RULE)
    body_fs, body_lh = 9.0, 13.2
    heading_fs = 8.1
    section_chrome = section_chrome_height(heading_fs) + 8

    def section(label: str) -> None:
        """Render a filled accent badge, white glyph, label, and hairline rule."""
        cursor, page = builder.y, builder.pg
        icon_name = _icon_key_for_label(label)
        badge = _line(main_left, cursor, 18, 18, colors["accent"], zIndex=2, page=page)
        glyph = fixed_icon(icon_theme, icon_name, main_left + 3, cursor + 3, 12)
        glyph["page"] = page
        chrome = [badge, glyph]
        for element in chrome:
            element["flowRole"] = "section-chrome"
        builder.els.extend(chrome)
        heading = _text(
            label, heading_fs, sans, colors["ink"], main_left + 26,
            cursor + 4, zIndex=3, page=page, bold=True,
        )
        heading["letterSpacing"] = 1.0
        heading["flowRole"] = "section-chrome"
        builder.els.append(heading)
        builder.y = cursor + 21
        builder.line(main_left + 26, main_width - 26, 1, colors["hairline"])
        builder.els[-1]["flowRole"] = "section-chrome"
        builder.gap(get_spacing().after_rule)

    def close_section() -> None:
        builder.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            builder, job, main_width, sans,
            title_fs=10.4, title_lh=13.4,
            meta_fs=8.3, meta_lh=11.4,
            body_fs=body_fs, body_lh=body_lh,
        )

    def education_height(education: dict) -> float:
        return _education_record_height(
            builder, education, main_width, sans,
            degree_fs=10.2, degree_lh=13,
            meta_fs=8.3, meta_lh=11.4,
            body_fs=8.8, body_lh=13,
        )

    if cv.get("summary"):
        summary_height = builder.measure_block(
            cv["summary"], main_width, body_fs, body_lh, sans,
        )
        builder.need_section(section_chrome, summary_height)
        section(labels["summary"])
        builder.block(
            cv["summary"], main_left, main_width, body_fs, body_lh,
            colors["body"], sans,
        )
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        builder.need_section(section_chrome, experience_height(jobs[0]))
        section(labels["experience"])
        for index, job in enumerate(jobs):
            _place_experience_record(
                builder, job, main_left, main_width,
                ink=colors["ink"],
                muted=colors["accent"],
                body=colors["body"],
                font=sans,
                title_fs=10.4,
                title_lh=13.4,
                meta_fs=8.3,
                meta_lh=11.4,
                body_fs=body_fs,
                body_lh=body_lh,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            builder, cv, "after_experience", section, {"body": colors["body"], "accent": colors.get("accent", colors["body"])},
            main_left, main_width, sans, fs=body_fs, lh=body_lh,
            skip_indices=sidebar_extra_indices,
            section_chrome_h=section_chrome,
            languages_columns=3,
        )

    if cv.get("education") and "education" not in sidebar_keys:
        entries = cv["education"]
        builder.need_section(section_chrome, education_height(entries[0]))
        section(labels["education"])
        for index, education in enumerate(entries):
            _place_education_record(
                builder, education, main_left, main_width,
                ink=colors["ink"],
                muted=colors["muted"],
                body=colors["body"],
                font=sans,
                degree_fs=10.2,
                degree_lh=13,
                meta_fs=8.3,
                meta_lh=11.4,
                body_fs=8.8,
                body_lh=13,
                after_gap=get_spacing().record if index < len(entries) - 1 else None,
            )
        close_section()

    if "skills" not in sidebar_keys:
        if _place_skills_section(
            builder, cv, section, main_left, main_width, colors["body"], sans,
            body_fs, body_lh, section_chrome_h=section_chrome,
        ):
            close_section()

    _extra_sections(
        builder, cv, "after_skills", section, {"body": colors["body"], "accent": colors.get("accent", colors["body"])},
        main_left, main_width, sans, fs=body_fs, lh=body_lh,
        skip_indices=sidebar_extra_indices,
        section_chrome_h=section_chrome,
    )

    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in builder.build()
    ]
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])

    # Keep a recognisable rail on continuation pages without duplicating personal
    # data. Sidebar content itself is fixed to page 1.
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.extend([
            {**_line(0, 0, 595, A4_H, colors["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, side_width, A4_H, colors["sidebar"], zIndex=1, page=page), "fixedToPage": True},
            # Thin accent hairline on the inner sidebar edge (2 px, versus
            # Tessera's 4 px coral bar).
            {**_line(side_width, 0, 2, A4_H, colors["accent"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(main_left, 798, main_width, 1, colors["hairline"], zIndex=2, page=page), "fixedToPage": True},
            # Keep the page-number tab aligned to the footer rule; its previous
            # 4 px drop below the rule made the pagination look accidental.
            {**_line(514, 798, 20, 14, colors["accent"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 7.6, sans, colors["white"], 519, 801, zIndex=3, page=page), "fixedToPage": True},
            {**_line(24, 800, 9, 9, colors["accent"], zIndex=3, page=page), "fixedToPage": True},
        ])

    # Keep sidebar personal content interactive. Decorative page rails and the
    # photo chrome already carry fixedToPage; do not blanket-lock the rail.
    sidebar = [
        {
            **element,
            "page": 1,
            "flowRole": element.get("flowRole", "content"),
            "flowLane": "sidebar",
        }
        for element in sidebar_static
    ]
    # Entire masthead (name, role pill, icon contacts, grid, rule) must stay
    # exempt from section packing — same contract as Tessera.
    header = [
        {**element, "flowRole": "masthead"}
        for element in header
    ]
    # Append the band anchor after the masthead spread so its own flowRole
    # ("masthead-anchor") is preserved rather than overwritten to "masthead".
    header.append(build_contact_band_anchor(contact_descriptor))
    # Re-point the name/title references at their post-comprehension copies and
    # tag them for the masthead identity manager. Slate's design uppercases both
    # the name and the pill title, so both seed the reversible `textTransform`
    # flag; `band_top` matches the contact band's `start_y` (119.0) so the client
    # can compute the title-hide reflow delta.
    name_el = header[name_index]
    title_el = header[title_index] if title_index is not None else None
    title_decoration = header[title_index - 1] if title_index is not None else title_bar
    header.append(tag_masthead_identity(
        name_el, title_el,
        title_prototype=title_prototype,
        band_id="masthead-main", name_default_uppercase=True,
        title_default_uppercase=True, band_top=119.0,
        # Slate reserves the contact row independently from its title pill.
        # An initially absent pill is therefore restored with zero reflow.
        title_reclaim_pt=0.0 if not title else None,
        contact_band_id="contact-main",
        title_decorations=[title_decoration],
    ))
    return page_decorations + sidebar + header + flow
