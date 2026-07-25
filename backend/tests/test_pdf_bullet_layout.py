import unittest

from app.services.pdf_generator import PDF_Generator


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


if __name__ == "__main__":
    unittest.main()
