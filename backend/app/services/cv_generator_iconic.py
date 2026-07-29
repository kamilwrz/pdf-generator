"""Iconic template family generators (Nova, Ridge, Loom, Volt).

Each layout pairs contact + section headings with tinted line-art icons from
``template_assets/iconic/<theme>/``. Fonts use the stylish OFL families already
registered in ``pdf_generator`` (Playfair, Lora, Cormorant, Montserrat, JetBrains).
"""

from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_data import fold_section_label
from app.services.cv_generator import (
    SPACE_RECORD,
    SPACE_SECTION,
    Builder,
    _block,
    _bullets,
    _compact_text,
    _company_period,
    _education_record_height,
    _extra_sections,
    _labels,
    _line,
    _place_education_record,
    _rect,
    _text,
    section_chrome_height,
)


def _icon(theme: str, name: str, left: float, top: float, size: float = 12, *,
          zIndex: int = 3, page: int = 1) -> dict:
    return {
        "category": "image",
        "src": f"{BACKEND_URL}/template-assets/iconic/{theme}/{name}.png",
        "left": left,
        "top": top,
        "width": size,
        "height": size,
        "zIndex": zIndex,
        "page": page,
        # `top` is the companion label's CSS top; PDF/canvas centre the glyph.
        "alignWithText": True,
    }


def _icon_beside(theme: str, name: str, left: float, text_top: float,
                 text_fs: float, size: float = 11, *, page: int = 1) -> dict:
    """Place an icon on the same row as a text label (shared logical top)."""
    del text_fs  # kept for call-site compatibility with older generators
    return _icon(theme, name, left, text_top, size, page=page)


def _icon_key_for_label(label: str) -> str:
    folded = fold_section_label(label)
    mapping = (
        (("podsumow", "summary", "profil"), "summary"),
        (("doswiadcz", "experience", "praca"), "experience"),
        (("wyksztal", "education", "edukac"), "education"),
        (("umiejet", "kompetenc", "skill"), "skills"),
        (("jezyk", "language"), "languages"),
        (("zainteres", "hobby", "interest"), "interests"),
        (("referenc", "reference"), "references"),
        (("certyfik", "kurs", "szkolen", "licenc", "certif"), "certifications"),
    )
    for tokens, key in mapping:
        if any(token in folded for token in tokens):
            return key
    return "other"


