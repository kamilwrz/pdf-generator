import unittest

from app.services.pdf_generator import PDF_Generator
from app.services.article_generator import _wrap_lines


class BulletLayoutTests(unittest.TestCase):
    def test_bullet_prefix_is_normalized_and_continuations_share_its_text_start(self):
        generator = PDF_Generator.__new__(PDF_Generator)

        lines = generator._wrap_textarea(
            "  •   Pierwszy punkt\n• Drugi punkt",
            "Helvetica",
            12,
            0,
            240,
            bullet_list=True,
        )

        bullet_width = generator._line_width("• ", "Helvetica", 12, 0)
        self.assertEqual(lines, [
            ("Pierwszy punkt", True, bullet_width, "• "),
            ("Drugi punkt", True, bullet_width, "• "),
        ])

    def test_auto_height_pdf_textarea_draws_all_wrapped_lines(self):
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append((x, text))

        generator.renderTextarea(
            40, 100, 180, 1, "Helvetica", 12, "#000000",
            "Pierwsza linia\nDruga linia", 14, 0,
            autoHeight=True,
        )

        self.assertEqual([text for _, text in drawn], ["Pierwsza linia", "Druga linia"])

    def test_article_wrap_helper_accepts_current_pdf_line_shape(self):
        self.assertEqual(_wrap_lines("Krótki akapit.", 180, 12), ["Krótki akapit."])


if __name__ == "__main__":
    unittest.main()
