"""Regression coverage for the portrait-led Vellum editorial template."""
from __future__ import annotations

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume

_SUMMARY = "Łączę analizę ryzyka z jasną komunikacją decyzji."


def _base_cv(**overrides):
    cv = {
        "name": "Julia Bernat",
        "title": "Analityczka AML i Compliance",
        "email": "julia@example.com",
        "phone": "+48 512 340 780",
        "location": "Warszawa",
        "summary": _SUMMARY,
        "experience": [],
        "education": [],
        "skills": ["AML/KYC", "CDD/EDD"],
        "languages": [],
    }
    cv.update(overrides)
    return cv


def test_vellum_registers_as_a_single_column_icon_template():
    assert TEMPLATE_LAYOUTS["vellum"] == frozenset({"single", "icons"})


def test_vellum_uses_asymmetric_identity_summary_field_and_circular_photo():
    elements = generate_resume("vellum", _base_cv())

    page_background = next(
        element for element in elements
        if element.get("fixedToPage")
        and element.get("left") == 0
        and element.get("top") == 0
        and element.get("height") == 842
    )
    assert page_background["backgroundColor"] == "#FFFFFF"
    assert page_background["appearanceTemplateId"] == "vellum"
    assert page_background["appearanceSettings"] == {
        "palette": "sage",
        "textSize": "M",
    }

    name = next(element for element in elements if element.get("mastheadRole") == "name")
    assert name["fontFamily"] == "CormorantGaramond"
    assert name["align"] == "left"
    assert name["textTransform"] == "uppercase"

    frame = next(element for element in elements if element.get("id") == "vellum-photo-frame")
    glyph = next(element for element in elements if element.get("id") == "vellum-photo-glyph")
    assert frame["category"] == "circle"
    assert frame["photoShape"] == "circle"
    assert frame["width"] == frame["height"] == 104.0
    assert frame["backgroundColor"] == "#E5ECE8"
    assert frame["appearanceColorRole"] == "photo"
    assert glyph["photoSlot"] == "glyph"
    assert "/iconic/vellum-sage/portrait.png" in glyph["src"]
    photo_cluster = [element for element in elements if element.get("photoSlot")]
    assert len(photo_cluster) == 3
    assert all(element.get("fixedToPage") is True for element in photo_cluster)
    assert all(element.get("repeatOnContinuation") is False for element in photo_cluster)

    summary_band = next(
        element for element in elements
        if element.get("flowRole") == "section-chrome"
        and element.get("backgroundColor") == "#EDF2EF"
        and element.get("width") == 595
    )
    summary_background = next(
        element for element in elements
        if element.get("flowRole") == "section-background"
        and element.get("backgroundColor") == "#EDF2EF"
        and element.get("width") == 595
    )
    summary = next(element for element in elements if element.get("content") == _SUMMARY)
    assert summary_band["top"] < summary["top"]
    assert summary_background["top"] == summary["top"]
    assert summary_background["flowGroup"] == summary["flowGroup"]
    assert summary_background["id"] == "vellum-summary-background"
    assert summary_background["appearanceColorRole"] == "field"
    assert summary["appearanceColorRole"] == "summaryText"
    assert summary["color"] == "#3B4540"


def test_vellum_places_skills_before_experience_and_anchors_periods_exactly():
    elements = generate_resume(
        "vellum",
        _base_cv(
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

    headings = [
        element for element in elements
        if element.get("flowRole") == "section-chrome"
        and element.get("category") == "text"
    ]
    heading_order = [element["content"] for element in sorted(headings, key=lambda item: item["top"])]
    assert heading_order.index("UMIEJĘTNOŚCI") < heading_order.index("DOŚWIADCZENIE ZAWODOWE")

    job_title = next(element for element in elements if element.get("content") == "Senior AML Analyst")
    company = next(element for element in elements if element.get("content") == "Northbridge Advisory")
    job_period = next(element for element in elements if element.get("content") == "2022 – obecnie")
    degree = next(element for element in elements if element.get("content") == "Magister prawa")
    school = next(element for element in elements if element.get("content") == "Uniwersytet Warszawski")
    education_period = next(element for element in elements if element.get("content") == "2016 – 2021")
    job_city = next(
        element for element in elements
        if element.get("content") == "Warszawa"
        and element.get("flowGroup") == job_title.get("flowGroup")
    )
    education_city = next(
        element for element in elements
        if element.get("content") == "Warszawa"
        and element.get("flowGroup") == degree.get("flowGroup")
    )
    assert job_period["top"] == job_title["top"]
    assert job_city["top"] == company["top"]
    assert education_period["top"] == degree["top"]
    assert education_city["top"] == school["top"]
    for rail_item in (job_period, job_city, education_period, education_city):
        assert rail_item["flowRole"] == "record-overlay"
        assert rail_item["align"] == "right"
        assert rail_item["autoHeight"] is False


def test_vellum_continuation_pages_do_not_repeat_identity_or_contacts():
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
    elements = generate_resume("vellum", _base_cv(experience=jobs))
    pages = {element.get("page", 1) for element in elements}
    assert max(pages) > 1

    assert not any(
        element.get("page", 1) > 1
        and (
            element.get("mastheadRole") == "name"
            or element.get("contactChannel")
        )
        for element in elements
    )
    page_numbers = [
        element for element in elements
        if element.get("fixedToPage")
        and element.get("category") == "text"
        and str(element.get("content", "")).isdigit()
    ]
    assert len(page_numbers) == max(pages)
