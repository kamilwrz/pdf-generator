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

def _gen_monument(cv: dict) -> list[dict]:
    """
    Generate the monochrome Monument editorial layout.

    The font hierarchy bottoms out at 9 px. The summary uses the same size as
    body copy so it does not appear one step larger than surrounding text.
    Section navigation uses numbered filled rectangles paired with outlined
    title frames, while all dynamic content remains in a single readable column
    that can reflow across as many A4 pages as the CV requires.
    """
    C = {
        "paper": "#F7F7F7",
        "white": "#FFFFFF",
        "ink": "#111111",
        "body": "#343434",
        "muted": "#6D6D6D",
        "rule": "#C8C8C8",
        "pale": "#E8E8E8",
    }
    L, W = 102, 427
    DISPLAY, SANS = "CormorantGaramond", "Montserrat"
    SECTION_CHROME = 44.0
    BODY_FS, BODY_LH = 9.0, 14.0

    class MonumentBuilder(Builder):
        """Continue the editorial column below the repeated page frame."""

        def continuation_top(self) -> float:
            return 72.0

    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    contact = _compact_text(_contact_line(cv), 82)
    # Square masthead frame is the profile-photo slot; abstract bars are
    # ornaments covered by a gallery upload while the ink outline stays on top.
    photo_frame = {
        **_rect(425, 54, 84, 84, C["ink"], 1.5, zIndex=3),
        "id": "monument-masthead-frame",
        "photoSlot": "frame",
        "photoShape": "ornament-frame",
        "fixedToPage": True,
        "locked": True,
    }
    photo_ornaments = [
        {
            **_line(441, 70, 52, 11, C["ink"], zIndex=3),
            "photoSlot": "ornament",
            "fixedToPage": True,
            "locked": True,
        },
        {
            **_line(441, 88, 34, 11, C["body"], zIndex=3),
            "photoSlot": "ornament",
            "fixedToPage": True,
            "locked": True,
        },
        {
            **_line(441, 106, 52, 11, C["rule"], zIndex=3),
            "photoSlot": "ornament",
            "fixedToPage": True,
            "locked": True,
        },
    ]
    header = [
        _text(name, 33, DISPLAY, C["ink"], 74, 59, zIndex=3, bold=True),
        _block(title, 76, 104, 337, 20, 12.5, 16, C["body"], SANS, zIndex=3, bold=True),
        _block(contact, 76, 136, 337, 16, 9, 12, C["muted"], SANS, zIndex=3),
        photo_frame,
        *photo_ornaments,
    ]
    header[1]["letterSpacing"] = 1.1

    # Contact block ends near y=152; masthead clearance before first chrome.
    b = MonumentBuilder(152 + SPACE_AFTER_MASTHEAD)
    section_number = 0

    def section(label: str) -> None:
        """
        Draw one numbered heading unit and advance to its content baseline.

        The fixed frame width keeps every section aligned. Long custom labels
        are shortened only in this decorative slot; their content is preserved.
        """
        nonlocal section_number
        section_number += 1
        top = b.y
        display_label = _compact_text(label, 31)
        # The ordinal badge ("01", "02", …) is decorative chrome, not the
        # section's title — the frontend's structural editor (Sections panel)
        # must not list it as its own section alongside the real label. Tag it
        # `isDecorativeChromeText` so `isSectionHeading` (sectionStructure.js)
        # can tell the two chrome-tagged text elements apart.
        number_badge = {
            **_text(f"{section_number:02d}", 11, SANS, C["white"], 74, top + 8,
                    zIndex=5, page=b.pg, bold=True),
            "isDecorativeChromeText": True,
        }
        chrome = [
            _line(66, top, 32, 32, C["ink"], zIndex=2, page=b.pg),
            number_badge,
            _rect(106, top, 251, 32, C["ink"], 1.2, zIndex=2, page=b.pg),
            _text(display_label, 12.5, DISPLAY, C["ink"], 118, top + 8,
                  zIndex=5, page=b.pg, bold=True),
            _line(369, top + 15, 160, 2, C["rule"], zIndex=1, page=b.pg),
        ]
        chrome[-2]["letterSpacing"] = 0.35
        # Keep the marker, number, title frame, label, and rule as one reflow
        # cluster. Without explicit roles, the browser's legacy fallback treats
        # text and shapes independently and can break the heading alignment.
        b.els.extend({**element, "flowRole": "section-chrome"} for element in chrome)
        b.y += SECTION_CHROME

    def experience_height(job: dict) -> float:
        height = (
            b.measure_block(job.get("title", ""), W, 11, 14, SANS, bold=True, min_h=14)
            + get_spacing().stack
            + b.measure_block(_company_period(job), W, 9, 12, SANS, min_h=12)
        )
        bullets = _bullets(job)
        if bullets:
            height += get_spacing().stack + b.measure_block(
                bullets, W, BODY_FS, BODY_LH, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10, degree_lh=13,
            meta_fs=9, meta_lh=12,
            body_fs=BODY_FS, body_lh=BODY_LH,
        )

    lbl = _labels(cv)

    if cv.get("summary"):
        # Keep summary at BODY_FS. A larger lead paragraph would fight the
        # compact editorial hierarchy this template is built around.
        summary_height = b.measure_block(cv["summary"], W, BODY_FS, BODY_LH, SANS)
        b.need_section(SECTION_CHROME, summary_height)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, BODY_FS, BODY_LH, C["body"], SANS)
        b.gap(get_spacing().section)

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(job.get("title", ""), L, W, 11, 14, C["ink"], SANS,
                        bold=True, min_h=14)
                b.gap(get_spacing().stack)
                b.block(_company_period(job), L, W, 9, 12, C["muted"], SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(get_spacing().stack)
                    b.block(bullets, L, W, BODY_FS, BODY_LH, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        b.gap(get_spacing().section)

    _extra_sections(
        b, cv, "after_experience", section, C, L, W, SANS,
        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
    )

    if cv.get("education"):
        entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(entries[0]))
        section(lbl["education"])
        for index, education in enumerate(entries):
            _place_education_record(
                b, education, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10, degree_lh=13,
                meta_fs=9, meta_lh=12,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(entries) - 1 else None,
            )
        b.gap(get_spacing().section)

    if cv.get("skills"):
        skills = _skills_inline_content(cv["skills"])
        skills_height = b.measure_block(skills, W, BODY_FS, BODY_LH, SANS)
        b.need_section(SECTION_CHROME, skills_height)
        section(lbl["skills"])
        b.block(skills, L, W, BODY_FS, BODY_LH, C["body"], SANS)
        b.gap(get_spacing().section)

    _extra_sections(
        b, cv, "after_skills", section, C, L, W, SANS,
        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
    )

    flow = b.build()
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
        for element in header + flow
    ]
    pages_used = max([element.get("page", 1) for element in selectable] or [1])
    page_decorations = []
    for page in range(1, pages_used + 1):
        page_decorations.extend([
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_rect(34, 32, 527, 778, C["rule"], 0.8, page=page), "fixedToPage": True},
        ])
        # The tall bars belong to the name-and-position masthead. Repeating
        # them on continuation pages incorrectly suggests a missing header.
        if page == 1:
            page_decorations.extend([
                {
                    **_line(51, 54, 8, 111, C["ink"], zIndex=2, page=page),
                    "fixedToPage": True,
                    "repeatOnContinuation": False,
                },
                {
                    **_line(529, 54, 8, 111, C["pale"], zIndex=2, page=page),
                    "fixedToPage": True,
                    "repeatOnContinuation": False,
                },
            ])
        page_decorations.extend([
            {**_line(66, 779, 463, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(66, 792, 28, 8, C["ink"], zIndex=2, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 9, SANS, C["muted"], 512, 787,
                     zIndex=3, page=page), "fixedToPage": True},
        ])
    return page_decorations + selectable
