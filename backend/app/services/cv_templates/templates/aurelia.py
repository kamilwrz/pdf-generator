from __future__ import annotations

"""Aurelia CV template generator.

Aurelia is a one-column quiet-luxury document in charcoal, warm white, and
antique gold. Its signature golden thread is a normalized cubic Bézier path:
one large orbit frames the masthead and a smaller flourish introduces every
section without competing with the deliberately modest body copy.
"""

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


ORBIT_CURVES = [
    {"type": "M", "x": 0.02, "y": 0.72},
    {"type": "C", "x1": 0.18, "y1": 0.05, "x2": 0.48, "y2": 0.02, "x": 0.62, "y": 0.38},
    {"type": "C", "x1": 0.76, "y1": 0.74, "x2": 0.86, "y2": 1.03, "x": 0.98, "y": 0.58},
]
THREAD_CURVES = [
    {"type": "M", "x": 0.02, "y": 0.54},
    {"type": "C", "x1": 0.22, "y1": 0.04, "x2": 0.38, "y2": 0.98, "x": 0.56, "y": 0.5},
    {"type": "C", "x1": 0.72, "y1": 0.08, "x2": 0.86, "y2": 0.92, "x": 0.98, "y": 0.46},
]
SWEEP_CURVES = [
    {"type": "M", "x": 0.01, "y": 0.76},
    {"type": "C", "x1": 0.23, "y1": 0.12, "x2": 0.42, "y2": 0.1, "x": 0.55, "y": 0.48},
    {"type": "C", "x1": 0.68, "y1": 0.86, "x2": 0.86, "y2": 0.82, "x": 0.99, "y": 0.28},
]


def _gen_aurelia(cv: dict) -> list[dict]:
    """Build the Aurelia single-column CV with reusable Bézier section chrome."""
    C = {
        "paper": "#FEFDF9",
        "ink": "#272724",
        "body": "#464540",
        "muted": "#77736B",
        "gold": "#B3924F",
        "gold_dark": "#8B713A",
        "rule": "#DCD8CE",
        "pale": "#F1EEE7",
    }
    L, W = 116, 399
    DISPLAY, SANS = "PlayfairDisplay", "Montserrat"
    BODY_FS, BODY_LH = 9.3, 13.6
    SECTION_CHROME = 16 + get_spacing().after_rule
    lbl = _labels(cv)

    class AureliaBuilder(Builder):
        """Continue content below a restrained top flourish on later pages."""

        def continuation_top(self) -> float:
            return 66.0

    name = _compact_text(cv.get("name"), 34)
    title = _compact_text(cv.get("title"), 58)
    contact = _compact_text(_contact_line(cv), 84)
    header = [
        _text(name, 31, DISPLAY, C["ink"], 80, 55, zIndex=4, bold=True),
        _text(title, 8.4, SANS, C["gold_dark"], 82, 100, zIndex=4),
        _text(contact, 8.4, SANS, C["muted"], 82, 128, zIndex=4),
        {
            **_path(302, 25, 229, 128, ORBIT_CURVES, C["gold"],
                    borderWidth=1.2, pathKind="arc", zIndex=2),
            "id": "aurelia-golden-orbit",
        },
        {
            **_path(80, 153, 435, 19, SWEEP_CURVES, C["gold_dark"],
                    borderWidth=1.15, pathKind="flourish", zIndex=3),
            "id": "aurelia-masthead-sweep",
        },
        {
            "category": "polygon",
            "shape": "diamond",
            "points": [[0.5, 0.04], [0.96, 0.5], [0.5, 0.96], [0.04, 0.5]],
            "left": 495,
            "top": 74,
            "width": 10,
            "height": 10,
            "backgroundColor": C["gold"],
            "borderWidth": 0,
            "filled": True,
            "zIndex": 4,
            "page": 1,
            "id": "aurelia-orbit-jewel",
        },
    ]
    header[0]["letterSpacing"] = 0.1
    header[1]["letterSpacing"] = 1.55
    header = [{**element, "flowRole": "masthead"} for element in header]

    b = AureliaBuilder(204)

    def section(label: str) -> None:
        """Place one Bézier thread, label, and two-tone divider as one unit."""
        top = b.y
        chrome = [
            _path(76, top + 1, 29, 13, THREAD_CURVES, C["gold"],
                  borderWidth=1.35, pathKind="flourish", zIndex=3, page=b.pg),
            _text(_compact_text(label, 44), 9, SANS, C["ink"], L, top,
                  zIndex=3, page=b.pg, bold=True),
            _line(274, top + 9, 241, 1, C["rule"], zIndex=2, page=b.pg),
            _line(274, top + 9, 38, 1.4, C["gold"], zIndex=3, page=b.pg),
        ]
        chrome[1]["letterSpacing"] = 1.35
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
        footer_thread = {
            **_path(80, 783, 54, 12, THREAD_CURVES, C["gold"],
                    borderWidth=1.2, pathKind="flourish", zIndex=3, page=page),
            "fixedToPage": True,
        }
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
            footer_thread,
            {**page_label, "fixedToPage": True},
        )

    decorations = [
        element
        for page in range(1, pages_used + 1)
        for element in page_decorations(page)
    ]
    return decorations + header + flow
