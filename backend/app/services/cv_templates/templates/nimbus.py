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
    _skills_inline_content,
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

def _gen_nimbus(cv: dict) -> list[dict]:
    """Light blue-grey finance CV with an airy editorial rhythm."""
    INK, BLUE = "#2B3D4C", "#5F8EAD"
    POWDER, SKY, CLOUD, SLATE = "#B9D2E5", "#DFEBF4", "#E9EEF1", "#72818C"
    L, W, SANS, SERIF = 80, 462, "Inter", "Times-Roman"
    CONTINUATION = 66
    SECTION_CHROME = section_chrome_height(8.4)
    lbl = _labels(cv)

    class NimbusBuilder(Builder):
        def continuation_top(self) -> float:
            return float(CONTINUATION)

    mark_one = {**_rect(80, 176, 14, 14, BLUE, 1.2, zIndex=2), "id": "nimbus-mark-one"}
    mark_two = {**_rect(114, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-two"}
    mark_three = {**_rect(148, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-three"}
    static = [
        _line(0, 0, 595, 4, POWDER, zIndex=0),
        _line(52, 207, 490, 1, POWDER),
        _rect(401, 35, 141, 153, POWDER, 1.1, zIndex=3),
        {
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/nimbus-finance-accent.png",
            "width": 129,
            "height": 141,
            "left": 407,
            "top": 41,
            "zIndex": 2,
            "page": 1,
        },
        _line(52, 48, 4, 112, BLUE, zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 29, SERIF, INK, 78, 55, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 52), 9.3, SANS, BLUE, 80, 99, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.7, SANS, SLATE, 80, 153, zIndex=2),
        mark_one,
        mark_two,
        mark_three,
        _line(94, 182, 20, 1, POWDER, zIndex=1),
        _line(128, 182, 20, 1, POWDER, zIndex=1),
    ]
    static[6]["letterSpacing"] = 1.5

    # Header rail at y=207; masthead clearance before the first section heading.
    b = NimbusBuilder(208 + SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.8, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
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

    def section(label: str, decorated: bool = True) -> None:
        if decorated:
            # Short rail next to the heading only — a page-tall rail fought
            # client reflow and made continuation pages look bottom-heavy.
            b.els.append(_line(52, b.y + 5, 2, 28, SKY, page=b.pg))
            b.els.append(_rect(45, b.y + 20, 16, 16, BLUE, zIndex=2, page=b.pg))
        b.text(label, 8.7, SANS, BLUE, L)
        b.line(L, W, 1, CLOUD)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.5, 13.4, SANS))
        section(lbl["summary"], decorated=False)
        b.block(cv["summary"], L, W, 9.5, 13.4, INK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 13.5, INK, SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.8, 11.5, SLATE, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.5, 13.4, INK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.5, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=SLATE, body=INK, font=SANS,
                degree_fs=10.3, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        skills = _skills_inline_content(cv["skills"])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.4, 13.5, SANS))
        section(lbl["skills"])
        b.block(skills, L, W, 9.4, 13.5, INK, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.4, lh=13.5)
    return static + b.build()
