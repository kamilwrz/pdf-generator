"""Aurelia CV template generator.

Aurelia is a one-column quiet-luxury document in charcoal, warm white, mist
grey, and antique-gold chrome accents. Thick cubic Bézier brushstrokes build a
high-contrast name and title composition: a mist vertical backdrop on the
right, a charcoal nameplate, a stone title plate, and a gold accent stroke.
White text sits on the foreground layer. Section rules react to label length
while sharing one precise right edge.
"""

from __future__ import annotations

from app.services.cv_generator_primitives import (
    Builder,
    _block,
    _line,
    _path,
    _text,
    get_spacing,
)
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (
    _compact_text,
    _contact_line,
    _labels,
    _place_skills_section,
)


BACKDROP_CURVES = [
    {"type": "M", "x": 0.72, "y": 0.02},
    {"type": "C", "x1": 1, "y1": 0.27, "x2": 0.08, "y2": 0.66, "x": 0.34, "y": 0.98},
]
NAMEPLATE_CURVES = [
    {"type": "M", "x": 0.03, "y": 0.55},
    {"type": "C", "x1": 0.25, "y1": 0.23, "x2": 0.68, "y2": 0.78, "x": 0.97, "y": 0.46},
]
TITLEPLATE_CURVES = [
    {"type": "M", "x": 0.02, "y": 0.52},
    {"type": "C", "x1": 0.28, "y1": 0.16, "x2": 0.72, "y2": 0.84, "x": 0.98, "y": 0.48},
]
INK_CURVES = [
    {"type": "M", "x": 0.02, "y": 0.65},
    {"type": "C", "x1": 0.28, "y1": 0.05, "x2": 0.72, "y2": 0.95, "x": 0.98, "y": 0.25},
]

SECTION_HEADING_LEFT = 116
SECTION_RULE_RIGHT = 515
SECTION_HEADING_SIZE = 9
SECTION_HEADING_TRACKING = 1.35
SECTION_RULE_GAP = 18
DISPLAY_NAME_SIZE = 31
DISPLAY_NAME_TRACKING = 0.1
TITLE_SIZE = 8.4
TITLE_TRACKING = 1.55


