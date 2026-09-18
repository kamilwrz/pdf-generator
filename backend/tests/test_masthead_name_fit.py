"""Managed masthead names preserve text, first baseline and browser wrapping."""
from __future__ import annotations

import pytest
from copy import deepcopy
from types import SimpleNamespace

from app.schemas.pdf_schema import PdfElement
from app.services.cv.generator import generate_resume
from app.services.cv.layout.name_fit import fit_legacy_masthead_names
from app.services.documents.rendering.pdf import PDF_Generator


def _renderer():
    generator = PDF_Generator.__new__(PDF_Generator)
    generator.page_h = 842
    generator.page_w = 595
    drawn = []

    def record(x, y, text, family, size, color, bold=False, italic=False,
               underline=False, letter_spacing=0.0, word_space=0.0):
        drawn.append({
            "x": x, "y": y, "text": text, "family": family, "size": size,
            "bold": bold, "italic": italic, "underline": underline,
            "tracking": letter_spacing, "color": color,
        })

    generator._draw_text_line = record
    return generator, drawn


@pytest.mark.parametrize("family,bold", [("Montserrat", True), ("CormorantGaramond", True)])
def test_single_line_name_keeps_original_baseline_and_font(family, bold):
    generator, original = _renderer()
    generator.renderText(74, 59, family, 24, "#111111", "Jan Kowalski", bold=bold)
    original_draw = original[:]
    original.clear()
    generator.renderText(
        74, 59, family, 24, "#111111", "Jan Kowalski", bold=bold,
        width=339, lineHeight=28.8, height=28.8,
        nameFit={"baseFontSize": 24, "fittedFontSize": 24, "extraHeight": 0},
    )
    assert len(original) == 1
    assert original[0]["y"] == pytest.approx(original_draw[0]["y"])
    assert original[0]["size"] == original_draw[0]["size"]
    assert original[0]["text"] == original_draw[0]["text"]


def test_name_at_minimum_wraps_unbroken_surname_without_losing_characters():
    generator, drawn = _renderer()
    content = "W" * 80
    generator.renderText(
        218, 60, "Montserrat", 14, "#111111", content, bold=True,
        width=329, lineHeight=16.8, nameFit={"baseFontSize": 24},
    )
    assert len(drawn) > 1
    assert "".join(line["text"] for line in drawn) == content
    assert drawn[0]["y"] == pytest.approx(842 - 60 - 14 * 0.34)
    font, _, _ = generator._resolve_font("Montserrat", True, False)
    for index, line in enumerate(drawn):
        assert line["y"] == pytest.approx(drawn[0]["y"] - index * 16.8)
        assert line["size"] == 14
        assert generator._line_width(line["text"], font, 14, 0) <= 329


def test_browser_name_lines_preserve_advances_and_inline_marks():
    generator, drawn = _renderer()
    content = "Anna Kowalska"
    generator.renderText(
        74, 59, "CormorantGaramond", 14, "#111111", content,
        width=339, lineHeight=16.8, height=33.6,
        nameFit={"baseFontSize": 33, "fittedFontSize": 14, "extraHeight": 16.8},
        runs=[{"start": 5, "end": 13, "bold": True, "color": "#123456"}],
        resolvedLines=[
            {"text": "Anna", "start": 0, "end": 4, "paragraphEnd": False,
             "indent": 0, "bulletPrefix": "", "xOffset": 1, "advanceWidth": 42},
            {"text": "Kowalska", "start": 5, "end": 13, "paragraphEnd": True,
             "indent": 0, "bulletPrefix": "", "xOffset": 2, "advanceWidth": 64},
        ],
    )
    assert [line["text"] for line in drawn] == ["Anna", "Kowalska"]
    assert [line["x"] for line in drawn] == [75, 76]
    assert drawn[1]["bold"] is True
    assert drawn[1]["color"] == "#123456"
    assert drawn[1]["y"] == pytest.approx(drawn[0]["y"] - 16.8)
    for line, advance in zip(drawn, [42, 64]):
        font, _, _ = generator._resolve_font(line["family"], line["bold"], line["italic"])
        assert generator._line_width(line["text"], font, line["size"], line["tracking"]) == pytest.approx(advance)


