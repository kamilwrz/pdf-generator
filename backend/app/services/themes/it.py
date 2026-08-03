"""IT template family generators (Vector, Kernel, Relay).

Shared multi-page content flow with per-theme sidebar artwork and palette.
Helpers are imported from ``cv_generator`` — same dependency direction as
``cv_generator_iconic``.
"""

from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator import (
    SPACE_AFTER_MASTHEAD,
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    SPACE_STACK,
    Builder,
    _bullets,
    _circle,
    _compact_text,
    _company_period,
    _contact_line,
    _education_record_height,
    _ellipse,
    _extra_sections,
    _labels,
    _line,
    _place_education_record,
    _rect,
    _text,
    section_chrome_height,
)

SANS = "Inter"

def _gen_it_theme(cv: dict, theme: str) -> list[dict]:
    """Three distinct IT CV systems with shared safe, multi-page content flow."""
    themes = {
        "vector": {
            "asset": "vector-it-network.png",
            # Contact ~y=119; accent rail ends ~148. Masthead air before body.
            "left": 160, "width": 365, "start": 148 + SPACE_AFTER_MASTHEAD, "continuation": 72,
            "ink": "#FFFFFF", "body": "#DCEBFA", "muted": "#95AFC5",
            "accent": "#26D8FF", "marker": "#B8EF4A", "rule": "#3C6682",
            "font": "Inter", "display": "Times-Roman",
        },
        "kernel": {
            "asset": "kernel-it-architecture.png",
            # Accent rail ends ~152.
            "left": 167, "width": 355, "start": 152 + SPACE_AFTER_MASTHEAD, "continuation": 72,
            "ink": "#173A76", "body": "#253D54", "muted": "#526A83",
            "accent": "#2462B7", "marker": "#D69B22", "rule": "#ACC5D8",
            "font": "Inter", "display": "Times-Roman",
        },
        "relay": {
            "asset": "relay-it-signal.png",
            # Accent rail ends ~149.
            "left": 192, "width": 340, "start": 149 + SPACE_AFTER_MASTHEAD, "continuation": 72,
            "ink": "#F7F6F1", "body": "#F7F6F1", "muted": "#92989C",
            "accent": "#F47B20", "marker": "#EE2525", "rule": "#596065",
            "font": "Inter", "display": "Inter",
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw IT: {theme}")

    C = themes[theme]
    L, W = C["left"], C["width"]
    SANS, DISPLAY = C["font"], C["display"]
    lbl = _labels(cv)

    class TechBuilder(Builder):
        def need(self, h: float):
            if self.y + h > 746:
                self.pg += 1
                self.y = float(C["continuation"])


    contact = _compact_text(_contact_line(cv), 78)
    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    header: list[dict]

    if theme == "vector":
        node_one = {**_circle(430, 53, 18, C["marker"], filled=True, zIndex=3), "id": "vector-node-one"}
        node_two = {**_ellipse(468, 54, 42, 18, C["accent"], borderWidth=1.2, zIndex=3), "id": "vector-node-two"}
        node_three = {**_circle(527, 53, 18, C["accent"], borderWidth=1.2, zIndex=3), "id": "vector-node-three"}
        header = [
            _line(133, 36, 2, 112, C["accent"], zIndex=3),
            _rect(412, 38, 137, 48, "#184568", 0.8, zIndex=2),
            _text(name, 31, DISPLAY, C["ink"], L, 48, zIndex=3, bold=True),
            _text(title, 9.2, SANS, C["accent"], L, 91, zIndex=3),
            _text(contact, 8.8, SANS, C["body"], L, 119, zIndex=3),
            node_one, node_two, node_three,
            _line(448, 61, 20, 1, C["marker"], zIndex=2),
            _line(510, 62, 17, 1, C["accent"], zIndex=2),
        ]
        header[2]["letterSpacing"] = 0.2
        header[3]["letterSpacing"] = 1.35
    elif theme == "kernel":
        orbit = {**_ellipse(435, 54, 75, 34, "#6FB9B4", borderWidth=1.2, zIndex=3), "id": "kernel-orbit"}
        core = {**_circle(456, 64, 15, C["marker"], filled=True, zIndex=3), "id": "kernel-core"}
        node = {**_circle(494, 64, 15, C["accent"], borderWidth=1.2, zIndex=3), "id": "kernel-node"}
        header = [
            _line(137, 48, 4, 104, C["ink"], zIndex=3),
            _rect(425, 42, 105, 52, C["rule"], 0.8, zIndex=2),
            _text(name, 30, DISPLAY, C["ink"], L, 51, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], L, 94, zIndex=3),
            _text(contact, 8.7, SANS, C["muted"], L, 121, zIndex=3),
            orbit, core, node,
            _line(471, 70, 23, 1, C["marker"], zIndex=2),
        ]
        header[2]["letterSpacing"] = 0.15
        header[3]["letterSpacing"] = 1.55
    elif theme == "relay":
        module_one = {**_rect(428, 51, 18, 18, C["marker"], 1.2, zIndex=3), "id": "relay-module-one"}
        module_two = {**_circle(471, 52, 18, C["accent"], filled=True, zIndex=3), "id": "relay-module-two"}
        module_three = {**_ellipse(511, 53, 28, 17, "#D6D9D9", borderWidth=1.1, zIndex=3), "id": "relay-module-three"}
        header = [
            _line(164, 43, 4, 106, C["marker"], zIndex=3),
            _rect(413, 40, 137, 49, "#3A3E42", 0.8, zIndex=2),
            _text(name, 30, DISPLAY, C["ink"], L, 49, zIndex=3, bold=True),
            _text(title, 8.7, "Courier", C["accent"], L, 91, zIndex=3),
            _text(contact, 8.5, SANS, "#D6D9D9", L, 119, zIndex=3),
            module_one, module_two, module_three,
            _line(446, 59, 25, 1, C["accent"], zIndex=2),
            _line(489, 60, 22, 1, "#D6D9D9", zIndex=2),
        ]
        header[2]["letterSpacing"] = 0.3
        header[3]["letterSpacing"] = 0.9
    SECTION_CHROME = section_chrome_height(8.5)
    title_fs = 11 if theme != "relay" else 10.8
    meta_fs = 8.7 if theme != "relay" else 8.6
    body_fs = 9.4 if theme != "relay" else 9.2
    body_lh = 13.3 if theme != "relay" else 13.1
    b = TechBuilder(C["start"])

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job.get("title", ""), W, title_fs, 13.5, SANS, bold=True, min_h=15)
            + SPACE_STACK
            + b.measure_block(_company_period(job), W, meta_fs, 11.5, SANS, min_h=12)
        )
        if bullets:
            height += SPACE_STACK + b.measure_block(
                bullets, W, body_fs, body_lh, SANS, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.4, degree_lh=13,
            meta_fs=8.7, meta_lh=11.5,
            body_fs=8.7, body_lh=11.5,
        )

    def section(label: str) -> None:
        marker_y = b.y + 1
        markers: list[dict] = []
        if theme == "vector":
            markers = [
                _ellipse(L - 27, marker_y, 13, 13, C["accent"], borderWidth=1.2, zIndex=3, page=b.pg),
                _circle(L - 23, marker_y + 4, 5, C["marker"], filled=True, zIndex=3, page=b.pg),
            ]
        elif theme == "kernel":
            markers = [
                _circle(L - 24, marker_y + 1, 12, C["marker"], filled=True, zIndex=3, page=b.pg),
                _line(L - 8, marker_y + 7, 11, 1, C["accent"], zIndex=3, page=b.pg),
            ]
        elif theme == "relay":
            markers = [
                _circle(L - 31, marker_y, 18, C["marker"], borderWidth=1.2, zIndex=3, page=b.pg),
                _rect(L - 25, marker_y + 6, 6, 6, C["accent"], 1, zIndex=3, page=b.pg),
            ]
        # Lock decorative markers/rules for drag + spacing guides (text→text
        # rhythm). flowRole section-chrome still lets canvas reflow move them
        # with the heading when a prior textarea shrinks — otherwise the rule
        # stays on page N+1 while WYKSZTAŁCENIE packs onto page 1 alone.
        for mark in markers:
            mark["locked"] = True
            mark["flowRole"] = "section-chrome"
        b.els.extend(markers)
        b.text(label, 8.5 if theme != "relay" else 8.3,
               "Courier" if theme == "relay" else SANS, C["accent"], L)
        b.els[-1]["letterSpacing"] = 1.55 if theme != "relay" else 1.1
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(L, W, 1, C["rule"])
        b.els[-1]["locked"] = True
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    # Match summary to experience body copy (not a larger lead paragraph).
    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, body_fs, body_lh, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, body_fs, body_lh, C["body"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, title_fs, 13.5, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, meta_fs, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, body_fs, body_lh, C["body"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["body"]},
                        L, W, SANS, fs=body_fs, lh=body_lh)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                degree_fs=10.4, degree_lh=13,
                meta_fs=8.7, meta_lh=11.5,
                body_fs=8.7, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.3, 13.3, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.3, 13.3, C["body"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["body"]},
                    L, W, SANS, fs=9.3, lh=13.3)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            {
                "category": "image",
                "src": f"{BACKEND_URL}/template-assets/{C['asset']}",
                "width": 595,
                "height": 842,
                "left": 0,
                "top": 0,
                "zIndex": 0,
                "page": page,
                "fixedToPage": True,
            },
            {**_line(L, 784, W, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(L, 797, 7, C["marker"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, "Courier" if theme == "relay" else SANS,
                     C["muted"], L + W - 15, 792, zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_vector(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "vector")


def _gen_kernel(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "kernel")


def _gen_relay(cv: dict) -> list[dict]:
    return _gen_it_theme(cv, "relay")

