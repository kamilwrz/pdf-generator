"""Every contact-band template emits a masthead identity anchor + tagged name,
and templates that used to bake ``.upper()`` now carry the reversible
``textTransform`` flag with original-case content.

Drawn geometry is asserted in ``test_cv_template_layouts.py``; here we only check
the masthead identity plumbing (the anchor carries the descriptor, the name/title
are tagged, and the design's default casing is expressed reversibly).
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

# Templates whose design uppercases the name by default. These must now express
# the caps through the reversible flag rather than a baked ``.upper()``.
_UPPERCASE_NAME = {"tessera", "slate"}


def _by_role(elements, role):
    return next((e for e in elements if e.get("mastheadRole") == role), None)


@pytest.mark.parametrize(
    "template_id",
    ["atrium", "portico", "tessera", "slate", "regent", "volt"],
)
def test_template_emits_masthead_identity(template_id):
    elements = generate_resume(template_id, _CV)
    anchor = next(
        (
            e
            for e in elements
            if e.get("flowRole") == "masthead-anchor" and e.get("mastheadIdentity")
        ),
        None,
    )
    assert anchor is not None, f"{template_id} has no masthead identity anchor"
    assert anchor["mastheadIdentity"]["id"] == "masthead-main"

    name_el = _by_role(elements, "name")
    assert name_el is not None, f"{template_id} did not tag the name element"
    # Content keeps original case regardless of the drawn default, so the toggle
    # is reversible and existing PDFs stay byte-stable.
    assert name_el["content"] == "Jan Kowalski"
    if template_id in _UPPERCASE_NAME:
        assert name_el.get("textTransform") == "uppercase"
    else:
        assert name_el.get("textTransform") in (None, "none")


@pytest.mark.parametrize(
    "template_id",
    ["atrium", "portico", "tessera", "slate", "regent", "volt"],
)
def test_masthead_descriptor_reflow_delta_is_positive(template_id):
    """The title-hide reflow delta (``blockPt``) must be positive so hiding the
    title moves downstream flow up rather than down."""
    elements = generate_resume(template_id, _CV)
    anchor = next(
        e for e in elements
        if e.get("flowRole") == "masthead-anchor" and e.get("mastheadIdentity")
    )
    descriptor = anchor["mastheadIdentity"]
    assert descriptor["title"]["present"] is True
    assert descriptor["title"]["blockPt"] > 0
    assert descriptor["contactBandId"] == "contact-main"


def test_atrium_title_hide_preserves_name_to_contact_buffer():
    """Atrium reclaims only the inter-row gap when its title is hidden."""
    elements = generate_resume("atrium", _CV)
    anchor = next(
        e for e in elements
        if e.get("flowRole") == "masthead-anchor" and e.get("mastheadIdentity")
    )

    title = anchor["mastheadIdentity"]["title"]
    assert title["blockPt"] == 29.0
    assert title["reclaimPt"] == 16.0
