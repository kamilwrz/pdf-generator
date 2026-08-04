from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    get_spacing,
    SPACE_AFTER_HEADER_RULE,
    SPACE_AFTER_MASTHEAD,
    Builder,
    _circle,
    _line,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _flatten_extra_items,
    _sidebar_candidates,
)
from app.services.cv_templates.shared.records import (
    _education_bullet_items,
    _education_record_height,
    _education_sidebar_content,
    _experience_record_height,
    _language_sidebar_lines,
    _obsidian_education_parts,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)
from app.services.cv_templates.shared.icons import _icon, _icon_beside

def _gen_harbor(cv: dict) -> list[dict]:
    """Generate the Harbor two-column layout.

    The main column (summary + experience) reflows across pages through a
    ``Builder``; the right sidebar (education, skills, languages, tools as
    teal-diamond bullet lists) is painted once on page 1 and does not repeat
    on continuation pages. A single teal accent carries the role line, company
    names and diamond bullets; all other ink is charcoal on white.
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
               *, accent: bool = False, align: bool = True, page: int = 1) -> dict:
        theme = "harbor-accent" if accent else "harbor"
        return {
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/iconic/{theme}/{name}.png",
            "left": left, "top": top, "width": size, "height": size,
            "zIndex": 3, "page": page, "alignWithText": align,
        }

    # ── Header (spans both columns) ─────────────────────────────────────────
    name = _compact_text(cv.get("name"), 32).upper()
    title = _compact_text(cv.get("title"), 48)
    header = [
        {**_text(name, 23, SANS, C["ink"], MAIN_X, 44, zIndex=3, bold=True), "letterSpacing": 0.3},
        _text(title, 11, SANS, C["accent"], MAIN_X, 80, zIndex=3),
    ]
    contacts = [
        ("phone", _compact_text(cv.get("phone"), 24)),
        ("email", _compact_text(cv.get("email"), 40)),
        ("github", _compact_text(cv.get("github") or cv.get("website") or cv.get("link"), 36)),
        ("location", _compact_text(cv.get("location"), 28)),
    ]
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
        header.append(_text(value, 8.4, SANS, C["body"], cx + 15, cy, zIndex=3))
        cx += advance
    # Circular photo placeholder: soft-grey disc + centred grey person glyph.
    header.append(_circle(493, 36, 58, C["photo"], filled=True, zIndex=2))
    header.append(_hicon("references", 507, 50, 30, align=False))
    header_rule_y = cy + 22
    header.append(_line(MAIN_X, header_rule_y, SIDE_X + SIDE_W - MAIN_X, 1, C["rule"], zIndex=2))
    section_start = header_rule_y + 20

    # ── Sidebar (static, page 1) ────────────────────────────────────────────
    def _side_head(label: str, top: float) -> list[dict]:
        head = _text(label, 8.8, SANS, C["ink"], SIDE_X, top, zIndex=3)
        head["letterSpacing"] = 1.1
        return [head, _line(SIDE_X, top + 13, SIDE_W, 1, C["rule"], zIndex=2)]

    sidebar: list[dict] = []
    sy = section_start

    if cv.get("education"):
        sidebar += _side_head(lbl["education"], sy)
        sy += 24
        for edu in cv["education"][:2]:
            degree = _compact_text(edu.get("degree") or edu.get("title"), 40)
            school = _compact_text(edu.get("school"), 40)
            period = _compact_text(edu.get("period"), 24)
            city = _compact_text(edu.get("city"), 26)
            if degree:
                sidebar.append(_text(degree, 10, SANS, C["ink"], SIDE_X, sy, zIndex=3, bold=True))
                sy += 16
            if school:
                sidebar.append(_text(school, 9, SANS, C["accent"], SIDE_X, sy, zIndex=3))
                sy += 16
            if period:
                sidebar.append(_hicon("calendar", SIDE_X, sy, 11))
                sidebar.append(_text(period, 8.2, SANS, C["meta"], SIDE_X + 15, sy, zIndex=3))
                sy += 15
            if city:
                sidebar.append(_hicon("location", SIDE_X, sy, 11))
                sidebar.append(_text(city, 8.2, SANS, C["meta"], SIDE_X + 15, sy, zIndex=3))
                sy += 15
            for item in _education_bullet_items(edu)[:4]:
                sidebar.append(_hicon("diamond", SIDE_X, sy, 11, accent=True))
                sidebar.append(_text(_compact_text(item, 34), 8.6, SANS, C["ink"], SIDE_X + 16, sy, zIndex=3))
                sy += 15
            sy += 6
        sy += 12

    if cv.get("skills"):
        sidebar += _side_head(lbl["skills"], sy)
        iy = sy + 24
        for skill in cv["skills"][:12]:
            sidebar.append(_hicon("diamond", SIDE_X, iy, 11, accent=True))
            sidebar.append(_text(_compact_text(skill, 34), 8.6, SANS, C["ink"], SIDE_X + 16, iy, zIndex=3))
            iy += 15
        sy = iy + 12

    if cv.get("languages"):
        sidebar += _side_head("JĘZYKI", sy)
        ly = sy + 24
        for language in cv["languages"][:6]:
            lang_name = _compact_text(language.get("name"), 22)
            level = _compact_text(language.get("level"), 12)
            line = f"{lang_name} — {level}" if lang_name and level else (lang_name or level)
            if not line:
                continue
            sidebar.append(_hicon("diamond", SIDE_X, ly, 11, accent=True))
            sidebar.append(_text(_compact_text(line, 34), 8.6, SANS, C["ink"], SIDE_X + 16, ly, zIndex=3))
            ly += 15
        sy = ly + 12

    # Every remaining custom section becomes a teal-diamond bulleted list.
    for custom in (cv.get("custom_sections") or [])[:3]:
        items = _flatten_extra_items(custom.get("items"))
        if not items:
            continue
        sidebar += _side_head(_compact_text(custom.get("title"), 30), sy)
        iy = sy + 24
        for item in items[:8]:
            sidebar.append(_hicon("diamond", SIDE_X, iy, 11, accent=True))
            sidebar.append(_text(_compact_text(item, 34), 8.6, SANS, C["ink"], SIDE_X + 16, iy, zIndex=3))
            iy += 15
        sy = iy + 12

    # ── Main column (reflows across pages) ──────────────────────────────────
    b = Builder(section_start)
    SECTION_CHROME = section_chrome_height(8.8)

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
            + b.measure_block(job.get("company", ""), MAIN_W - 150, 9.2, 12, SANS, min_h=12)
        )
        if bullets:
            height += get_spacing().stack + b.measure_block(bullets, MAIN_W, 9, 13.4, SANS, bulletList=True)
        return height

    def job_meta(period: str, city: str, top: float, page: int) -> None:
        # Right-aligned date + location on the company line. Positions are
        # estimated from text length (there is no measurement pass here); the
        # company block is capped narrow enough that the two never collide.
        right = MAIN_R
        if city:
            cx_city = right - len(city) * 4.2
            b.els.append(_text(city, 8.2, SANS, C["meta"], cx_city, top, zIndex=3, page=page))
            b.els.append(_hicon("location", cx_city - 13, top, 11, page=page))
            right = cx_city - 13 - 10
        if period:
            cx_period = right - len(period) * 4.2
            b.els.append(_text(period, 8.2, SANS, C["meta"], cx_period, top, zIndex=3, page=page))
            b.els.append(_hicon("calendar", cx_period - 13, top, 11, page=page))

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
                company_y, company_pg = b.y, b.pg
                # Company is capped narrow so the right-aligned meta cannot overlap it.
                b.block(job.get("company", ""), MAIN_X, MAIN_W - 150, 9.2, 12, C["accent"], SANS, min_h=12)
                job_meta(job.get("period", ""), job.get("city", ""), company_y, company_pg)
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
    # The sidebar only exists on page 1; keep it out of continuation pages.
    return page_decorations + header + sidebar + flow
