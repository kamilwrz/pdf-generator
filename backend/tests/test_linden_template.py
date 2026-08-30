"""Regression coverage for Linden's editorial and structural contracts."""
from __future__ import annotations

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume
from app.services.cv_templates.shared.contact import _measured_text_width


CV = {
    "name": "Julia Bernat",
    "title": "Analityczka AML i Compliance",
    "phone": "+48 512 340 780",
    "email": "julia.bernat@example.com",
    "location": "Warszawa",
    "linkedin": "linkedin.com/in/julia-bernat",
    "summary": "Łączę analizę ryzyka z przejrzystą komunikacją i odpowiedzialnością za wynik.",
    "experience": [
        {
            "title": "Analityczka AML",
            "company": "Crestmont Advisory",
            "period": "2022 – obecnie",
            "bullets": ["Prowadzę monitoring transakcji i analizę alertów AML."],
        }
    ],
    "education": [
        {"degree": "Magister prawa", "school": "Uniwersytet Warszawski", "period": "2018 – 2020"}
    ],
    "skills": ["AML/KYC", "CDD/EDD", "Analiza ryzyka"],
    "languages": [{"name": "Angielski", "level": "C1"}],
}


def test_linden_registers_as_sidebar_icon_layout() -> None:
    assert TEMPLATE_LAYOUTS["linden"] == frozenset({"sidebar", "icons"})


def test_linden_matches_the_editorial_reference_without_losing_structure() -> None:
    elements = generate_resume("linden", CV)

    photo_members = {element.get("photoSlot") for element in elements if element.get("photoSlot")}
    assert photo_members == {"ornament", "frame", "glyph"}
    frame = next(element for element in elements if element.get("photoSlot") == "frame")
    assert frame["photoShape"] == "rect"
    assert frame["width"] > 100
    assert frame["height"] > frame["width"]

    name = next(element for element in elements if element.get("mastheadRole") == "name")
    title = next(element for element in elements if element.get("mastheadRole") == "title")
    assert name["textTransform"] == "uppercase"
    assert name["fontFamily"] == "CormorantGaramond"
    assert title["italic"] is True
    assert title["color"] == "#FBFAF6"
    title_band = next(
        element for element in elements if element.get("titleDecoration") == "identity-band"
    )
    assert title_band["backgroundColor"] == "#1E4037"
    appearance_anchor = next(
        element for element in elements if element.get("appearanceTemplateId") == "linden"
    )
    assert appearance_anchor["appearanceSettings"] == {
        "palette": "botanical",
        "textSize": "M",
    }

    summary_heading = next(
        element for element in elements if element.get("content") == "PODSUMOWANIE ZAWODOWE"
    )
    assert summary_heading["flowRole"] == "section-chrome"
    assert summary_heading.get("flowLane") != "sidebar"
    identity_anchor = next(
        element for element in elements if element.get("mastheadBandId") == "linden-masthead"
        and element.get("flowRole") == "masthead-anchor"
    )
    assert identity_anchor["mainFlowStart"] == summary_heading["top"]
    assert not any(
        element.get("fixedToPage")
        and element.get("category") == "line"
        and element.get("page", 1) == 1
        and element.get("left") == summary_heading["left"]
        and element.get("top", 0) < summary_heading["top"]
        for element in elements
    )

    sidebar_headings = [
        element for element in elements if element.get("flowRole") == "sidebar-chrome"
    ]
    assert sidebar_headings
    assert all(element.get("flowLane") == "sidebar" for element in sidebar_headings)
    sidebar_rules = [
        element for element in elements
        if element.get("category") == "line"
        and float(element.get("left", 0)) < 210.0
        and float(element.get("width", 0)) > float(element.get("height", 0))
        and float(element.get("width", 0)) <= 152.0
    ]
    assert sidebar_rules
    assert {float(element["height"]) for element in sidebar_rules} == {1.0}
    assert any(element.get("flowGroup") for element in elements)


def test_linden_uppercase_name_fits_the_authored_identity_line() -> None:
    cv = {**CV, "name": "Kamil Wrzochalski"}
    elements = generate_resume("linden", cv)
    name = next(element for element in elements if element.get("mastheadRole") == "name")

    glyph_width = _measured_text_width(
        name["content"].upper(), name["fontFamily"], name["fontSize"]
    )
    assert glyph_width is not None
    rendered_width = glyph_width + (len(name["content"]) - 1) * name["letterSpacing"]
    assert rendered_width <= name["width"] - 10.0
    assert name["content"] == "Kamil Wrzochalski"
    assert name["textTransform"] == "uppercase"


def test_linden_contact_descriptor_drives_photo_and_sidebar_reflow() -> None:
    elements = generate_resume("linden", CV)
    anchor = next(element for element in elements if element.get("contactBandId") == "linden-contact" and element.get("contactBand"))
    descriptor = anchor["contactBand"]

    assert descriptor["mode"] == "stacked"
    assert descriptor["icon"]["theme"] == "linden"
    assert descriptor["sidebarSectionGap"] == 32.0
    assert descriptor["photoHidden"] == {
        "mode": "stacked",
        "anchor": {"startX": 34.0, "startY": 64.0},
    }
    assert all(
        "/template-assets/iconic/linden/" in element["src"]
        for element in elements
        if element.get("contactBandId") == "linden-contact" and element.get("category") == "image"
    )