def test_stale_browser_name_lines_preserve_complete_uppercase_content():
    generator, drawn = _renderer()
    generator.renderText(
        218, 60, "Montserrat", 14, "#111111", "Jan Kowalski", bold=True,
        width=329, lineHeight=16.8, nameFit={"baseFontSize": 24},
        textTransform="uppercase",
        resolvedLines=[{"text": "stale", "start": 0, "end": 5, "paragraphEnd": True}],
    )
    assert [line["text"] for line in drawn] == ["JAN KOWALSKI"]


def test_name_fit_policy_survives_element_schema_round_trip():
    policy = {"baseFontSize": 33, "fittedFontSize": 14, "extraHeight": 16.8}
    element = PdfElement(category="text", element_id="name", nameFit=policy)
    assert PdfElement.model_validate(element.model_dump()).nameFit == policy


def _cv(name):
    return {"name": name, "title": "Analyst", "email": "anna@example.com",
            "summary": "Professional summary.", "skills": ["Research"],
            "experience": [], "education": []}


@pytest.mark.parametrize("template_id,width,base", [("slate", 329, 24), ("monument", 331, 33)])
def test_legacy_fit_preserves_full_identity_and_moves_only_downstream_flow(template_id, width, base):
    source_name = "Anna " + "W" * 85
    original = generate_resume(template_id, _cv(source_name))
    snapshot = deepcopy(original)
    original_name = next(element for element in original if element.get("mastheadRole") == "name")
    assert original_name["content"] == source_name
    fitted = fit_legacy_masthead_names(original)
    name = next(element for element in fitted if element.get("mastheadRole") == "name")
    assert original == snapshot
    assert name["content"] == source_name
    assert name["fontSize"] == 14
    assert name["width"] == width
    assert name["nameFit"]["baseFontSize"] == base
    assert name["nameFit"]["extraHeight"] > 0
    assert name["top"] == original_name["top"]
    delta = name["nameFit"]["extraHeight"]
    for before, after in zip(original, fitted):
        if before.get("photoSlot") or before.get("fixedToPage") or before.get("flowLane") == "sidebar":
            assert after["top"] == before["top"]
        if before.get("mastheadRole") == "title":
            assert after["top"] == pytest.approx(before["top"] + delta)
        if before.get("contactBand"):
            assert after["contactBand"]["anchor"]["startY"] == pytest.approx(
                before["contactBand"]["anchor"]["startY"] + delta
            )
        if before.get("mastheadIdentity"):
            assert after["mastheadIdentity"]["title"]["spec"]["top"] == pytest.approx(
                before["mastheadIdentity"]["title"]["spec"]["top"] + delta
            )
    assert fit_legacy_masthead_names(fitted) is fitted


@pytest.mark.parametrize("template_id,base", [("slate", 24), ("monument", 33)])
def test_legacy_fit_uses_largest_safe_size_without_crossing_minimum(template_id, base):
    original = generate_resume(template_id, _cv("Anna Wrzoszczynowska-Kowalska"))
    fitted = fit_legacy_masthead_names(original)
    name = next(element for element in fitted if element.get("mastheadRole") == "name")
    assert 14 <= name["fontSize"] < base
    assert name["nameFit"]["extraHeight"] == 0
    content = name["content"].upper() if name.get("textTransform") == "uppercase" else name["content"]
    font, _, _ = PDF_Generator._resolve_font(name["fontFamily"], name["bold"], False)
    tracking = name.get("letterSpacing", 0)
    assert PDF_Generator._line_width(content, font, name["fontSize"], tracking) <= name["width"] - 1
    assert PDF_Generator._line_width(content, font, name["fontSize"] + 0.01, tracking) > name["width"] - 1


def test_legacy_fit_keeps_short_names_small_authored_fonts_and_unmanaged_text():
    source = generate_resume("slate", _cv("Anna Li"))
    name = next(element for element in source if element.get("mastheadRole") == "name")
    name["fontSize"] = 12
    fitted = fit_legacy_masthead_names(source)
    assert next(element for element in fitted if element.get("mastheadRole") == "name")["fontSize"] == 12
    arbitrary = [{"category": "text", "content": "W" * 200, "fontSize": 24}]
    assert fit_legacy_masthead_names(arbitrary) is arbitrary


