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
        """Stub canvas height (pre-measure) still expands so lines are not lost."""
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

    def test_auto_height_honours_measured_canvas_height_for_rhythm(self):
        """After a font change the canvas packs tops from measured heights.

        PDF must clip to that box instead of growing from its own wrap count,
        or following blocks keep canvas tops while this box draws taller and
        the vertical rhythm diverges.
        """
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append((x, text))

        # Stored height fits only the first line (14px); three explicit lines.
        generator.renderTextarea(
            40, 100, 180, 14, "Helvetica", 12, "#000000",
            "Pierwsza linia\nDruga linia\nTrzecia linia", 14, 0,
            autoHeight=True,
        )

        self.assertEqual([text for _, text in drawn], ["Pierwsza linia"])

    def test_tight_bullet_line_keeps_final_word_with_canvas(self):
        """Kernel-width Inter body: browser fits the last word; PDF must too.

        Without Inter's calibrated wrap tolerance, ReportLab overshoots by
        ~1.2 px and orphans "korporacyjnych." on its own line while the canvas
        keeps it.
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

    def test_monument_training_wrap_keeps_hanging_indent_for_every_continuation(self):
        """Pin the PDF side of the edit/display/PDF parity regression.

        At Monument's 152 px sidebar width, ``NSE`` belongs on the fourth PDF
        line because every continuation reserves the same marker column. The
        contentEditable surface must mirror this geometry instead of using the
        wider flat-text wrap that previously kept ``NSE`` on line three.
        """
        font, _, _ = PDF_Generator._resolve_font("Montserrat", False, False)
        content = (
            "• W trakcie (bezpłatnie): Cisco Networking Academy (Junior "
            "Cybersecurity Analyst), Fortinet NSE 1-3."
        )

        lines = PDF_Generator._wrap_textarea(
            content, font, 8.3, 0.0, 152.0, bullet_list=True,
        )

        self.assertEqual(
            [line for line, *_ in lines],
            [
                "W trakcie (bezpłatnie): Cisco",
                "Networking Academy (Junior",
                "Cybersecurity Analyst), Fortinet",
                "NSE 1-3.",
            ],
        )

    def test_linden_montserrat_rejects_inter_only_width_slack(self):
        """Montserrat must wrap at Linden's literal browser body width.

        Both phrases are slightly wider than the 147.377 px body column after
        reserving the bullet marker. The old global two-pixel tolerance kept
        them on one PDF line even though Chromium moved the final word.
        """
        font, _, _ = PDF_Generator._resolve_font("Montserrat", False, False)

        cases = [
            (
                "• systemy wbudowane (Raspberry Pi)",
                ["systemy wbudowane (Raspberry", "Pi)"],
            ),
            (
                "• Alert Triage, SOC L1 Alert Reporting,",
                ["Alert Triage, SOC L1 Alert", "Reporting,"],
            ),
        ]

        for content, expected in cases:
            with self.subTest(content=content):
                lines = PDF_Generator._wrap_textarea(
                    content, font, 8.3, 0.0, 152.0, bullet_list=True,
                )
                self.assertEqual([line for line, *_ in lines], expected)

    def test_linden_styled_wrap_uses_the_same_exact_montserrat_width(self):
        """Inline-decoration path must not reintroduce the removed slack."""
        generator = PDF_Generator.__new__(PDF_Generator)
        content = "• systemy wbudowane (Raspberry Pi)"
        styles = [(False, False, True, "#252823")] * len(content)
        base_style = (False, False, False, "#252823")

        lines = generator._wrap_textarea_styled(
            content,
            styles,
            "Montserrat",
            8.3,
            0.0,
            152.0,
            base_style,
            bullet_list=True,
        )

        self.assertEqual(
            ["".join(piece for piece, _style in pieces) for pieces, *_ in lines],
            ["systemy wbudowane (Raspberry", "Pi)"],
        )

    def test_browser_resolved_lines_override_reportlab_soft_wrap(self):
        """Exported Chromium lines are authoritative when slices are valid."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append((x, text))
        content = "Ala ma kota"

        generator.renderTextarea(
            40, 100, 300, 28, "Montserrat", 9.5, "#000000",
            content, 14, 0,
            resolvedLines=[
                {
                    "text": "Ala",
                    "start": 0,
                    "end": 3,
                    "paragraphEnd": False,
                    "indent": 0,
                    "bulletPrefix": "",
                    "xOffset": 1.25,
                    "advanceWidth": 20,
                },
                {
                    "text": "ma kota",
                    "start": 4,
                    "end": len(content),
                    "paragraphEnd": True,
                    "indent": 0,
                    "bulletPrefix": "",
                    "xOffset": 2.5,
                    "advanceWidth": 40,
                },
            ],
        )

        self.assertEqual(drawn, [(41.25, "Ala"), (42.5, "ma kota")])

    def test_stale_browser_lines_fall_back_to_safe_width_wrap(self):
        """A mismatched browser slice must never change or drop PDF content."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(text)

        generator.renderTextarea(
            40, 100, 300, 14, "Montserrat", 9.5, "#000000",
            "Ala ma kota", 14, 0,
            resolvedLines=[{
                "text": "stale",
                "start": 0,
                "end": 3,
                "paragraphEnd": True,
            }],
        )

        self.assertEqual(drawn, ["Ala ma kota"])

    def test_partial_browser_lines_cannot_drop_uncovered_content(self):
        """Valid slices are rejected when the record set omits later text."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(text)

        generator.renderTextarea(
            40, 100, 300, 14, "Montserrat", 9.5, "#000000",
            "Ala ma kota", 14, 0,
            resolvedLines=[{
                "text": "Ala",
                "start": 0,
                "end": 3,
                "paragraphEnd": True,
            }],
        )

        self.assertEqual(drawn, ["Ala ma kota"])

    def test_browser_lines_cannot_skip_an_explicit_blank_paragraph(self):
        """Every authored newline must retain its own vertical line box."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(text)

        generator.renderTextarea(
            40, 100, 300, 42, "Montserrat", 9.5, "#000000",
            "Ala\n\nkota", 14, 0,
            resolvedLines=[
                {"text": "Ala", "start": 0, "end": 3, "paragraphEnd": True},
                {"text": "kota", "start": 5, "end": 9, "paragraphEnd": True},
            ],
        )

        self.assertEqual(drawn, ["Ala", "", "kota"])

    def test_null_content_with_empty_browser_line_remains_safe(self):
        """Legacy nullable content must not crash transient-line validation."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(text)

        generator.renderTextarea(
            40, 100, 300, 14, "Montserrat", 9.5, "#000000",
            None, 14, 0,
            resolvedLines=[{
                "text": "",
                "start": 0,
                "end": 0,
                "paragraphEnd": True,
                "xOffset": 0,
            }],
        )

        self.assertEqual(drawn, [""])

    def test_browser_lines_cannot_inject_an_unbacked_blank_row(self):
        """A zero-length record needs a real empty paragraph in content."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(text)

        generator.renderTextarea(
            40, 100, 300, 28, "Montserrat", 9.5, "#000000",
            "A", 14, 0,
            resolvedLines=[
                {"text": "", "start": 0, "end": 0, "paragraphEnd": False},
                {"text": "A", "start": 0, "end": 1, "paragraphEnd": True},
            ],
        )

        self.assertEqual(drawn, ["A"])

    def test_browser_advance_width_calibrates_reportlab_tracking(self):
        """A valid browser advance controls the final PDF line width."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = (
            lambda x, y, text, *args: drawn.append((text, args[6]))
        )
        font, _, _ = PDF_Generator._resolve_font("Montserrat", False, False)
        reportlab_width = PDF_Generator._line_width("AV", font, 9.5, 0)
        browser_width = reportlab_width - 0.6

        generator.renderTextarea(
            40, 100, 300, 14, "Montserrat", 9.5, "#000000",
            "AV", 14, 0,
            resolvedLines=[{
                "text": "AV",
                "start": 0,
                "end": 2,
                "paragraphEnd": True,
                "xOffset": 0,
                "advanceWidth": browser_width,
            }],
        )

        self.assertEqual(drawn[0][0], "AV")
        self.assertAlmostEqual(drawn[0][1], -0.3)

    def test_styled_browser_lines_keep_runs_and_measured_start(self):
        """Resolved offsets slice inline styles without losing browser X."""
        generator = PDF_Generator.__new__(PDF_Generator)
        generator.page_h = 842
        drawn = []
        generator._draw_text_line = lambda x, y, text, *args: drawn.append(
            (x, text, args[3])
        )

        generator.renderTextarea(
            40, 100, 300, 14, "Montserrat", 9.5, "#000000",
            "AB CD", 14, 0,
            runs=[{"start": 0, "end": 2, "bold": True}],
            resolvedLines=[{
                "text": "AB CD",
                "start": 0,
                "end": 5,
                "paragraphEnd": True,
                "xOffset": 1.5,
                "advanceWidth": 30,
            }],
        )

        self.assertEqual(drawn[0], (41.5, "AB", True))
        self.assertEqual(drawn[1][1:], (" CD", False))

    def test_incomplete_or_zero_browser_geometry_uses_alignment_fallback(self):
        """Start and advance are atomic and non-empty lines need an advance."""
        font, _, _ = PDF_Generator._resolve_font("Montserrat", False, False)
        expected_x = 140 - PDF_Generator._line_width("AV", font, 9.5, 0)

        cases = [
            {"advanceWidth": 90},
            {"xOffset": 10, "advanceWidth": 0},
        ]
        for geometry in cases:
            with self.subTest(geometry=geometry):
                generator = PDF_Generator.__new__(PDF_Generator)
                generator.page_h = 842
                drawn = []
                generator._draw_text_line = (
                    lambda x, y, text, *args: drawn.append((x, text, args[6]))
                )
                generator.renderTextarea(
                    40, 100, 100, 14, "Montserrat", 9.5, "#000000",
                    "AV", 14, 0,
                    align="right",
                    resolvedLines=[{
                        "text": "AV",
                        "start": 0,
                        "end": 2,
                        "paragraphEnd": True,
                        **geometry,
                    }],
                )

                self.assertAlmostEqual(drawn[0][0], expected_x)
                self.assertEqual(drawn[0][1:], ("AV", 0))

if __name__ == "__main__":
    unittest.main()
