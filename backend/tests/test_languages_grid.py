"""Unit tests for the shared single-column languages grid helpers."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import Builder
from app.services.cv_templates.shared.text import (
    LANGUAGE_SEP_SIDEBAR,
    LANGUAGE_SEP_SINGLE,
    _language_entries,
    _language_level_runs,
    _language_line,
    _place_languages_grid,
    _sidebar_language_content,
)


class LanguagesGridTests(unittest.TestCase):
    def test_language_line_separators(self):
        self.assertEqual(
            _language_line("Polski", "C2", sep=LANGUAGE_SEP_SINGLE),
            "Polski — C2",
        )
        self.assertEqual(
            _language_line("Polski", "C2", sep=LANGUAGE_SEP_SIDEBAR),
            "Polski - C2",
        )
        self.assertEqual(_language_line("Polski", "", sep=LANGUAGE_SEP_SINGLE), "Polski")

    def test_level_runs_cover_only_the_cefr_suffix(self):
        content = _language_line("Niemiecki", "C1")
        runs = _language_level_runs(content, "Niemiecki", "C1", color="#9E2532")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["start"], len("Niemiecki — "))
        self.assertEqual(runs[0]["end"], len(content))
        self.assertTrue(runs[0]["italic"])
        self.assertEqual(runs[0]["color"], "#9E2532")

    def test_place_languages_grid_emits_equal_columns_and_skips_empty_slots(self):
        entries = _language_entries({
            "languages": [
                {"name": "Polski", "level": "C2"},
                {"name": "Niemiecki", "level": "C1"},
            ],
        })
        left, width, columns = 54.0, 487.0, 4
        builder = Builder(80)
        _place_languages_grid(
            builder,
            entries,
            left,
            width,
            columns=columns,
            font="Times-Roman",
            fs=10,
            lh=14,
            body_color="#222222",
            level_color="#9E2532",
            gutter=8.0,
        )
        cells = [
            element for element in builder.build()
            if element.get("category") == "textarea"
        ]
        self.assertEqual(len(cells), 2)
        col_w = width / columns
        cell_w = col_w - 8.0
        self.assertAlmostEqual(cells[0]["left"], left)
        self.assertAlmostEqual(cells[1]["left"], left + col_w)
        self.assertAlmostEqual(cells[0]["width"], cell_w)
        self.assertAlmostEqual(cells[1]["width"], cell_w)
        self.assertEqual(cells[0]["flowRole"], "grid-member")
        self.assertEqual(cells[0]["content"], "Polski — C2")
        self.assertEqual(cells[0]["runs"][0]["start"], len("Polski — "))
        self.assertEqual(cells[0]["runs"][0]["color"], "#9E2532")

    def test_sidebar_language_content_uses_hyphen_and_no_bullets(self):
        content = _sidebar_language_content({
            "languages": [
                {"name": "Polski", "level": "ojczysty"},
                {"name": "Angielski", "level": "C1"},
            ],
        })
        self.assertEqual(content, "Polski - ojczysty\nAngielski - C1")
        self.assertNotIn("•", content)
        self.assertNotIn("—", content)


if __name__ == "__main__":
    unittest.main()