def test_browser_geometry_is_never_refitted_using_different_pdf_metrics():
    elements = generate_resume("monument", _cv("Anna Kowalska"))
    name = next(element for element in elements if element.get("mastheadRole") == "name")
    name.update({"fontSize": 19.13, "width": 331, "lineHeight": 22.96, "height": 22.96,
                 "nameFit": {"baseFontSize": 33, "fittedFontSize": 19.13, "width": 331, "extraHeight": 0}})
    assert fit_legacy_masthead_names(elements) is elements
    assert name["fontSize"] == 19.13


def test_render_entry_point_fits_legacy_pydantic_names_without_mutation():
    generator, drawn = _renderer()
    generator.c = SimpleNamespace(showPage=lambda: None, save=lambda: None)
    source = generate_resume("slate", _cv("W" * 100))
    relevant = [element for element in source if element.get("mastheadRole") == "name"
                or element.get("mastheadIdentity") or element.get("contactBand")]
    elements = [PdfElement(element_id=str(index), **element) for index, element in enumerate(relevant)]
    generator.render_elements(elements, lambda src: src)
    assert "".join(line["text"] for line in drawn) == "W" * 100
    assert all(line["size"] == 14 for line in drawn if line["text"])
    assert elements[0].nameFit is None


@pytest.mark.parametrize("template_id", ["slate", "monument"])
def test_long_name_carries_complete_records_and_repeats_only_continuation_chrome(template_id):
    cv = _cv("W" * 150)
    cv["experience"] = [
        {"title": "Analyst", "company": f"Company {index}", "period": "2020 - 2024",
         "bullets": ["Investigated cases and reviewed evidence. " * 7]}
        for index in range(5)
    ]
    original = generate_resume(template_id, cv)
    original_snapshot = deepcopy(original)
    fitted = fit_legacy_masthead_names(original)
    assert original == original_snapshot
    body = [element for element in fitted if element.get("flowRole") not in {"masthead", "masthead-anchor"}
            and not element.get("fixedToPage") and not element.get("photoSlot")
            and element.get("flowLane") != "sidebar" and element.get("category") == "textarea"]
    assert all(element["top"] + element["height"] <= 770.01 for element in body)
    assert [element["content"] for element in body] == [
        element["content"] for element in original if element.get("flowRole") not in {"masthead", "masthead-anchor"}
        and not element.get("fixedToPage") and not element.get("photoSlot")
        and element.get("flowLane") != "sidebar" and element.get("category") == "textarea"
    ]
    groups = {}
    for element in body:
        if element.get("flowGroup"):
            groups.setdefault(element["flowGroup"], set()).add(element.get("page", 1))
    assert all(len(pages) == 1 for pages in groups.values())
    max_page = max(element.get("page", 1) for element in fitted)
    for page in range(2, max_page + 1):
        assert any(element.get("page") == page and element.get("fixedToPage")
                   and element.get("width") == 595 for element in fitted)
        assert not any(element.get("page") == page and element.get("photoSlot") for element in fitted)
    original_group_pages = {element["flowGroup"]: element.get("page", 1)
                            for element in original if element.get("flowGroup")}
    assert any(element.get("page", 1) > original_group_pages[element["flowGroup"]]
               for element in fitted if element.get("flowGroup"))
    for page in range(2, max_page + 1):
        page_elements = [element for element in fitted if element.get("page", 1) == page]
        first_background = next(index for index, element in enumerate(page_elements)
                                if element.get("fixedToPage") and element.get("width") == 595)
        assert all(index > first_background for index, element in enumerate(page_elements)
                   if element.get("flowGroup"))


