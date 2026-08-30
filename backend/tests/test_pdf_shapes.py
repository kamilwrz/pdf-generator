import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from app.services.pdf_generator import PDF_Generator
from app.utils.build_pdf import build_pdf_to_buffer
from app.utils.image_src_to_path import image_src_to_local_path


class RecordingPath:
    def __init__(self):
        self.ops = []

    def moveTo(self, x, y):
        self.ops.append(("moveTo", x, y))

    def lineTo(self, x, y):
        self.ops.append(("lineTo", x, y))

    def curveTo(self, x1, y1, x2, y2, x3, y3):
        self.ops.append(("curveTo", x1, y1, x2, y2, x3, y3))

    def close(self):
        self.ops.append(("close",))

    def rect(self, x, y, width, height):
        self.ops.append(("rect", x, y, width, height))

    def roundRect(self, x, y, width, height, radius):
        self.ops.append(("roundRect", x, y, width, height, radius))

    def ellipse(self, x1, y1, x2, y2):
        self.ops.append(("ellipse", x1, y1, x2, y2))

    def getCode(self):
        return "path"


class RecordingCanvas:
    def __init__(self):
        self.calls = []
        self.paths = []

    def setFillColor(self, color):
        self.calls.append(("fill_color", color))

    def setStrokeColor(self, color):
        self.calls.append(("stroke_color", color))

    def setLineWidth(self, width):
        self.calls.append(("line_width", width))

    def setLineCap(self, value):
        self.calls.append(("line_cap", value))

    def setLineJoin(self, value):
        self.calls.append(("line_join", value))

    def ellipse(self, x1, y1, x2, y2, stroke, fill):
        self.calls.append(("ellipse", x1, y1, x2, y2, stroke, fill))

    def rect(self, x, y, width=None, height=None, stroke=1, fill=0):
        self.calls.append(("rect", x, y, width, height, stroke, fill))

    def roundRect(self, x, y, width, height, radius, stroke=1, fill=0):
        self.calls.append(("roundRect", x, y, width, height, radius, stroke, fill))

    def beginPath(self):
        path = RecordingPath()
        self.paths.append(path)
        self.calls.append(("beginPath",))
        return path

    def drawPath(self, path, stroke=1, fill=0):
        self.calls.append(("drawPath", path.ops, stroke, fill))

    def clipPath(self, path, stroke=0, fill=0):
        self.calls.append(("clipPath", path.ops, stroke, fill))

    def drawImage(self, *args, **kwargs):
        self.calls.append(("drawImage", args, kwargs))

    def saveState(self):
        self.calls.append(("saveState",))

    def restoreState(self):
        self.calls.append(("restoreState",))

    def showPage(self):
        self.calls.append(("showPage",))

    def save(self):
        self.calls.append(("save",))


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
        icon = Path(__file__).resolve().parents[1] / "template_assets" / "iconic" / "regent" / "email.png"
        self.assertTrue(icon.is_file())

        self.generator.renderImage(str(icon), 12, 12, 50, 118)

        draw_calls = [call for call in self.generator.c.calls if call[0] == "drawImage"]
        self.assertEqual(len(draw_calls), 1)
        _, _args, kwargs = draw_calls[0]
        self.assertEqual(kwargs.get("mask"), "auto")
        self.assertIn(("saveState",), self.generator.c.calls)
        self.assertIn(("restoreState",), self.generator.c.calls)

    def test_local_iconic_assets_are_optically_aligned_without_schema_flag(self):
        icon = Path(__file__).resolve().parents[1] / "template_assets" / "iconic" / "regent" / "email.png"
        # API validation may omit the optional canvas-only flag. The resolved
        # local asset path must still activate the same optical alignment.
        self.generator.renderImage(str(icon), 11, 11, 48, 200)

        draw_calls = [call for call in self.generator.c.calls if call[0] == "drawImage"]
        self.assertEqual(len(draw_calls), 1)
        _name, args, _kwargs = draw_calls[0]
        # Must match canvas iconicDrawTop: cap mid = 200 + 1.0; image top =
        # mid - h/2 = 195.5; PDF y = page_h - top - h = 842 - 195.5 - 11 = 635.5
        self.assertAlmostEqual(args[2], 635.5, places=1)

    def test_explicit_align_with_text_false_keeps_authored_image_top(self):
        icon = Path(__file__).resolve().parents[1] / "template_assets" / "iconic" / "regent" / "email.png"
        # Contact icons may opt out of the section-head optical shift.
        self.generator.renderImage(str(icon), 9, 9, 24, 140.7, align_with_text=False)

        draw_calls = [call for call in self.generator.c.calls if call[0] == "drawImage"]
        self.assertEqual(len(draw_calls), 1)
        _name, args, _kwargs = draw_calls[0]
        # PDF y = page_h - top - h = 842 - 140.7 - 9 = 692.3
        self.assertAlmostEqual(args[2], 692.3, places=1)

    def test_render_elements_clips_vellum_profile_photo_to_an_exact_circle(self):
        portrait = Path(__file__).resolve().parents[1] / "template_assets" / "regent-portrait.png"
        element = SimpleNamespace(
            category="image",
            src=str(portrait),
            width=104,
            height=104,
            left=433,
            top=36,
            page=1,
            deleted=False,
            photoSlot="image",
            photoSlotHidden=False,
            objectFit="cover",
            borderRadius=52,
            alignWithText=False,
        )

        self.generator.render_elements([element], lambda src: src)

        self.assertIn(
            ("ellipse", 433.0, 702.0, 537.0, 806.0),
            self.generator.c.paths[0].ops,
        )
        self.assertTrue(any(call[0] == "clipPath" for call in self.generator.c.calls))

    def test_circular_profile_photo_pdf_has_clean_page_colored_corners(self):
        try:
            import fitz
            from PIL import Image
            from reportlab.pdfgen import canvas
        except ImportError:
            self.skipTest("PyMuPDF, Pillow, and ReportLab are required")

        with TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "wide-red.png"
            Image.new("RGB", (180, 90), (220, 10, 10)).save(source)
            buffer = BytesIO()
            pdf_canvas = canvas.Canvas(buffer, pagesize=(595, 842))
            generator = PDF_Generator(
                SimpleNamespace(page_height=842, page_width=595),
                pdf_canvas,
            )
            generator.renderImage(
                str(source),
                100,
                100,
                100,
                100,
                object_fit="cover",
                border_radius=50,
            )
            pdf_canvas.showPage()
            pdf_canvas.save()

        document = fitz.open(stream=buffer.getvalue(), filetype="pdf")
        pixmap = document[0].get_pixmap()
        raster = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        corner = raster.getpixel((102, 102))
        center = raster.getpixel((150, 150))
        self.assertTrue(all(channel >= 245 for channel in corner))
        self.assertGreater(center[0], 180)
        self.assertLess(center[1], 60)
        self.assertLess(center[2], 60)

    def test_iconic_png_exports_without_opaque_black_squares(self):
        try:
            import fitz
            from PIL import Image
        except ImportError:
            self.skipTest("pymupdf/Pillow required for raster smoke check")

        from app.services.cv_generator import generate_resume

        elements = [
            SimpleNamespace(**element)
            for element in generate_resume("regent", {
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
            pdf_title = "CV Regent"
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

    def test_filled_rectangle_paints_solid_panel(self):
        self.generator.renderRectangle(120, 40, 10, 20, "#123456", 2, 0, True)
        self.assertIn(("rect", 10, 782, 120, 40, 0, 1), self.generator.c.calls)

    def test_polygon_outline_closes_path(self):
        self.generator.renderPolygon(
            100, 80, 10, 20, "#24201E", 1.5, False,
            [[0.5, 0.0], [1.0, 1.0], [0.0, 1.0]],
        )
        draw = [call for call in self.generator.c.calls if call[0] == "drawPath"]
        self.assertEqual(len(draw), 1)
        ops, stroke, fill = draw[0][1], draw[0][2], draw[0][3]
        self.assertEqual(stroke, 1)
        self.assertEqual(fill, 0)
        self.assertEqual(ops[0], ("moveTo", 60.0, 822.0))
        self.assertIn(("close",), ops)

    def test_path_uses_reportlab_curve_to(self):
        self.generator.renderPath(
            100, 50, 20, 30, "#24201E", 2,
            [
                {"type": "M", "x": 0.0, "y": 0.5},
                {"type": "C", "x1": 0.25, "y1": 0.0, "x2": 0.75, "y2": 1.0, "x": 1.0, "y": 0.5},
            ],
        )
        draw = [call for call in self.generator.c.calls if call[0] == "drawPath"]
        self.assertEqual(len(draw), 1)
        ops = draw[0][1]
        self.assertEqual(ops[0], ("moveTo", 20.0, 787.0))
        self.assertEqual(ops[1][0], "curveTo")
        self.assertIn(("line_cap", 1), self.generator.c.calls)


if __name__ == "__main__":
    unittest.main()
