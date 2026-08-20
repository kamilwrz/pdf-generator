"""The masthead identity helper tags name/title, seeds reversible uppercase
defaults, records the title spec + reflow blockPt, and returns the anchor."""
from app.services.cv_generator_primitives import _block, _text
from app.services.cv_templates.shared.masthead import (
    build_masthead_identity_anchor,
    tag_masthead_identity,
)


def test_tag_masthead_identity_tags_and_builds_descriptor():
    name_el = _text("Jan Kowalski", 23, "Inter", "#2B2B2B", 44, 44, zIndex=3, bold=True)
    title_el = _text("AML Analyst", 11, "Inter", "#17A2B8", 44, 80, zIndex=3)
    anchor = tag_masthead_identity(
        name_el, title_el, band_id="masthead-main",
        name_default_uppercase=True, band_top=104.0,
        contact_band_id="contact-main",
    )
    # Name is tagged and defaults to uppercase (reversible: content untouched).
    assert name_el["mastheadRole"] == "name"
    assert name_el["mastheadBandId"] == "masthead-main"
    assert name_el["textTransform"] == "uppercase"
    assert name_el["content"] == "Jan Kowalski"
    # Title is tagged; the descriptor captures its spec + reflow delta.
    assert title_el["mastheadRole"] == "title"
    desc = anchor["mastheadIdentity"]
    assert anchor["flowRole"] == "masthead-anchor"
    assert anchor["mastheadBandId"] == "masthead-main"
    assert desc["title"]["present"] is True
    assert desc["title"]["blockPt"] == 24.0  # 104 - 80
    assert desc["title"]["spec"]["content"] == "AML Analyst"
    assert desc["title"]["spec"]["top"] == 80.0
    assert desc["contactBandId"] == "contact-main"


def test_tag_masthead_identity_captures_centered_title_box():
    """A centered title is a width-bounded textarea; the spec must record enough
    geometry (category/width/align/lineHeight) for the client to rebuild the
    centered box on re-add rather than a left-anchored point-text run."""
    name_el = _block("Karolina Zawadzka", 76, 18, 443, 33, 29, 33,
                     "#22221F", "Lora", zIndex=3, bold=True, align="center")
    title_el = _block("Cloud Security Analyst", 76, 169, 443, 14, 10, 14,
                      "#7C6A52", "Inter", zIndex=3, align="center")
    anchor = tag_masthead_identity(
        name_el, title_el, band_id="masthead-main",
        name_default_uppercase=False, band_top=179.0,
        contact_band_id="contact-main",
    )
    spec = anchor["mastheadIdentity"]["title"]["spec"]
    assert spec["category"] == "textarea"
    assert spec["width"] == 443
    assert spec["align"] == "center"
    assert spec["lineHeight"] == 14
    assert spec["autoHeight"] is True


def test_tag_masthead_identity_without_title():
    name_el = _text("Jan Kowalski", 23, "Inter", "#2B2B2B", 44, 44, zIndex=3)
    anchor = tag_masthead_identity(
        name_el, None, band_id="masthead-main",
        name_default_uppercase=False, band_top=100.0,
    )
    desc = anchor["mastheadIdentity"]
    assert "textTransform" not in name_el  # no default → no flag
    assert desc["title"]["present"] is False
    assert desc["title"]["spec"] is None
    assert desc["name"]["defaultUppercase"] is False