def test_hidden_slate_photo_uses_parked_main_width_and_keeps_sidebar_contacts_fixed():
    source = generate_resume("slate", _cv("W" * 100))
    anchor = next(element for element in source if element.get("contactBand"))
    anchor["profilePhotoMainContactBand"] = deepcopy(anchor["contactBand"])
    anchor["contactBand"]["anchor"] = {"startX": 25, "startY": 50, "rightLimit": 153}
    identity = next(element for element in source if element.get("mastheadIdentity"))
    identity["profilePhotoMainMastheadIdentity"] = deepcopy(identity["mastheadIdentity"])
    for element in source:
        if element.get("photoSlot"):
            element["photoSlotHidden"] = True
        if element.get("contactChannel"):
            element["left"], element["top"] = 25, 50
    source.append({"category": "text", "content": "DANE KONTAKTOWE", "left": 25,
                   "top": 70, "fontSize": 10, "flowRole": "photo-contact-header"})
    fitted = fit_legacy_masthead_names(source)
    name = next(element for element in fitted if element.get("mastheadRole") == "name")
    assert name["width"] == 329
    delta = name["nameFit"]["extraHeight"]
    assert delta > 0
    for before, after in zip(source, fitted):
        if before.get("contactChannel") or before.get("flowRole") == "photo-contact-header":
            assert after["top"] == before["top"]
        if before.get("contactBand"):
            assert after["contactBand"] == before["contactBand"]
            assert after["profilePhotoMainContactBand"]["anchor"]["startY"] == pytest.approx(
                before["profilePhotoMainContactBand"]["anchor"]["startY"] + delta)
        if before.get("profilePhotoMainMastheadIdentity"):
            assert after["profilePhotoMainMastheadIdentity"]["title"]["spec"]["top"] == pytest.approx(
                before["profilePhotoMainMastheadIdentity"]["title"]["spec"]["top"] + delta)


def test_deleted_names_and_photos_do_not_participate_in_fitting():
    source = generate_resume("slate", _cv("Anna Kowalska"))
    source.append({"category": "rectangle", "photoSlot": "frame", "left": 225,
                   "top": 35, "height": 80, "deleted": True})
    fitted = fit_legacy_masthead_names(source)
    assert next(element for element in fitted if element.get("mastheadRole") == "name")["width"] == 329
    name = next(element for element in source if element.get("mastheadRole") == "name")
    name["deleted"] = True
    assert fit_legacy_masthead_names(source) is source


@pytest.mark.parametrize("template_id", ["slate", "monument"])
def test_new_continuation_background_is_behind_visible_carried_text(template_id):
    pymupdf = pytest.importorskip("pymupdf")
    from app.services.documents.rendering.build import build_pdf_to_buffer
    from app.services.storage.image_resolver import image_src_to_local_path

    source = generate_resume(template_id, _cv("W" * 150))
    source.append({"category": "textarea", "content": "Carried record probe", "left": 218,
                   "top": 700, "width": 290, "height": 60, "fontSize": 12,
                   "fontFamily": "Montserrat", "color": "#111111", "lineHeight": 16,
                   "letterSpacing": 0, "flowRole": "content", "flowGroup": "carry-probe"})
    fitted = fit_legacy_masthead_names(source)
    probe = next(element for element in fitted if element.get("flowGroup") == "carry-probe")
    assert probe["page"] == 2
    page_two = [element for element in fitted if element.get("page", 1) == 2]
    assert page_two[0].get("fixedToPage")
    assert not any(element.get("photoSlot") for element in page_two)
    elements = [PdfElement(element_id=str(index), **element) for index, element in enumerate(source)]
    pdf_data = SimpleNamespace(pdf_title="Name overflow", page_width=595, page_height=842, pages=1)
    document = pymupdf.open(stream=build_pdf_to_buffer(pdf_data, elements, image_src_to_local_path), filetype="pdf")
    assert len(document) == 2
    assert "Carried record probe" in document[1].get_text()
    pixels = document[1].get_pixmap(clip=pymupdf.Rect(218, probe["top"], 508, probe["top"] + 60))
    samples = pixels.samples
    dark = sum(max(samples[offset:offset + 3]) < 100
               for offset in range(0, len(samples), pixels.n))
    assert dark > 10, "Continuation paper must not paint over the carried record"


