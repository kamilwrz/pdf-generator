"""Contact placers tag pairs and return a reflow descriptor; geometry unchanged."""
from app.services.cv_templates.shared.contact import (
    _place_centered_icon_contacts,
    _place_wrapping_icon_contacts,
    build_contact_band_anchor,
)


def test_wrapping_tags_pairs_and_returns_descriptor():
    items = [("phone", "+48 111 222 333"), ("email", "a@b.pl")]
    elements, bottom_y, descriptor = _place_wrapping_icon_contacts(
        theme="harbor", items=items, start_x=44, start_y=104, right_limit=551,
        text_fs=8.4, icon_size=11, text_color="#3A3A3A", font="Inter",
        band_id="band-1",
    )
    # Every element carries the shared band id; each pair shares a channel.
    assert all(e.get("contactBandId") == "band-1" for e in elements)
    channels = [e.get("contactChannel") for e in elements if e.get("contactChannel")]
    assert channels.count("phone") == 2  # icon + label
    assert channels.count("email") == 2
    assert descriptor["mode"] == "wrapping"
    assert descriptor["order"] == ["phone", "email"]
    assert descriptor["anchor"]["startX"] == 44
    assert descriptor["anchor"]["rightLimit"] == 551
    assert descriptor["icon"]["theme"] == "harbor"


def test_centered_tags_pairs_and_returns_descriptor():
    items = [("phone", "+48 111"), ("location", "Warszawa")]
    elements, bottom_y, descriptor = _place_centered_icon_contacts(
        theme="nova", items=items, center_x=300, start_y=120, max_width=400,
        text_fs=9, icon_size=11, text_color="#222222", font="Inter",
        band_id="band-2",
    )
    assert all(e.get("contactBandId") == "band-2" for e in elements)
    assert descriptor["mode"] == "centered"
    assert descriptor["anchor"]["centerX"] == 300
    assert descriptor["anchor"]["maxWidth"] == 400
    assert descriptor["order"] == ["phone", "location"]


def test_band_anchor_is_empty_non_drawing_masthead_anchor():
    descriptor = {"id": "band-1", "mode": "wrapping"}
    anchor = build_contact_band_anchor(descriptor)
    assert anchor["category"] == "text"
    assert anchor["content"] == ""
    assert anchor["flowRole"] == "masthead-anchor"
    assert anchor["contactBand"] == descriptor
    assert anchor["contactBandId"] == "band-1"
