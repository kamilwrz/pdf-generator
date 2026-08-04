from __future__ import annotations

"""Merit CV template generator (classic compact)."""

from app.services.cv_generator_primitives import SPACE_AFTER_HEADER_RULE, SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _circle, _ellipse, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _contact_line, _labels, _skills_inline_content

def _gen_merit(cv: dict) -> list[dict]:
    """Image-free, single-column CVs inspired by impeccably edited Word files."""
    C = {'paper': '#FAFAF8', 'ink': '#262A31', 'accent': '#4F6679', 'muted': '#7F909C', 'rule': '#CED4D5', 'left': 102, 'width': 418, 'start': 159 + SPACE_AFTER_HEADER_RULE, 'continuation': 66}
    L, W = (C['left'], C['width'])
    SANS, SERIF = ('Inter', 'Times-Roman')
    lbl = _labels(cv)

    class ClassicBuilder(Builder):

        def continuation_top(self) -> float:
            return float(C['continuation'])
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 52)
    contact = _compact_text(_contact_line(cv), 78)
    panel = {**_rect(452, 58, 67, 58, C['accent'], 0.8, zIndex=3), 'id': 'merit-panel'}
    capsule = {**_ellipse(462, 69, 47, 18, C['accent'], borderWidth=1, zIndex=3), 'id': 'merit-capsule'}
    dot_one = {**_circle(476, 93, 12, C['accent'], filled=True, zIndex=3), 'id': 'merit-dot-one'}
    dot_two = {**_circle(497, 93, 12, C['muted'], borderWidth=1, zIndex=3), 'id': 'merit-dot-two'}
    header = [_text(name, 30, SERIF, C['ink'], 77, 68, zIndex=3, bold=True), _text(title, 8.9, SANS, C['accent'], 79, 108, zIndex=3), _text(contact, 8.6, SANS, C['muted'], 79, 134, zIndex=3), _line(77, 159, 443, 1, C['rule'], zIndex=2), panel, capsule, dot_one, dot_two, _line(488, 98, 9, 1, C['accent'], zIndex=2), _line(522, 70, 14, 1, C['rule'], zIndex=2)]
    header[0]['letterSpacing'] = 0.1
    header[1]['letterSpacing'] = 1.45
    b = ClassicBuilder(C['start'])
    BODY_FS, BODY_LH = (9.3, 13.2)

    def experience_height(job: dict) -> float:
        return _experience_record_height(b, job, W, SANS, title_fs=10.8, title_lh=13.5, meta_fs=8.6, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH)

    def education_height(education: dict) -> float:
        return _education_record_height(b, education, W, SANS, degree_fs=10.2, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=8.5, body_lh=11.5)
    SECTION_CHROME = section_chrome_height(8.4)

    def section(label: str) -> None:
        marker_y = b.y + 1
        b.els.append(_ellipse(L - 26, marker_y, 13, 13, C['accent'], borderWidth=0.9, zIndex=3, page=b.pg))
        b.text(label, 8.4, SANS, C['accent'], L)
        b.els[-1]['letterSpacing'] = 1.6 if label != lbl['skills'] else 1.35
        b.line(L, W, 1, C['rule'])
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)
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
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS, title_fs=10.8, title_lh=13.5, meta_fs=8.6, meta_lh=11.5, body_fs=BODY_FS, body_lh=BODY_LH, after_gap=SPACE_RECORD if index < len(jobs) - 1 else None)
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['ink']}, L, W, SANS, fs=BODY_FS, lh=BODY_LH)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(b, edu, L, W, ink=C['ink'], muted=C['muted'], body=C['ink'], font=SANS, degree_fs=10.2, degree_lh=13, meta_fs=8.5, meta_lh=11.5, body_fs=8.5, body_lh=11.5, after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None)
        close_section()
    if cv.get('skills'):
        skills = _skills_inline_content(cv['skills'])
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.1, 13, SANS))
        section(lbl['skills'])
        b.block(skills, L, W, 9.1, 13, C['ink'], SANS)
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['ink']}, L, W, SANS, fs=9.1, lh=13)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])

    def page_frame(page: int) -> tuple[dict, ...]:
        return ({**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_rect(35, 34, 525, 774, C['rule'], 0.7, page=page), 'fixedToPage': True}, {**_line(35, 34, 525, 3, C['accent'], zIndex=2, page=page), 'fixedToPage': True})
    footer_left = 77
    footer_width = 443
    page_decorations = [decoration for page in range(1, pages_used + 1) for decoration in (*page_frame(page), {**_line(footer_left, 783, footer_width, 1, C['rule'], zIndex=2, page=page), 'fixedToPage': True}, {**_circle(footer_left, 796, 6, C['accent'], filled=True, zIndex=3, page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['muted'], footer_left + footer_width - 15, 791, zIndex=3, page=page), 'fixedToPage': True})]
    return page_decorations + header + flow
