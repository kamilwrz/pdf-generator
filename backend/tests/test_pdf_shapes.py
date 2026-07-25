import unittest

from app.services.pdf_generator import PDF_Generator


class RecordingCanvas:
    def __init__(self):
        self.calls = []

    def setFillColor(self, color):
        self.calls.append(("fill_color", color))

    def setStrokeColor(self, color):
        self.calls.append(("stroke_color", color))

    def setLineWidth(self, width):
        self.calls.append(("line_width", width))

    def ellipse(self, x1, y1, x2, y2, stroke, fill):
        self.calls.append(("ellipse", x1, y1, x2, y2, stroke, fill))


class PdfShapeTests(unittest.TestCase):
    def setUp(self):
        self.generator = PDF_Generator.__new__(PDF_Generator)
        self.generator.page_h = 842
        self.generator.c = RecordingCanvas()

    def test_outline_ellipse_insets_stroke_inside_canvas_bounds(self):
        self.generator.renderEllipse(100, 60, 10, 20, "#123456", 4, False)

        self.assertIn(("line_width", 4.0), self.generator.c.calls)
        self.assertIn(("ellipse", 12.0, 764.0, 108.0, 820.0, 1, 0), self.generator.c.calls)

    def test_filled_ellipse_uses_exact_canvas_bounds_without_stroke(self):
        self.generator.renderEllipse(80, 80, 25, 30, "#123456", 3, True)

        self.assertIn(("ellipse", 25, 732, 105, 812, 0, 1), self.generator.c.calls)
        self.assertFalse(any(call[0] == "line_width" for call in self.generator.c.calls))


if __name__ == "__main__":
    unittest.main()
