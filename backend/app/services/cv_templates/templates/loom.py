from __future__ import annotations

"""Loom CV template generator (icon sidebar)."""

from app.services.cv_generator_primitives import (
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    Builder,
    _block,
    _line,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
    _fit_sidebar_sections,
    _flatten_extra_items,
)
from app.services.cv_templates.shared.icons import _icon, _icon_beside, _icon_key_for_label
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _bullet_list_content,
    _compact_text,
    _labels,
    _skills_inline_content,
)


def _loom_sidebar_candidates(cv: dict, labels: dict) -> list[dict]:
    """Skills / languages / interests / certifications eligible for the forest rail."""
    candidates: list[dict] = []
    skills = [str(skill).strip() for skill in (cv.get("skills") or []) if str(skill).strip()]
    if skills:
        candidates.append({
            "key": "skills",
            "kind": "skills",
            "title": labels["skills"],
            "icon_key": "skills",
            "content": _bullet_list_content(skills),
            "bulletList": True,
        })

    for index, section in enumerate(cv.get("extra_sections") or []):
        kind = (section.get("kind") or "").lower()
        if kind not in {"languages", "references", "interests", "certifications"}:
            continue
        items = _flatten_extra_items(section.get("items") or [])
        title = str(section.get("title") or kind).strip().upper()
        if not title or not items:
            continue
        if kind == "references":
            content = items[0]
            bullet_list = False
        else:
            content = _bullet_list_content(items)
            bullet_list = True
        if not content:
            continue
        candidates.append({
            "key": f"extra:{index}",
            "kind": kind,
            "title": title,
            "icon_key": _icon_key_for_label(title or kind),
            "content": content,
            "bulletList": bullet_list,
            "extra_index": index,
        })
    order = {
        "skills": 0,
        "languages": 1,
        "certifications": 2,
        "interests": 3,
        "references": 4,
    }
    return sorted(
        candidates,
        key=lambda candidate: (order.get(candidate["kind"], 99), candidate["key"]),
    )


