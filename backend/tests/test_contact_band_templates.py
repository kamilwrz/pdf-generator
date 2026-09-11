"""Templates emit a contact-band anchor + tagged pairs so the client channel
manager can add/remove/edit channels.

The tests also protect the reserved two-row masthead used by centered editorial
templates. Its divider must stay clear of wrapped contacts and remain at the
same coordinate when channels are added or removed.
"""
import pytest

from app.services.cv_generator import generate_resume

_CV = {
    "name": "Jan Kowalski",
    "title": "AML Analyst",
    "phone": "+48 111 222 333",
    "email": "jan@example.com",
    "linkedin": "linkedin.com/in/jan",
    "location": "Warszawa",
    "summary": "Krótkie podsumowanie zawodowe do testów.",
    "experience": [],
    "education": [],
    "skills": ["Analiza"],
}


def _anchor(elements):
    return next((e for e in elements if e.get("flowRole") == "masthead-anchor"), None)


@pytest.mark.parametrize(
    "template_id,mode",
    [
        ("aurelia", "centered"),
        ("atrium", "centered"),
        ("slate", "wrapping"),
        ("regent", "bounded-stack"),
        ("meridian", "bounded-stack"),
        ("cadenza", "centered"),
        ("vellum", "bounded-stack"),
    ],
)
def test_template_emits_contact_band(template_id, mode):
    elements = generate_resume(template_id, _CV)
    anchor = _anchor(elements)
    assert anchor is not None, f"{template_id} has no contact-band anchor"
    assert anchor["contactBand"]["mode"] == mode
    band_id = anchor["contactBandId"]
    pairs = [
        e for e in elements
        if e.get("contactBandId") == band_id and e.get("contactChannel")
    ]
    assert any(e.get("contactChannel") == "phone" for e in pairs), (
        f"{template_id} did not tag the phone contact pair"
    )


def _masthead_divider(elements):
    """Return the decorative line that closes a single-column masthead."""
    explicit = next(
        (element for element in elements if element.get("mastheadDivider")),
        None,
    )
    if explicit is not None:
        return explicit
    return next(
        element for element in elements
        if element.get("category") == "line"
        and element.get("flowRole") == "masthead"
    )


def _first_section_top(elements):
    """Return the first body heading's top coordinate."""
    return min(
        element["top"] for element in elements
        if element.get("category") == "text"
        and element.get("flowRole") == "section-chrome"
    )


@pytest.mark.parametrize("template_id", ["aurelia", "cadenza"])
def test_centered_masthead_reserves_two_contact_rows_without_moving_body(template_id):
    """A newly added second contact row must not collide with or move content."""
    sparse_cv = {
        **_CV,
        "email": "",
        "linkedin": "",
        "location": "",
    }
    sparse_elements = generate_resume(template_id, sparse_cv)
    wrapped_elements = generate_resume(template_id, _CV)

    for elements in (sparse_elements, wrapped_elements):
        descriptor = _anchor(elements)["contactBand"]
        reserved_second_row_top = (
            descriptor["anchor"]["startY"] + descriptor["metrics"]["lineStep"]
        )
        divider = _masthead_divider(elements)
        assert divider["top"] == pytest.approx(reserved_second_row_top + 24.0)

        contact_icons = [
            element for element in elements
            if element.get("category") == "image"
            and element.get("contactBandId") == descriptor["id"]
        ]
        assert all(
            icon["top"] + icon["height"] <= divider["top"] - 12.0
            for icon in contact_icons
        )

    assert _masthead_divider(sparse_elements)["top"] == _masthead_divider(wrapped_elements)["top"]
    assert _first_section_top(sparse_elements) == _first_section_top(wrapped_elements)


@pytest.mark.parametrize("template_id", ["regent", "meridian"])
@pytest.mark.parametrize("long_address", [False, True])
def test_editorial_list_keeps_full_contacts_and_compact_identity(template_id, long_address):
    """Generation shares the editor's geometric icons and growing body floor."""
    cv = {**_CV, "github": "github.com/jan", "website": "example.com"}
    if long_address:
        cv["email"] = "long-address" * 35 + "@example.com"
    elements = generate_resume(template_id, cv)
    descriptor = _anchor(elements)["contactBand"]
    name = next(element for element in elements if element.get("mastheadRole") == "name")
    title = next(element for element in elements if element.get("mastheadRole") == "title")
    assert name["top"] == 24
    assert title["top"] == pytest.approx(name["top"] + name["height"] + 4)
    assert descriptor["anchor"]["startY"] == pytest.approx(title["top"] + title["height"] + 8)
    labels = [element for element in elements if element.get("contactChannel") and element["category"] == "textarea"]
    assert [element["contactChannel"] for element in labels] == ["phone", "email", "linkedin", "github", "website", "location"]
    for index, label in enumerate(labels):
        icon = next(element for element in elements if element.get("contactChannel") == label["contactChannel"] and element["category"] == "image")
        assert icon["width"] == icon["height"] == 11
        assert icon["alignWithText"] is False
        assert icon["top"] + 5.5 == pytest.approx(label["top"] + label["height"] / 2)
        assert icon["left"] == 62
        assert label["left"] == 76
        assert label["width"] == 457
        if index:
            assert label["top"] >= labels[index - 1]["top"] + labels[index - 1]["height"] + 2
    email = next(label for label in labels if label["contactChannel"] == "email")
    assert email["content"] == cv["email"]
    if long_address:
        assert email["height"] > email["lineHeight"]
    divider = _masthead_divider(elements)
    assert divider["top"] >= max(label["top"] + label["height"] for label in labels) + 10
    assert _first_section_top(elements) >= descriptor["flow"]["bodyTop"]
