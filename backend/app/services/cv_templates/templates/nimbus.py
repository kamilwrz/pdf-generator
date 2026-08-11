from __future__ import annotations

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import (
    get_spacing,
    Builder,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.shared.extras import (
    _extra_sections,
)
from app.services.cv_templates.shared.records import (
    _education_record_height,
    _place_education_record,
)
from app.services.cv_templates.shared.text import (
    _place_skills_section,
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

def _gen_nimbus(cv: dict) -> list[dict]:
    """Light blue-grey finance CV with an airy editorial rhythm."""
    INK, BLUE = "#2B3D4C", "#5F8EAD"
    # Body copy uses a neutral dark grey; headings keep the blue accent ink.
    BODY = "#3A3A3A"
    POWDER, SKY, CLOUD, SLATE = "#B9D2E5", "#DFEBF4", "#E9EEF1", "#72818C"
    L, W, FONT = 80, 462, "Lora"
    FS_NAME, FS_ROLE, FS_HEADING, FS_BODY, FS_META = 32, 14, 14, 12, 11
    LH_ROLE, LH_BODY, LH_META = 18, 17, 14.5
    CONTINUATION = 66
    # Masthead divider and section underlines share the same 3 px weight.
    RULE_H = 3
    # Authored clearance under the masthead rule (resolveFlowStart 6–56 window).
    AFTER_MASTHEAD_RULE = 56
    # Label advance + rule thickness + after-rule gap.
    SECTION_CHROME = section_chrome_height(FS_HEADING) + RULE_H
    lbl = _labels(cv)

    class NimbusBuilder(Builder):
        def continuation_top(self) -> float:
            return float(CONTINUATION)

    def _masthead(element: dict) -> dict:
        return {**element, "flowRole": "masthead"}

    # Masthead composition (A4 pt):
    # - blue accent bar beside name + role (kept; mark chips stay removed)
    # - square photo slot top-right, right edge aligned with the content column
    # - contact line under the photo band, then the 3 px divider
    NAME_LEFT, NAME_TOP = 78, 48
    TITLE_LEFT, TITLE_TOP = 80, 92
    PHOTO_SIZE = 118
    PHOTO_LEFT = L + W - PHOTO_SIZE  # 424 — flush with content right edge
    PHOTO_TOP = 32
    PHOTO_INSET = 6
    CONTACT_TOP = PHOTO_TOP + PHOTO_SIZE + 16  # 166
    rule_top = CONTACT_TOP + 26  # 192

    photo_frame = _masthead({
        **_rect(PHOTO_LEFT, PHOTO_TOP, PHOTO_SIZE, PHOTO_SIZE, POWDER, 1.2, zIndex=3),
        "id": "nimbus-photo-frame",
        "photoSlot": "frame",
        "photoShape": "rect",
    })
    # Soft fill behind the accent art so an empty slot still reads as a photo
    # well; gallery upload replaces the image via photoSlot.
    photo_fill = _masthead(_line(
        PHOTO_LEFT + PHOTO_INSET,
        PHOTO_TOP + PHOTO_INSET,
        PHOTO_SIZE - PHOTO_INSET * 2,
        PHOTO_SIZE - PHOTO_INSET * 2,
        SKY,
        zIndex=1,
    ))
    photo_fill["id"] = "nimbus-photo-fill"
    photo_fill["photoSlot"] = "ornament"
    photo_image = _masthead({
        "category": "image",
        "src": f"{BACKEND_URL}/template-assets/nimbus-finance-accent.png",
        "width": PHOTO_SIZE - PHOTO_INSET * 2,
        "height": PHOTO_SIZE - PHOTO_INSET * 2,
        "left": PHOTO_LEFT + PHOTO_INSET,
        "top": PHOTO_TOP + PHOTO_INSET,
        "zIndex": 2,
        "page": 1,
        "id": "nimbus-photo-image",
        "photoSlot": "image",
        "alignWithText": False,
    })
    static = [
        _masthead(_line(0, 0, 595, RULE_H, POWDER, zIndex=0)),
        _masthead(_line(52, rule_top, 490, RULE_H, POWDER)),
        # Accent bar beside the name / role block (not a removable mark chip).
        _masthead(_line(52, 44, 4, 78, BLUE, zIndex=2)),
        photo_fill,
        photo_frame,
        photo_image,
        _masthead(_text(
            _compact_text(cv.get("name"), 28), FS_NAME, FONT, INK,
            NAME_LEFT, NAME_TOP, zIndex=2, bold=True,
        )),
        _masthead(_text(
            _compact_text(cv.get("title"), 48), FS_ROLE, FONT, BLUE,
            TITLE_LEFT, TITLE_TOP, zIndex=2,
        )),
        _masthead(_text(
            _compact_text(_contact_line(cv), 72), FS_META, FONT, SLATE,
            L, CONTACT_TOP, zIndex=2,
        )),
    ]
    static[7]["letterSpacing"] = 1.2

    b = NimbusBuilder(rule_top + RULE_H + AFTER_MASTHEAD_RULE)

    def job_title(job: dict) -> str:
        # Demo / wizard payloads may use `role` before cv_data normalises to `title`.
        return str(job.get("title") or job.get("role") or "")

    def experience_height(job: dict) -> float:
        bullets = _bullets(job)
        height = (
            b.measure_block(job_title(job), W, FS_ROLE, LH_ROLE, FONT, bold=True, min_h=FS_ROLE + 2)
            + get_spacing().stack
            + b.measure_block(_company_period(job), W, FS_META, LH_META, FONT, min_h=FS_META + 1)
        )
        if bullets:
            height += get_spacing().stack + b.measure_block(
                bullets, W, FS_BODY, LH_BODY, FONT, bulletList=True
            )
        return height

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, FONT,
            degree_fs=FS_ROLE, degree_lh=LH_ROLE,
            meta_fs=FS_META, meta_lh=LH_META,
            body_fs=FS_BODY, body_lh=LH_BODY,
        )

    def section(label: str) -> None:
        # Heading + underline only — no decorative rail/chip beside the label.
        b.text(label, FS_HEADING, FONT, BLUE, L)
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(L, W, RULE_H, CLOUD)
        b.els[-1]["flowRole"] = "section-chrome"
        # Advance past the rule thickness, then the shared after-rule rhythm.
        b.gap(RULE_H)
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, FS_BODY, LH_BODY, FONT))
        section(lbl["summary"])
        b.block(cv["summary"], L, W, FS_BODY, LH_BODY, BODY, FONT)
        close_section()

    if cv.get("experience"):
        jobs = cv["experience"]
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl["experience"])
        for index, job in enumerate(jobs):
            with b.keep_together(experience_height(job)):
                b.block(
                    job_title(job), L, W, FS_ROLE, LH_ROLE, BODY, FONT,
                    bold=True, min_h=FS_ROLE + 2,
                )
                b.gap(get_spacing().stack)
                b.block(
                    _company_period(job), L, W, FS_META, LH_META, SLATE, FONT,
                    min_h=FS_META + 1,
                )
                bullets = _bullets(job)
                if bullets:
                    b.gap(get_spacing().stack)
                    b.block(bullets, L, W, FS_BODY, LH_BODY, BODY, FONT, bulletList=True)
            if index < len(jobs) - 1:
                b.gap(get_spacing().record)
        close_section()
        _extra_sections(
            b, cv, "after_experience", section, {"body": BODY, "accent": BLUE}, L, W, FONT,
            fs=FS_BODY, lh=LH_BODY,
        )

    if cv.get("education"):
        education_entries = cv["education"]
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl["education"])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W,
                ink=BODY, muted=SLATE, body=BODY, font=FONT,
                degree_fs=FS_ROLE, degree_lh=LH_ROLE,
                meta_fs=FS_META, meta_lh=LH_META,
                body_fs=FS_BODY, body_lh=LH_BODY,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()

    if _place_skills_section(
        b, cv, section, L, W, BODY, FONT, FS_BODY, LH_BODY,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()

    _extra_sections(
        b, cv, "after_skills", section, {"body": BODY, "accent": BLUE}, L, W, FONT,
        fs=FS_BODY, lh=LH_BODY,
    )
    # Tag ordinary flow nodes as content so reflow never promotes job titles
    # or degree lines to keep-with-next section chrome.
    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    return static + flow
