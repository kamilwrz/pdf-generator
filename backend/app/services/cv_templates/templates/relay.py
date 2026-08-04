from __future__ import annotations

"""Relay CV template generator (IT / monospace motif)."""

from app.core.config import BACKEND_URL
from app.services.cv_generator_primitives import SPACE_AFTER_MASTHEAD, SPACE_AFTER_RULE, SPACE_RECORD, SPACE_SECTION, Builder, _circle, _ellipse, _line, _rect, _text, section_chrome_height
from app.services.cv_templates.shared.extras import _extra_sections
from app.services.cv_templates.shared.records import _education_record_height, _experience_record_height, _place_education_record, _place_experience_record
from app.services.cv_templates.shared.text import _compact_text, _contact_line, _labels, _bullet_list_content

def _gen_relay(cv: dict) -> list[dict]:
    C = {'asset': 'relay-it-signal.png', 'left': 192, 'width': 340, 'start': 149 + SPACE_AFTER_MASTHEAD, 'continuation': 72, 'ink': '#F7F6F1', 'body': '#F7F6F1', 'muted': '#92989C', 'accent': '#F47B20', 'marker': '#EE2525', 'rule': '#596065', 'font': 'Inter', 'display': 'Inter'}
    L, W = (C['left'], C['width'])
    SANS, DISPLAY = (C['font'], C['display'])
    lbl = _labels(cv)

    class TechBuilder(Builder):

        def continuation_top(self) -> float:
            return float(C['continuation'])
    contact = _compact_text(_contact_line(cv), 78)
    name = _compact_text(cv.get('name'), 32)
    title = _compact_text(cv.get('title'), 52)
    header: list[dict]
    module_one = {**_rect(428, 51, 18, 18, C['marker'], 1.2, zIndex=3), 'id': 'relay-module-one'}
    module_two = {**_circle(471, 52, 18, C['accent'], filled=True, zIndex=3), 'id': 'relay-module-two'}
    module_three = {**_ellipse(511, 53, 28, 17, '#D6D9D9', borderWidth=1.1, zIndex=3), 'id': 'relay-module-three'}
    header = [_line(164, 43, 4, 106, C['marker'], zIndex=3), _rect(413, 40, 137, 49, '#3A3E42', 0.8, zIndex=2), _text(name, 30, DISPLAY, C['ink'], L, 49, zIndex=3, bold=True), _text(title, 8.7, 'Courier', C['accent'], L, 91, zIndex=3), _text(contact, 8.5, SANS, '#D6D9D9', L, 119, zIndex=3), module_one, module_two, module_three, _line(446, 59, 25, 1, C['accent'], zIndex=2), _line(489, 60, 22, 1, '#D6D9D9', zIndex=2)]
    header[2]['letterSpacing'] = 0.3
    header[3]['letterSpacing'] = 0.9
    SECTION_CHROME = section_chrome_height(8.5)
    title_fs = 10.8
    meta_fs = 8.6
    body_fs = 9.2
    body_lh = 13.1
    b = TechBuilder(C['start'])

    def experience_height(job: dict) -> float:
        return _experience_record_height(b, job, W, SANS, title_fs=title_fs, title_lh=13.5, meta_fs=meta_fs, meta_lh=11.5, body_fs=body_fs, body_lh=body_lh)

    def education_height(education: dict) -> float:
        return _education_record_height(b, education, W, SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5)

    def section(label: str) -> None:
        marker_y = b.y + 1
        markers: list[dict] = []
        markers = [_circle(L - 31, marker_y, 18, C['marker'], borderWidth=1.2, zIndex=3, page=b.pg), _rect(L - 25, marker_y + 6, 6, 6, C['accent'], 1, zIndex=3, page=b.pg)]
        for mark in markers:
            mark['locked'] = True
            mark['flowRole'] = 'section-chrome'
        b.els.extend(markers)
        b.text(label, 8.3, 'Courier', C['accent'], L)
        b.els[-1]['letterSpacing'] = 1.1
        b.els[-1]['flowRole'] = 'section-chrome'
        b.line(L, W, 1, C['rule'])
        b.els[-1]['locked'] = True
        b.els[-1]['flowRole'] = 'section-chrome'
        b.gap(SPACE_AFTER_RULE)

    def close_section() -> None:
        b.gap(SPACE_SECTION)
    if cv.get('summary'):
        b.need_section(SECTION_CHROME, b.measure_block(cv['summary'], W, body_fs, body_lh, SANS))
        section(lbl['summary'])
        b.block(cv['summary'], L, W, body_fs, body_lh, C['body'], SANS)
        close_section()
    if cv.get('experience'):
        jobs = cv['experience']
        b.need_section(SECTION_CHROME, experience_height(jobs[0]))
        section(lbl['experience'])
        for index, job in enumerate(jobs):
            _place_experience_record(b, job, L, W, ink=C['ink'], muted=C['muted'], body=C['body'], font=SANS, title_fs=title_fs, title_lh=13.5, meta_fs=meta_fs, meta_lh=11.5, body_fs=body_fs, body_lh=body_lh, after_gap=SPACE_RECORD if index < len(jobs) - 1 else None)
        close_section()
        _extra_sections(b, cv, 'after_experience', section, {'body': C['body']}, L, W, SANS, fs=body_fs, lh=body_lh)
    if cv.get('education'):
        education_entries = cv['education']
        b.need_section(SECTION_CHROME, education_height(education_entries[0]))
        section(lbl['education'])
        for index, edu in enumerate(education_entries):
            _place_education_record(b, edu, L, W, ink=C['ink'], muted=C['muted'], body=C['body'], font=SANS, degree_fs=10.4, degree_lh=13, meta_fs=8.7, meta_lh=11.5, body_fs=8.7, body_lh=11.5, after_gap=SPACE_RECORD if index < len(education_entries) - 1 else None)
        close_section()
    # Only emit skills chrome when the bullet body is non-empty. Marker-only
    # leftover items can keep cv['skills'] truthy while `_bullet_list_content`
    # returns "", which previously stranded an empty UMIEJĘTNOŚCI heading.
    skills = _bullet_list_content(cv.get('skills'))
    if skills:
        b.need_section(SECTION_CHROME, b.measure_block(skills, W, 9.3, 13.3, SANS, bulletList=True))
        section(lbl['skills'])
        b.block(skills, L, W, 9.3, 13.3, C['body'], SANS, bulletList=True)
        close_section()
    _extra_sections(b, cv, 'after_skills', section, {'body': C['body']}, L, W, SANS, fs=9.3, lh=13.3)
    # Tag ordinary text/textarea nodes as content so reflow never treats job
    # titles or skill lines as keep-with-next section chrome.
    flow = [
        {**element, 'flowRole': element.get('flowRole', 'content')}
        for element in b.build()
    ]
    header = [
        {**element, 'flowRole': element.get('flowRole', 'content')}
        for element in header
    ]
    pages_used = max([element.get('page', 1) for element in header + flow] or [1])
    page_decorations = [decoration for page in range(1, pages_used + 1) for decoration in ({'category': 'image', 'src': f"{BACKEND_URL}/template-assets/{C['asset']}", 'width': 595, 'height': 842, 'left': 0, 'top': 0, 'zIndex': 0, 'page': page, 'fixedToPage': True}, {**_line(L, 784, W, 1, C['rule'], zIndex=2, page=page), 'fixedToPage': True}, {**_circle(L, 797, 7, C['marker'], filled=True, zIndex=3, page=page), 'fixedToPage': True}, {**_text(f'{page:02d}', 8, 'Courier', C['muted'], L + W - 15, 792, zIndex=3, page=page), 'fixedToPage': True})]
    return page_decorations + header + flow