def _gen_iconic_theme(cv: dict, theme: str) -> list[dict]:
    themes = {
        "nova": {
            "paper": "#F7F1E8", "ink": "#1A1612", "accent": "#C45C26",
            "mute": "#7A6550", "body": "#2C241C", "rule": "#E0D2C0",
            "display": "PlayfairDisplay", "sans": "Montserrat", "mono": "Montserrat",
            "layout": "nova", "icon_theme": "nova",
            "L": 68, "W": 479, "icon_x": 48, "start": 200,
        },
        "ridge": {
            "paper": "#F3F6F8", "ink": "#15202B", "accent": "#1F7A6C",
            "mute": "#5A6B75", "body": "#24323A", "rule": "#D0DADF",
            "display": "Lora", "sans": "Montserrat", "mono": "Montserrat",
            "layout": "ridge", "icon_theme": "ridge",
            "L": 56, "W": 483, "icon_x": 8, "start": 222,
        },
        "loom": {
            "paper": "#FAF8F4", "ink": "#1C241E", "accent": "#C4A35A",
            "mute": "#6B7368", "body": "#2A322C", "rule": "#DDD6C8",
            "side": "#24352B", "light": "#F3E6C8",
            "display": "CormorantGaramond", "sans": "Montserrat", "mono": "Montserrat",
            "layout": "loom", "icon_theme": "loom",
            "L": 224, "W": 323, "icon_x": 204, "start": 80,
        },
        "volt": {
            "paper": "#0F1218", "ink": "#E8ECF0", "accent": "#E8A838",
            "mute": "#8B93A0", "body": "#C5CCD6", "rule": "#2A3140", "chip": "#1A2030",
            "display": "Montserrat", "sans": "Montserrat", "mono": "JetBrainsMono",
            "layout": "volt", "icon_theme": "volt",
            "L": 78, "W": 469, "icon_x": 48, "start": 188,
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw Iconic: {theme}")

    C = themes[theme]
    L, W = C["L"], C["W"]
    SANS, DISP, MONO = C["sans"], C["display"], C["mono"]
    ICON = C["icon_theme"]
    lbl = _labels(cv)
    header: list[dict] = []
    skip_sidebar_extras: set[int] = set()

    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 56)
    email = _compact_text(cv.get("email"), 42)
    phone = _compact_text(cv.get("phone"), 24)
    location = _compact_text(cv.get("location"), 28)

    start_y = float(C["start"])

    if C["layout"] == "nova":
        contact_fs, contact_icon = 8.4, 11.0
        header = [
            _text(name, 34, DISP, C["ink"], 48, 42, zIndex=3, bold=True),
            _text(title, 9.2, SANS, C["accent"], 50, 88, zIndex=3),
        ]
        header[1]["letterSpacing"] = 1.8
        x = 50.0
        for key, value in (("email", email), ("phone", phone), ("location", location)):
            if not value:
                continue
            header.append(_icon_beside(ICON, key, x, 118, contact_fs, contact_icon))
            header.append(_text(value, contact_fs, SANS, C["mute"], x + 16, 118, zIndex=3))
            x += max(120.0, 16 + len(value) * 5.2)
        header.append(_line(48, 144, 499, 1, C["rule"], zIndex=2))
        start_y = 200.0

    elif C["layout"] == "ridge":
        contact_fs, contact_icon = 8.3, 11.0
        header = [
            _text(name, 30, DISP, C["ink"], 56, 40, zIndex=3, bold=True),
            _text(title, 8.8, SANS, C["accent"], 58, 82, zIndex=3),
        ]
        header[1]["letterSpacing"] = 1.4
        y = 112.0
        for key, value in (("email", email), ("phone", phone), ("location", location)):
            if not value:
                continue
            header.append(_icon_beside(ICON, key, 56, y, contact_fs, contact_icon))
            header.append(_text(value, contact_fs, SANS, C["mute"], 72, y, zIndex=3))
            y += 18
        start_y = y + 24

    elif C["layout"] == "loom":
        light = "loom-light"
        contact_fs, side_head_fs, side_icon = 7.6, 7.4, 11.0
        parts = (name or "").split(" ", 1)
        first = parts[0] if parts else name
        last = parts[1] if len(parts) > 1 else ""
        header = [
            _text(first, 22, DISP, C["light"], 24, 42, zIndex=3, bold=True),
            _text(last or " ", 22, DISP, C["accent"], 24, 68, zIndex=3, bold=True),
            _text(title, 7.8, SANS, C["accent"], 24, 104, zIndex=3),
        ]
        header[2]["letterSpacing"] = 1.3
        y = 140.0
        for key, value in (("email", email), ("phone", phone), ("location", location)):
            if not value:
                continue
            header.append(_icon_beside(light, key, 24, y, contact_fs, side_icon))
            if key == "email":
                header.append(_block(value, 40, y - 2, 120, 20, contact_fs, 11, C["light"], SANS, zIndex=3))
            else:
                header.append(_text(value, contact_fs, SANS, C["light"], 40, y, zIndex=3))
            y += 28
        sidebar_y = max(y + 30, 250.0)
        if cv.get("skills"):
            header.append(_icon_beside(light, "skills", 24, sidebar_y, side_head_fs, side_icon))
            skills_label = _text(lbl["skills"], side_head_fs, SANS, C["accent"], 40, sidebar_y, zIndex=3)
            skills_label["letterSpacing"] = 1.2
            header.append(skills_label)
            skills_txt = "\n".join(f"• {s}" for s in cv["skills"][:6])
            header.append(_block(
                skills_txt, 24, sidebar_y + 24, 132, 78, 7.8, 12, C["light"], SANS,
                zIndex=3, bulletList=True,
            ))
            sidebar_y += 110
        # Compact contact-adjacent extras stay in the sidebar (match frontend Loom).
        for index, sec in enumerate(cv.get("extra_sections") or []):
            kind = (sec.get("kind") or "").lower()
            items = sec.get("items") or []
            if kind not in {"languages", "references", "interests"} or not items:
                continue
            key = _icon_key_for_label(sec.get("title") or kind)
            header.append(_icon_beside(light, key, 24, sidebar_y, side_head_fs, side_icon))
            side_label = _text(
                (sec.get("title") or kind).upper(), side_head_fs, SANS, C["accent"],
                40, sidebar_y, zIndex=3,
            )
            side_label["letterSpacing"] = 1.2
            header.append(side_label)
            if kind == "references":
                body = str(items[0]) if items else "Dostępne na życzenie"
            else:
                body = "\n".join(f"• {item}" for item in items[:5])
            header.append(_block(
                body, 24, sidebar_y + 24, 132, 54, 7.8, 12, C["light"], SANS,
                zIndex=3, bulletList=kind != "references",
            ))
            sidebar_y += 90
            skip_sidebar_extras.add(index)
        start_y = 80.0

    else:  # volt
        chip_h, contact_icon, contact_fs = 20.0, 12.0, 7.8
        header = [
            _text(name, 32, SANS, C["ink"], 48, 36, zIndex=3, bold=True),
            _text(title, 9, MONO, C["accent"], 50, 78, zIndex=3),
        ]
        header[1]["letterSpacing"] = 1.2
        x = 48.0
        chip_top = 108.0
        for key, value, width in (
            ("email", email, 168),
            ("phone", phone, 148),
            ("location", location, 120),
        ):
            if not value:
                continue
            text_top = chip_top + (chip_h - contact_fs) / 2
            header.append(_rect(x, chip_top, width, chip_h, C["chip"], 1, zIndex=1))
            header.append(_icon(ICON, key, x + 6, text_top, contact_icon))
            header.append(_text(
                value, contact_fs, MONO, C["body"],
                x + 6 + contact_icon + 6, text_top, zIndex=3,
            ))
            x += width + 8
        start_y = 188.0

    b = Builder(start_y)
    label_fs = 8.5 if C["layout"] != "volt" else 8.4
    section_icon = 12.0 if C["layout"] in {"ridge", "volt"} else 11.0
    volt_chip = 20.0
    SECTION_CHROME = section_chrome_height(label_fs) + (volt_chip if C["layout"] == "volt" else 16)

    def section(label: str) -> None:
        key = _icon_key_for_label(label)
        b.need(SECTION_CHROME)
        y = b.y
        page = b.pg
        if C["layout"] == "volt":
            text_top = y + (volt_chip - label_fs) / 2
            icon_left = C["icon_x"] + (volt_chip - section_icon) / 2
            b.els.append(_rect(C["icon_x"], y, volt_chip, volt_chip, C["chip"], 1, zIndex=1, page=page))
            b.els.append(_icon(ICON, key, icon_left, text_top, section_icon, page=page))
            heading = _text(label, label_fs, SANS, C["accent"], 78, text_top, zIndex=3, page=page)
            heading["letterSpacing"] = 1.35
            b.els.append(heading)
            b.y = y + volt_chip
        else:
            b.els.append(_icon_beside(
                ICON, key, C["icon_x"], y, label_fs, section_icon, page=page,
            ))
            heading = _text(label, label_fs, SANS, C["accent"], L, y, zIndex=3, page=page)
            heading["letterSpacing"] = 1.45
            b.els.append(heading)
            b.y = y + label_fs * 1.35
        b.gap(2)
        b.line(L, W, 1, C["rule"])
        b.gap(14)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, 11, 13.5, SANS, bold=True, min_h=15)
            + 4
            + b.measure_block(
                _company_period(job), W, 8.5, 11.5,
                MONO if C["layout"] == "volt" else SANS, min_h=12,
            )
        )
        if bullets:
            height += 4 + b.measure_block(bullets, W, 9.4, 13.4, SANS, bulletList=True)
        return height

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.8, SANS) + SPACE_SECTION)
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.8, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.text(job.get("title", ""), 11, SANS, C["ink"], L, bold=True)
            b.gap(2)
            b.text(
                _company_period(job), 8.5,
                MONO if C["layout"] == "volt" else SANS, C["mute"], L,
            )
            b.gap(2)
            bullets = _bullets(job)
            if bullets:
                b.block(bullets, L, W, 9.4, 13.4, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]}, L, W, SANS, fs=9.4, lh=13.4)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, _education_record_height(
            b, education_entries[0], W, SANS,
            degree_fs=10.4, degree_lh=13, meta_fs=8.5, meta_lh=11.5,
            body_fs=9.2, body_lh=13.2,
        ))
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

    # Loom already paints skills (and some extras) in the forest sidebar.
    if cv.get("skills") and C["layout"] != "loom":
        skills_fs = 9.3
        b.need_section(
            SECTION_CHROME,
            b.measure_block("  ·  ".join(cv["skills"]), W, skills_fs, 13.4, SANS) + SPACE_SECTION,
        )
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, skills_fs, 13.4, C["body"], SANS)
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": C["body"]}, L, W, SANS,
        fs=9.3, lh=13.4, skip_indices=skip_sidebar_extras,
    )

    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])

    page_decorations: list[dict] = []
    for page in range(1, pages_used + 1):
        if C["layout"] == "nova":
            page_decorations += [
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(0, 0, 595, 6, C["accent"], zIndex=2, page=page), "fixedToPage": True},
                {**_line(48, 800, 499, 1, C["rule"], page=page), "fixedToPage": True},
                {**_text(f"{page:02d}", 8, SANS, C["mute"], 522, 808, page=page), "fixedToPage": True},
            ]
        elif C["layout"] == "ridge":
            page_decorations += [
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(0, 0, 28, 842, C["accent"], zIndex=1, page=page), "fixedToPage": True},
                {**_line(28, 0, 3, 842, "#9BCFC5", zIndex=1, page=page), "fixedToPage": True},
                {**_line(56, 800, 483, 1, C["rule"], page=page), "fixedToPage": True},
                {**_text(f"{page:02d}", 8, SANS, C["mute"], 520, 808, page=page), "fixedToPage": True},
            ]
        elif C["layout"] == "loom":
            page_decorations += [
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(0, 0, 176, 842, C["side"], zIndex=1, page=page), "fixedToPage": True},
                {**_line(176, 0, 3, 842, C["accent"], zIndex=2, page=page), "fixedToPage": True},
                {**_line(204, 800, 343, 1, C["rule"], page=page), "fixedToPage": True},
                {**_text(f"{page:02d}", 8, SANS, C["mute"], 522, 808, page=page), "fixedToPage": True},
            ]
        else:
            page_decorations += [
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(0, 0, 595, 4, C["accent"], zIndex=2, page=page), "fixedToPage": True},
                {**_line(48, 800, 499, 1, C["rule"], page=page), "fixedToPage": True},
                {**_text(f"{page:02d}", 8, MONO, C["mute"], 522, 808, page=page), "fixedToPage": True},
            ]

    return page_decorations + header + flow


def _gen_nova(cv: dict) -> list[dict]:
    return _gen_iconic_theme(cv, "nova")


def _gen_ridge(cv: dict) -> list[dict]:
    return _gen_iconic_theme(cv, "ridge")


def _gen_loom(cv: dict) -> list[dict]:
    return _gen_iconic_theme(cv, "loom")


def _gen_volt(cv: dict) -> list[dict]:
    return _gen_iconic_theme(cv, "volt")
