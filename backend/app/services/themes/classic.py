"""Classic editorial template family (Scribe, Regent, Aldine, Merit).

Image-free single-column layouts. Helpers come from ``cv_generator``.
"""

from __future__ import annotations

from app.services.cv_generator import (
    CONTENT_BOTTOM,
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
SERIF = "Times-Roman"

def _gen_classic_theme(cv: dict, theme: str) -> list[dict]:
    """Image-free, single-column CVs inspired by impeccably edited Word files."""
    themes = {
        "scribe": {
            "paper": "#FBFAF6", "ink": "#1C2B3A", "accent": "#34516A",
            "muted": "#687782", "rule": "#C7CBC7",
            "left": 94, "width": 429, "start": 168, "continuation": 66,
        },
        "regent": {
            "paper": "#FCFBF8", "ink": "#24201E", "accent": "#733B43",
            "muted": "#756F6B", "rule": "#BFB4AA",
            "left": 113, "width": 386, "start": 168, "continuation": 66,
        },
        "aldine": {
            "paper": "#F8F4EC", "ink": "#2A3028", "accent": "#486151",
            "muted": "#79776E", "rule": "#D7CCB8",
            "left": 116, "width": 384, "start": 168, "continuation": 66,
        },
        "merit": {
            "paper": "#FAFAF8", "ink": "#262A31", "accent": "#4F6679",
            "muted": "#7F909C", "rule": "#CED4D5",
            "left": 102, "width": 418, "start": 168, "continuation": 66,
        },
    }
    if theme not in themes:
        raise ValueError(f"Nieznany motyw klasyczny: {theme}")

    C = themes[theme]
    L, W = C["left"], C["width"]
    SANS, SERIF = "Inter", "Times-Roman"
    lbl = _labels(cv)

    class ClassicBuilder(Builder):
        def need(self, h: float):
            if self.y + h > CONTENT_BOTTOM:
                self.pg += 1
                self.y = float(C["continuation"])


    name = _compact_text(cv.get("name"), 32)
    title = _compact_text(cv.get("title"), 52)
    contact = _compact_text(_contact_line(cv), 78)

    if theme == "scribe":
        frame = {**_rect(461, 60, 58, 58, C["accent"], 0.9, zIndex=3), "id": "scribe-frame"}
        orbit = {**_ellipse(473, 70, 34, 17, C["accent"], borderWidth=0.9, zIndex=3), "id": "scribe-orbit"}
        seal = {**_circle(484, 91, 11, C["accent"], filled=True, zIndex=3), "id": "scribe-seal"}
        header = [
            _text(name, 30, SERIF, C["ink"], 72, 66, zIndex=3, bold=True),
            _text(title, 9.2, SANS, C["accent"], 74, 106, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 74, 132, zIndex=3),
            _line(72, 157, 451, 1, C["rule"], zIndex=2),
            frame, orbit, seal,
            _line(528, 86, 14, 1, C["accent"], zIndex=2),
        ]
        header[0]["letterSpacing"] = 0.15
        header[1]["letterSpacing"] = 1.25
    elif theme == "regent":
        square = {**_rect(442, 57, 57, 57, C["accent"], 0.9, zIndex=3), "id": "regent-square"}
        signet = {**_circle(458, 73, 25, C["accent"], borderWidth=1.1, zIndex=3), "id": "regent-signet"}
        rule = {**_ellipse(451, 91, 39, 13, "#A66B5B", borderWidth=0.8, zIndex=3), "id": "regent-rule"}
        header = [
            _text(name, 29, SERIF, C["ink"], 88, 67, zIndex=3, bold=True),
            _text(title, 8.8, SANS, C["accent"], 90, 107, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 90, 133, zIndex=3),
            _line(88, 158, 411, 1, C["rule"], zIndex=2),
            square, signet, rule,
            _line(508, 82, 16, 1, "#A66B5B", zIndex=2),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.45
    elif theme == "aldine":
        seal = {**_circle(446, 61, 48, C["accent"], borderWidth=1, zIndex=3), "id": "aldine-seal"}
        lozenge = {**_ellipse(458, 76, 24, 10, "#788068", borderWidth=0.9, zIndex=3), "id": "aldine-lozenge"}
        core = {**_circle(465, 93, 10, C["accent"], filled=True, zIndex=3), "id": "aldine-core"}
        frame = {**_rect(437, 52, 66, 66, C["rule"], 0.7, zIndex=3), "id": "aldine-frame"}
        header = [
            _text(name, 30, SERIF, C["ink"], 92, 66, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], 94, 106, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 94, 132, zIndex=3),
            _line(92, 157, 408, 1, C["rule"], zIndex=2),
            seal, lozenge, core, frame,
            _line(508, 96, 14, 1, C["accent"], zIndex=2),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.4
    else:
        panel = {**_rect(452, 58, 67, 58, C["accent"], 0.8, zIndex=3), "id": "merit-panel"}
        capsule = {**_ellipse(462, 69, 47, 18, C["accent"], borderWidth=1, zIndex=3), "id": "merit-capsule"}
        dot_one = {**_circle(476, 93, 12, C["accent"], filled=True, zIndex=3), "id": "merit-dot-one"}
        dot_two = {**_circle(497, 93, 12, C["muted"], borderWidth=1, zIndex=3), "id": "merit-dot-two"}
        header = [
            _text(name, 30, SERIF, C["ink"], 77, 68, zIndex=3, bold=True),
            _text(title, 8.9, SANS, C["accent"], 79, 108, zIndex=3),
            _text(contact, 8.6, SANS, C["muted"], 79, 134, zIndex=3),
            _line(77, 159, 443, 1, C["rule"], zIndex=2),
            panel, capsule, dot_one, dot_two,
            _line(488, 98, 9, 1, C["accent"], zIndex=2),
            _line(522, 70, 14, 1, C["rule"], zIndex=2),
        ]
        header[0]["letterSpacing"] = 0.1
        header[1]["letterSpacing"] = 1.45

    b = ClassicBuilder(C["start"])

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
            meta_fs=8.5, meta_lh=11.5,
            body_fs=8.5, body_lh=11.5,
        )

    # Heading label + rule + after-rule gap. Callers reserve this together with
    # the first body block so section titles are never stranded above the footer.
    SECTION_CHROME = section_chrome_height(8.4)

    def section(label: str) -> None:
        marker_y = b.y + 1
        if theme == "scribe":
            b.els.append(_circle(L - 22, marker_y + 1, 8, C["accent"], filled=True, zIndex=3, page=b.pg))
        elif theme == "regent":
            b.els.append(_rect(L - 25, marker_y + 1, 8, 8, C["accent"], 0.9, zIndex=3, page=b.pg))
        elif theme == "aldine":
            b.els.append(_circle(L - 22, marker_y + 1, 7, C["accent"], filled=True, zIndex=3, page=b.pg))
        else:
            b.els.append(_ellipse(L - 26, marker_y, 13, 13, C["accent"], borderWidth=0.9, zIndex=3, page=b.pg))
        b.text(label, 8.4, SANS, C["accent"], L)
        b.els[-1]["letterSpacing"] = 1.6 if label != lbl["skills"] else 1.35
        b.line(L, W, 1, C["rule"])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, 10, 14.5, SANS))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14.5, C["ink"], SANS)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            # Keep title/meta/bullets as one record so page breaks never split
            # a role across the footer chrome.
            if index > 0:
                b.need(experience_height(job))
            b.block(job.get("title", ""), L, W, 10.8, 13.5, C["ink"], SANS, bold=True, min_h=15)
            b.gap(SPACE_STACK)
            b.block(_company_period(job), L, W, 8.6, 11.5, C["muted"], SANS, min_h=12)
            bullets = _bullets(job)
            if bullets:
                b.gap(SPACE_STACK)
                b.block(bullets, L, W, 9.3, 13.2, C["ink"], SANS, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(SPACE_RECORD)
        close_section()
        _extra_sections(b, cv, "after_experience", section, {"body": C["ink"]},
                        L, W, SANS, fs=9.3, lh=13.2)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            if index > 0:
                b.need(education_height(edu))
            _place_education_record(
                b, edu, L, W,
                ink=C["ink"], muted=C["muted"], body=C["ink"], font=SANS,
                degree_fs=10.2, degree_lh=13,
                meta_fs=8.5, meta_lh=11.5,
                body_fs=8.5, body_lh=11.5,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        close_section()

    if cv.get("skills"):
        b.need_section(SECTION_CHROME, b.measure_block("  ·  ".join(cv["skills"]), W, 9.1, 13, SANS))
        section(lbl["skills"])
        b.block("  ·  ".join(cv["skills"]), L, W, 9.1, 13, C["ink"], SANS)
        close_section()

    _extra_sections(b, cv, "after_skills", section, {"body": C["ink"]},
                    L, W, SANS, fs=9.1, lh=13)
    flow = b.build()
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])

    def page_frame(page: int) -> tuple[dict, ...]:
        if theme == "scribe":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_rect(30, 28, 535, 786, C["rule"], 0.8, page=page), "fixedToPage": True},
                {**_rect(38, 36, 519, 770, "#E7E6DF", 0.5, page=page), "fixedToPage": True},
            )
        if theme == "regent":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_line(46, 36, 3, 770, C["accent"], page=page), "fixedToPage": True},
                {**_rect(56, 36, 483, 770, C["rule"], 0.75, page=page), "fixedToPage": True},
            )
        if theme == "aldine":
            return (
                {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
                {**_rect(29, 29, 537, 784, C["rule"], 0.7, page=page), "fixedToPage": True},
                {**_line(71, 36, 1, 770, "#E3D9C9", page=page), "fixedToPage": True},
                {**_line(523, 36, 1, 770, "#E3D9C9", page=page), "fixedToPage": True},
            )
        return (
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_rect(35, 34, 525, 774, C["rule"], 0.7, page=page), "fixedToPage": True},
            {**_line(35, 34, 525, 3, C["accent"], zIndex=2, page=page), "fixedToPage": True},
        )

    footer_left = 72 if theme == "scribe" else 88 if theme == "regent" else 92 if theme == "aldine" else 77
    footer_width = 451 if theme == "scribe" else 411 if theme == "regent" else 408 if theme == "aldine" else 443
    page_decorations = [
        decoration
        for page in range(1, pages_used + 1)
        for decoration in (
            *page_frame(page),
            {**_line(footer_left, 783, footer_width, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_circle(footer_left, 796, 6, C["accent"], filled=True, zIndex=3, page=page), "fixedToPage": True},
            {**_text(f"{page:02d}", 8, SANS, C["muted"], footer_left + footer_width - 15, 791,
                     zIndex=3, page=page), "fixedToPage": True},
        )
    ]
    return page_decorations + header + flow


def _gen_scribe(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "scribe")


def _gen_regent(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "regent")


def _gen_aldine(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "aldine")


def _gen_merit(cv: dict) -> list[dict]:
    return _gen_classic_theme(cv, "merit")

