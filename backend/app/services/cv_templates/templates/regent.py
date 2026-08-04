from __future__ import annotations

"""Regent CV template generator (classic ruled)."""

from app.services.cv_generator_primitives import SPACE_AFTER_HEADER_RULE, SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _circle, _ellipse, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _contact_line, _labels

def _gen_regent(cv: dict) -> list[dict]:
    """Image-free, single-column CVs inspired by impeccably edited Word files."""
    C = {'paper': '#FCFBF8', 'ink': '#24201E', 'accent': '#733B43', 'muted': '#756F6B', 'rule': '#BFB4AA', 'left': 113, 'width': 386, 'start': 158 + SPACE_AFTER_HEADER_RULE, 'continuation': 66}
    L, W = (C['left'], C['width'])
    SANS, SERIF = ('Inter', 'Times-Roman')
    lbl = _labels(cv)

    class ClassicBuilder(Builder):

        def continuation_top(self) -> float:
            return float(C['continuation'])
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 52)
    contact = _compact_text(_contact_line(cv), 78)
    square = {**_rect(442, 57, 57, 57, C['accent'], 0.9, zIndex=3), 'id': 'regent-square'}
    signet = {**_circle(458, 73, 25, C['accent'], borderWidth=1.1, zIndex=3), 'id': 'regent-signet'}
    rule = {**_ellipse(451, 91, 39, 13, '#A66B5B', borderWidth=0.8, zIndex=3), 'id': 'regent-rule'}
    header = [_text(name, 29, SERIF, C['ink'], 88, 67, zIndex=3, bold=True), _text(title, 8.8, SANS, C['accent'], 90, 107, zIndex=3), _text(contact, 8.6, SANS, C['muted'], 90, 133, zIndex=3), _line(88, 158, 411, 1, C['rule'], zIndex=2), square, signet, rule, _line(508, 82, 16, 1, '#A66B5B', zIndex=2)]
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
        b.els.append(_rect(L - 25, marker_y + 1, 8, 8, C['accent'], 0.9, zIndex=3, page=b.pg))
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
        b.need_section(SECTION_CHROME, b.measure_block('  ·  '.join(cv['skills']), W, 9.1, 13, SANS))
        section(lbl['skills'])
        b.block('  ·  '.join(cv['skills']), L, W, 9.1, 13, C['ink'], SANS)
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['ink']}, L, W, SANS, fs=9.1, lh=13)
    flow = b.build()
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])

    def page_frame(page: int) -> tuple[dict, ...]:
        return ({**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_line(46, 36, 3, 770, C['accent'], page=page), 'fixedToPage': True}, {**_rect(56, 36, 483, 770, C['rule'], 0.75, page=page), 'fixedToPage': True})
        return ({**_line(0, 0, 595, 842, C['paper'], zIndex=0, page=page), 'fixedToPage': True}, {**_rect(35, 34, 525, 774, C['rule'], 0.7, page=page), 'fixedToPage': True}, {**_line(35, 34, 525, 3, C['accent'], zIndex=2, page=page), 'fixedToPage': True})
    footer_left = 88
    footer_width = 411
    page_decorations = [decoration for page in range(1, pages_used + 1) for decoration in (*page_frame(page), {**_line(footer_left, 783, footer_width, 1, C['rule'], zIndex=2, page=page), 'fixedToPage': True}, {**_circle(footer_left, 796, 6, C['accent'], filled=True, zIndex=3, page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, SANS, C['muted'], footer_left + footer_width - 15, 791, zIndex=3, page=page), 'fixedToPage': True})]
    return page_decorations + header + flow
