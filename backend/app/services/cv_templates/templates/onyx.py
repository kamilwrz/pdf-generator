from __future__ import annotations

import re
from datetime import datetime

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

def _gen_onyx(cv: dict) -> list[dict]:
    """Framed diplomatic dark theme: a bronze double frame, a centered serif
    masthead and three data-derived stat boxes — the formal, symmetric
    counterpart to the other, left-aligned dark themes."""
    BG, FRAME, FRAME_INNER = "#0E0E10", "#B08D57", "#3A3227"
    IVORY, MUTED, BODY, RULE = "#EDE6D8", "#8A7550", "#D2C9BA", "#332C22"
    S, I = "Times-Roman", "Inter"
    L, W = 55, 485
    lbl = _labels(cv)

    static = [
        _block((cv.get("name") or "").upper(), 50, 56, 495, 36, 27, 33, IVORY, S,
               bold=True, align="center"),
        _block((cv.get("title") or "").upper(), 50, 96, 495, 18, 11.5, 15, FRAME, I,
               align="center"),
        _block(_contact_line(cv), 50, 120, 495, 14, 9.3, 13, MUTED, I, align="center"),
        _rect(255, 139, 8, 8, FRAME, 1),
        _line(271, 142, 53, 2, FRAME),
        _rect(332, 139, 8, 8, FRAME, 1),
    ]
    static[1]["letterSpacing"] = 2

    exp = cv.get("experience") or []
    years_found = [int(m) for job in exp
                   for m in re.findall(r"\b(?:19|20)\d{2}\b", job.get("period") or "")]
    years = max(datetime.now().year - min(years_found), 1) if years_found else None
    skills = cv.get("skills") or []
    kpis = [
        (f"{years}+" if years else str(len(exp) or "—"),
         "LAT DOŚWIADCZENIA" if years else "STANOWISK"),
        (str(len(exp)) if exp else "—", "ZAJMOWANYCH STANOWISK"),
        (str(len(skills)) if skills else "—", "KLUCZOWYCH UMIEJĘTNOŚCI"),
    ]
    for i, (figure, label) in enumerate(kpis):
        left = 55 + i * 164
        static.append(_rect(left, 160, 157, 52, FRAME, 1, zIndex=1))
        static.append(_block(figure, left, 168, 157, 18, 15, 18, IVORY, S, bold=True, align="center"))
        lab = _block(label, left, 190, 157, 12, 7.3, 10, MUTED, I, align="center")
        lab["letterSpacing"] = 1
        static.append(lab)

    # KPI cards end near y=212; start the first section shortly after.
    b = Builder(220)

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            (11 * 1.35) + SPACE_STACK
            + (9 * 1.35) + SPACE_STACK
        )
        if bullets:
            height += b.measure_block(bullets, W, 10, 14, I, bulletList=True)
        return height

    def section(label: str) -> None:
        # Match frontend/src/templates/onyx.js chrome rhythm:
        #   marker + label on one band, rule 14px below label top, then 16px to body.
        # Using Builder.text() then line at y-2 put the rule inside the label's
        # line-box leading (~2px under the glyphs) and only 8px before content —
        # which made every AI-filled Onyx section look top-crushed.
        b.need(40)
        y0 = b.y
        marker = _rect(L, y0 + 2, 9, 9, FRAME, 1.5, zIndex=2, page=b.pg)
        marker["flowRole"] = "section-chrome"
        b.els.append(marker)
        heading = _text(label, 11.5, S, IVORY, 72, y0, zIndex=2, page=b.pg, bold=True)
        heading["letterSpacing"] = 1.4
        heading["flowRole"] = "section-chrome"
        b.els.append(heading)
        b.y = y0 + 14
        b.line(L, W, 1, RULE)
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(16)

    if cv.get("summary"):
        section(lbl["summary"])
        b.block(cv["summary"], L, W, 10, 14, BODY, I); b.gap(16)

    if exp:
        section(lbl["experience"])
        for index, job in enumerate(exp):
            with b.keep_together(experience_height(job)):
                b.text(job.get("title", ""), 11, I, IVORY, L, bold=True); b.gap(SPACE_STACK)
                b.text(_company_period(job), 9, I, MUTED, L); b.gap(SPACE_STACK)
                bul = _bullets(job)
                if bul:
                    b.block(bul, L, W, 10, 14, BODY, I, bulletList=True)
            if index < len(exp) - 1:
                b.gap(SPACE_RECORD)
        b.gap(SPACE_SECTION)
        _extra_sections(b, cv, "after_experience", section, {"body": BODY}, L, W, I)

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(section_chrome_height(12), 72); section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=IVORY, muted=MUTED, body=BODY, font=I,
                degree_fs=10.5, degree_lh=14, meta_fs=9, meta_lh=12.5,
                body_fs=9, body_lh=13,
                after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None,
            )
        b.gap(SPACE_SECTION)

    if skills:
        b.need(40); section(lbl["skills"])
        b.block(" · ".join(skills), L, W, 10, 15, BODY, I); b.gap(SPACE_SECTION)

    _extra_sections(b, cv, "after_skills", section, {"body": BODY}, L, W, I)

    # Reflow must distinguish section chrome from ordinary `text` nodes such
    # as job titles. Without an explicit role, the client treated every text
    # element as keep-with-next chrome and could move a heading behind its own
    # section content during independent auto-height passes.
    flow = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in b.build()
    ]
    static = [
        {
            **element,
            "flowRole": element.get("flowRole", "content"),
            **(
                {"preserveInitialLayout": True}
                if element.get("category") == "textarea"
                else {}
            ),
        }
        for element in static
    ]
    pages_used = max([e.get("page", 1) for e in static + flow] or [1])
    frames = []
    for p in range(1, pages_used + 1):
        frames.append({**_line(0, 0, 595, 842, BG, zIndex=0, page=p), "fixedToPage": True})
        # Frames must be fixed — otherwise textarea reflow treats the full-page
        # outlines as content and shifts them down, leaving empty boxes / pages.
        frames.append({**_rect(24, 24, 547, 794, FRAME, 1.5, page=p), "fixedToPage": True})
        frames.append({**_rect(29, 29, 537, 784, FRAME_INNER, 1, page=p), "fixedToPage": True})
        frames.append({
            **_text(f"{p:02d}", 8, I, MUTED, 522, 801, page=p),
            "fixedToPage": True,
        })

    return frames + static + flow
