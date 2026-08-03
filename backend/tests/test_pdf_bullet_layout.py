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

    def test_tight_bullet_line_keeps_final_word_with_canvas(self):
        """Kernel-width Inter body: browser fits the last word; PDF must too.

        Without WRAP_WIDTH_TOLERANCE_PX, ReportLab overshoots by ~1.2 px and
        orphans "korporacyjnych." on its own line while the canvas keeps it.
        """
        font, _, _ = PDF_Generator._resolve_font("Inter", False, False)
        content = (
            "• Tworzenie i aktualizacja profili KYC klientów indywidualnych "
            "i korporacyjnych."
        )
        lines = PDF_Generator._wrap_textarea(
            content, font, 9.4, 0.0, 355.0, bullet_list=True,
        )
        bodies = [line for line, *_ in lines]
        self.assertEqual(
            bodies,
            [
                "Tworzenie i aktualizacja profili KYC klientów indywidualnych "
                "i korporacyjnych."
            ],
            msg=f"unexpected wrap points: {bodies!r}",
        )

if __name__ == "__main__":
    unittest.main()
