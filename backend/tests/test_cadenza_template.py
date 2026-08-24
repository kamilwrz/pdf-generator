"""Regression coverage for the Cadenza editorial sidebar template."""
from __future__ import annotations

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


def test_cadenza_is_a_sidebar_icon_template_with_fixed_geometry() -> None:
    """Geometry must remain page furniture, never participate in text reflow."""
    elements = generate_resume(
        "cadenza",
        {
            "name": "Julia Bernat",
            "title": "Analityczka AML",
            "summary": "Łączę analizę ryzyka z precyzyjną komunikacją.",
            "experience": [],
            "education": [],
            "skills": [],
            "languages": [],
        },
    )

    assert TEMPLATE_LAYOUTS["cadenza"] == frozenset({"sidebar", "icons"})
    geometry = [
        element
        for element in elements
        if element["category"] in {"rectangle", "circle", "ellipse"}
    ]
    assert {element["category"] for element in geometry} == {
        "rectangle",
        "circle",
        "ellipse",
    }
    assert all(element["fixedToPage"] for element in geometry)


def test_cadenza_keeps_sidebar_and_record_lanes_from_the_shared_planner() -> None:
    """Content lanes are structural metadata, not visual decoration."""
    elements = generate_resume(
        "cadenza",
        {
            "name": "Julia Bernat",
            "summary": "Profil zawodowy.",
            "experience": [
                {
                    "title": "Analityczka AML",
                    "company": "Crestmont Advisory",
                    "period": "2022 – obecnie",
                    "bullets": ["Prowadzi monitoring transakcji."],
                },
            ],
            "education": [],
            "skills": ["AML/KYC"],
            "languages": [],
        },
    )

    assert any(element.get("flowLane") == "sidebar" for element in elements)
    record_elements = [
        element
        for element in elements
        if element.get("content") == "Analityczka AML"
        or "Crestmont Advisory" in str(element.get("content"))
    ]
    assert len(record_elements) == 2
    assert record_elements[0]["flowGroup"] == record_elements[1]["flowGroup"]
