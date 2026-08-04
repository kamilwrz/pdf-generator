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

def _gen_rift(cv: dict) -> list[dict]:
    """Abstract red/grey CV over a generated full-page background."""
    BLACK, GRAPHITE, ASH, RED = "#181A1C", "#565B60", "#C9CBCC", "#E21B1B"
    L, W, SANS, SERIF = 194, 330, "Inter", "Times-Roman"
    lbl = _labels(cv)

    class RiftBuilder(Builder):
        """Keep flowing copy inside the background's central quiet field."""

        def continuation_top(self) -> float:
            return 90.0

    node_one = {**_rect(194, 158, 13, 13, RED, 1.2, zIndex=3), "id": "rift-node-one"}
    node_two = {**_rect(229, 158, 13, 13, GRAPHITE, 1, zIndex=3), "id": "rift-node-two"}
    node_three = {**_rect(264, 158, 13, 13, ASH, 1, zIndex=3), "id": "rift-node-three"}
    header = [
        _text(_compact_text(cv.get("name"), 30), 29, SERIF, BLACK, L, 48, zIndex=3, bold=True),
        _text(_compact_text(cv.get("title"), 46), 9.3, SANS, RED, L + 2, 88, zIndex=3),
        _block(_compact_text(_contact_line(cv), 72), L + 2, 113, 300, 30, 8.7, 13, GRAPHITE, SANS, zIndex=3),
        node_one,
        node_two,
        node_three,
        _line(207, 163, 22, 1, RED, zIndex=2),
        _line(242, 163, 22, 1, GRAPHITE, zIndex=2),
    ]
    header[1]["letterSpacing"] = 1.7
    SECTION_CHROME = section_chrome_height(8.7)
    # Accent nodes occupy y=158..171 in the content column — clear below them.
    b = RiftBuilder(171 + SPACE_AFTER_MASTHEAD)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.3, 13.2, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.2, degree_lh=13,
            meta_fs=8.6, meta_lh=11.5,
            body_fs=8.6, body_lh=11.5,
        )

    def section(label: str) -> None:
        b.els.append(_rect(510, b.y, 14, 14, RED, 1.2, zIndex=2, page=b.pg))
        b.text(label, 8.5, SANS, RED, L)
        b.line(L, W, 1, ASH)
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.3, 13.2, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.3, 13.2, BLACK, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 13.5, BLACK, SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.7, 11.5, GRAPHITE, SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.3, 13.2, BLACK, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BLACK}, L, W, SANS, fs=9.3, lh=13.2)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=BLACK, muted=GRAPHITE, body=BLACK, font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        skills = _bullet_list_content(cv["skills"])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.2, 13.2, SANS, bulletList=True))
        section(lbl["skills"])
        b.block(skills, L, W, 9.2, 13.2, BLACK, SANS, bulletList=True)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BLACK}, L, W, SANS, fs=9.2, lh=13.2)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image",
                "src": f"{BACKEND_URL}/template-assets/rift-cv-background.png",
                "width": 595,
                "height": 842,
                "left": 0,
                "top": 0,
                "zIndex": 0,
                "page": page,
                "fixedToPage": True,
            },
            {**_rect(493, 780, 31, 22, "#FFFFFF", 1, zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, GRAPHITE, 503, 787, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow
