from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    get_spacing,
    Builder,
    _block,
    _circle,
    _line,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import _flatten_extra_items
from app.services.cv_templates.shared.records import (
    _education_bullet_items,
    _education_school,
)
from app.services.cv_data import skill_groups, skills_have_content
from app.services.cv_templates.shared.text import (
    _bullets,
    _compact_text,
    _labels,
)
from app.services.cv_templates.shared.icons import _icon, _icon_beside

def _gen_harbor(cv: dict) -> list[dict]:
    """Generate the Harbor two-column layout.

    The main column (summary + experience) and right sidebar (education,
    skills, languages, tools as teal-diamond lists) use independent measured
    flows. Either column may continue on a later page without colliding with
    the other. A single teal accent carries the role line, company names and
    diamond bullets; all other ink is charcoal on white.
    """
    C = {
        "accent": "#17A2B8", "ink": "#2B2B2B", "body": "#3A3A3A",
        "meta": "#7A7A7A", "rule": "#C4C9CE", "photo": "#ECEEF1",
    }
    SANS = "Inter"
    MAIN_X, MAIN_W = 44, 292
    MAIN_R = MAIN_X + MAIN_W  # 336
    SIDE_X, SIDE_W = 364, 187
    lbl = _labels(cv)

    def _hicon(name: str, left: float, top: float, size: float,
               *, accent: bool = False, align: bool = True, page: int = 1,
               flow_role: str = "masthead") -> dict:
        theme = "harbor-accent" if accent else "harbor"
        return {
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/iconic/{theme}/{name}.png",
            "left": left, "top": top, "width": size, "height": size,
            "zIndex": 3, "page": page, "alignWithText": align,
            # Keep icons layout-owned in structural edit (contact, bullets, photo glyph).
            "flowRole": flow_role,
        }

    # ── Header (spans both columns) ─────────────────────────────────────────
    name = _compact_text(cv.get("name"), 32).upper()
    title = _compact_text(cv.get("title"), 48)
    header = [
        {**_text(name, 23, SANS, C["ink"], MAIN_X, 44, zIndex=3, bold=True), "letterSpacing": 0.3},
        _text(title, 11, SANS, C["accent"], MAIN_X, 80, zIndex=3),
    ]
    from app.services.cv_templates.shared.contact import _contact_channel_items
    contacts = _contact_channel_items(cv, email_limit=40, social_limit=36)
    # Single contact row that wraps to a second line when the values are long,
    # so real data cannot overrun the right page margin.
    cx, cy = float(MAIN_X), 104.0
    for key, value in contacts:
        if not value:
            continue
        advance = 15 + len(value) * 4.7 + 14
        if cx > MAIN_X and cx + advance > 551:
            cx, cy = float(MAIN_X), cy + 16
        header.append(_hicon(key, cx, cy, 11))
        header.append({
            **_text(value, 8.4, SANS, C["body"], cx + 15, cy, zIndex=3),
            "flowRole": "masthead",
        })
        cx += advance
    # Name / title join the masthead so spacing packs never treat phone text
    # as a section heading against the header rule.
    header = [{**element, "flowRole": element.get("flowRole") or "masthead"} for element in header]
    # Circular photo placeholder: soft-grey disc + centred grey person glyph.
    # photoSlot lets the editor gallery fit a user photo over this cluster.
    header.append({
        **_circle(493, 36, 58, C["photo"], filled=True, zIndex=2),
        "flowRole": "masthead",
        "id": "harbor-photo-frame",
        "photoSlot": "frame",
        "photoShape": "circle",
    })
    header.append({
        **_hicon("references", 507, 50, 30, align=False),
        "id": "harbor-photo-glyph",
        "photoSlot": "glyph",
    })
    header_rule_y = cy + 22
    header.append({
        **_line(MAIN_X, header_rule_y, SIDE_X + SIDE_W - MAIN_X, 1, C["rule"], zIndex=2),
        "flowRole": "masthead",
    })
    section_start = header_rule_y + 20

    # ── Sidebar (independent flow in the right column) ──────────────────────
    #
    # Sidebar copy must be measured, not advanced by a fixed 15 px cursor.
    # Real education descriptions commonly wrap to two or more lines. Drawing
    # them as compact single-line text both truncated content and let it escape
    # past the page's right edge while subsequent sections kept the old Y step.
    SIDE_BODY_X = SIDE_X + 16
    SIDE_BODY_W = SIDE_W - 16
    SIDE_ITEM_FS, SIDE_ITEM_LH = 8.6, 11.5
    SECTION_CHROME = section_chrome_height(8.8)
    side_b = Builder(section_start)

    def side_section(label: str, first_body_height: float) -> None:
        side_b.need_section(SECTION_CHROME, first_body_height)
        side_b.text(label, 8.8, SANS, C["ink"], SIDE_X)
        side_b.els[-1]["letterSpacing"] = 1.1
        side_b.els[-1]["flowRole"] = "section-chrome"
        side_b.line(SIDE_X, SIDE_W, 1, C["rule"])
        side_b.els[-1]["flowRole"] = "section-chrome"
        side_b.gap(get_spacing().after_rule)

    def side_block(content: str, fs: float, lh: float, color: str, *,
                   bold: bool = False, left: float = SIDE_X,
                   width: float = SIDE_W) -> float:
        return side_b.block(
            str(content or "").strip(), left, width, fs, lh, color, SANS,
            bold=bold, min_h=lh,
        )

    def side_icon_line(icon_name: str, content: str, *, accent: bool = False,
                       color: str | None = None, atomic_pair: bool = False) -> None:
        """Place one sidebar label with a non-stacking icon overlay.

        ``record-overlay`` keeps the icon on the label's Y coordinate when
        browser measurement moves the label. Without that role, the frontend
        interprets both members of a keep-together ``flowGroup`` as consecutive
        vertical rows, separating the glyph from its text and inflating the
        record height.
        """
        text_content = str(content or "").strip()
        if not text_content:
            return
        height = side_b.measure_block(
            text_content, SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, SANS,
            min_h=SIDE_ITEM_LH,
        )
        side_b.need(height)
        top, page = side_b.y, side_b.pg
        side_block(
            text_content, SIDE_ITEM_FS, SIDE_ITEM_LH,
            color or C["ink"], left=SIDE_BODY_X, width=SIDE_BODY_W,
        )
        text_element = side_b.els[-1]
        # Centre the 11px glyph geometrically inside the 11.5px textarea row.
        # Harbor mixes textarea and single-line text metrics, so it must not use
        # the shared Iconic cap offset intended for other templates.
        icon_element = _hicon(
            icon_name, SIDE_X, top + 0.25, 11,
            accent=accent, align=False, page=page,
            flow_role="record-overlay",
        )
        if atomic_pair:
            pair_group = f"record-harbor-side-{len(side_b.els)}"
            text_element["flowGroup"] = pair_group
            icon_element["flowGroup"] = pair_group
        side_b.els.append(icon_element)
        side_b.gap(2)

    if cv.get("education"):
        first_edu = cv["education"][0]
        first_degree = str(first_edu.get("degree") or first_edu.get("title") or "").strip()
        first_height = side_b.measure_block(
            first_degree, SIDE_W, 10, 13, SANS, bold=True, min_h=13,
        )
        side_section(lbl["education"], first_height)
        for edu in cv["education"]:
            degree = str(edu.get("degree") or edu.get("title") or "").strip()
            school = _education_school(edu)
            period = str(edu.get("period") or "").strip()
            city = str(edu.get("city") or "").strip()
            items = _education_bullet_items(edu)

            record_height = 0.0
            for content, width, fs, lh, is_bold in (
                (degree, SIDE_W, 10, 13, True),
                (school, SIDE_W, 9, 12, False),
                (period, SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, False),
                (city, SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, False),
                *((item, SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, False) for item in items),
            ):
                if content:
                    record_height += side_b.measure_block(
                        content, width, fs, lh, SANS, bold=is_bold, min_h=lh,
                    ) + 2

            with side_b.keep_together(record_height):
                side_block(degree, 10, 13, C["ink"], bold=True)
                if school:
                    side_b.gap(2)
                    side_block(school, 9, 12, C["accent"])
                side_icon_line("calendar", period, color=C["meta"])
                side_icon_line("location", city, color=C["meta"])
                for item in items:
                    side_icon_line("diamond", item, accent=True)
            side_b.gap(get_spacing().record)
        side_b.gap(get_spacing().section)

    if skills_have_content(cv.get("skills")):
        groups = skill_groups(cv["skills"])
        first_chip = next(
            (chip for group in groups for chip in group["items"]),
            "",
        )
        first_label = str(groups[0].get("category") or "").strip() if groups else ""
        first_height = side_b.measure_block(
            first_label or first_chip, SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, SANS,
            min_h=SIDE_ITEM_LH,
            bold=bool(first_label),
        )
        side_section(lbl["skills"], first_height)
        for group in groups:
            category = str(group.get("category") or "").strip()
            if category:
                side_block(category, SIDE_ITEM_FS, SIDE_ITEM_LH, C["ink"], bold=True)
                side_b.gap(2)
            for skill in group["items"]:
                side_icon_line("diamond", skill, accent=True, atomic_pair=True)
            if category:
                side_b.gap(get_spacing().stack)
        side_b.gap(get_spacing().section)

    if cv.get("languages"):
        language_lines = []
        for language in cv["languages"]:
            if isinstance(language, dict):
                name = str(language.get("name") or "").strip()
                level = str(language.get("level") or "").strip()
                value = f"{name} — {level}" if name and level else (name or level)
            else:
                value = str(language or "").strip()
            if value:
                language_lines.append(value)
        first_height = (
            side_b.measure_block(
                language_lines[0], SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, SANS,
                min_h=SIDE_ITEM_LH,
            )
            if language_lines else 0
        )
        side_section("JĘZYKI", first_height)
        for language in language_lines:
            side_icon_line("diamond", language, accent=True, atomic_pair=True)
        side_b.gap(get_spacing().section)

    # Every remaining custom section becomes a complete, wrapped diamond list.
    for custom in cv.get("custom_sections") or []:
        items = _flatten_extra_items(custom.get("items"))
        title = str(custom.get("title") or "").strip().upper()
        if not title or not items:
            continue
        first_height = side_b.measure_block(
            items[0], SIDE_BODY_W, SIDE_ITEM_FS, SIDE_ITEM_LH, SANS,
            min_h=SIDE_ITEM_LH,
        )
        side_section(title, first_height)
        for item in items:
            side_icon_line("diamond", item, accent=True, atomic_pair=True)
        side_b.gap(get_spacing().section)

    sidebar = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in side_b.build()
    ]

    # ── Main column (reflows across pages) ──────────────────────────────────
    b = Builder(section_start)

    def section(label: str) -> None:
        b.text(label, 8.8, SANS, C["ink"], MAIN_X)
        b.els[-1]["letterSpacing"] = 1.1
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(MAIN_X, MAIN_W, 1, C["rule"])
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), MAIN_W, 10.5, 13.5, SANS, bold=True, min_h=15)
            + get_spacing().stack
            + b.measure_block(job.get("company", ""), MAIN_W, 9.2, 12, SANS, min_h=12)
        )
        if job.get("period") or job.get("city"):
            height += 2 + 12
        if bullets:
            height += get_spacing().stack + b.measure_block(bullets, MAIN_W, 9, 13.4, SANS, bulletList=True)
        return height

    def job_meta(period: str, city: str) -> None:
        """Place period and location on their own row below the employer.

        The row uses the same 8.6/11.5 typography as education metadata. Its
        first label is a normal flow block, so bullet content always starts
        below it; the second label and both icons are horizontal overlays that
        follow the row without increasing its vertical height.
        """
        values = [
            ("calendar", str(period or "").strip()),
            ("location", str(city or "").strip()),
        ]
        values = [(icon_name, value) for icon_name, value in values if value]
        if not values:
            return

        meta_fs, meta_lh = SIDE_ITEM_FS, SIDE_ITEM_LH
        icon_size, icon_gap, group_gap = 11.0, 4.0, 10.0
        b.gap(2)
        row_top, row_page = b.y, b.pg
        cursor = float(MAIN_X)

        for index, (icon_name, value) in enumerate(values):
            label_left = cursor + icon_size + icon_gap
            # With both values present, reserve a deterministic 110px period
            # slot and give the complete remainder to the city. Font-width
            # estimates repeatedly clipped "Warszawa" because browser Inter
            # metrics differ from ReportLab and vary with zoom.
            if len(values) == 2 and index == 0:
                value_width = 110.0
            else:
                value_width = max(1.0, MAIN_R - label_left)
            icon_element = _hicon(
                icon_name, cursor, row_top + 0.25, icon_size,
                align=False, page=row_page, flow_role="record-overlay",
            )
            b.els.append(icon_element)
            if index == 0:
                b.block(
                    value, label_left, value_width, meta_fs, meta_lh,
                    C["meta"], SANS, min_h=meta_lh,
                )
            else:
                b.els.append({
                    **_block(
                        value, label_left, row_top, value_width, 12,
                        meta_fs, meta_lh, C["meta"], SANS,
                        zIndex=3, page=row_page,
                    ),
                    "autoHeight": False,
                    "flowRole": "record-overlay",
                })
            cursor = label_left + value_width + group_gap

    if cv.get("summary"):
        # Summary shares the experience-bullet type size (9 pt); the project-wide
        # "summary equals body" rule keeps the lead paragraph from reading a step
        # larger than the records beneath it.
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], MAIN_W, 9, 13.4, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], MAIN_X, MAIN_W, 9, 13.4, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), MAIN_X, MAIN_W, 10.5, 13.5, C["ink"], SANS, bold=True, min_h=15)
                b.gap(get_spacing().stack)
                b.block(job.get("company", ""), MAIN_X, MAIN_W, 9.2, 12, C["accent"], SANS, min_h=12)
                job_meta(job.get("period", ""), job.get("city", ""))
                bullets = _bullets(job)
                if bullets:
                    b.gap(get_spacing().stack)
                    b.block(bullets, MAIN_X, MAIN_W, 9, 13.4, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        close_section()

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + sidebar + flow] or [1])

    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, "#FFFFFF", zIndex=0, page=page), "fixedToPage": True},
            {**_line(MAIN_X, 806, SIDE_X + SIDE_W - MAIN_X, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["meta"], 535, 812, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    # Both columns are page-aware independent flows; decorations cover every
    # page used by either side.
    return page_decorations + header + sidebar + flow
