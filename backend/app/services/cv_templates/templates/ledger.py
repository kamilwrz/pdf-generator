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
    _bullet_list_content,
    _skills_inline_content,
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

def _gen_ledger(cv: dict) -> list[dict]:
    """Blue-grey finance CV with editable data panels and market graphic."""
    NAVY, BLUE = "#102A43", "#2E5E86"
    SLATE, STEEL, INK = "#607789", "#AEBECC", "#17212B"
    L, W, SANS, SERIF = 52, 490, "Inter", "Times-Roman"
    lbl = _labels(cv)

    def _masthead(element: dict) -> dict:
        return {**element, "flowRole": "masthead"}

    static = [
        _masthead(_line(0, 0, 595, 146, NAVY, zIndex=0)),
        _masthead(_line(0, 146, 595, 5, BLUE, zIndex=1)),
        _masthead(_rect(416, 24, 122, 126, STEEL, 1.2, zIndex=3)),
        _masthead({
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/ledger-finance-accent.png",
            "width": 110,
            "height": 118,
            "left": 422,
            "top": 28,
            "zIndex": 2,
            "page": 1,
        }),
        _masthead(_line(400, 30, 2, 102, BLUE, zIndex=2)),
        _masthead(_text(_compact_text(cv.get("name"), 30), 30, SERIF, "#FFFFFF", L, 58, zIndex=2, bold=True)),
        _masthead(_text(_compact_text(cv.get("title"), 52), 10, SANS, "#C7D7E2", L, 98, zIndex=2)),
        _masthead(_text(_compact_text(_contact_line(cv), 78), 8.8, SANS, "#C7D7E2", L, 120, zIndex=2)),
    ]
    static[6]["letterSpacing"] = 1.05

    SECTION_CHROME = section_chrome_height(8.4)
    # Navy band + accent rule end at y=151; masthead air before first section.
    b = Builder(151 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + get_spacing().stack
            + b.measure_block(_company_period(job), W, 9, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += get_spacing().stack + b.measure_block(
                bullets, W, 9.6, 13.5, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.6, degree_lh=13,
            meta_fs=9, meta_lh=11.5,
            body_fs=9, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.text(label, 9, SANS, BLUE, L)
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(L, W, 1, STEEL)
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.6, 13.5, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.6, 13.5, INK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 13.5, NAVY, SANS, bold=True, min_h=15)
                b.gap(get_spacing().stack)
                b.block(_company_period(job), L, W, 9, 11.5, SLATE, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(get_spacing().stack)
                    b.block(bullets, L, W, 9.6, 13.5, INK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": INK}, L, W, SANS, fs=9.6, lh=13.5)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=NAVY, muted=SLATE, body=INK, font=SANS,
                degree_fs=10.6, degree_lh=13,
                meta_fs=9, meta_lh=11.5,
                body_fs=9, body_lh=11.5,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        skills = _skills_inline_content(cv["skills"])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.8, 14, SANS))
        section(lbl["skills"])
        b.block(skills, L, W, 9.8, 14, INK, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": INK}, L, W, SANS, fs=9.8, lh=14)
    return static + b.build()
