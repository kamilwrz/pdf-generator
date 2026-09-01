"""elements_from_rows must round-trip everything create_new_pdf packs away
into extra_properties — bold/runs/connectors/borderRadius/flowRole/etc."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud.pdfs import (
    create_new_pdf,
    elements_from_rows,
    request_pdf_by_id_show,
    request_pdf_elements_by_element_id,
)
from app.models.models import Base, User
from app.schemas.pdf_schema import PdfElement, TextRun


class ElementsFromRowsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(User(
            id=1,
            username="elements-owner",
            email="elements-owner@example.test",
            hashed_password="test-only",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_round_trips_every_style_field(self):
        elements = [
            PdfElement(
                category="text", element_id="e1", page=1, left=10, top=20,
                fontFamily="Inter", fontSize=12, color="#111111",
                content="Hello world", bold=True, italic=False, underline=True,
                runs=[TextRun(start=0, end=5, bold=False, color="#ff0000")],
                fixedToPage=True, locked=True, flowRole="section-chrome",
                zIndex=5, isSelected=True, isMove=True,
            ),
            PdfElement(
                category="rectangle", element_id="e2", page=1, left=0, top=0,
                width=100, height=50, backgroundColor="#eeeeee",
                borderWidth=2, borderRadius=6, filled=True,
            ),
            PdfElement(
                category="connector", element_id="e3", page=1, left=0, top=0,
                source_id="e1", target_id="e2", arrow=True,
            ),
            PdfElement(
                category="polygon", element_id="e4", page=1, left=40, top=40,
                width=72, height=72, backgroundColor="#24201E",
                borderWidth=1.2, filled=False, shape="triangle",
                points=[[0.5, 0.06], [0.94, 0.92], [0.06, 0.92]],
            ),
            PdfElement(
                category="path", element_id="e5", page=1, left=40, top=60,
                width=180, height=48, backgroundColor="#24201E",
                borderWidth=1.4, pathKind="wave",
                curves=[
                    {"type": "M", "x": 0.02, "y": 0.55},
                    {
                        "type": "C",
                        "x1": 0.18, "y1": 0.1, "x2": 0.32, "y2": 1.0,
                        "x": 0.5, "y": 0.55,
                    },
                ],
            ),
        ]
        pdf_id = create_new_pdf(
            self.db, "t", 1, "/tmp/t.pdf", elements,
            pages=1, page_width=595, page_height=842,
            editor_mode="freeform", template_id=None, spacing_px=None,
        )
        rows = request_pdf_by_id_show(self.db, pdf_id)
        rebuilt = {el.element_id: el for el in elements_from_rows(rows)}

        text_el = rebuilt["e1"]
        self.assertTrue(text_el.bold)
        self.assertTrue(text_el.underline)
        self.assertTrue(text_el.fixedToPage)
        self.assertTrue(text_el.locked)
        self.assertEqual(text_el.flowRole, "section-chrome")
        self.assertEqual(len(text_el.runs), 1)
        self.assertEqual(text_el.runs[0].color, "#ff0000")
        # zIndex/isSelected/isMove are packed into extra_properties alongside the
        # other style flags (see create_new_pdf); confirm they round-trip too.
        self.assertEqual(text_el.zIndex, 5)
        self.assertTrue(text_el.isSelected)
        self.assertTrue(text_el.isMove)

        rect_el = rebuilt["e2"]
        self.assertEqual(rect_el.borderRadius, 6)
        self.assertEqual(rect_el.borderWidth, 2)
        self.assertTrue(rect_el.filled)

        conn_el = rebuilt["e3"]
        self.assertEqual(conn_el.source_id, "e1")
        self.assertEqual(conn_el.target_id, "e2")
        self.assertTrue(conn_el.arrow)

        polygon_el = rebuilt["e4"]
        self.assertEqual(polygon_el.shape, "triangle")
        self.assertEqual(len(polygon_el.points), 3)
        self.assertFalse(polygon_el.filled)

        path_el = rebuilt["e5"]
        self.assertEqual(path_el.pathKind, "wave")
        self.assertEqual(path_el.curves[0]["type"], "M")
        self.assertEqual(path_el.curves[1]["type"], "C")

    def test_preserves_original_paint_order_not_alphabetical_or_reversed(self):
        # `render_elements` (see `pdf_generator.py`) draws strictly in list order
        # with no z-index sort, so the download-time self-heal re-render (Task 7's
        # `render_pdf_for_download`) must reconstruct elements in the exact order
        # they were originally saved — otherwise overlapping shapes could
        # silently swap which one paints on top. `element_id`s are deliberately
        # picked out of alphabetical order ("z", "a", "m") so a test that
        # accidentally passed due to alphabetical or id-reversed ordering would
        # be caught.
        elements = [
            PdfElement(category="rectangle", element_id="z", page=1, left=0, top=0),
            PdfElement(category="rectangle", element_id="a", page=1, left=0, top=0),
            PdfElement(category="rectangle", element_id="m", page=1, left=0, top=0),
        ]
        pdf_id = create_new_pdf(
            self.db, "order-test", 1, "/tmp/order.pdf", elements,
            pages=1, page_width=595, page_height=842,
            editor_mode="freeform", template_id=None, spacing_px=None,
        )
        rows_by_id = request_pdf_elements_by_element_id(self.db, pdf_id)
        rebuilt = elements_from_rows(list(rows_by_id.values()))
        self.assertEqual(
            [el.element_id for el in rebuilt],
            ["z", "a", "m"],
        )


if __name__ == "__main__":
    unittest.main()
