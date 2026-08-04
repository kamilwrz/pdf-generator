from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
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
    _extra_sections,
    _fit_sidebar_sections,
    _flatten_extra_items,
    _sidebar_candidates,
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
    _labels,
)

def _gen_raven(cv: dict) -> list[dict]:
    """Topbar dark theme — a raised masthead band over a fully dark page,
    single column, cool teal accents. The structural counterpart to the
    sidebar dark theme: one horizontal band instead of a vertical column."""
    BODY_BG, BAND_BG = "#12161C", "#181D25"
    TEAL, INK, MUTED, BODY, RULE = "#3FBFA6", "#F2F5F4", "#8B98A1", "#C9D2D6", "#2A3038"
    L, W, SANS, SERIF = 76, 466, "Inter", "Times-Roman"
    lbl = _labels(cv)

    frame_one = {**_rect(425, 34, 72, 72, TEAL, 1.2, zIndex=3), "id": "raven-frame-one"}
    frame_two = {**_rect(455, 63, 78, 78, "#4C5760", 1, zIndex=3), "id": "raven-frame-two"}
    node = {**_rect(482, 39, 12, 12, INK, 1, zIndex=3), "id": "raven-node"}
    header = [
        _line(0, 0, 595, 170, BAND_BG, zIndex=1),
        _line(0, 170, 595, 3, TEAL, zIndex=2),
        _line(52, 36, 5, 99, TEAL, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, INK, L, 43, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.5, SANS, TEAL, L + 2, 86, zIndex=3),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, MUTED, L + 2, 119, zIndex=3),
        frame_one, frame_two, node,
        _line(497, 45, 18, 1, TEAL, zIndex=2),
    ]
    header[4]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    # Band y=0..170 + teal rule to 173. Masthead air before body copy.
    b = Builder(173 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(bullets, W, 9.5, 13.4, SANS, bulletList=True)
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.3, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_rect(526, b.y + 2, 16, 16, TEAL, 1.2, zIndex=2, page=b.pg))
        b.text(label, 8.7, SANS, TEAL, L)
        b.line(L, W, 1, RULE)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.5, 13.4, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.7, 11.5, MUTED, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.5, 13.4, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.3, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        skills = _bullet_list_content(cv["skills"])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.4, 13.5, SANS, bulletList=True))
        section(lbl["skills"])
        b.block(skills, L, W, 9.4, 13.5, BODY, SANS, bulletList=True)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS, fs=9.4, lh=13.5)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, BODY_BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, 595, 3, TEAL, zIndex=2, page=page), "fixedToPage": True},
            {**_line(52, 786, 490, 1, RULE, page=page), "fixedToPage": True},
            {**_line(52, 786, 64, 3, TEAL, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, 522, 801, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow
