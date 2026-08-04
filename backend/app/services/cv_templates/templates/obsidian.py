from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    A4_H,
    SPACE_AFTER_HEADER_RULE,
    SPACE_AFTER_MASTHEAD,
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    SPACE_STACK,
    Builder,
    _block,
    _circle,
    _ellipse,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import (
    _SIDEBAR_FONT_SIZES,
    _extra_sections,
    _fit_sidebar_sections,
    _flatten_extra_items,
    _sidebar_candidates,
    _sidebar_wrapped_height,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _education_sidebar_content,
    _experience_record_height,
    _language_sidebar_lines,
    _obsidian_education_parts,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _bullet_list_content,
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _extra_section_kind,
    _labels,
)

def _gen_obsidian(cv: dict) -> list[dict]:
    """Sidebar dark theme — a near-black sidecar beside a charcoal main field,
    signed with a single warm-gold accent. Both panels stay dark on every page.

    Sidebar order: KONTAKT → skills (user/label title) → JĘZYKI → WYKSZTAŁCENIE.
    Skills and languages are bullet lists; education uses diploma — period /
    school, city / description.
    """
    SIDEBAR_BG, MAIN_BG = "#0B0D10", "#15181C"
    GOLD, INK, MUTED, BODY, RULE = "#C9A24B", "#F4F1EA", "#9AA1AC", "#D7DAE0", "#33383F"
    SANS, SERIF = "Inter", "Times-Roman"
    SIDE, L, W = 184, 222, 337
    SIDEBAR_L, SIDEBAR_W, SIDEBAR_BOTTOM = 24, 136, 758
    lbl = _labels(cv)

    contact = "\n".join(filter(None, [
        str(cv.get("location") or "").strip(),
        str(cv.get("email") or "").strip(),
        str(cv.get("phone") or "").strip(),
    ]))
    contact_fs, contact_lh = 8.0, 12.5
    contact_height = _sidebar_wrapped_height(
        contact or " ", SIDEBAR_W, contact_fs, contact_lh
    )

    frame = {**_rect(464, 50, 56, 52, GOLD, 1, zIndex=3), "id": "obsidian-frame"}
    orbit = {**_ellipse(474, 60, 32, 15, GOLD, borderWidth=1, zIndex=3), "id": "obsidian-orbit"}
    node = {**_circle(484, 79, 11, GOLD, filled=True, zIndex=3), "id": "obsidian-node"}

    contact_label = _text("KONTAKT", 8, SANS, GOLD, SIDEBAR_L, 60, zIndex=3)
    contact_label["letterSpacing"] = 1.3
    static = [
        _text(_compact_text(cv.get("name"), 28), 29, SERIF, INK, L, 52, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9, SANS, GOLD, L + 2, 92, zIndex=3),
        _line(L, 116, W, 1, RULE, zIndex=2),
        frame, orbit, node,
        _line(528, 74, 14, 1, GOLD, zIndex=2),
        contact_label,
        _block(
            contact, SIDEBAR_L, 80, SIDEBAR_W, contact_height,
            contact_fs, contact_lh, BODY, SANS, zIndex=3,
        ),
    ]
    static[1]["letterSpacing"] = 1.4

    cursor_y = 80 + contact_height + 18
    placed_keys: set[str] = set()
    sidebar_extra_indices: set[int] = set()

    def bulleted_section_height(items: list[str], font_size: float) -> float:
        content = "\n".join(f"• {item}" for item in items)
        line_height = round(max(font_size * 1.45, 11.0), 2)
        body_height = _sidebar_wrapped_height(content, SIDEBAR_W, font_size, line_height)
        return 15 + body_height + 18

    def place_bulleted_section(
        title: str,
        items: list[str],
        key: str,
        *,
        reserve: float = 0.0,
    ) -> bool:
        """Place a complete bulleted sidebar section when it fits below the cursor.

        ``reserve`` keeps room for later sidebar sections (languages/education)
        so a tall skills list cannot push them into the main column.
        """
        nonlocal cursor_y
        if not items:
            return False
        content = "\n".join(f"• {item}" for item in items)
        for font_size in _SIDEBAR_FONT_SIZES:
            line_height = round(max(font_size * 1.45, 11.0), 2)
            body_height = _sidebar_wrapped_height(content, SIDEBAR_W, font_size, line_height)
            section_height = 15 + body_height + 18
            if cursor_y + section_height + reserve > SIDEBAR_BOTTOM:
                continue
            label = _text(title, 8, SANS, GOLD, SIDEBAR_L, cursor_y, zIndex=3)
            label["letterSpacing"] = 1.3
            static.extend([
                label,
                _block(
                    content, SIDEBAR_L, cursor_y + 15, SIDEBAR_W, body_height,
                    font_size, line_height, BODY, SANS, zIndex=3, bulletList=True,
                ),
            ])
            cursor_y += section_height
            placed_keys.add(key)
            return True
        return False

    def education_record_height(edu: dict) -> float:
        degree, school, meta, bullets = _obsidian_education_parts(edu)
        height = 0.0
        if degree:
            height += _sidebar_wrapped_height(degree, SIDEBAR_W, 8.6, 12)
        if school:
            if height:
                height += SPACE_STACK
            height += _sidebar_wrapped_height(school, SIDEBAR_W, 8.4, 12)
        if meta:
            if height:
                height += SPACE_STACK
            height += _sidebar_wrapped_height(meta, SIDEBAR_W, 7.9, 11)
        if bullets:
            if height:
                height += SPACE_STACK
            height += _sidebar_wrapped_height(bullets, SIDEBAR_W, 8.0, 12)
        return height

    skills = [str(skill).strip() for skill in (cv.get("skills") or []) if str(skill).strip()]
    language_lines = _language_sidebar_lines(cv)
    education_entries = list(cv.get("education") or [])

    language_reserve = (
        bulleted_section_height(language_lines, _SIDEBAR_FONT_SIZES[-1])
        if language_lines else 0.0
    )
    education_reserve = 0.0
    if education_entries:
        records_height = 0.0
        for index, edu in enumerate(education_entries):
            if index:
                records_height += SPACE_RECORD
            records_height += education_record_height(edu)
        if records_height > 0:
            education_reserve = 15 + records_height + 18

    # Prefer KONTAKT → skills → languages → education. Reserve room so a tall
    # skills list cannot push languages/education out of the sidebar.
    place_bulleted_section(
        lbl["skills"], skills, "skills",
        reserve=language_reserve + education_reserve,
    )

    if place_bulleted_section("JĘZYKI", language_lines, "languages", reserve=education_reserve):
        for index, section in enumerate(cv.get("extra_sections") or []):
            if _extra_section_kind(section) == "languages":
                sidebar_extra_indices.add(index)

    if education_entries and education_reserve > 0 and cursor_y + education_reserve <= SIDEBAR_BOTTOM:
        edu_label = _text(lbl["education"], 8, SANS, GOLD, SIDEBAR_L, cursor_y, zIndex=3)
        edu_label["letterSpacing"] = 1.3
        static.append(edu_label)
        cursor_y += 15
        for index, edu in enumerate(education_entries):
            if index:
                cursor_y += SPACE_RECORD
            degree, school, meta, bullets = _obsidian_education_parts(edu)
            if degree:
                title_h = _sidebar_wrapped_height(degree, SIDEBAR_W, 8.6, 12)
                static.append(_block(
                    degree, SIDEBAR_L, cursor_y, SIDEBAR_W, title_h,
                    8.6, 12, INK, SANS, zIndex=3, bold=True,
                ))
                cursor_y += title_h
            if school:
                cursor_y += SPACE_STACK
                school_h = _sidebar_wrapped_height(school, SIDEBAR_W, 8.4, 12)
                static.append(_block(
                    school, SIDEBAR_L, cursor_y, SIDEBAR_W, school_h,
                    8.4, 12, INK, SANS, zIndex=3,
                ))
                cursor_y += school_h
            if meta:
                cursor_y += SPACE_STACK
                meta_h = _sidebar_wrapped_height(meta, SIDEBAR_W, 7.9, 11)
                static.append(_block(
                    meta, SIDEBAR_L, cursor_y, SIDEBAR_W, meta_h,
                    7.9, 11, MUTED, SANS, zIndex=3,
                ))
                cursor_y += meta_h
            if bullets:
                cursor_y += SPACE_STACK
                desc_h = _sidebar_wrapped_height(bullets, SIDEBAR_W, 8.0, 12)
                static.append(_block(
                    bullets, SIDEBAR_L, cursor_y, SIDEBAR_W, desc_h,
                    8.0, 12, BODY, SANS, zIndex=3, bulletList=True,
                ))
                cursor_y += desc_h
        cursor_y += 18
        placed_keys.add("education")

    # Last chance: leftover sidebar space after languages/education.
    if "skills" not in placed_keys:
        place_bulleted_section(lbl["skills"], skills, "skills")

    # Main-column header rule ends at y=117; clear before first section.
    b = Builder(117 + SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS,
            title_fs=11, title_lh=14,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=9.4, body_lh=13.3,
        )

    def section(label: str) -> None:
        b.need(34)
        b.els.append(_circle(L - 18, b.y + 2, 7, GOLD, filled=True, zIndex=3, page=b.pg))
        b.text(label, 8.6, SANS, INK, L, bold=True)
        b.els.append(_line(L, b.y - 2, W, 1, RULE, page=b.pg))
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.4, 13.3, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 14, INK, SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.7, 11.5, MUTED, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.4, 13.3, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": BODY}, L, W, SANS,
            fs=9.4, lh=13.3, skip_indices=sidebar_extra_indices,
        )

    if education_entries and "education" not in placed_keys:
        b.need_section(section_chrome_height(12), 72)
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD,
            )
        close_section()

    if skills and "skills" not in placed_keys:
        section(lbl["skills"])
        b.block(
            _bullet_list_content(skills), L, W, 9.4, 13.3, BODY, SANS, bulletList=True,
        )
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": BODY}, L, W, SANS,
        fs=9.4, lh=13.3, skip_indices=sidebar_extra_indices,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, SIDE, A4_H, SIDEBAR_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(SIDE, 0, 2, A4_H, GOLD, zIndex=1, page=page), "fixedToPage": True},
            {**_line(SIDE + 2, 0, 595 - SIDE - 2, A4_H, MAIN_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 783, W, 1, RULE, zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 796, 6, GOLD, filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, L + W - 15, 791, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + static + flow
