"""Contact-channel identity + band descriptor survive persist/reload.

Verifies the `extra_properties` pack/unpack in `crud/pdfs.py` carries the new
Phase-1 contact fields through the `PdfElements` row model without a migration.
"""
from app.crud.pdfs import elements_from_rows


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
    row = _Row(
        element_id="photo", category="image", page=1, left=33, top=40,
        src="/images/7/content", width=112, height=126,
        extra_properties={
            "photoSlot": "image",
            "photoSlotHidden": True,
            "photoPlaceholder": placeholder,
            "profilePhotoMainContactBand": main_band,
            "photoLayoutHome": {"top": 191},
        },
    )
    [element] = elements_from_rows([row])
    assert element.photoSlotHidden is True
    assert element.photoPlaceholder == placeholder
    assert element.profilePhotoMainContactBand == main_band
    assert element.photoLayoutHome == {"top": 191}
