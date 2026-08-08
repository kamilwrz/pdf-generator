"""Tessera CV template: an aubergine/coral editorial sidebar with mosaic icons."""
from __future__ import annotations

from app.services.cv_generator_primitives import (
    get_spacing,
    A4_H,
    SPACE_AFTER_HEADER_RULE,
    Builder,
    _circle,
    _ellipse,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _sidebar_candidates,
)
from app.services.cv_templates.shared.icons import _icon, _icon_beside, _icon_key_for_label
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
    _skills_inline_content,
)


def _gen_tessera(cv: dict) -> list[dict]:
    """Generate Tessera's original two-column, mosaic-tile CV layout.

    The left rail owns the rectangular photo placeholder, contact rows, and as
    many complete compact sections as fit. Overflow sections move to the main
    column instead of being truncated. Main-column records use Builder page
    flow and remain atomic through ``flowGroup`` tags.
    """
    colors = {
        "paper": "#FCF8F2",
        "sidebar": "#F2DDD2",
        "ink": "#2D2530",
        "body": "#463E47",
        "muted": "#806F78",
        "aubergine": "#4A2347",
        "coral": "#E15D4F",
        "ochre": "#DCA65A",
        "tile": "#F7E9DF",
        "rule": "#D8C5C7",
        "white": "#FFFDFC",
    }
    side_width = 178
    main_left, main_width = 218, 329
    side_left, side_body_width = 25, 128
    sans, display = "Montserrat", "PlayfairDisplay"
    icon_theme = "tessera"
    labels = _labels(cv)

    class TesseraBuilder(Builder):
        """Use a compact continuation inset while preserving shared pagination."""

        def continuation_top(self) -> float:
            return 58.0

    def sidebar_icon(name: str, left: float, top: float, size: float = 12) -> dict:
        """Return an exact-position aubergine icon for the fixed sidebar."""
        icon = _icon(icon_theme, name, left, top, size)
        icon["alignWithText"] = False
        return icon

    # Rectangular photo placeholder with offset frame and orbit/node motif. The
    # image glyph is intentionally separate so a user photo can replace it
    # without removing the surrounding Tessera decoration.
    #
    # Only this decorative cluster is inert (`fixedToPage` + `locked`). Contact
    # rows and fitted sidebar sections stay editable — Tessera does
    # not repeat personal sidebar data on continuation pages.
    photo_left, photo_top, photo_width, photo_height = 33, 40, 112, 126

    def lock_chrome(element: dict) -> dict:
        return {**element, "fixedToPage": True, "locked": True}

    photo = [
        lock_chrome(_ellipse(20, 25, 138, 80, colors["ochre"], borderWidth=1.1, zIndex=1)),
        lock_chrome(_circle(136, 26, 19, colors["coral"], filled=True, zIndex=2)),
        lock_chrome(_line(
            photo_left - 7, photo_top + 8, photo_width, photo_height, colors["tile"], zIndex=1,
        )),
        lock_chrome({
            **_rect(
                photo_left, photo_top, photo_width, photo_height,
                colors["aubergine"], 1.2, zIndex=3,
            ),
            "id": "tessera-photo-frame",
            "photoSlot": "frame",
        }),
        lock_chrome({
            **sidebar_icon(
                "portrait",
                photo_left + (photo_width - 48) / 2,
                photo_top + (photo_height - 48) / 2,
                48,
            ),
            "id": "tessera-photo-glyph",
            "photoSlot": "glyph",
        }),
        lock_chrome(_circle(
            photo_left - 5, photo_top + photo_height - 8, 12, colors["coral"], filled=True, zIndex=4,
        )),
    ]

    def sidebar_heading(label: str, icon_name: str, top: float) -> list[dict]:
        """Build a compact icon tile + heading + short keyline."""
        tile = _line(side_left, top - 2, 18, 18, colors["white"], zIndex=2)
        outline = _rect(side_left + 2, top, 18, 18, colors["coral"], 0.8, zIndex=3)
        icon = sidebar_icon(icon_name, side_left + 4, top + 2, 12)
        heading = _text(
            label, 7.6, sans, colors["aubergine"], side_left + 26, top + 3,
            zIndex=3, bold=True,
        )
        heading["letterSpacing"] = 0.85
        return [tile, outline, icon, heading, _line(side_left + 26, top + 16, 50, 1, colors["coral"], zIndex=2)]

    # Contact rows use dedicated icons rather than text symbols so canvas and
    # PDF export share the same geometry and visual weight.
    contact_top = 194.0
    sidebar_static: list[dict] = [
        *photo,
        *sidebar_heading("KONTAKT", "references", contact_top),
    ]
    contact_y = contact_top + 28
    contacts = (
        ("phone", _compact_text(cv.get("phone"), 28)),
        ("email", _compact_text(cv.get("email"), 42)),
        ("github", _compact_text(cv.get("github") or cv.get("website") or cv.get("link"), 36)),
        ("location", _compact_text(cv.get("location"), 34)),
    )
    for icon_name, value in contacts:
        if not value:
            continue
        sidebar_static.extend([
            sidebar_icon(icon_name, side_left, contact_y, 11),
            _text(value, 7.3, sans, colors["body"], side_left + 17, contact_y + 1, zIndex=3),
        ])
        contact_y += 19

    # Tessera deliberately prioritises education before skill lists, unlike the
    # shared generic order. Every chosen section must fit in full; the remainder
    # is rendered in the main flow below experience.
    candidates = _sidebar_candidates(cv, labels)
    candidate_order = {
        "education": 0,
        "skills": 1,
        "languages": 2,
        "certifications": 3,
        "interests": 4,
    }
    candidates.sort(key=lambda candidate: (
        candidate_order.get(candidate.get("kind"), 99),
        candidate.get("key", ""),
    ))
    fitted_sections, sidebar_keys = _fit_sidebar_sections(
        candidates,
        width=side_body_width,
        start_y=max(contact_y + 20, 320),
        # Sidebar bodies are lowered 6 px below the generic fitted heading
        # baseline to clear the 18 px mosaic tile, so reserve that offset here.
        bottom_y=760,
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
        sidebar_static.append({
            "category": "textarea",
            "content": section_data["content"],
            "left": side_left,
            "top": float(section_data["body_top"]) + 6,
            "width": side_body_width,
            "height": float(section_data["body_height"]),
            "fontSize": float(section_data["fontSize"]),
            "lineHeight": float(section_data["lineHeight"]),
            "letterSpacing": 0,
            "color": colors["body"],
            "fontFamily": sans,
            "zIndex": 3,
            "page": 1,
            "bold": False,
            "italic": False,
            "align": "left",
            "bulletList": bool(section_data.get("bulletList")),
            "autoHeight": True,
            "preserveInitialLayout": True,
        })

    # Personal masthead is separated from the reference by serif typography,
    # an offset coral role tile, and an abstract mosaic at the top-right.
    name = _compact_text(cv.get("name"), 34).upper()
    title = _compact_text(cv.get("title"), 56).upper()
    contact_line = _compact_text(_contact_line(cv), 80)
    header = [
        _text(name, 24, display, colors["aubergine"], main_left, 48, zIndex=3, bold=True),
        _line(main_left, 88, 164, 22, colors["coral"], zIndex=1),
        _text(title, 8.2, sans, colors["white"], main_left + 10, 94, zIndex=3, bold=True),
        _text(contact_line, 7.8, sans, colors["muted"], main_left, 121, zIndex=3),
        _line(main_left, 143, main_width, 1, colors["rule"], zIndex=2),
        _rect(491, 42, 41, 41, colors["aubergine"], 1.1, zIndex=2),
        _line(499, 50, 41, 41, colors["tile"], zIndex=1),
        _circle(506, 58, 13, colors["coral"], filled=True, zIndex=3),
        _ellipse(487, 90, 56, 15, colors["ochre"], borderWidth=1, zIndex=2),
    ]
    header[0]["letterSpacing"] = 0.2
    header[2]["letterSpacing"] = 1.15

    builder = TesseraBuilder(143 + SPACE_AFTER_HEADER_RULE)
    body_fs, body_lh = 9.0, 13.2
    heading_fs = 8.1
    section_chrome = section_chrome_height(heading_fs) + 8

    def section(label: str) -> None:
        """Render an offset mosaic tile, custom icon, label, and keyline."""
        cursor, page = builder.y, builder.pg
        icon_name = _icon_key_for_label(label)
        chrome = [
            _line(main_left, cursor - 2, 20, 20, colors["tile"], zIndex=1, page=page),
            _rect(main_left + 2, cursor, 20, 20, colors["coral"], 0.8, zIndex=2, page=page),
            _circle(main_left + 16, cursor - 3, 7, colors["ochre"], filled=True, zIndex=3, page=page),
            _icon_beside(icon_theme, icon_name, main_left + 5, cursor + 3, heading_fs, 12, page=page),
        ]
        for element in chrome:
            element["flowRole"] = "section-chrome"
        builder.els.extend(chrome)
        heading = _text(
            label, heading_fs, sans, colors["aubergine"], main_left + 30,
            cursor + 3, zIndex=3, page=page, bold=True,
        )
        heading["letterSpacing"] = 1.0
        heading["flowRole"] = "section-chrome"
        builder.els.append(heading)
        builder.y = cursor + 21
        builder.line(main_left + 30, main_width - 30, 1, colors["rule"])
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
                muted=colors["coral"],
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
        skills = _skills_inline_content(cv.get("skills"))
        if skills:
            skills_height = builder.measure_block(
                skills, main_width, body_fs, body_lh, sans,
            )
            builder.need_section(section_chrome, skills_height)
            section(labels["skills"])
            builder.block(
                skills, main_left, main_width, body_fs, body_lh,
                colors["body"], sans,
            )
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

    # Keep a recognisable rail on continuation pages without duplicating
    # personal data. Sidebar content itself is fixed to page 1.
    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations.extend([
            {**_line(0, 0, 595, A4_H, colors["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, side_width, A4_H, colors["sidebar"], zIndex=1, page=page), "fixedToPage": True},
            {**_line(side_width, 0, 4, A4_H, colors["coral"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(main_left, 798, main_width, 1, colors["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, sans, colors["muted"], 524, 807, zIndex=3, page=page), "fixedToPage": True},
            {**_circle(24, 800, 8, colors["coral"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_ellipse(42, 797, 44, 10, colors["ochre"], borderWidth=1, zIndex=2, page=page), "fixedToPage": True},
        ])

    # Keep sidebar personal content interactive. Decorative page rails and the
    # photo chrome already carry fixedToPage; do not blanket-lock the rail.
    sidebar = [
        {
            **element,
            "page": 1,
            "flowRole": element.get("flowRole", "content"),
        }
        for element in sidebar_static
    ]
    header = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in header
    ]
    return page_decorations + sidebar + header + flow
