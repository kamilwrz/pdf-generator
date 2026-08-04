from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    A4_H,
    SPACE_AFTER_HEADER_RULE,
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
    _sidebar_candidates,
    _sidebar_wrapped_height,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _place_education_record,
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

def _gen_moss(cv: dict) -> list[dict]:
    """Generate the Moss narrow-sidebar layout on every content page."""
    C = {
        "asset": "moss-sidebar.png", "paper": "#FBFAF6", "ink": "#274232",
        "body": "#344238", "accent": "#B99854", "marker": "#73856E",
        "muted": "#798078", "rule": "#D5D0C2", "side_text": "#274232",
        "side_label": "#274232",
    }
    SIDE, L, W = 184, 220, 326
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class SidebarBuilder(Builder):
        def continuation_top(self) -> float:
            return 56.0


    sidebar_left, sidebar_width = 24, 136
    # Align the sidebar stack with the main-column name top. The former
    # masthead ornament (frame/orbit/node) is the photo placeholder and must
    # sit first so KONTAKT and fitted sections begin below it, not mid-page.
    name_top = 52.0
    photo_w, photo_h = 96.0, 90.0
    photo_left = sidebar_left + (sidebar_width - photo_w) / 2
    photo_top = name_top
    gap_after_photo = 18.0
    contact_label_y = photo_top + photo_h + gap_after_photo
    contact_rule_y = contact_label_y + 12
    contact_body_y = contact_label_y + 22

    contact = "\n".join(filter(None, [
        str(cv.get("location") or "").strip(),
        str(cv.get("email") or "").strip(),
        str(cv.get("phone") or "").strip(),
    ]))
    contact_font_size, contact_line_height = 8.0, 12.5
    contact_height = _sidebar_wrapped_height(
        contact or " ", sidebar_width, contact_font_size, contact_line_height
    )
    sidebar_start = contact_body_y + contact_height + 18
    sidebar_sections, sidebar_keys = _fit_sidebar_sections(
        _sidebar_candidates(cv, lbl),
        width=sidebar_width,
        start_y=sidebar_start,
        bottom_y=758,
    )
    sidebar_extra_indices = {
        section["extra_index"]
        for section in sidebar_sections
        if "extra_index" in section
    }
    name = _compact_text(cv.get("name"), 32).upper()
    title = _compact_text(cv.get("title"), 54).upper()
    contact_line = _compact_text(_contact_line(cv), 78)

    # Photo placeholder: same gold-frame motif that used to sit beside the name.
    # Scale is sized for the narrow sidebar so users can drop a portrait over it.
    scale = photo_w / 58.0
    frame = {
        **_rect(photo_left, photo_top, photo_w, photo_h, C["accent"], 0.85, zIndex=3),
        "id": "moss-frame",
    }
    orbit = {
        **_ellipse(
            photo_left + 10 * scale,
            photo_top + 10 * scale,
            35 * scale,
            17 * scale,
            C["marker"],
            borderWidth=1,
            zIndex=3,
        ),
        "id": "moss-orbit",
    }
    node = {
        **_circle(
            photo_left + 22 * scale,
            photo_top + 30 * scale,
            11 * scale,
            C["accent"],
            filled=True,
            zIndex=3,
        ),
        "id": "moss-node",
    }
    contact_label = _text(
        "KONTAKT", 8, SANS, C["side_label"], sidebar_left, contact_label_y, zIndex=3,
    )
    contact_rule = _line(sidebar_left, contact_rule_y, 44, 1, C["accent"], zIndex=3)
    contact_body = _block(
        contact, sidebar_left, contact_body_y, sidebar_width, contact_height,
        contact_font_size, contact_line_height, C["side_text"], SANS, zIndex=3,
    )
    sidebar_static = [frame, orbit, node, contact_label, contact_rule, contact_body]
    for section_data in sidebar_sections:
        section_label = _text(
            section_data["title"], 8, SANS, C["side_label"],
            sidebar_left, section_data["top"], zIndex=3,
        )
        section_label["letterSpacing"] = 1.2
        sidebar_static.extend([
            section_label,
            _line(sidebar_left, section_data["top"] + 12, 44, 1, C["accent"], zIndex=3),
            _block(
                section_data["content"], sidebar_left, section_data["body_top"],
                sidebar_width, section_data["body_height"], section_data["fontSize"],
                section_data["lineHeight"], C["side_text"], SANS, zIndex=3,
                bulletList=bool(section_data.get("bulletList")),
            ),
        ])

    static = [
        _text(name, 29, SERIF, C["ink"], L, name_top, zIndex=3, bold=True),
        # Keep the main-column X origin identical for header and body flow.
        _text(title, 8.8, SANS, C["marker"], L, 92, zIndex=3),
        _text(contact_line, 8.4, SANS, C["muted"], L, 120, zIndex=3),
        _line(L, 145, W, 1, C["rule"], zIndex=2),
        *sidebar_static,
    ]
    static[0]["letterSpacing"] = 0.1
    static[1]["letterSpacing"] = 1.45
    contact_label["letterSpacing"] = 1.2

    # Header rule at y=145; body starts after masthead clearance.
    b = SidebarBuilder(145 + SPACE_AFTER_HEADER_RULE)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 10.8, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, 8.6, 11.5, SANS, min_h=12)
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

    SECTION_CHROME = section_chrome_height(8.4)

    def section(label: str) -> None:
        marker_y = b.y + 1
        b.els.append(
            _ellipse(L - 23, marker_y, 12, 12, C["marker"], borderWidth=1, zIndex=3, page=b.pg)
        )
        b.text(label, 8.4, SANS, C["marker"], L)
        b.els[-1]["letterSpacing"] = 1.55 if label != lbl["skills"] else 1.3
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 9.3, 13.2, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 9.3, 13.2, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                # the complete record genuinely fits.
                b.block(job.get("title", ""), L, W, 10.8, 13.5, C["ink"], SANS, bold=True, min_h=15)
                b.gap(SPACE_STACK)
                b.block(_company_period(job), L, W, 8.6, 11.5, C["muted"], SANS, min_h=12)
                bullets = _bullets(job)
                if bullets:
                    b.gap(SPACE_STACK)
                    b.block(bullets, L, W, 9.3, 13.2, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]},
                        L, W, SANS, fs=9.3, lh=13.2, skip_indices=sidebar_extra_indices)

    if cv.get("education") and "education" not in sidebar_keys:
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

    if cv.get("skills") and "skills" not in sidebar_keys:
        skills = _skills_inline_content(cv["skills"])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.3, 13.2, SANS))
        section(lbl["skills"])
        b.block(skills, L, W, 9.3, 13.2, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]},
                    L, W, SANS, fs=9.3, lh=13.2, skip_indices=sidebar_extra_indices)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in static + flow] or [1])

    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image", "src": f"{BACKEND_URL}/template-assets/{C['asset']}",
                "width": SIDE, "height": A4_H, "left": 0, "top": 0, "zIndex": 0,
                "page": page, "fixedToPage": True,
            },
            {**_line(SIDE, 0, 2, A4_H, C["accent"], zIndex=1, page=page), "fixedToPage": True},
            {**_line(SIDE + 2, 0, 409, A4_H, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(L, 783, W, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 796, 6, C["accent"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["muted"], L + W - 15, 791, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + static + flow
