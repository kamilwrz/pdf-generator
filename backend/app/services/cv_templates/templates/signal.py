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

_SIGNAL_THEME = {
    "paper": "#101C26", "ink": "#F2F7F6", "body": "#E4EFEE",
    "muted": "#9DB7C3", "accent": "#3BD2C7", "rule": "#395263",
    "light": "#7BE1D9", "left": 76, "width": 465,
    "start": 222, "continuation": 66, "mark_x": 525,
}


def _signal_page_decorations(page: int) -> list[dict]:
    """Return fixed paper, rail, and folio for one Signal banking page."""
    C = _SIGNAL_THEME
    return [
        {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
        {**_line(0, 0, 595, 5, C["accent"], page=page), "fixedToPage": True},
        {**_line(76, 789, 465, 1, C["rule"], page=page), "fixedToPage": True},
        {**_text(f"{page:02d}", 8, "Inter", C["muted"], 522, 800, page=page), "fixedToPage": True},
    ]


def _gen_signal(cv: dict) -> list[dict]:
    """Generate the Signal banking CV with a dark header and resilient flow."""
    C = _SIGNAL_THEME
    L, W = C["left"], C["width"]
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class BankingBuilder(Builder):
        # Match canvas reflow (pageTop 66 / bottomMargin 96 → 746). Keep the
        # shared need/keep_together path; only the continuation Y differs.
        def continuation_top(self) -> float:
            return float(C["continuation"])

    node_a = {**_circle(78, 197, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-a"}
    node_b = {**_circle(116, 197, 18, C["muted"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-b"}
    node_c = {**_circle(154, 197, 18, C["accent"], borderWidth=1.2, zIndex=2, page=1), "id": "signal-node-c"}
    static = [
        _ellipse(392, 26, 164, 106, "#173545", borderWidth=1.2, zIndex=1),
        _ellipse(427, 48, 94, 62, C["accent"], borderWidth=1, zIndex=1),
        _circle(460, 65, 28, C["accent"], filled=True, zIndex=2),
        _line(52, 42, 4, 118, C["accent"], zIndex=2),
        _text(_compact_text(cv.get("name"), 30), 30, SERIF, C["ink"], 76, 77, zIndex=2, bold=True),
        _text(_compact_text(cv.get("title"), 54), 9.2, SANS, C["muted"], 78, 122, zIndex=2),
        _text(_compact_text(_contact_line(cv), 78), 8.6, SANS, C["muted"], 78, 145, zIndex=2),
        node_a, node_b, node_c,
        _line(96, 205, 20, 1, C["accent"], zIndex=2),
        _line(134, 205, 20, 1, C["accent"], zIndex=2),
        _rect(487, 181, 54, 22, C["rule"], 1, zIndex=2),
    ]
    static[5]["letterSpacing"] = 1.35

    SECTION_CHROME = section_chrome_height(8.6)
    b = BankingBuilder(C["start"])

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 10.8, 13.4, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.7, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 9.4, 13.1, SANS, bulletList=True
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
        b.els.append(_circle(C["mark_x"], b.y + 1, 12, C["accent"], borderWidth=1.1, zIndex=2, page=b.pg))
        b.text(label, 8.6, SANS, C["light"], L)
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.4, 13.1, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.4, 13.1, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 10.8, 13.4, C["ink"], SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.7, 11.5, C["muted"], SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.4, 13.1, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]}, L, W, SANS, fs=9.4, lh=13.1)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.6, meta_lh=11.5,
                body_fs=8.6, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.2, 13.1, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.2, 13.1, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]}, L, W, SANS, fs=9.2, lh=13.1)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])
    decorations = [
        element
        for page in range(1, pages_used + 1)
        for element in _signal_page_decorations(page)
    ]
    return decorations + static + flow