@pytest.mark.parametrize("template_id", ["vellum", "aurelia", "cadenza"])
@pytest.mark.parametrize("content", ["Hubert Mikołaj Stawiarczyk", "Anna " + "W" * 90])
def test_editorial_generators_reserve_complete_tracked_name_before_title_and_contacts(template_id, content):
    elements = generate_resume(template_id, _cv(content))
    name = next(element for element in elements if element.get("mastheadRole") == "name")
    title = next(element for element in elements if element.get("mastheadRole") == "title")
    contact = next(element["contactBand"] for element in elements if element.get("contactBand"))
    assert name["content"] == content
    assert name["nameFit"]["mode"] == "wrap"
    assert name["fontSize"] == {"vellum": 28.5, "aurelia": 29.0, "cadenza": 27.5}[template_id]
    height = PDF_Generator.measure_textarea_height(
        content.upper(), name["fontFamily"], name["fontSize"], name["lineHeight"], name["width"],
        bold=name.get("bold", False), letter_spacing=name["letterSpacing"],
    )
    assert name["height"] >= height
    assert title["top"] >= name["top"] + name["height"] + 5
    assert contact["anchor"]["startY"] >= title["top"] + title["height"]
    assert name["nameFit"]["extraHeight"] == name["height"] - name["nameFit"]["baseHeight"]
    assert fit_legacy_masthead_names(elements) is elements
    if template_id == "aurelia":
        frame = next(element for element in elements if element.get("id") == "aurelia-masthead-frame")
        assert frame["height"] == 104 + name["nameFit"]["extraHeight"]
        assert frame["top"] + frame["height"] > title["top"] + title["height"]


@pytest.mark.parametrize("template_id", ["vellum", "aurelia", "cadenza"])
@pytest.mark.parametrize("title", ["Analyst", ""])
def test_legacy_editorial_fit_repairs_name_only_autoheight_without_mutating_saved_graph(template_id, title):
    source = generate_resume(template_id, {**_cv("Anna Li"), "title": title})
    name = next(element for element in source if element.get("mastheadRole") == "name")
    name.pop("nameFit")
    name["content"] = "Hubert Mikołaj Stawiarczyk"
    # This recreates the screenshot: the textarea's height has already grown,
    # while the title blueprint and the contacts retain the original slot.
    name["height"] = 3 * name["lineHeight"]
    snapshot = deepcopy(source)
    fitted = fit_legacy_masthead_names(source)
    assert source == snapshot
    fitted_name = next(element for element in fitted if element.get("mastheadRole") == "name")
    identity = next(element["mastheadIdentity"] for element in fitted if element.get("mastheadIdentity"))
    delta = fitted_name["nameFit"]["extraHeight"]
    assert fitted_name["content"] == name["content"]
    assert fitted_name["fontSize"] == name["fontSize"]
    assert identity["title"]["spec"]["top"] >= fitted_name["top"] + fitted_name["height"] + 5
    for before, after in zip(source, fitted):
        if before.get("photoSlot") or before.get("fixedToPage"):
            assert after["top"] == before["top"]
        if before.get("contactBand"):
            assert after["contactBand"]["anchor"]["startY"] == before["contactBand"]["anchor"]["startY"] + delta
        if before.get("id") == "aurelia-masthead-frame":
            assert after["height"] == before["height"] + delta
    assert fit_legacy_masthead_names(fitted) is fitted


@pytest.mark.parametrize("template_id", ["vellum", "aurelia", "cadenza"])
def test_editorial_pdf_keeps_every_name_glyph_clear_of_the_following_title(template_id):
    pymupdf = pytest.importorskip("pymupdf")
    from app.services.documents.rendering.build import build_pdf_to_buffer
    from app.services.storage.image_resolver import image_src_to_local_path

    content = "Anna " + "W" * 90
    source = generate_resume(template_id, _cv(content))
    name = next(element for element in source if element.get("mastheadRole") == "name")
    title = next(element for element in source if element.get("mastheadRole") == "title")
    elements = [PdfElement(element_id=str(index), **element) for index, element in enumerate(source)]
    pdf_data = SimpleNamespace(pdf_title="Editorial name", page_width=595, page_height=842, pages=1)
    document = pymupdf.open(stream=build_pdf_to_buffer(pdf_data, elements, image_src_to_local_path), filetype="pdf")
    spans = [span for block in document[0].get_text("dict")["blocks"] if "lines" in block
             for line in block["lines"] for span in line["spans"]
             if span["size"] == pytest.approx(name["fontSize"])]
    assert "".join(span["text"] for span in spans).replace(" ", "") == content.upper().replace(" ", "")
    # Font bounding boxes include a small descender allowance outside the
    # textarea's line box. Verify the actual non-overlap contract, not an
    # assumed equality between font ink metrics and authored line heights.
    assert max(span["bbox"][3] for span in spans) < title["top"]


