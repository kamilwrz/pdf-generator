"""elements_from_rows must round-trip everything create_new_pdf packs away
into extra_properties — bold/runs/connectors/borderRadius/flowRole/etc."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud.pdfs import create_new_pdf, elements_from_rows, request_pdf_by_id_show
from app.models.models import Base
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
                borderWidth=2, borderRadius=6,
            ),
            PdfElement(
                category="connector", element_id="e3", page=1, left=0, top=0,
                source_id="e1", target_id="e2", arrow=True,
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

        conn_el = rebuilt["e3"]
        self.assertEqual(conn_el.source_id, "e1")
        self.assertEqual(conn_el.target_id, "e2")
        self.assertTrue(conn_el.arrow)


if __name__ == "__main__":
    unittest.main()
