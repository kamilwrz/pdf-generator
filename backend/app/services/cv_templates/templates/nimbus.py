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
    # Label + rule gap; decorated markers stay inside this band so their tops
    # never sort between education/experience flowGroup mates during reflow.
    SECTION_CHROME = section_chrome_height(FS_HEADING)
    lbl = _labels(cv)

    class NimbusBuilder(Builder):
        def continuation_top(self) -> float:
            return float(CONTINUATION)

    def _masthead(element: dict) -> dict:
        return {**element, "flowRole": "masthead"}

    mark_one = _masthead({**_rect(80, 176, 14, 14, BLUE, 1.2, zIndex=2), "id": "nimbus-mark-one"})
    mark_two = _masthead({**_rect(114, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-two"})
    mark_three = _masthead({**_rect(148, 176, 14, 14, POWDER, 1.2, zIndex=2), "id": "nimbus-mark-three"})
    static = [
        _masthead(_line(0, 0, 595, 4, POWDER, zIndex=0)),
        _masthead(_line(52, 207, 490, 1, POWDER)),
        _masthead(_rect(401, 35, 141, 153, POWDER, 1.1, zIndex=3)),
        _masthead({
            "category": "image",
            "src": f"{BACKEND_URL}/template-assets/nimbus-finance-accent.png",
            "width": 129,
            "height": 141,
            "left": 407,
            "top": 41,
            "zIndex": 2,
            "page": 1,
        }),
        _masthead(_line(52, 48, 4, 112, BLUE, zIndex=2)),
        _masthead(_text(_compact_text(cv.get("name"), 28), FS_NAME, FONT, INK, 78, 52, zIndex=2, bold=True)),
        _masthead(_text(_compact_text(cv.get("title"), 48), FS_ROLE, FONT, BLUE, 80, 98, zIndex=2)),
        _masthead(_text(_compact_text(_contact_line(cv), 72), FS_META, FONT, SLATE, 80, 153, zIndex=2)),
        mark_one,
        mark_two,
        mark_three,
        _masthead(_line(94, 182, 20, 1, POWDER, zIndex=1)),
        _masthead(_line(128, 182, 20, 1, POWDER, zIndex=1)),
    ]
    static[6]["letterSpacing"] = 1.2

    # Header rail at y=207; masthead clearance before the first section heading.
    b = NimbusBuilder(208 + SPACE_AFTER_HEADER_RULE)

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

    def section(label: str, decorated: bool = True) -> None:
        if decorated:
            # Markers stay in the heading band (above the rule). A taller chip
            # at y+20 previously sorted onto the first record line and made
            # client reflow treat school/meta as a new record after the degree.
            rail = _line(52, b.y + 2, 2, 14, SKY, page=b.pg)
            chip = _rect(45, b.y + 1, 14, 14, BLUE, zIndex=2, page=b.pg)
            rail["flowRole"] = "section-chrome"
            chip["flowRole"] = "section-chrome"
            b.els.extend((rail, chip))
        b.text(label, FS_HEADING, FONT, BLUE, L)
        b.els[-1]["flowRole"] = "section-chrome"
        b.line(L, W, 1, CLOUD)
        b.els[-1]["flowRole"] = "section-chrome"
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)

    if cv.get("summary"):
        b.need_section(SECTION_CHROME, b.measure_block(cv["summary"], W, FS_BODY, LH_BODY, FONT))
        section(lbl["summary"], decorated=False)
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
            b, cv, "after_experience", section, {"body": BODY}, L, W, FONT,
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
        b, cv, "after_skills", section, {"body": BODY}, L, W, FONT,
        fs=FS_BODY, lh=LH_BODY,
    )
    # Tag ordinary flow nodes as content so reflow never promotes job titles
    # or degree lines to keep-with-next section chrome.
    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    return static + flow
