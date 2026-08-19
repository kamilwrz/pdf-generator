"""Templates emit a contact-band anchor + tagged pairs so the client channel
manager can add/remove/edit channels.

Drawn geometry is asserted in ``test_cv_template_layouts.py``; here we only check
the identity/descriptor plumbing (the band anchor carries the descriptor, and
every contact pair is tagged with its channel + the shared band id).
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
        ("atrium", "centered"),
        ("portico", "centered"),
        ("cardinal", "wrapping"),
        ("tessera", "wrapping"),
        ("slate", "wrapping"),
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
