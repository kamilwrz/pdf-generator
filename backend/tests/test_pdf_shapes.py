import unittest
from pathlib import Path
from types import SimpleNamespace

from app.services.pdf_generator import PDF_Generator
from app.utils.build_pdf import build_pdf_to_buffer
from app.utils.image_src_to_path import image_src_to_local_path


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

    def drawImage(self, *args, **kwargs):
        self.calls.append(("drawImage", args, kwargs))


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

    def test_render_image_uses_auto_mask_for_png_alpha(self):
        icon = Path(__file__).resolve().parents[1] / "template_assets" / "iconic" / "nova" / "email.png"
        self.assertTrue(icon.is_file())

        self.generator.renderImage(str(icon), 12, 12, 50, 118)

        draw_calls = [call for call in self.generator.c.calls if call[0] == "drawImage"]
        self.assertEqual(len(draw_calls), 1)
        _, _args, kwargs = draw_calls[0]
        self.assertEqual(kwargs.get("mask"), "auto")

    def test_iconic_png_exports_without_opaque_black_squares(self):
        try:
            import fitz
            from PIL import Image
        except ImportError:
            self.skipTest("pymupdf/Pillow required for raster smoke check")

        from app.services.cv_generator import generate_resume

        elements = [
            SimpleNamespace(**element)
            for element in generate_resume("nova", {
                "name": "Anna Kowalska",
                "title": "Dyrektorka",
                "email": "anna@email.com",
                "phone": "+48 600 000 000",
                "location": "Warszawa",
                "summary": "Podsumowanie.",
                "experience": [{"title": "Dyrektorka", "company": "X", "period": "2021", "bullets": ["A"]}],
                "education": [{"degree": "Mgr", "school": "SGH", "period": "2016"}],
                "skills": ["Strategia"],
            })
        ]

        class PdfData:
            pdf_title = "CV Nova"
            pages = max(getattr(element, "page", 1) or 1 for element in elements)
            page_height = 842
            page_width = 595

        pdf_bytes = build_pdf_to_buffer(PdfData(), elements, image_src_to_local_path)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(2, 2))
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        # Contact icon neighborhood — cream paper must not contain solid black boxes.
        crop = image.crop((95, 225, 130, 260))
        dark = sum(
            1 for pixel in crop.getdata()
            if pixel[0] < 35 and pixel[1] < 35 and pixel[2] < 35
        )
        self.assertEqual(dark, 0)


if __name__ == "__main__":
    unittest.main()
