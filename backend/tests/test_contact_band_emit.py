"""Contact placers tag pairs and return a reflow descriptor; geometry unchanged."""
from app.services.cv_templates.shared.contact import (
    _place_centered_icon_contacts,
    _place_chip_icon_contacts,
    _place_stacked_icon_contacts,
    _place_wrapping_icon_contacts,
    build_contact_band_anchor,
)


def _fake_rect(x, y, w, h, color):
    return {"category": "rectangle", "left": x, "top": y, "width": w, "height": h,
            "backgroundColor": color, "filled": True, "borderWidth": 1, "zIndex": 1}


def _fake_icon(key, left, top, size):
    return {"category": "image", "src": f"x/volt/{key}.png", "left": left, "top": top,
            "width": size, "height": size, "zIndex": 3}


def test_chip_tags_triples_and_returns_descriptor():
    items = [("phone", "+48 111 222 333"), ("email", "a@b.pl")]
    elements, bottom_y, descriptor = _place_chip_icon_contacts(
        theme="volt", items=items, start_x=48, start_y=108, right_limit=547,
        chip_h=20, icon_size=15, text_fs=7.8, text_color="#333",
        chip_color="#EEE", font="JetBrainsMono",
        rect_builder=_fake_rect, icon_builder=_fake_icon, band_id="contact-main",
    )
    assert all(e.get("contactBandId") == "contact-main" for e in elements)
    kinds = [e["category"] for e in elements if e.get("contactChannel") == "phone"]
    assert sorted(kinds) == ["image", "rectangle", "text"]
    assert descriptor["mode"] == "chip"
    assert descriptor["chipColor"] == "#EEE"
    assert descriptor["metrics"]["labelOffset"] == 27


def test_stacked_tags_pairs_and_returns_descriptor():
    items = [("phone", "+48 111"), ("email", "a@b.pl")]
    elements, bottom_y, descriptor = _place_stacked_icon_contacts(
        theme="nova", items=items, start_x=48, start_y=120,
        text_fs=8.4, icon_size=11, text_color="#3A3A3A", font="Inter",
        band_id="contact-main",
    )
    assert all(e.get("contactBandId") == "contact-main" for e in elements)
    channels = [e.get("contactChannel") for e in elements if e.get("contactChannel")]
    assert channels.count("phone") == 2  # icon + label
    assert descriptor["mode"] == "stacked"
    assert descriptor["anchor"]["startX"] == 48
    assert descriptor["anchor"]["startY"] == 120
    assert descriptor["metrics"]["lineStep"] == 18.0


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
