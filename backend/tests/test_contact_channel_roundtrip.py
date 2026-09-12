"""Contact-channel identity + band descriptor survive persist/reload.

Verifies the `extra_properties` pack/unpack in `crud/pdfs.py` carries the new
Phase-1 contact fields through the `PdfElements` row model without a migration.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.crud.pdfs import create_new_pdf, elements_from_rows, update_pdf_elements
from app.models.models import Base, PdfElements, User
from app.schemas.pdf_schema import PDFCreateRequest, PdfElement
from app.services.cv_generator import generate_resume


class _Row:
    """Minimal stand-in for a PdfElements ORM row.

    Any attribute not explicitly provided reads back as None, matching the
    nullable columns `elements_from_rows` accesses directly (src, img_id, ...).
    """

    def __init__(self, **kw):
        self.__dict__.update(kw)

    def __getattr__(self, _name):
        return None


def test_contact_fields_unpack_from_extra_properties():
    row = _Row(
        element_id="e1", category="text", page=1, left=10, top=10,
        content="+48 111", fontFamily="Inter", fontSize=8.4, color="#3A3A3A",
        extra_properties={
            "contactChannel": "phone",
            "contactBandId": "band-1",
            "flowRole": "masthead",
        },
    )
    [element] = elements_from_rows([row])
    assert element.contactChannel == "phone"
    assert element.contactBandId == "band-1"


def test_band_descriptor_unpacks_on_anchor():
    descriptor = {"id": "band-1", "mode": "centered", "order": ["phone", "email"]}
    row = _Row(
        element_id="anchor", category="text", page=1, left=0, top=0,
        content="", fontFamily="Inter", fontSize=1, color="#000000",
        extra_properties={
            "flowRole": "masthead-anchor",
            "contactBand": descriptor,
            "contactBandId": "band-1",
        },
    )
    [element] = elements_from_rows([row])
    assert element.contactBand == descriptor
    assert element.contactBandId == "band-1"


def test_profile_photo_visibility_state_unpacks_from_extra_properties():
    """Hidden geometry and restoration snapshots survive a saved-document load."""
    placeholder = {"src": "/template-assets/portrait.png", "left": 40, "top": 50}
    main_band = {"mode": "wrapping", "anchor": {"startX": 218, "startY": 121}}
    main_identity = {"title": {"spec": {"top": 169}, "blockPt": 22}}
    row = _Row(
        element_id="photo", category="image", page=1, left=33, top=40,
        src="/images/7/content", width=112, height=126,
        extra_properties={
            "photoSlot": "image",
            "photoSlotHidden": True,
            "photoPlaceholder": placeholder,
            "profilePhotoMainContactBand": main_band,
            "profilePhotoMainMastheadIdentity": main_identity,
            "photoLayoutHome": {"top": 191},
        },
    )
    [element] = elements_from_rows([row])
    assert element.photoSlotHidden is True
    assert element.photoPlaceholder == placeholder
    assert element.profilePhotoMainContactBand == main_band
    assert element.profilePhotoMainMastheadIdentity == main_identity
    assert element.photoLayoutHome == {"top": 191}


@pytest.mark.parametrize("write_path", ["create", "update-existing", "insert-on-update"])
def test_linden_contact_chrome_hidden_positions_survive_persistence(write_path):
    """All write paths preserve generated contact heading/rule photo offsets.

    A validated full Linden graph crosses the real SQLite JSON column and is
    reconstructed after expiration. The update cases independently cover both
    existing rows and newly inserted elements, which use separate CRUD paths.
    """
    generated = generate_resume("linden", {
        "name": "Anna Kowalska",
        "title": "Compliance analyst",
        "email": "anna@example.com",
        "phone": "+48 123 456 789",
        "skills": ["CDD/EDD oraz screening PEP, Sanctions i Adverse Media"],
    })
    # Canvas/API preparation supplies stable editor IDs after generation.
    generated = [
        {**element, "element_id": f"linden-{index}"}
        for index, element in enumerate(generated)
    ]
    expected = {
        element["element_id"]: element["profilePhotoHiddenTop"]
        for element in generated if "profilePhotoHiddenTop" in element
    }
    assert sorted(expected.values()) == [38.0, 52.0]
    payload = PDFCreateRequest.model_validate({
        "pdf_title": "Linden photo roundtrip",
        "editor_mode": "template",
        "template_id": "linden",
        "root": generated,
    })
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as database:
            owner = User(username="photo-roundtrip", email="photo@example.com")
            database.add(owner)
            database.flush()
            initial = []
            if write_path == "create":
                initial = payload.root
            elif write_path == "update-existing":
                initial = [
                    element.model_copy(update={"profilePhotoHiddenTop": None})
                    for element in payload.root
                ]
            pdf_id = create_new_pdf(
                database, payload.pdf_title, owner.id, None, initial,
                editor_mode="template", template_id="linden",
            )
            if write_path != "create":
                existing = {
                    row.element_id: row
                    for row in database.query(PdfElements).filter_by(pdf_id=pdf_id).all()
                }
                update_pdf_elements(database, payload.root, existing, pdf_id)
                database.commit()
            database.expire_all()
            rows = database.query(PdfElements).filter_by(pdf_id=pdf_id).all()
            assert {
                row.element_id: row.extra_properties.get("profilePhotoHiddenTop")
                for row in rows if row.element_id in expected
            } == expected
            reloaded = {element.element_id: element for element in elements_from_rows(rows)}
            for element in payload.root:
                restored = reloaded[element.element_id]
                assert restored.model_dump().get("profilePhotoHiddenTop") == expected.get(element.element_id)
                assert restored.top == element.top
                # Dimensions use a string column to also support CSS values.
                assert str(restored.height) == str(element.height)
    finally:
        engine.dispose()


@pytest.mark.parametrize("hidden_top", [None, 0.0, 38.0])
def test_profile_photo_hidden_top_retains_optional_geometry(hidden_top):
    """Missing positions stay null; zero is valid geometry rather than absence."""
    element = PdfElement.model_validate({
        "category": "text", "element_id": "contact-label",
        "profilePhotoHiddenTop": hidden_top,
    })
    assert element.model_dump()["profilePhotoHiddenTop"] == hidden_top


def test_sterling_appearance_state_unpacks_from_extra_properties():
    """Palette intent and reversible type baselines survive document reloads."""
    row = _Row(
        element_id="body", category="textarea", page=1, left=245, top=210,
        content="Profile", fontFamily="Montserrat", fontSize=10.26,
        color="#25322D", width=300, height=28,
        extra_properties={
            "appearanceTemplateId": "sterling",
            "appearanceSettings": {"palette": "sage", "textSize": "L"},
            "appearanceTypographyRole": "body",
            "appearanceBaseFontSize": 9.5,
            "appearanceBaseLineHeight": 13.8,
        },
    )
    [element] = elements_from_rows([row])
    assert element.appearanceTemplateId == "sterling"
    assert element.appearanceSettings == {"palette": "sage", "textSize": "L"}
    assert element.appearanceTypographyRole == "body"
    assert element.appearanceBaseFontSize == 9.5
    assert element.appearanceBaseLineHeight == 13.8


def test_starter_guidance_and_cv_bindings_unpack_from_extra_properties():
    """Empty editor guidance survives storage without becoming PDF content."""
    bindings = [
        {"path": ["experience", 0, "company"], "placeholder": "Nazwa firmy"},
        {"path": ["experience", 0, "city"], "placeholder": "Miasto"},
    ]
    row = _Row(
        element_id="starter-meta", category="text", page=1, left=80, top=250,
        content="", fontFamily="Inter", fontSize=9, color="#111111",
        extra_properties={
            "placeholder": "Nazwa firmy · Miasto",
            "starterPlaceholder": True,
            "starterSectionKey": "experience",
            "cvDataBindings": bindings,
        },
    )
    [element] = elements_from_rows([row])
    assert element.placeholder == "Nazwa firmy · Miasto"
    assert element.starterPlaceholder is True
    assert element.starterSectionKey == "experience"
    assert element.cvDataBindings == bindings