def _gen_aurelia(cv: dict) -> list[dict]:
    """Build the Aurelia single-column CV with thick contrasting Bézier artwork."""
    C = {
        "paper": "#FEFDF9",
        "ink": "#272724",
        "body": "#464540",
        "muted": "#77736B",
        "gold": "#B3924F",
        "gold_dark": "#8B713A",
        "rule": "#DCD8CE",
        "mist": "#D6D6D3",
        "slate": "#3A3A36",
        "stone": "#5A5A54",
        "white": "#FFFFFF",
    }
    L, W = 116, 399
    DISPLAY, SANS = "PlayfairDisplay", "Montserrat"
    BODY_FS, BODY_LH = 9.3, 13.6
    SECTION_CHROME = 16 + get_spacing().after_rule
    lbl = _labels(cv)

    class AureliaBuilder(Builder):
        """Continue content below the restrained top margin on later pages."""

        def continuation_top(self) -> float:
            return 66.0

    name = _compact_text(cv.get("name"), 34)
    title = _compact_text(cv.get("title"), 58)
    contact = _compact_text(_contact_line(cv), 84)
    # Thick charcoal/stone plates scale with the displayed name and title; the
    # mist backdrop anchors the right half. Clamping protects the page edge for
    # long strings and keeps short ones visually present. Border widths stay
    # large so the fields read as background mass under white type.
    display_name_width = min(
        435,
        max(
            180,
            len(name) * (DISPLAY_NAME_SIZE * 0.63 + DISPLAY_NAME_TRACKING),
        ),
    )
    display_title_width = min(
        360,
        max(
            140,
            len(title) * (TITLE_SIZE * 0.52 + TITLE_TRACKING * 0.35),
        ),
    )
    # PDF export paints elements in list order. Emit artwork from back to front,
    # then text, so the name remains readable even when paths overlap its box.
    header = [
        {
            **_path(
                min(425, 80 + display_name_width * 1.02),
                24,
                90,
                132,
                BACKDROP_CURVES,
                C["mist"],
                borderWidth=22,
                pathKind="flourish",
                zIndex=1,
            ),
            "id": "aurelia-name-backdrop",
        },
        {
            **_path(
                72,
                36,
                min(455, display_name_width + 56),
                52,
                NAMEPLATE_CURVES,
                C["slate"],
                borderWidth=44,
                pathKind="wave",
                zIndex=2,
            ),
            "id": "aurelia-nameplate",
        },
        {
            **_path(
                78,
                86,
                min(400, display_title_width + 48),
                36,
                TITLEPLATE_CURVES,
                C["stone"],
                borderWidth=30,
                pathKind="wave",
                zIndex=2,
            ),
            "id": "aurelia-titleplate",
        },
        {
            **_path(
                80,
                28,
                display_name_width * 0.55,
                12,
                INK_CURVES,
                C["gold"],
                borderWidth=6,
                pathKind="arc",
                zIndex=3,
            ),
            "id": "aurelia-name-ink",
        },
        _text(name, DISPLAY_NAME_SIZE, DISPLAY, C["white"], 80, 55, zIndex=4, bold=True),
        _text(title, TITLE_SIZE, SANS, C["white"], 82, 100, zIndex=4),
        _text(contact, 8.4, SANS, C["muted"], 82, 128, zIndex=4),
    ]
    header[4]["letterSpacing"] = DISPLAY_NAME_TRACKING
    header[5]["letterSpacing"] = TITLE_TRACKING
    header = [{**element, "flowRole": "masthead"} for element in header]

    b = AureliaBuilder(204)

    def section(label: str) -> None:
        """Place a label-aware rule ending at the shared right-column datum."""
        top = b.y
        display_label = _compact_text(label, 44)
        estimated_label_width = len(display_label) * (
            SECTION_HEADING_SIZE * 0.58 + SECTION_HEADING_TRACKING
        )
        # Keep every rule aligned at x=515 while allowing its start to follow
        # the tracked label width. The 24 pt minimum prevents long custom labels
        # from eliminating the visual endpoint completely.
        rule_left = min(
            SECTION_RULE_RIGHT - 24,
            SECTION_HEADING_LEFT + estimated_label_width + SECTION_RULE_GAP,
        )
        chrome = [
            _line(76, top + 7, 28, 4, C["gold"], zIndex=3, page=b.pg),
            _text(display_label, SECTION_HEADING_SIZE, SANS, C["ink"], L, top,
                  zIndex=3, page=b.pg, bold=True),
            _line(
                rule_left,
                top + 9,
                SECTION_RULE_RIGHT - rule_left,
                1,
                C["rule"],
                zIndex=2,
                page=b.pg,
            ),
        ]
        chrome[1]["letterSpacing"] = SECTION_HEADING_TRACKING
        b.els.extend({**element, "flowRole": "section-chrome"} for element in chrome)
        b.y = top + SECTION_CHROME

    def close_section() -> None:
        b.gap(get_spacing().section)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS,
            title_fs=10.8, title_lh=13.8,
            meta_fs=8.2, meta_lh=11.2,
            body_fs=BODY_FS, body_lh=BODY_LH,
        )

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS,
            degree_fs=10.4, degree_lh=13.4,
            meta_fs=8.2, meta_lh=11.2,
            body_fs=9.2, body_lh=13.4,
        )

    if cv.get("summary"):
        height = b.measure_block(cv["summary"], W, BODY_FS, BODY_LH, SANS)
        b.need_section(SECTION_CHROME, height)
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
                ink=C["ink"], muted=C["muted"], body=C["body"], font=SANS,
                title_fs=10.8, title_lh=13.8,
                meta_fs=8.2, meta_lh=11.2,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
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
                degree_fs=10.4, degree_lh=13.4,
                meta_fs=8.2, meta_lh=11.2,
                body_fs=9.2, body_lh=13.4,
                after_gap=get_spacing().record if index < len(entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, C["body"], SANS, 9.3, 13.6,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, C, L, W, SANS,
        fs=BODY_FS, lh=BODY_LH, section_chrome_h=SECTION_CHROME,
    )

    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    pages_used = max([element.get("page", 1) for element in header + flow] or [1])

    def page_decorations(page: int) -> tuple[dict, ...]:
        """Return the asymmetric gold/grey page rails and quiet footer."""
        page_label = _text(
            f"AURELIA  /  {page:02d}", 7.6, SANS, C["muted"],
            437, 788, zIndex=3, page=page,
        )
        page_label["letterSpacing"] = 1.1
        return (
            {**_line(0, 0, 595, 842, C["paper"], zIndex=0, page=page), "fixedToPage": True},
            {**_line(58, 42, 1, 756, C["rule"], page=page), "fixedToPage": True},
            {**_line(63, 42, 3, 54, C["gold"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(63, 744, 3, 54, C["gold"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(80, 778, 435, 1, C["rule"], zIndex=2, page=page), "fixedToPage": True},
            {**_line(80, 787, 54, 4, C["gold"], zIndex=3, page=page), "fixedToPage": True},
            {**page_label, "fixedToPage": True},
        )

    decorations = [
        element
        for page in range(1, pages_used + 1)
        for element in page_decorations(page)
    ]
    return decorations + header + flow
