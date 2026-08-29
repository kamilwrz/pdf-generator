"""Every CV template emits one masthead identity contract.

Templates that used to bake ``.upper()`` carry the reversible ``textTransform``
flag with original-case content. Profiles without a professional title retain
an unrendered title prototype so the editor can add the template-native element
without leaving empty text boxes or decorative bars on the generated page.

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

# Templates whose design uppercases the name by default. These must express
# the caps through the reversible flag rather than a baked ``.upper()``.
_UPPERCASE_NAME = {"slate", "linden"}
_UPPERCASE_TITLE = {"slate", "regent", "meridian", "vestige", "sterling"}
_BAND_IDS = {
    "atrium": "masthead-main",
    "portico": "masthead-main",
    "slate": "masthead-main",
    "regent": "masthead-main",
    "meridian": "masthead-main",
    "linden": "linden-masthead",
    "vestige": "vestige-masthead",
    "monument": "monument-masthead",
    "sterling": "sterling-masthead",
}
_TITLE_CATEGORIES = {
    template_id: "text" if template_id in {"slate"} else "textarea"
    for template_id in _BAND_IDS
}
_TITLE_DECORATION_COUNTS = {"slate": 1, "linden": 1}


def _by_role(elements, role):
    return next((e for e in elements if e.get("mastheadRole") == role), None)


@pytest.mark.parametrize(
    "template_id",
    list(_BAND_IDS),
)
def test_template_emits_masthead_identity(template_id):
    elements = generate_resume(template_id, _CV)
    anchors = [
        e for e in elements
        if e.get("flowRole") == "masthead-anchor" and e.get("mastheadIdentity")
    ]
    assert len(anchors) == 1, f"{template_id} must emit one identity anchor"
    descriptor = anchors[0]["mastheadIdentity"]
    assert descriptor["id"] == _BAND_IDS[template_id]

    name_el = _by_role(elements, "name")
    title_el = _by_role(elements, "title")
    assert name_el is not None, f"{template_id} did not tag the name element"
    assert title_el is not None, f"{template_id} did not tag the title element"
    # Content keeps original case regardless of the drawn default, so the toggle
    # is reversible and existing PDFs stay byte-stable.
    assert name_el["content"] == "Jan Kowalski"
    if template_id in _UPPERCASE_NAME:
        assert name_el.get("textTransform") == "uppercase"
    else:
        assert name_el.get("textTransform") in (None, "none")

    assert title_el["content"] == "AML Analyst"
    if template_id in _UPPERCASE_TITLE:
        assert title_el.get("textTransform") == "uppercase"
    else:
        assert title_el.get("textTransform") in (None, "none")

    title_spec = descriptor["title"]["spec"]
    assert descriptor["title"]["present"] is True
    assert title_spec["content"] == "AML Analyst"
    assert title_spec["category"] == _TITLE_CATEGORIES[template_id]
    assert title_spec["italic"] is (template_id == "linden")
    assert title_spec["underline"] is False
    assert title_spec["zIndex"] == (5 if template_id == "linden" else 3)
    assert len(descriptor["title"]["decorations"]) == _TITLE_DECORATION_COUNTS.get(
        template_id, 0
    )


@pytest.mark.parametrize(
    "template_id",
    ["atrium", "portico", "slate", "regent", "meridian"],
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
    contact_band_id = descriptor["contactBandId"]
    contact_anchor = next(
        e for e in elements
        if e.get("flowRole") == "masthead-anchor"
        and e.get("contactBand", {}).get("id") == contact_band_id
    )
    assert contact_anchor["contactBandId"] == contact_band_id


@pytest.mark.parametrize(
    "template_id",
    ["linden", "vestige", "monument", "sterling"],
)
def test_fixed_or_parallel_mastheads_do_not_reflow_when_title_toggles(template_id):
    """These layouts reserve the title row or run it beside independent rails."""
    for source_title in ("AML Analyst", ""):
        elements = generate_resume(template_id, {**_CV, "title": source_title})
        anchor = next(e for e in elements if e.get("mastheadIdentity"))
        title = anchor["mastheadIdentity"]["title"]
        assert float(title.get("reclaimPt", title["blockPt"])) == 0.0


@pytest.mark.parametrize("template_id", list(_BAND_IDS))
def test_empty_title_emits_complete_latent_spec_without_orphan_elements(template_id):
    elements = generate_resume(template_id, {**_CV, "title": ""})
    anchors = [e for e in elements if e.get("mastheadIdentity")]
    assert len(anchors) == 1
    descriptor = anchors[0]["mastheadIdentity"]
    title = descriptor["title"]
    spec = title["spec"]

    assert descriptor["id"] == _BAND_IDS[template_id]
    assert title["present"] is False
    assert spec is not None
    assert spec["content"] == ""
    assert spec["category"] == _TITLE_CATEGORIES[template_id]
    assert spec["fontSizePt"] > 0
    assert spec["fontFamily"]
    assert spec["colorHex"]
    assert spec["italic"] is (template_id == "linden")
    assert spec["underline"] is False
    assert spec["zIndex"] == (5 if template_id == "linden" else 3)
    if spec["category"] == "textarea":
        assert spec["width"] > 0
        assert spec["height"] > 0
        assert spec["lineHeight"] > 0

    filled_elements = generate_resume(template_id, _CV)
    filled_title = next(
        element["mastheadIdentity"]["title"]
        for element in filled_elements
        if element.get("mastheadIdentity")
    )
    assert {
        key: value for key, value in spec.items() if key != "content"
    } == {
        key: value for key, value in filled_title["spec"].items() if key != "content"
    }
    assert title["blockPt"] == filled_title["blockPt"]
    assert title["decorations"] == filled_title["decorations"]
    assert all(
        decoration.get("flowRole") == "masthead"
        for decoration in title["decorations"]
    )

    assert _by_role(elements, "title") is None
    assert _by_role(elements, "title-decoration") is None
    # A latent prototype belongs only in the descriptor. This catches the old
    # Tessera/Linden blank bars and Monument's empty title textarea.
    assert not any(element.get("titleDecoration") for element in elements)
    assert not any(
        element is not anchors[0]
        and element.get("category") == spec["category"]
        and element.get("content") == ""
        and element.get("left") == spec["left"]
        and element.get("top") == spec["top"]
        for element in elements
    )
    assert len(title["decorations"]) == _TITLE_DECORATION_COUNTS.get(template_id, 0)


@pytest.mark.parametrize(
    "template_id",
    [
        "atrium", "portico", "slate", "regent", "meridian",
        "monument", "sterling",
    ],
)
def test_empty_title_add_delta_matches_the_authored_contact_position(template_id):
    """The first `+` action must land contacts exactly where a filled CV puts them.

    Empty sequential mastheads already retain their title-to-contact gap, while
    fixed rows reserve the complete slot. Reusing the filled-title hide delta
    would therefore double-shift those contacts when the title was absent from
    the source profile rather than hidden later in the editor.
    """
    empty_elements = generate_resume(template_id, {**_CV, "title": ""})
    filled_elements = generate_resume(template_id, _CV)
    empty_identity = next(
        element["mastheadIdentity"]
        for element in empty_elements
        if element.get("mastheadIdentity")
    )
    contact_band_id = empty_identity["contactBandId"]

    def contact_start(elements):
        anchor = next(
            element for element in elements
            if element.get("contactBand", {}).get("id") == contact_band_id
        )
        return float(anchor["contactBand"]["anchor"]["startY"])

    title_descriptor = empty_identity["title"]
    add_delta = float(title_descriptor.get("reclaimPt", title_descriptor["blockPt"]))
    assert contact_start(empty_elements) + add_delta == contact_start(filled_elements)


@pytest.mark.parametrize("template_id", list(_BAND_IDS))
def test_empty_title_add_delta_matches_the_authored_first_section(template_id):
    """Materialising a missing title must reproduce the filled body boundary."""
    empty_elements = generate_resume(template_id, {**_CV, "title": ""})
    filled_elements = generate_resume(template_id, _CV)
    descriptor = next(
        element["mastheadIdentity"]
        for element in empty_elements
        if element.get("mastheadIdentity")
    )["title"]
    add_delta = float(descriptor.get("reclaimPt", descriptor["blockPt"]))

    def first_section_top(elements):
        return min(
            float(element["top"])
            for element in elements
            if element.get("flowRole") == "section-chrome"
            and int(element.get("page", 1)) == 1
        )

    assert first_section_top(empty_elements) + add_delta == first_section_top(
        filled_elements
    )


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