def _gen_loom(cv: dict) -> list[dict]:
    C = {
        "paper": "#FAF8F4", "ink": "#1C241E", "accent": "#C4A35A", "mute": "#6B7368",
        "body": "#2A322C", "rule": "#DDD6C8", "side": "#24352B", "light": "#F3E6C8",
        "display": "CormorantGaramond", "sans": "Montserrat", "mono": "Montserrat",
        "layout": "loom", "icon_theme": "loom", "L": 224, "W": 323, "icon_x": 204, "start": 80,
    }
    L, W = C["L"], C["W"]
    SANS, DISP = C["sans"], C["display"]
    ICON = C["icon_theme"]
    lbl = _labels(cv)

    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 56)
    email = _compact_text(cv.get("email"), 42)
    phone = _compact_text(cv.get("phone"), 24)
    location = _compact_text(cv.get("location"), 28)

    light = "loom-light"
    contact_fs = 7.6
    side_head_fs = 7.4
    contact_icon = 11.0
    side_icon = 14.0
    side_text_x = 40.0
    side_body_w = 120.0
    # Keep the rail readable above the footer rule on every page.
    sidebar_bottom = 780.0

    parts = (name or "").split(" ", 1)
    first = parts[0] if parts else name
    last = parts[1] if len(parts) > 1 else ""

    sidebar_base: list[dict] = [
        _text(first, 22, DISP, C["light"], 24, 42, zIndex=3, bold=True),
        _text(last or " ", 22, DISP, C["accent"], 24, 68, zIndex=3, bold=True),
        _text(title, 7.8, SANS, C["accent"], 24, 104, zIndex=3),
    ]
    sidebar_base[2]["letterSpacing"] = 1.3

    y = 140.0
    for key, value in (("email", email), ("phone", phone), ("location", location)):
        if not value:
            continue
        icon_top = y + (contact_fs - contact_icon) / 2.0
        contact_mark = _icon(light, key, 24, icon_top, contact_icon)
        contact_mark["alignWithText"] = False
        sidebar_base.append(contact_mark)
        sidebar_base.append(_text(value, contact_fs, SANS, C["light"], side_text_x, y, zIndex=3))
        y += 22.0

    sidebar_start = max(y + 28.0, 240.0)
    # Measure sidebar bodies with the same font stack Loom paints, then place
    # complete sections only — overflow skills/languages go to the main column
    # instead of being silently truncated to six / five lines.
    fitted, placed_keys = _fit_sidebar_sections(
        _loom_sidebar_candidates(cv, lbl),
        width=side_body_w,
        start_y=sidebar_start,
        bottom_y=sidebar_bottom,
    )
    skip_sidebar_extras = {
        section["extra_index"]
        for section in fitted
        if isinstance(section.get("extra_index"), int)
    }

    for section_data in fitted:
        top = float(section_data["top"])
        icon_top = top + (side_head_fs - side_icon) / 2.0
        mark = _icon(light, section_data["icon_key"], 24, icon_top, side_icon)
        mark["alignWithText"] = False
        sidebar_base.append(mark)
        side_label = _text(
            section_data["title"], side_head_fs, SANS, C["accent"], side_text_x, top, zIndex=3,
        )
        side_label["letterSpacing"] = 1.2
        sidebar_base.append(side_label)
        body_top = float(section_data["body_top"])
        # Prefer the fitted height so the rail packing matches `_fit_sidebar_sections`.
        sidebar_base.append(_block(
            section_data["content"],
            side_text_x,
            body_top,
            side_body_w,
            section_data["body_height"],
            section_data["fontSize"],
            section_data["lineHeight"],
            C["light"],
            SANS,
            zIndex=3,
            bulletList=bool(section_data.get("bulletList")),
        ))

    b = Builder(80.0)
    label_fs = 8.5
    section_icon = 14.0
    SECTION_CHROME = section_chrome_height(label_fs) + 16

    def section(label: str) -> None:
        key = _icon_key_for_label(label)
        cursor = b.y
        page = b.pg
        icon_el = _icon_beside(ICON, key, C["icon_x"], cursor, label_fs, section_icon, page=page)
        icon_el["flowRole"] = "section-chrome"
        b.els.append(icon_el)
        heading = _text(label, label_fs, SANS, C["accent"], L, cursor, zIndex=3, page=page)
        heading["letterSpacing"] = 1.45
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        b.y = cursor + label_fs * 1.35
        b.gap(2)
        b.line(L, W, 1, C["rule"])
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    BODY_FS, BODY_LH = 9.4, 13.4

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS,
            title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
            body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
        )

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, BODY_FS, BODY_LH, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, BODY_FS, BODY_LH, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W,
                ink=C["ink"], muted=C["mute"], body=C["body"], font=SANS,
                title_fs=11, title_lh=13.5, meta_fs=8.5, meta_lh=11.5,
                body_fs=BODY_FS, body_lh=BODY_LH, meta_font=SANS,
                after_gap=SPACE_RECORD if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": C["body"]},
            L, W, SANS, fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(
            SECTION_CHROME,
            _education_record_height(
                b, education_entries[0], W, SANS,
                degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5,
                body_fs=9.2, body_lh=13.2,
            ),
        )
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["mute"], body=C["body"], font=SANS,
                degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5,
                body_fs=9.2, body_lh=13.2,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    # Skills that did not fit the rail appear in the main column — never drop them.
    if "skills" not in placed_keys:
        skills = _skills_inline_content(cv.get("skills"))
        if skills:
            b.need_section(
                SECTION_CHROME,
                b.measure_block(skills, W, 9.3, 13.4, SANS),
            )
            section(lbl["skills"])
            b.block(skills, L, W, 9.3, 13.4, C["body"], SANS)
            close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": C["body"]},
        L, W, SANS, fs=9.3, lh=13.4,
        skip_indices=skip_sidebar_extras, section_chrome_h=SECTION_CHROME,
    )

    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    pages_used = max([element.get("page", 1) for element in flow] or [1])

    # Repeat the forest rail identity + fitted sections on every page so
    # continuation pages do not show a blank green column.
    sidebar: list[dict] = []
    for page in range(1, pages_used + 1):
        for element in sidebar_base:
            sidebar.append({
                **element,
                "page": page,
                "fixedToPage": True,
                "locked": True,
                "flowRole": element.get("flowRole", "content"),
            })

    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        page_decorations += [
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(0, 0, 176, 842, C["side"], zIndex=1, page=page), "fixedToPage": True},
            {**_line(176, 0, 3, 842, C["accent"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(204, 800, 343, 1, C["rule"], page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["mute"], 522, 808, page=page), "fixedToPage": True},
        ]
    return page_decorations + sidebar + flow
