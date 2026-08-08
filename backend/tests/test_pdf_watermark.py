"""Watermark overlay: opt-in, drawn after elements, byte-identical when unused."""
from __future__ import annotations

import unittest

from app.services.pdf_generator import PDF_Generator


class RecordingCanvas:
    def __init__(self):
        self.calls = []

    def saveState(self):
        self.calls.append(("saveState",))

    def restoreState(self):
        self.calls.append(("restoreState",))

    def setFillColor(self, color):
        self.calls.append(("fill_color", color))

    def setFillAlpha(self, alpha):
        self.calls.append(("fill_alpha", alpha))

    def setFont(self, name, size):
        self.calls.append(("font", name, size))

    def translate(self, x, y):
        self.calls.append(("translate", x, y))

    def rotate(self, degrees):
        self.calls.append(("rotate", degrees))

    def drawCentredString(self, x, y, text):
        self.calls.append(("drawCentredString", x, y, text))

    def showPage(self):
        self.calls.append(("showPage",))

    def save(self):
        self.calls.append(("save",))


class PdfWatermarkTests(unittest.TestCase):
    def setUp(self):
        self.generator = PDF_Generator.__new__(PDF_Generator)
        self.generator.page_h = 842
        self.generator.page_w = 595
        self.generator.c = RecordingCanvas()

    def test_draw_watermark_rotates_and_lowers_alpha(self):
        self.generator._draw_watermark()
        calls = self.generator.c.calls
        self.assertIn(("fill_alpha", 0.14), calls)
        self.assertIn(("rotate", 45), calls)
        texts = [c[3] for c in calls if c[0] == "drawCentredString"]
        self.assertTrue(all(t == "CV STUDIO — WERSJA DARMOWA" for t in texts))
        self.assertGreaterEqual(len(texts), 2)

    def test_render_elements_skips_watermark_by_default(self):
        self.generator.render_elements([], lambda src: src, pages=1)
        calls = self.generator.c.calls
        self.assertNotIn(("rotate", 45), calls)
        self.assertNotIn(("fill_alpha", 0.14), calls)

    def test_render_elements_draws_watermark_when_requested(self):
        self.generator.render_elements([], lambda src: src, pages=1, watermark=True)
        calls = self.generator.c.calls
        self.assertIn(("rotate", 45), calls)


if __name__ == "__main__":
    unittest.main()
