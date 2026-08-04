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
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

def _gen_graphite(cv: dict) -> list[dict]:
    """Ultra-minimalist dark theme. A single cool-silver accent, hairline
    rules and generous whitespace carry the whole hierarchy — no bands,
    frames or sidebars, just quiet typography on a dark field."""
    BG, SILVER, INK, MUTED, BODY, HAIRLINE = (
        "#101113", "#B7C3CC", "#F5F6F7", "#8A9099", "#C7CBCF", "#2B2E32",
    )
    L, W, SANS, SERIF = 56, 483, "Inter", "Times-Roman"
    lbl = _labels(cv)
    b = Builder(58)

    b.text(_compact_text(cv.get("name"), 34), 32, SERIF, INK, L, bold=True); b.gap(4)
    b.text(_compact_text(cv.get("title"), 52), 12, SANS, SILVER, L, italic=True); b.gap(4)
    b.text(_compact_text(_contact_line(cv), 82), 9, SANS, MUTED, L); b.gap(10)
    b.line(L, W, 0.5, HAIRLINE); b.gap(SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        # Graphite uses single-line text for title/meta; reserve the same stack
        # footprint as the visual record so keep_together can page-break cleanly.
        bullets = _bullets(job)
        height = 11 * 1.35 + 2 + 9.3 * 1.35 + 2
        if bullets:
            height += b.measure_block(bullets, W, 10, 14.5, SANS, bulletList=True)
        return height

    def section(label: str) -> None:
        b.need(38)
        b.text(label, 9, SANS, SILVER, L)
        b.els[-1]["letterSpacing"] = 1.6
        b.gap(2)
        b.line(L, W, 0.5, HAIRLINE)
        b.gap(14)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, BODY, SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.text(job.get("title", ""), 11, SANS, INK, L, bold=True); b.gap(2)
                b.text(_company_period(job), 9.3, SANS, MUTED, L); b.gap(2)
                bullets = _bullets(job)
                if bullets:
                    b.block(bullets, L, W, 10, 14.5, BODY, SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, SANS, fs=10, lh=14.5)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(section_chrome_height(9), _education_record_height(
            b, education_entries[0], W, SANS,
            degree_fs=10.5, degree_lh=14, meta_fs=9.3, meta_lh=12.5,
            body_fs=9.3, body_lh=13.5,
        ))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=INK, muted=MUTED, body=BODY, font=SANS,
                degree_fs=10.5, degree_lh=14, meta_fs=9.3, meta_lh=12.5,
                body_fs=9.3, body_lh=13.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        section(lbl["skills"])
        b.block(" · ".join(cv["skills"]), L, W, 10, 15, BODY, SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, SANS)

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, BG, zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 784, W, 0.5, HAIRLINE, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, MUTED, L + W - 15, 792, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + flow
