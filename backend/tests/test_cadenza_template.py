"""Regression coverage for the warm editorial Cadenza template."""
from __future__ import annotations

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


def _base_cv(**overrides):
    cv = {
        "name": "Julia Bernat",
        "title": "Analityczka AML i Compliance",
        "email": "julia@example.com",
        "phone": "+48 512 340 780",
        "location": "Warszawa",
        "summary": "Łączę analizę ryzyka z jasną komunikacją decyzji.",
        "experience": [],
        "education": [],
        "skills": [],
        "languages": [],
    }
    cv.update(overrides)
    return cv


def test_cadenza_registers_as_a_single_column_icon_template():
    assert TEMPLATE_LAYOUTS["cadenza"] == frozenset({"single", "icons"})


def test_cadenza_uses_editorial_bands_and_its_dedicated_contact_icons():
    elements = generate_resume("cadenza", _base_cv())

    name = next(element for element in elements if element.get("mastheadRole") == "name")
    assert name["fontFamily"] == "PlayfairDisplay"
    assert name["align"] == "center"
    assert name["textTransform"] == "uppercase"

    bands = [
        element for element in elements
        if element.get("flowRole") == "section-chrome"
        and element.get("backgroundColor") == "#E8EDEE"
    ]
    marks = [
        element for element in elements
        if element.get("flowRole") == "section-chrome"
        and element.get("backgroundColor") == "#9B735A"
    ]
    assert len(bands) == 1
    assert bands[0]["width"] == 479.0
    assert len(marks) == 1
    assert marks[0]["width"] == 3.0

    heading = next(
        element for element in elements
        if element.get("content") == "PODSUMOWANIE ZAWODOWE"
    )
    assert heading["left"] == bands[0]["left"]
    assert heading["width"] == bands[0]["width"]
    assert heading["align"] == "center"
    assert heading["letterSpacing"] == 1.8

    icons = [element for element in elements if element.get("category") == "image"]
    assert icons
    assert all("/template-assets/iconic/cadenza/" in element["src"] for element in icons)


def test_cadenza_periods_share_exact_title_and_degree_anchors():
    elements = generate_resume(
        "cadenza",
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
    degree = next(element for element in elements if element.get("content") == "Magister prawa")
    education_period = next(element for element in elements if element.get("content") == "2016 – 2021")

    assert job_period["top"] == job_title["top"]
    assert education_period["top"] == degree["top"]
    for period in (job_period, education_period):
        assert period["flowRole"] == "record-overlay"
        assert period["align"] == "right"
        assert period["autoHeight"] is False


def test_cadenza_adds_a_compact_identity_to_continuation_pages():
    jobs = [
        {
            "title": f"Stanowisko {index}",
            "company": "Editorial Systems",
            "city": "Warszawa",
            "period": f"20{index:02d} – 20{index + 1:02d}",
            "bullets": [
                "Prowadziła wieloetapowy projekt i dokumentowała wyniki dla zespołu.",
                "Koordynowała interesariuszy oraz przygotowywała rekomendacje.",
            ],
        }
        for index in range(12)
    ]
    elements = generate_resume("cadenza", _base_cv(experience=jobs))
    pages = {element.get("page", 1) for element in elements}
    assert max(pages) > 1

    continuation_names = [
        element for element in elements
        if element.get("content") == "Julia Bernat"
        and element.get("page", 1) > 1
        and element.get("fixedToPage")
    ]
    assert len(continuation_names) == max(pages) - 1
    assert all(element.get("textTransform") == "uppercase" for element in continuation_names)
