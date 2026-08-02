"""Contract: exported JSON Schema stays in sync with PdfElement."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.schemas.export_pdf_element_schema import OUT_PATH, export_schema
from app.schemas.pdf_schema import ElementCategory, PdfElement, PDFCreateRequest
from typing import get_args


class PdfElementSchemaTests(unittest.TestCase):
    def test_required_identity_fields(self):
        el = PdfElement(category="text", element_id="abc")
        self.assertEqual(el.category, "text")
        with self.assertRaises(Exception):
            PdfElement(category="text")  # type: ignore[call-arg]
        with self.assertRaises(Exception):
            PdfElement(category="widget", element_id="x")  # type: ignore[arg-type]

    def test_create_request_rejects_unknown_category(self):
        with self.assertRaises(Exception):
            PDFCreateRequest(
                root=[{"category": "nope", "element_id": "1"}],
                pdf_title="t.pdf",
            )

    def test_exported_schema_matches_pydantic(self):
        export_schema()
        self.assertTrue(OUT_PATH.is_file())
        disk = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        live = PdfElement.model_json_schema()
        self.assertEqual(disk, live)
        # Category enum on disk must match the Literal used in code.
        props = disk.get("properties", {}).get("category", {})
        enum = props.get("enum") or disk.get("$defs", {}).get("ElementCategory", {}).get("enum")
        if enum is None and "anyOf" in props:
            enum = next((p.get("enum") for p in props["anyOf"] if "enum" in p), None)
        # Pydantic v2 may inline Literal as enum on the property.
        categories = set(get_args(ElementCategory))
        if enum:
            self.assertEqual(set(enum), categories)
        else:
            self.assertIn("category", disk.get("required", []))


if __name__ == "__main__":
    unittest.main()
