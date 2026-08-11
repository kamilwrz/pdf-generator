"""Slate CV template: a steel-blue/graphite two-column sidebar with a
rectilinear "blueprint" decoration language.

Slate shares the proven Tessera information architecture (a fixed left rail that
owns the rectangular photo slot, contact rows, and as many complete compact
sections as fit, with overflow moving into the main column) but its visual
identity is deliberately distinct from Tessera. Where Tessera uses warm mosaic
tiles, coral circles, ochre ellipses, and a serif masthead, Slate uses a cool
palette and only filled/outlined rectangles: solid steel-blue heading badges
with white glyphs, a filled title pill, a 3x3 precision-grid ornament, and
drafting-style corner brackets around the photo. There are no circles or
ellipses — the rectilinear vocabulary is the point of difference.
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
    _contact_line_core,
    _labels,
    _place_skills_section,
)


def _gen_slate(cv: dict) -> list[dict]:
    """Generate Slate's two-column, blueprint-style CV layout.

    The left rail owns the rectangular photo placeholder, contact rows, and as
    many complete compact sections as fit. Overflow sections move to the main
    column instead of being truncated. Main-column records use Builder page flow
    and remain atomic through ``flowGroup`` tags.
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
    # White glyphs sit inside filled accent badges; accent glyphs sit bare on the
    # paper for contact rows and the photo placeholder.
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
        return {**element, "fixedToPage": True, "locked": True}

    # Rectangular photo placeholder with a drafting-style decoration: a light
    # tint fill, an offset "shadow" frame behind the main outline, two accent
    # corner registration squares, and a solid accent base bar. The portrait
    # glyph is separate so a user photo can replace it without removing the
    # surrounding decoration. Only this cluster is inert (fixedToPage + locked);
    # contact rows and fitted sidebar sections stay editable.
    photo_left, photo_top, photo_width, photo_height = 33, 40, 112, 126
    portrait_size = 46
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

    # Contact rows use bare accent glyphs (no badge) so they read as metadata
    # rather than section headings, matching the reference layout.
    contact_top = 194.0
    sidebar_static: list[dict] = [
        *photo,
        *sidebar_heading("KONTAKT", "references", contact_top),
    ]
    contact_y = contact_top + 28
    from app.services.cv_templates.shared.contact import _sidebar_contact_items
    contacts = _sidebar_contact_items(cv)
    for icon_name, value in contacts:
        if not value:
            continue
        sidebar_static.extend([
            fixed_icon(icon_theme_accent, icon_name, side_left, contact_y, 11),
            _text(value, 7.3, sans, colors["body"], side_left + 17, contact_y + 1, zIndex=3),
        ])
        contact_y += 19

    # Slate follows the shared sidebar order (skills, languages, certifications,
    # interests, education). Every chosen section must fit in full; the remainder
    # is rendered in the main flow below experience.
    candidates = _sidebar_candidates(cv, labels)
    fitted_sections, sidebar_keys = _fit_sidebar_sections(
        candidates,
        width=side_body_width,
        start_y=max(contact_y + 20, 320),
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

    # Masthead: geometric sans name, a filled accent title pill, a muted contact
    # line, and a 3x3 precision-grid ornament in the top-right corner.
    name = _compact_text(cv.get("name"), 30).upper()
    title = _compact_text(cv.get("title"), 48).upper()
    # Masthead stays email/phone/location only; socials live in the KONTAKT rail.
    contact_line = _compact_text(_contact_line_core(cv), 80)
    header = [
        _text(name, 24, sans, colors["ink"], main_left, 48, zIndex=3, bold=True),
    ]
    header[0]["letterSpacing"] = 0.4
    if title:
        # Size the pill to the (truncated) title so white text never spills onto
        # the white paper. 5.4 px/char at 8.2 pt tracked, plus horizontal padding,
        # capped at the main column width.
        pill_width = max(120.0, min(float(main_width), len(title) * 5.4 + 24))
        header.append(_line(main_left, 86, pill_width, 20, colors["accent"], zIndex=1))
        role = _text(title, 8.2, sans, colors["white"], main_left + 12, 92, zIndex=3, bold=True)
        role["letterSpacing"] = 1.15
        header.append(role)
    header.extend([
        _text(contact_line, 7.8, sans, colors["muted"], main_left, 119, zIndex=3),
        _line(main_left, 141, main_width, 1, colors["hairline"], zIndex=2),
    ])
    # 3x3 grid of small accent squares (the "precision grid" motif). Positioned
    # in the top-right corner, slightly above the name baseline so ordinary names
    # clear it. Very long names may still reach it — an accepted decorative
    # tolerance shared with Tessera's corner ornament.
    grid_x, grid_y, pitch, cell = 505, 39, 9, 5
    for row in range(3):
        for col in range(3):
            header.append(_line(
                grid_x + col * pitch, grid_y + row * pitch, cell, cell, colors["accent"], zIndex=2,
            ))

    builder = SlateBuilder(141 + SPACE_AFTER_HEADER_RULE)
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
            builder, cv, "after_experience", section, {"body": colors["body"]},
            main_left, main_width, sans, fs=body_fs, lh=body_lh,
            skip_indices=sidebar_extra_indices,
            section_chrome_h=section_chrome,
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
        builder, cv, "after_skills", section, {"body": colors["body"]},
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
            # Page number sits inside a small filled accent tab.
            {**_line(514, 802, 20, 15, colors["accent"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 7.6, sans, colors["white"], 519, 805, zIndex=3, page=page), "fixedToPage": True},
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
    header = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in header
    ]
    return page_decorations + sidebar + header + flow
