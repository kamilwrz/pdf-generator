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

    def test_draw_watermark_balances_save_and_restore_state(self):
        """Prove `_draw_watermark` never leaks canvas state to later draws.

        The earlier `test_draw_watermark_rotates_and_lowers_alpha` test only
        checked that the *content* calls (fill alpha, rotation, text) were
        present — it would still pass even if a `restoreState()` call were
        deleted from the implementation, because deleting a restore doesn't
        remove any of the calls that test looks for. This test instead walks
        the recorded call sequence like a stack: every `saveState` pushes,
        every `restoreState` pops. If a `restoreState` fires with nothing
        open (a stray restore) or the stack is not empty once the sequence
        ends (an orphaned save that never got restored — e.g. a deleted
        `finally: self.c.restoreState()`), the watermark is leaking or
        corrupting shared canvas state and the test fails.
        """
        self.generator._draw_watermark()
        calls = self.generator.c.calls

        save_count = calls.count(("saveState",))
        restore_count = calls.count(("restoreState",))
        self.assertEqual(
            save_count,
            restore_count,
            "saveState/restoreState counts must match — an unequal count "
            "means at least one state push is never undone.",
        )
        # One outer save/restore wrapping the whole watermark draw, plus one
        # save/restore per repeated stamp (offsets -260, 0, 260).
        self.assertEqual(save_count, 4)

        depth = 0
        for call in calls:
            if call[0] == "saveState":
                depth += 1
            elif call[0] == "restoreState":
                depth -= 1
                self.assertGreaterEqual(
                    depth,
                    0,
                    "restoreState fired without a matching prior saveState",
                )
        self.assertEqual(
            depth,
            0,
            "saveState/restoreState calls are unbalanced — a save was left "
            "open, so later draws on this page would inherit watermark "
            "fill/alpha/font/rotation state.",
        )

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
