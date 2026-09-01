"""Regression coverage for the framed, single-column Aurelia template."""
from __future__ import annotations

from pathlib import Path

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume
from app.utils.image_src_to_path import image_src_to_local_path


def _base_cv(**overrides):
    cv = {
        "name": "Julia Bernat",
        "title": "Analityczka AML i Compliance",
        "email": "julia@example.com",
        "phone": "+48 512 340 780",
        "location": "Warszawa",
        "linkedin": "linkedin.com/in/julia-bernat",
        "summary": "Łączę analizę ryzyka z jasną komunikacją decyzji.",
        "experience": [],
        "education": [],
        "skills": [],
        "languages": [],
    }
    cv.update(overrides)
    return cv


def test_aurelia_registers_as_a_single_column_icon_template():
    assert TEMPLATE_LAYOUTS["aurelia"] == frozenset({"single", "icons"})


def test_aurelia_uses_a_framed_identity_and_centered_editorial_rules():
    elements = generate_resume("aurelia", _base_cv())

    frame = next(element for element in elements if element.get("id") == "aurelia-masthead-frame")
    assert frame["category"] == "rectangle"
    assert (frame["left"], frame["top"], frame["width"], frame["height"]) == (
        58.0, 38.0, 479.0, 104.0,
    )
    assert frame["backgroundColor"] == "#98884D"
    assert frame["flowRole"] == "masthead"

    name = next(element for element in elements if element.get("mastheadRole") == "name")
    title = next(element for element in elements if element.get("mastheadRole") == "title")
    assert name["fontFamily"] == "Montserrat"
    assert name["align"] == "center"
    assert name["textTransform"] == "uppercase"
    assert title["align"] == "center"
    assert title["textTransform"] == "uppercase"

    heading = next(
        element for element in elements
        if element.get("content") == "PODSUMOWANIE ZAWODOWE"
    )
    assert heading["width"] == 479.0
    assert heading["align"] == "center"
    assert heading["letterSpacing"] == 1.9
    rule = next(
        element for element in elements
        if element.get("category") == "line"
        and element.get("flowRole") == "section-chrome"
        and element.get("top") > heading["top"]
    )
    assert rule["left"] == 58.0
    assert rule["width"] == 479.0
    assert rule["backgroundColor"] == "#98884D"

    icons = [element for element in elements if element.get("category") == "image"]
    assert icons
    assert all("/template-assets/iconic/aurelia-gilded/" in element["src"] for element in icons)
    assert all(Path(image_src_to_local_path(element["src"])).is_file() for element in icons)

    background = next(
        element for element in elements
        if element.get("fixedToPage")
        and element.get("left") == 0
        and element.get("top") == 0
    )
    assert background["appearanceTemplateId"] == "aurelia"
    assert background["appearanceSettings"] == {"palette": "gilded", "textSize": "M"}


def test_aurelia_records_use_exact_title_and_school_anchors():
    elements = generate_resume(
        "aurelia",
        _base_cv(
            summary="",
            experience=[{
                "title": "Senior AML Analyst",
                "company": "Northbridge Advisory",
                "city": "Warszawa",
                "period": "2022 – obecnie",
                "bullets": ["Prowadzi analizę alertów transakcyjnych."],
            }],
            education=[{
                "degree": "Magister prawa",
                "school": "Uniwersytet Warszawski",
                "city": "Warszawa",
                "period": "2016 – 2021",
            }],
        ),
    )

    job_title = next(element for element in elements if element.get("content") == "Senior AML Analyst")
    job_period = next(element for element in elements if element.get("content") == "2022 – obecnie")
    school = next(element for element in elements if element.get("content") == "Uniwersytet Warszawski")
    school_city = next(
        element for element in elements
        if element.get("content") == "Warszawa"
        and element.get("flowRole") == "record-overlay"
        and element.get("flowGroup") == school.get("flowGroup")
    )

    assert job_period["top"] == job_title["top"]
    assert school_city["top"] == school["top"]
    for overlay in (job_period, school_city):
        assert overlay["flowRole"] == "record-overlay"
        assert overlay["align"] == "right"
        assert overlay["autoHeight"] is False


def test_aurelia_keeps_the_frame_when_the_optional_title_is_empty():
    elements = generate_resume("aurelia", _base_cv(title=""))
    identity = next(element["mastheadIdentity"] for element in elements if element.get("mastheadIdentity"))

    assert identity["title"]["present"] is False
    assert identity["title"]["reclaimPt"] == 0.0
    assert identity["title"]["spec"]["content"] == ""
    assert any(element.get("id") == "aurelia-masthead-frame" for element in elements)
    assert not any(element.get("mastheadRole") == "title" for element in elements)