@pytest.mark.parametrize("template_id", ["aurelia", "cadenza"])
def test_editorial_long_continuation_name_stays_inside_its_existing_single_line_rail(template_id):
    content = "Anna " + "W" * 90
    cv = _cv(content)
    cv["experience"] = [{"title": f"Analyst {index}", "company": "Research", "bullets": ["Evidence review. " * 50]}
                        for index in range(6)]
    elements = generate_resume(template_id, cv)
    continuation = next(element for element in elements if element.get("content") == content and element.get("page", 1) > 1)
    font, _, _ = PDF_Generator._resolve_font(continuation["fontFamily"], continuation.get("bold", False), False)
    assert PDF_Generator._line_width(content.upper(), font, continuation["fontSize"], continuation["letterSpacing"]) <= 479
    assert continuation["top"] == 30


@pytest.mark.parametrize("write_path", ["create", "update-existing", "insert-on-update"])
def test_wrapped_name_allocation_survives_database_save_and_reload(write_path):
    """The settled expansion must not be lost at any JSON-column write path."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.crud.pdfs import create_new_pdf, elements_from_rows, update_pdf_elements
    from app.models.models import Base, PdfElements, User

    graph = generate_resume("aurelia", _cv("Hubert Mikołaj Stawiarczyk"))
    source = next(element for element in graph if element.get("mastheadRole") == "name")
    element = PdfElement(element_id="wrapped-name", **source)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as database:
            owner = User(username="name-roundtrip", email="name@example.com")
            database.add(owner)
            database.flush()
            initial = [] if write_path == "insert-on-update" else [
                element.model_copy(update={"nameFit": None}) if write_path == "update-existing" else element
            ]
            pdf_id = create_new_pdf(database, "Wrapped name", owner.id, None, initial)
            if write_path != "create":
                rows = database.query(PdfElements).filter_by(pdf_id=pdf_id).all()
                update_pdf_elements(database, [element], {row.element_id: row for row in rows}, pdf_id)
                database.commit()
            database.expire_all()
            [restored] = elements_from_rows(database.query(PdfElements).filter_by(pdf_id=pdf_id).all())
            assert restored.nameFit == element.nameFit
            assert restored.content == element.content
            assert float(restored.height) == float(element.height)
    finally:
        engine.dispose()


@pytest.mark.parametrize("template_id", ["vellum", "aurelia", "cadenza"])
def test_legacy_editorial_expansion_moves_complete_records_before_the_footer(template_id):
    cv = _cv("Anna Li")
    cv["experience"] = [{"title": f"Analyst {index}", "company": "Research", "bullets": ["Evidence review. " * 15]}
                        for index in range(7)]
    source = generate_resume(template_id, cv)
    name = next(element for element in source if element.get("mastheadRole") == "name")
    name.pop("nameFit")
    name["content"] = "Anna " + "W" * 60
    fitted = fit_legacy_masthead_names(source)
    source_groups = {element["flowGroup"]: element.get("page", 1) for element in source if element.get("flowGroup")}
    body = [element for element in fitted if element.get("flowGroup")]
    assert any(element.get("page", 1) > source_groups[element["flowGroup"]] for element in body)
    for group in source_groups:
        members = [element for element in body if element["flowGroup"] == group]
        assert len({element.get("page", 1) for element in members}) == 1
        assert all(element["top"] + float(element.get("height") or 0) <= 770 for element in members)
