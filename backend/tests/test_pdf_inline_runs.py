"""Tests for inline decoration (``runs``) in the PDF renderer.

The single-font fast path must stay byte-identical to the pre-runs renderer,
while the run-aware path must wrap and draw mixed bold/italic/underline/colour
spans correctly. These tests exercise the wrap engine and the draw sequence
without producing an actual PDF file (a stubbed ``_draw_text_line`` records the
draw calls, like the existing bullet-layout tests)."""

import unittest

from app.services.pdf_generator import PDF_Generator


def _new_generator():
    """A generator instance without a real ReportLab canvas (width-only work)."""
    generator = PDF_Generator.__new__(PDF_Generator)
    generator.page_h = 842
    return generator


class RunNormalizationTests(unittest.TestCase):
    def test_empty_or_noop_runs_take_the_plain_fast_path(self):
        """No runs, and runs that resolve to the base style, both return None so
        the renderer stays on the untouched single-font path."""
        generator = _new_generator()
        self.assertIsNone(
            generator._prepare_styled("Hello", None, False, False, False, "#000000")
        )
        self.assertIsNone(
            generator._prepare_styled("Hello", [], False, False, False, "#000000")
        )
        # A run that only re-states the base bold=False changes nothing.
        noop = [{"start": 0, "end": 5, "bold": False}]
        self.assertIsNone(
            generator._prepare_styled("Hello", noop, False, False, False, "#000000")
        )

    def test_invalid_spans_are_dropped(self):
        generator = _new_generator()
        self.assertIsNone(generator._normalize_runs([{"start": 3, "end": 3}]))
        self.assertIsNone(generator._normalize_runs([{"start": 5, "end": 2}]))
        self.assertIsNone(generator._normalize_runs([{"start": "x", "end": 2}]))

    def test_run_overrides_only_declared_marks(self):
        """An italic-only run keeps the element's base bold and colour."""
        generator = _new_generator()
        runs = [{"start": 0, "end": 2, "italic": True}]
        prepared = generator._prepare_styled("abcd", runs, True, False, False, "#111111")
        self.assertIsNotNone(prepared)
        _clean, styles = prepared
        # (bold, italic, underline, color) — bold and colour fall through to base.
        self.assertEqual(styles[0], (True, True, False, "#111111"))
        self.assertEqual(styles[2], (True, False, False, "#111111"))


class RunWrapParityTests(unittest.TestCase):
    def test_styled_wrap_matches_plain_when_no_style_changes(self):
        """A run covering the whole text with the base style produces the same
        line breaks as the plain wrapper — proof the run engine does not drift
        for style-neutral spans."""
        content = (
            "Tworzenie i aktualizacja profili KYC klientow indywidualnych "
            "i korporacyjnych oraz biznesowych podmiotow gospodarczych"
        )
        family, size, ls, width = "Inter", 9.4, 0.0, 240.0

        plain = PDF_Generator._wrap_textarea(content, family, size, ls, width)
        plain_bodies = [line for line, *_ in plain]

        generator = _new_generator()
        # Force the styled path with a colour-only run (colour does not change
        # glyph widths, so wrap points must be identical to the plain path).
        runs = [{"start": 0, "end": len(content), "color": "#123456"}]
        prepared = generator._prepare_styled(content, runs, False, False, False, "#000000")
        self.assertIsNotNone(prepared)
        clean, styles = prepared
        styled = generator._wrap_textarea_styled(
            clean, styles, family, size, ls, width, (False, False, False, "#000000"),
        )
        styled_bodies = ["".join(text for text, _ in pieces) for pieces, *_ in styled]

        self.assertEqual(styled_bodies, plain_bodies)

    def test_bold_span_splits_line_into_pieces(self):
        """A bold run inside a line yields separate draw pieces carrying the
        right marks, and every character is preserved in order."""
        generator = _new_generator()
        content = "Analiza KYC oraz AML"
        # Bold just the "KYC" token (offsets 8..11).
        runs = [{"start": 8, "end": 11, "bold": True}]
        prepared = generator._prepare_styled(content, runs, False, False, False, "#000000")
        clean, styles = prepared
        lines = generator._wrap_textarea_styled(
            clean, styles, "Inter", 12, 0.0, 400.0, (False, False, False, "#000000"),
        )
        self.assertEqual(len(lines), 1)
        pieces = lines[0][0]
        self.assertEqual("".join(text for text, _ in pieces), content)
        bold_text = "".join(text for text, style in pieces if style[0])
        self.assertEqual(bold_text, "KYC")


class RunDrawTests(unittest.TestCase):
    def test_pieces_drawn_left_to_right_with_advancing_x(self):
        """The styled textarea draws each span at an increasing x, and passes
        the per-span bold/italic/underline/colour to the draw primitive."""
        generator = _new_generator()
        drawn = []
        generator._draw_text_line = (
            lambda x, y, text, family, size, color, bold=False, italic=False,
            underline=False, letter_spacing=0.0, word_space=0.0:
            drawn.append((round(x, 2), text, color, bold, italic, underline))
        )

        content = "Analiza KYC"
        runs = [{"start": 8, "end": 11, "bold": True, "color": "#ff0000"}]
        generator.renderTextarea(
            40, 100, 400, 40, "Inter", 12, "#000000", content, 14, 0,
            runs=runs,
        )

        # Two pieces on one line: "Analiza " (base) then "KYC" (bold, red).
        self.assertEqual(len(drawn), 2)
        (x0, t0, c0, b0, _, _), (x1, t1, c1, b1, _, _) = drawn
        self.assertEqual((t0, c0, b0), ("Analiza ", "#000000", False))
        self.assertEqual((t1, c1, b1), ("KYC", "#ff0000", True))
        self.assertGreater(x1, x0)  # second piece is advanced past the first

    def test_single_line_text_draws_styled_pieces(self):
        generator = _new_generator()
        drawn = []
        generator._draw_text_line = (
            lambda x, y, text, *args, **kwargs: drawn.append(text)
        )
        runs = [{"start": 0, "end": 4, "underline": True}]
        generator.renderText(
            10, 20, "Inter", 12, "#000000", "Bold rest", False, False, False, runs,
        )
        self.assertEqual("".join(drawn), "Bold rest")


if __name__ == "__main__":
    unittest.main()
