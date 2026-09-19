"""Facet's generator, native geometry, pagination and embedded font contract."""
from copy import deepcopy
from pathlib import Path

from fontTools.ttLib import TTFont
from app.schemas.pdf_schema import PdfElement
from app.services.cv.templates.registry import generate_resume
from app.services.documents.rendering.pdf import PDF_Generator

CV = {
    "name": "Łucja Żółkiewska", "title": "Projektantka produktu",
    "email": "lucja@example.com", "phone": "+48 500 600 700", "location": "Łódź",
    "summary": "Projektuję dostępne narzędzia dla zespołów i ich klientów.",
    "experience": [{"title": "Projektantka", "company": "Studio", "period": "2021–2026",
                    "bullets": ["Badania potrzeb użytkowników i projektowanie interfejsów."]}],
    "education": [{"degree": "Magister", "school": "Akademia", "period": "2016–2021"}],
    "skills": ["Badania", "Prototypowanie"],
}


def test_facet_has_white_paper_new_fonts_and_editable_contracts():
    elements = generate_resume("facet", CV)
    paper = next(element for element in elements if element.get("appearanceTemplateId") == "facet")
    assert paper["backgroundColor"] == "#FFFFFF"
    assert paper["appearanceSettings"] == {"palette": "olive", "textSize": "M"}
    fonts = {e["fontFamily"] for e in elements if e.get("content")}
    assert fonts == {"BarlowCondensed", "Lato"}
    assert any(e.get("flowLane") == "sidebar" for e in elements)
    assert any(e.get("flowGroup") for e in elements)
    band = next(e["contactBand"] for e in elements if e.get("contactBand"))
    assert band["id"] == "facet-contact"
    assert band["text"]["fontFamily"] == "Lato"
    assert band["icon"]["theme"] == "facet-olive"
    identity = next(e["mastheadIdentity"] for e in elements if e.get("mastheadIdentity"))
    assert identity["contactBandId"] == "facet-contact"
    for index, element in enumerate(elements):
        PdfElement(element_id=f"facet-{index}", **element)


def test_facet_preserves_long_records_and_repeats_only_page_furniture():
    cv = deepcopy(CV)
    cv["experience"] = [dict(CV["experience"][0], title=f"Rola {index}") for index in range(24)]
    elements = generate_resume("facet", cv)
    pages = max(e.get("page", 1) for e in elements)
    assert pages > 1
    assert {f"Rola {index}" for index in range(24)} <= {e.get("content", "") for e in elements}
    assert sum(e.get("id", "").startswith("facet-corner-") for e in elements) == pages
    assert all(e.get("page", 1) == 1 for e in elements if e.get("flowRole") == "masthead")
    assert all(e["top"] + e.get("height", 0) <= 770 for e in elements if e.get("flowRole") == "content")


def test_facet_font_cuts_match_browser_and_cover_polish():
    root = Path(__file__).resolve().parents[2]
    for family in ("BarlowCondensed", "Lato"):
        for suffix in ("", "-Bold", "-Italic", "-BoldItalic"):
            filename = f"{family}{suffix}.ttf"
            path = root / "backend/fonts" / filename
            assert path.read_bytes() == (root / "frontend/public/fonts" / filename).read_bytes()
            font = TTFont(path)
            assert set(map(ord, "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ")) <= set(font.getBestCmap())
            font.close()
        assert PDF_Generator._resolve_font(family, True, True) == (f"{family}-BoldItalic", False, False)
