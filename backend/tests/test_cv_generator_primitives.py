"""``_rect`` gains filled/borderRadius kwargs without changing existing callers."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import _rect


class RectHelperTests(unittest.TestCase):
    def test_default_call_matches_pre_existing_outline_shape(self):
        element = _rect(10, 20, 100, 40, "#112233", 2, zIndex=3, page=2)
        self.assertEqual(element["category"], "rectangle")
        self.assertEqual(element["left"], 10)
        self.assertEqual(element["top"], 20)
        self.assertEqual(element["width"], 100)
        self.assertEqual(element["height"], 40)
        self.assertEqual(element["backgroundColor"], "#112233")
        self.assertEqual(element["borderWidth"], 2)
        self.assertFalse(element["filled"])
        self.assertIsNone(element["borderRadius"])
        self.assertEqual(element["zIndex"], 3)
        self.assertEqual(element["page"], 2)

    def test_filled_rounded_pill(self):
        element = _rect(0, 0, 60, 20, "#000000", 0, filled=True, borderRadius=10)
        self.assertTrue(element["filled"])
        self.assertEqual(element["borderRadius"], 10)


if __name__ == "__main__":
    unittest.main()
