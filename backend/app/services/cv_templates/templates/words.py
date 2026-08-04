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

def _gen_words(cv: dict) -> list[dict]:
    """
    Generate the monochrome Words layout inspired by a formatted Word document.

    The layout intentionally uses one serif text column with ordinary document
    rhythm. Thin rules and small circles are the only decoration; there are no
    frames, side panels, or artificial page margins.
    """
    C = {
        "paper": "#FFFFFF",
        "ink": "#202020",
        "body": "#383838",
        "muted": "#6F6F6F",
        "rule": "#BEBEBE",
        "pale": "#E6E6E6",
    }
    L, W = 89, 434
    FONT = "Times-Roman"
    SECTION_CHROME = 36.0

    class WordsBuilder(Builder):
        """Continue the document column below a compact page-top inset."""

        def continuation_top(self) -> float:
            return 58.0

    name = str(cv.get("name") or "").strip()
    title = str(cv.get("title") or "").strip()
    contact = _contact_line(cv)
    # Unlike poster-like mastheads, a Word document must never shorten contact
    # data or a long name. Measure each block and move the document body down
    # when wrapping adds another line.
    name_top = 58.0
    name_height = Builder.measure_block(
        name, 451, 29, 34, FONT, bold=True, min_h=34
    )
    title_top = name_top + name_height + 6
    title_height = Builder.measure_block(
        title, 451, 13.5, 17, FONT, bold=True, min_h=17
    )
    contact_top = title_top + title_height + 12
    contact_height = Builder.measure_block(
        contact, 451, 10, 13, FONT, min_h=13
    )
    divider_top = contact_top + contact_height + 16
    header = [
        _block(name, 72, name_top, 451, name_height, 29, 34,
               C["ink"], FONT, zIndex=3, bold=True),
        _block(title, 72, title_top, 451, title_height, 13.5, 17,
               C["body"], FONT, zIndex=3, bold=True),
        _block(contact, 72, contact_top, 451, contact_height, 10, 13,
               C["muted"], FONT, zIndex=3),
        _circle(72, divider_top - 2, 5, C["ink"], filled=True, zIndex=3),
        _circle(82, divider_top - 2, 5, C["pale"], borderWidth=1, zIndex=3),
        _line(94, divider_top, 429, 1, C["rule"], zIndex=2),
    ]

    b = WordsBuilder(divider_top + SPACE_AFTER_HEADER_RULE)

    def section(label: str) -> None:
        """
        Render one Word-like heading and advance to the section body.

        All three decorative parts share an explicit flow role so browser text
        measurement cannot separate the marker, heading, and underline.
        """
        top = b.y
        chrome = [
            _circle(72, top + 4, 7, C["ink"], borderWidth=1.2, zIndex=3, page=b.pg),
            _text(_compact_text(label, 42), 12, FONT, C["ink"], L, top,
                  zIndex=3, page=b.pg, bold=True),
            _line(L, top + 21, W, 1, C["rule"], zIndex=2, page=b.pg),
        ]
        b.els.extend({**element, "flowRole": "section-chrome"} for element in chrome)
        b.y += SECTION_CHROME

    def experience_height(job: dict) -> float:
        height = (
            b.measure_block(job.get("title", ""), W, 11.5, 15, FONT, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 10, 13, FONT, italic=True, min_h=13)
        )
        bullets = _bullets(job)
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, 10.5, 15, FONT, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, FONT,
            degree_fs=11, degree_lh=14,
            meta_fs=10, meta_lh=13,
            body_fs=10, body_lh=15,
        )

    lbl = _labels(cv)

    if cv.get("summary"):
        summary_height = b.measure_block(cv["summary"], W, 10.5, 15, FONT)
        b.need_section(SECTION_CHROME, summary_height)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10.5, 15, C["body"], FONT)
        b.gap(SPACE_SECTION)

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11.5, 15, C["ink"], FONT,
                        bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 10, 13, C["muted"], FONT,
                        italic=True, min_h=13)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 10.5, 15, C["body"], FONT, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_experience", section, C, L, W, FONT,
        fs=10.5, lh=15, section_chrome_h=SECTION_CHROME,
    )

    if cv.get("education"):
        entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(entries[0]))
        section(lbl["education"])
        for index, education in enumerate(entries):
            _place_education_record(
                b, education, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=FONT,
                degree_fs=11, degree_lh=14,
                meta_fs=10, meta_lh=13,
                body_fs=10, body_lh=15,
                after_gap=SPACE_RECORD if index < len(entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if cv.get("skills"):
        skills = _bullet_list_content(cv["skills"])
        skills_height = b.measure_block(skills, W, 10.5, 15, FONT, bulletList=True)
        b.need_section(SECTION_CHROME, skills_height)
        section(lbl["skills"])
        b.block(skills, L, W, 10.5, 15, C["body"], FONT, bulletList=True)
        b.gap(SPACE_SECTION)

    _extra_sections(
        b, cv, "after_skills", section, C, L, W, FONT,
        fs=10.5, lh=15, section_chrome_h=SECTION_CHROME,
    )

    selectable = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in header + b.build()
    ]
    pages_used = max([element.get("page", 1) for element in selectable] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(72, 783, 451, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {
                **_circle(72, 794, 6, C["ink"], borderWidth=1, zIndex=3, page=page),
                "fixedToPage": True,
            },
            {
                **_text(f"{page:02d}", 10, FONT, C["muted"], 508, 790,
                        zIndex=3, page=page),
                "fixedToPage": True,
            },
        )
    ]
    return page_decorations + selectable
