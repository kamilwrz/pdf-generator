from __future__ import annotations

"""Regent CV template generator.

Regent is a formal executive layout with an oxblood page rail, a personalized
initials seal, and a generous single-column reading measure. Its restrained
rules and serif/sans typography create hierarchy without relying on imagery.
"""

from app.services.cv_generator_primitives import get_spacing, SPACE_AFTER_HEADER_RULE, Builder, _circle, _ellipse, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _contact_line, _labels, _place_skills_section

def _gen_regent(cv: dict) -> list[dict]:
    """Build an image-free executive CV with stable single-column flow."""
    C = {
        'paper': '#FCFBF8',
        'ink': '#211D1B',
        'accent': '#733B43',
        'clay': '#A66B5B',
        'muted': '#756F6B',
        'rule': '#D6CCC3',
        'left': 96,
        'width': 410,
        'start': 154 + SPACE_AFTER_HEADER_RULE,
        'continuation': 66,
    }
    L, W = (C['left'], C['width'])
    SANS, SERIF = ('Inter', 'CormorantGaramond')
    lbl = _labels(cv)

    class ClassicBuilder(Builder):

        def continuation_top(self) -> float:
            return float(C['continuation'])
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 52)
    contact = _compact_text(_contact_line(cv), 78)
    name_parts = [part for part in name.split() if part]
    initials = (
        f"{name_parts[0][0]}{name_parts[-1][0]}".upper()
        if name_parts
        else "R"
    )
    seal = [
        {**_ellipse(445, 54, 58, 46, C['accent'], borderWidth=0.9, zIndex=3), 'id': 'regent-seal'},
        {**_circle(461, 64, 26, C['clay'], borderWidth=0.8, zIndex=3), 'id': 'regent-signet'},
        {**_text(initials, 9.5, SANS, C['accent'], 466, 72, zIndex=4, bold=True),
         'id': 'regent-initials'},
        _line(454, 105, 40, 1, C['clay'], zIndex=2),
    ]
    header = [
        _text(name, 33, SERIF, C['ink'], 88, 61, zIndex=3, bold=True),
        _text(title, 9.0, SANS, C['accent'], 90, 105, zIndex=3),
        _text(contact, 8.5, SANS, C['muted'], 90, 130, zIndex=3),
        _line(88, 154, 418, 1, C['rule'], zIndex=2),
        *seal,
    ]
    header[0]['letterSpacing'] = 0.15
    header[1]['letterSpacing'] = 1.65
    # Masthead stays out of section packing — the structural editor must not
    # treat the contact line / header rule as section chrome (that opened a
    # large white gap under the name block when rhythm knobs ran).
    header = [{**element, "flowRole": "masthead"} for element in header]
    b = ClassicBuilder(C['start'])
    BODY_FS, BODY_LH = (9.6, 14.0)

    def experience_height(job: dict) -> float:
        return _experience_record_height(
            b, job, W, SANS, title_fs=11.2, title_lh=14,
            meta_fs=8.5, meta_lh=11.8, body_fs=BODY_FS, body_lh=BODY_LH,
        )

    def education_height(education: dict) -> float:
        return _education_record_height(
            b, education, W, SANS, degree_fs=10.6, degree_lh=13.5,
            meta_fs=8.5, meta_lh=11.8, body_fs=9.4, body_lh=13.6,
        )
    SECTION_CHROME = section_chrome_height(9.0)

    def section(label: str) -> None:
        marker_y = b.y + 1.5
        mark = _circle(L - 21, marker_y, 7, C['accent'], filled=True, zIndex=3, page=b.pg)
        mark['flowRole'] = 'section-chrome'
        b.els.append(mark)
        b.text(label, 9.0, SANS, C['accent'], L)
        b.els[-1]['letterSpacing'] = 1.5 if label != lbl['skills'] else 1.25
        b.els[-1]['flowRole'] = 'section-chrome'
        accent_rule = _line(L, b.y, 44, 1.25, C['accent'], page=b.pg)
        accent_rule['flowRole'] = 'section-chrome'
        b.els.append(accent_rule)
        quiet_rule = _line(L + 52, b.y, W - 52, 1, C['rule'], page=b.pg)
        quiet_rule['flowRole'] = 'section-chrome'
        b.els.append(quiet_rule)
        b.gap(get_spacing().after_rule)

    def close_section() -> None:
        b.gap(get_spacing().section)
    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, BODY_FS, BODY_LH, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, BODY_FS, BODY_LH, C['ink'], SANS)
        close_section()
    if cv.get('experience'):
        jobs = cv['experience']
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_experience_record(
                b, job, L, W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                title_fs=11.2, title_lh=14, meta_fs=8.5, meta_lh=11.8,
                body_fs=BODY_FS, body_lh=BODY_LH,
                after_gap=get_spacing().record if index < len(jobs) - 1 else None,
            )
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['ink'], 'accent': C['accent']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(
                b, edu, L, W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS,
                degree_fs=10.6, degree_lh=13.5, meta_fs=8.5, meta_lh=11.8,
                body_fs=9.4, body_lh=13.6,
                after_gap=get_spacing().record if index < len(education_entries) - 1 else None,
            )
        close_section()
    if _place_skills_section(
        b, cv, section, L, W, C['ink'], SANS, 9.5, 13.8,
        section_chrome_h=SECTION_CHROME,
    ):
        close_section()
    _extra_sections(
        b, cv, 'after_skills', section, {'body': C['ink'], 'accent': C['accent']}, L, W, SANS,
        fs=9.5, lh=13.8,
    )
    flow = [
        {**element, "flowRole": element.get("flowRole", "content")}
        for element in b.build()
    ]
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])

    def page_frame(page: int) -> tuple[dict, ...]:
        """Return Regent's quiet frame and signature oxblood page rail."""
        return (
            {**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True},
            {**_line(46, 36, 3, 770, C['accent'], page=page), 'fixedToPage': True},
            {**_rect(56, 36, 483, 770, C['rule'], 0.7, page=page), 'fixedToPage': True},
        )
    footer_left = 88
    footer_width = 411
    page_decorations = [decoration for page in range(1, pages_used + 1) for decoration in (*page_frame(page), {**_line(footer_left, 783, footer_width, 1, C['rule'], zIndex=2, page=page), 'fixedToPage': True}, {**_circle(footer_left, 796, 6, C['accent'], filled=True, zIndex=3, page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['muted'], footer_left + footer_width - 15, 791, zIndex=3, page=page), 'fixedToPage': True})]
    return page_decorations + header + flow
