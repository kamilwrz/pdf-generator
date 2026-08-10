from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    get_spacing,
    SPACE_AFTER_HEADER_RULE,
    SPACE_AFTER_MASTHEAD,
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
    _place_skills_section,
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

def _gen_cinder(cv: dict) -> list[dict]:
    """Single-column black, grey and signal-red editorial CV."""
    BLACK, CHARCOAL, GRAPHITE = "#111315", "#292D31", "#62686D"
    ASH, PAPER, RED = "#D5D6D6", "#F4F3F1", "#C93F3F"
    L, W, SANS, SERIF = 76, 466, "Inter", "Times-Roman"
    lbl = _labels(cv)

    # Geometric masthead frames are also the profile-photo slot.
    frame_one = {
        **_rect(425, 34, 72, 72, RED, 1.2, zIndex=3),
        "id": "cinder-frame-one",
        "photoSlot": "frame",
        "photoShape": "ornament-frame",
    }
    frame_two = {
        **_rect(455, 63, 78, 78, "#767B80", 1, zIndex=3),
        "id": "cinder-frame-two",
        "photoSlot": "ornament",
    }
    node = {
        **_rect(482, 39, 12, 12, "#FFFFFF", 1, zIndex=3),
        "id": "cinder-node",
        "photoSlot": "ornament",
    }
    header = [
        _line(0, 0, 595, 170, BLACK, zIndex=1),
        _line(52, 36, 5, 99, RED, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, "#FFFFFF", L, 43, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.5, SANS, "#E06B67", L + 2, 86, zIndex=3),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, "#B8BCC0", L + 2, 119, zIndex=3),
        frame_one,
        frame_two,
        node,
        _line(497, 45, 18, 1, RED, zIndex=2),
    ]
    header[3]["letterSpacing"] = 1.65
    SECTION_CHROME = section_chrome_height(8.7)
    # Black masthead band occupies y=0..170. Use masthead clearance (not the
    # tighter get_spacing().section) so the first heading has visible breathing room.
    b = Builder(170 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + get_spacing().stack
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += get_spacing().stack + b.measure_block(
                bullets, W, 9.5, 13.4, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.3, degree_lh=13,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        # Tag chrome so the canvas Sections panel can reorder whole blocks.
        mark = _rect(526, b.y + 2, 16, 16, RED, 1.2, zIndex=2, page=b.pg)
        mark["flowRole"] = "section-chrome"
        b.els.append(mark)
        b.text(label, 8.7, SANS, RED, L)
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(L, W, 1, ASH)
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.5, 13.4, CHARCOAL, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 13.5, BLACK, SANS, bold=True, min_h=15)
                b.gap(get_spacing().stack)
                b.block(_company_period(job), L, W, 8.7, 11.5, GRAPHITE, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(get_spacing().stack)
                    b.block(bullets, L, W, 9.5, 13.4, CHARCOAL, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": CHARCOAL}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=BLACK, muted=GRAPHITE, body=CHARCOAL, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, CHARCOAL, SANS, 9.4, 13.5,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": CHARCOAL}, L, W, SANS, fs=9.4, lh=13.5)
    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, PAPER, zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, 595, 5, RED, zIndex=2, page=page), "fixedToPage": True},
            {**_line(52, 786, 490, 1, BLACK, page=page), "fixedToPage": True},
            {**_line(52, 786, 64, 3, RED, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, GRAPHITE, 522, 801, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow
