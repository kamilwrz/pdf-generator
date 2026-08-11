"""Skill chip pill wrapping: row layout, measure/place agreement, page breaks."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import Builder, CONTENT_BOTTOM, PAGE_TOP
from app.services.cv_templates.shared.text import (
    _layout_skill_chips,
    _measure_skill_chips_row,
    _place_skill_chips_row,
)


class LayoutSkillChipsTests(unittest.TestCase):
    def test_empty_items_produce_no_placements(self):
        placements, height = _layout_skill_chips([], 300, "Helvetica", 9.0)
        self.assertEqual(placements, [])
        self.assertEqual(height, 0.0)

    def test_wraps_to_a_new_row_when_width_exceeded(self):
        items = [
            "Analiza AML/KYC", "Transaction Monitoring", "Screening PEP", "SAR Reporting",
        ]
        placements, height = _layout_skill_chips(items, 160, "Helvetica", 9.0)
        rows = {round(dy, 3) for _skill, _dx, dy, _w in placements}
        self.assertGreater(len(rows), 1, "expected wrapping across multiple rows")
        self.assertEqual(len(placements), len(items))
        self.assertGreater(height, 0)

    def test_single_short_item_fits_on_one_row_at_the_origin(self):
        placements, height = _layout_skill_chips(["SQL"], 300, "Helvetica", 9.0)
        self.assertEqual(len(placements), 1)
        _skill, dx, dy, _w = placements[0]
        self.assertEqual((dx, dy), (0.0, 0.0))
        self.assertGreater(height, 0)


class MeasurePlaceAgreementTests(unittest.TestCase):
    def test_measured_height_matches_placed_cursor_advance(self):
        items = [
            "Analiza AML/KYC", "Transaction Monitoring", "CDD / EDD", "Screening PEP",
            "Sanctions", "Adverse Media", "SAR Reporting", "MS Office",
        ]
        width = 200.0
        measured = _measure_skill_chips_row(items, width, "Helvetica", 9.0)

        b = Builder(PAGE_TOP)
        start_y = b.y
        end_y = _place_skill_chips_row(b, items, 40, width, "Helvetica", 9.0, "#123456", "#FFFFFF")

        self.assertEqual(end_y - start_y, measured)
        self.assertEqual(end_y, b.y)


class PlaceSkillChipsRowRenderingTests(unittest.TestCase):
    def test_emits_filled_rounded_rectangle_and_centered_text_per_chip(self):
        b = Builder(PAGE_TOP)
        _place_skill_chips_row(b, ["SQL", "Python"], 40, 300, "Helvetica", 9.0, "#1B3357", "#FFFFFF")

        rects = [el for el in b.els if el["category"] == "rectangle"]
        texts = [el for el in b.els if el["category"] == "text"]
        self.assertEqual(len(rects), 2)
        self.assertEqual(len(texts), 2)
        for rect in rects:
            self.assertTrue(rect["filled"])
            self.assertGreater(rect["borderRadius"], 0)
            self.assertEqual(rect["backgroundColor"], "#1B3357")
        self.assertEqual({t["content"] for t in texts}, {"SQL", "Python"})
        for text in texts:
            self.assertEqual(text["color"], "#FFFFFF")


class KeepTogetherPageBreakTests(unittest.TestCase):
    def test_whole_wrapped_chip_block_moves_to_next_page_when_it_does_not_fit(self):
        items = [f"Skill {index}" for index in range(30)]
        width = 200.0
        height = _measure_skill_chips_row(items, width, "Helvetica", 9.0)

        # Leave less room on page 1 than the wrapped block needs.
        b = Builder(CONTENT_BOTTOM - height / 2)
        with b.keep_together(height):
            _place_skill_chips_row(b, items, 40, width, "Helvetica", 9.0, "#1B3357", "#FFFFFF")

        pages = {element["page"] for element in b.els}
        self.assertEqual(pages, {2})
        groups = {element.get("flowGroup") for element in b.els}
        self.assertEqual(len(groups), 1)


if __name__ == "__main__":
    unittest.main()
