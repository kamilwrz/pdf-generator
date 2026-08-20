"""renderText applies the textTransform flag so canvas-uppercased names render
uppercase in the PDF while the stored content keeps its original case."""
from types import SimpleNamespace

from app.services.pdf_generator import PDF_Generator


def _capturing_generator():
    # PDF_Generator's real constructor takes a DATA namespace (page geometry
    # source) and a ReportLab CANVAS; the canvas is unused by renderText once
    # `_draw_text_line` is stubbed below, so `None` is sufficient here.
    gen = PDF_Generator(SimpleNamespace(page_height=842, page_width=595), None)
    drawn = []
    # _draw_text_line is the single choke point every text draw funnels through.
    gen._draw_text_line = lambda x, y, text, *a, **k: drawn.append(text)  # type: ignore
    return gen, drawn


def test_render_text_uppercases_when_flagged():
    gen, drawn = _capturing_generator()
    gen.renderText(10, 10, "Inter", 12, "#000000", "Jan Kowalski", textTransform="uppercase")
    assert drawn == ["JAN KOWALSKI"]


def test_render_text_leaves_content_untouched_without_flag():
    gen, drawn = _capturing_generator()
    gen.renderText(10, 10, "Inter", 12, "#000000", "Jan Kowalski")
    assert drawn == ["Jan Kowalski"]


def test_render_textarea_uppercases_when_flagged():
    # Atrium / Portico build the masthead name as a multi-line block (a
    # `textarea`), so the reversible textTransform flag must be honored by the
    # textarea render path too, not only renderText.
    gen, drawn = _capturing_generator()
    gen.renderTextarea(
        10, 10, 400, 40, "Inter", 23, "#000000", "Kamil Wrzochalski",
        28, 0, textTransform="uppercase",
    )
    assert drawn == ["KAMIL WRZOCHALSKI"]


def test_render_textarea_leaves_content_untouched_without_flag():
    gen, drawn = _capturing_generator()
    gen.renderTextarea(
        10, 10, 400, 40, "Inter", 23, "#000000", "Kamil Wrzochalski", 28, 0,
    )
    assert drawn == ["Kamil Wrzochalski"]


# `elements_from_rows` is the real row->flat unpacker in `pdfs.py` (it operates
# on a list of ORM rows, not a single row at a time), so the round-trip below
# feeds it a one-row list and reads the corresponding single element back out.
from app.crud.pdfs import elements_from_rows  # noqa: E402


class _Row:
    """Minimal stand-in for a PdfElements ORM row."""
    def __init__(self, extra):
        self.category = "text"; self.content = "Jan"; self.left = 0; self.top = 0
        self.width = 0; self.height = 0; self.fontSize = 12; self.fontFamily = "Inter"
        self.color = "#000"; self.page = 1; self.element_id = "n1"
        self.src = None; self.backgroundColor = None; self.img_id = None
        self.extra_properties = extra


def test_masthead_fields_round_trip_through_extra_properties():
    row = _Row({"textTransform": "uppercase", "mastheadRole": "name",
                "mastheadBandId": "masthead-main",
                "mastheadIdentity": {"id": "masthead-main"}})
    [el] = elements_from_rows([row])
    assert el.textTransform == "uppercase"
    assert el.mastheadRole == "name"
    assert el.mastheadBandId == "masthead-main"
    assert el.mastheadIdentity == {"id": "masthead-main"}
