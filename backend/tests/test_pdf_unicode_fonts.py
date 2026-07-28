import io
import unittest
from types import SimpleNamespace

import fitz
from reportlab.pdfgen.canvas import Canvas

from app.services.pdf_generator import PDF_Generator


class PdfUnicodeFontTests(unittest.TestCase):
    def test_legacy_helvetica_is_resolved_to_unicode_inter_variants(self):
        self.assertEqual(
            PDF_Generator._resolve_font("Helvetica", False, False),
            ("Inter", False, False),
        )
        self.assertEqual(
            PDF_Generator._resolve_font("Helvetica", True, False),
            ("Inter-Bold", False, False),
        )

    def test_polish_characters_survive_pdf_export_from_legacy_helvetica_content(self):
        output = io.BytesIO()
        generator = PDF_Generator(
            SimpleNamespace(page_height=842),
            Canvas(output, pagesize=(595, 842)),
        )
        expected = "Zażółć gęślą jaźń"

        generator.renderText(40, 40, "Helvetica", 12, "#000000", expected)
        generator.generatePDF()

        document = fitz.open(stream=output.getvalue(), filetype="pdf")
        try:
            self.assertIn(expected, document[0].get_text())
        finally:
            document.close()

    def test_null_and_nbsp_are_stripped_from_exported_text(self):
        from app.services.pdf_generator import sanitize_pdf_text

        self.assertEqual(
            sanitize_pdf_text("Bachelor of Laws (LL.B.)\x00"),
            "Bachelor of Laws (LL.B.)",
        )
        self.assertEqual(
            sanitize_pdf_text("1. Juristische Prüfung\u00a0\u00a0"),
            "1. Juristische Prüfung  ",
        )
        self.assertEqual(
            sanitize_pdf_text("line1\nline2\x00"),
            "line1\nline2",
        )

        output = io.BytesIO()
        generator = PDF_Generator(
            SimpleNamespace(page_height=842),
            Canvas(output, pagesize=(595, 842)),
        )
        generator.renderText(
            40, 40, "Helvetica", 12, "#000000",
            "Bachelor of Laws (LL.B.)\x00\u00a0",
        )
        generator.generatePDF()

        document = fitz.open(stream=output.getvalue(), filetype="pdf")
        try:
            extracted = document[0].get_text()
            self.assertIn("Bachelor of Laws (LL.B.)", extracted)
            self.assertNotIn("\x00", extracted)
        finally:
            document.close()


if __name__ == "__main__":
    unittest.main()
