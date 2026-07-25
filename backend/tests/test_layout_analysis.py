import unittest

from app.services.layout_analysis import analyze_layout
from app.services import layout_analysis


PAGE_SIZE = {"width": 100, "height": 100}


def block(element_id, left, top, *, width=12, height=10, page=1, category="textarea"):
    return {
        "element_id": element_id,
        "category": category,
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "page": page,
        "zIndex": 2,
        "content": element_id,
    }


class LayoutAnalysisTests(unittest.TestCase):
    def test_snaps_near_miss_column_to_shared_anchor(self):
        result = analyze_layout(
            [
                block("one", 10, 10),
                block("two", 14, 30),
                block("three", 18, 50),
            ],
            PAGE_SIZE,
        )

        alignment = next(group for group in result["layout_groups"] if group["id"].startswith("alignment-"))
        changed = {patch["element_id"]: patch["left"] for patch in alignment["patches"]}
        self.assertEqual(changed, {"one": 14.0, "three": 14.0})

    def test_clamps_small_out_of_bounds_element(self):
        result = analyze_layout([block("off-page", 94, 20)], PAGE_SIZE)

        correction = result["layout_groups"][0]["patches"][0]
        self.assertEqual(correction["element_id"], "off-page")
        self.assertEqual(correction["left"], 88.0)
        self.assertEqual(correction["top"], 20.0)

    def test_rejects_bound_correction_that_would_create_overlap(self):
        result = analyze_layout(
            [
                block("off-page", 104, 20),
                block("occupied-edge", 88, 20),
            ],
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_groups"], [])

    def test_never_combines_alignment_across_pages(self):
        result = analyze_layout(
            [
                block("one-a", 10, 10, page=1),
                block("one-b", 14, 30, page=1),
                block("one-c", 18, 50, page=1),
                block("two-a", 10, 10, page=2),
                block("two-b", 14, 30, page=2),
                block("two-c", 18, 50, page=2),
            ],
            PAGE_SIZE,
        )

        alignment_groups = [
            group for group in result["layout_groups"] if group["id"].startswith("alignment-")
        ]
        self.assertEqual(len(alignment_groups), 2)
        for group in alignment_groups:
            pages = {patch["element_id"].split("-")[0] for patch in group["patches"]}
            self.assertEqual(len(pages), 1)

    def test_normalizes_a_repetitive_vertical_gap(self):
        result = analyze_layout(
            [
                block("one", 10, 10),
                block("two", 10, 30),
                block("three", 10, 50),
                block("four", 10, 73),
            ],
            PAGE_SIZE,
        )

        spacing = next(group for group in result["layout_groups"] if group["id"].startswith("spacing-"))
        self.assertEqual(spacing["patches"], [{"element_id": "four", "left": 10.0, "top": 70.0}])

    def test_ignores_decorative_template_elements(self):
        result = analyze_layout(
            [
                block("one", 10, 10),
                block("two", 14, 30),
                block("three", 18, 50),
                {
                    "element_id": "header-band",
                    "category": "line",
                    "left": -20,
                    "top": 0,
                    "width": 140,
                    "height": 8,
                    "page": 1,
                    "zIndex": 0,
                },
            ],
            PAGE_SIZE,
        )

        patched_ids = {
            patch["element_id"]
            for group in result["layout_groups"]
            for patch in group["patches"]
        }
        self.assertNotIn("header-band", patched_ids)


class DirectedOperationTests(unittest.TestCase):
    def test_shift_moves_targets_by_relative_offset(self):
        items = layout_analysis.extract_bounds([
            block("moved", 10, 10),
            block("stays", 50, 50),
        ])
        group = layout_analysis.resolve_shift(items, {"moved"}, 10.0, 5.0, 100, 100)
        self.assertIsNotNone(group)
        self.assertEqual(group["patches"], [{"element_id": "moved", "left": 20.0, "top": 15.0}])

    def test_shift_rejects_move_that_leaves_the_page(self):
        items = layout_analysis.extract_bounds([block("edge", 90, 10, width=12, height=10)])
        group = layout_analysis.resolve_shift(items, {"edge"}, 50.0, 0.0, 100, 100)
        self.assertIsNone(group)

    def test_align_to_explicit_target_value(self):
        items = layout_analysis.extract_bounds([
            block("one", 10, 10),
            block("two", 30, 40),
        ])
        group = layout_analysis.resolve_align(items, {"one", "two"}, "x", "start", 20.0, 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["left"] for p in group["patches"]}
        self.assertEqual(changed, {"one": 20.0, "two": 20.0})

    def test_align_with_omitted_target_uses_median_of_selection(self):
        # Distinct `top` values — these represent elements stacked in a
        # column (e.g. section headings at different heights) being aligned
        # on the x-axis. Same-row elements would legitimately overlap once
        # forced to a shared x, which is a different scenario this test
        # isn't exercising.
        items = layout_analysis.extract_bounds([
            block("one", 10, 10),
            block("two", 20, 40),
            block("three", 60, 70),
        ])
        group = layout_analysis.resolve_align(items, {"one", "two", "three"}, "x", "start", None, 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["left"] for p in group["patches"]}
        self.assertEqual(changed, {"one": 20.0, "three": 20.0})

    def test_distribute_equalizes_gaps_holding_ends_fixed(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 15, width=10, height=10),
            block("last", 0, 90, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "middle", "last"}, "y", 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["top"] for p in group["patches"]}
        self.assertEqual(changed, {"middle": 45.0})

    def test_distribute_requires_at_least_three_targets(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("last", 0, 90, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "last"}, "y", 100, 100)
        self.assertIsNone(group)

    def test_space_sets_an_exact_gap_between_each_selected_element(self):
        items = layout_analysis.extract_bounds([
            block("role", 10, 10, width=40, height=10),
            block("company", 10, 24, width=40, height=8),
            block("description", 10, 36, width=40, height=12),
        ])

        group = layout_analysis.resolve_space(
            items, {"role", "company", "description"}, "y", 10.0, 100, 100
        )

        self.assertIsNotNone(group)
        changed = {patch["element_id"]: patch["top"] for patch in group["patches"]}
        self.assertEqual(changed, {"company": 30.0, "description": 48.0})

    def test_resolve_directed_operation_rejects_targets_spanning_multiple_pages(self):
        elements = [
            block("one", 10, 10, page=1),
            block("two", 10, 10, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_element_ids": ["one", "two"], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_resolve_directed_operation_ignores_unknown_target_ids(self):
        elements = [block("real", 10, 10)]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_element_ids": ["ghost"], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_resolve_directed_operation_applies_a_valid_align_directive(self):
        elements = [
            block("one", 10, 10),
            block("two", 30, 40),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "align",
                "target_element_ids": ["one", "two"],
                "axis": "x",
                "anchor": "start",
                "target": 20,
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"one": 20.0, "two": 20.0})

    def test_directed_operation_can_move_visual_elements(self):
        elements = [
            block("section-line", 20, 30, width=160, height=2, category="line"),
            block("accent-box", 40, 60, width=120, height=80, category="rectangle"),
            block("profile-photo", 430, 20, width=100, height=100, category="image"),
            block("accent-circle", 200, 180, width=60, height=60, category="circle"),
            block("accent-ellipse", 300, 260, width=100, height=50, category="ellipse"),
        ]

        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "shift",
                "target_element_ids": ["section-line", "accent-box", "profile-photo", "accent-circle", "accent-ellipse"],
                "dx": 10,
                "dy": 5,
            },
            {"width": 595, "height": 842},
        )

        self.assertEqual(result["layout_issues"], [])
        changed = {
            patch["element_id"]: (patch["left"], patch["top"])
            for patch in result["layout_groups"][0]["patches"]
        }
        self.assertEqual(changed, {
            "section-line": (30.0, 35.0),
            "accent-box": (50.0, 65.0),
            "profile-photo": (440.0, 25.0),
            "accent-circle": (210.0, 185.0),
            "accent-ellipse": (310.0, 265.0),
        })

    def test_move_to_page_transfers_related_elements_and_aligns_them_to_reference(self):
        elements = [
            block("section-heading", 10, 10, width=30, height=10, page=1),
            block("section-body", 24, 30, width=40, height=20, page=1),
            block("page-two-content", 60, 70, width=30, height=10, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "move_to_page",
                "target_element_ids": ["section-heading", "section-body"],
                "target_page": 2,
                "reference_element_id": "section-heading",
                "align_element_ids": ["section-body"],
                "axis": "x",
                "anchor": "start",
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_issues"], [])
        group = result["layout_groups"][0]
        self.assertEqual(group["target_page"], 2)
        self.assertEqual(group["patches"], [
            {"element_id": "section-heading", "left": 10.0, "top": 10.0, "page": 2},
            {"element_id": "section-body", "left": 10.0, "top": 30.0, "page": 2},
        ])

    def test_move_to_page_can_create_one_new_trailing_page(self):
        result = layout_analysis.resolve_directed_operation(
            [block("heading", 10, 10, width=30, height=10, page=1)],
            {
                "type": "move_to_page",
                "target_element_ids": ["heading"],
                "target_page": 2,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "heading", "left": 10.0, "top": 10.0, "page": 2}],
        )

    def test_move_to_page_finds_a_free_slot_after_destination_content(self):
        result = layout_analysis.resolve_directed_operation(
            [
                block("moving", 10, 10, width=30, height=10, page=1),
                block("occupied", 10, 10, width=30, height=10, page=2),
            ],
            {
                "type": "move_to_page",
                "target_element_ids": ["moving"],
                "target_page": 2,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "moving", "left": 10.0, "top": 24.0, "page": 2}],
        )

    def test_move_to_page_places_a_related_field_below_its_reference(self):
        result = layout_analysis.resolve_directed_operation(
            [
                block("period", 30, 10, width=30, height=10, page=2),
                block("degree", 10, 50, width=40, height=12, page=1),
            ],
            {
                "type": "move_to_page",
                "target_element_ids": ["period"],
                "target_page": 1,
                "reference_element_id": "degree",
                "align_element_ids": ["period"],
                "axis": "x",
                "anchor": "start",
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "period", "left": 10.0, "top": 66.0, "page": 1}],
        )

    def test_move_to_page_rejects_when_destination_has_no_free_slot(self):
        result = layout_analysis.resolve_directed_operation(
            [
                block("moving", 10, 10, width=30, height=10, page=1),
                block("occupied", 0, 0, width=100, height=100, page=2),
            ],
            {
                "type": "move_to_page",
                "target_element_ids": ["moving"],
                "target_page": 2,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_move_to_page_rejects_fixed_page_decoration(self):
        decoration = block("background", 0, 0, width=100, height=100, page=1, category="image")
        decoration["fixedToPage"] = True
        result = layout_analysis.resolve_directed_operation(
            [decoration],
            {
                "type": "move_to_page",
                "target_element_ids": ["background"],
                "target_page": 2,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_shift_reports_no_change_for_a_near_zero_offset(self):
        items = layout_analysis.extract_bounds([block("stays", 10, 10)])
        group = layout_analysis.resolve_shift(items, {"stays"}, 0.0, 0.0, 100, 100)
        self.assertEqual(group, layout_analysis._NO_CHANGE)

    def test_align_reports_no_change_when_already_aligned(self):
        items = layout_analysis.extract_bounds([
            block("one", 20, 10),
            block("two", 20, 40),
        ])
        group = layout_analysis.resolve_align(items, {"one", "two"}, "x", "start", 20.0, 100, 100)
        self.assertEqual(group, layout_analysis._NO_CHANGE)

    def test_distribute_reports_no_change_when_already_even(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 45, width=10, height=10),
            block("last", 0, 90, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "middle", "last"}, "y", 100, 100)
        self.assertEqual(group, layout_analysis._NO_CHANGE)

    def test_resolve_directed_operation_reports_a_neutral_message_for_no_change(self):
        elements = [
            block("one", 20, 10),
            block("two", 20, 40),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "align", "target_element_ids": ["one", "two"], "axis": "x", "anchor": "start", "target": 20},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)
        self.assertEqual(result["layout_issues"][0]["severity"], "low")

    def test_shift_allows_a_move_that_creates_a_new_overlap(self):
        # Directed operations are an explicit instruction, not a guess — a
        # user asking to move an element somewhere may mean for it to land
        # on top of another element. Unlike the deterministic auto-scanner
        # (see test_rejects_bound_correction_that_would_create_overlap),
        # this is allowed as long as the result stays on the page.
        items = layout_analysis.extract_bounds([
            block("moving", 10, 10, width=12, height=10),
            block("stationary", 30, 10, width=12, height=10),
        ])
        group = layout_analysis.resolve_shift(items, {"moving"}, 15.0, 0.0, 100, 100)
        self.assertIsNotNone(group)
        self.assertEqual(group["patches"], [{"element_id": "moving", "left": 25.0, "top": 10.0}])

    def test_target_groups_shift_moves_a_block_as_one_rigid_unit(self):
        # PAGE_SIZE is 100x100 (this file's test convention) — widths must
        # stay well under that or the shift below would legitimately be
        # rejected as leaving the page, defeating the point of this test.
        elements = [
            block("title", 10, 10, width=30, height=15),
            block("company", 10, 30, width=30, height=12),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "company"]], "dx": 20, "dy": 5},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: (p["left"], p["top"]) for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title": (30.0, 15.0), "company": (30.0, 35.0)})

    def test_target_groups_distribute_moves_middle_block_preserving_internal_layout(self):
        elements = [
            block("a-title", 0, 0, width=20, height=5),
            block("a-desc", 0, 6, width=20, height=4),
            block("b-title", 0, 15, width=20, height=5),
            block("b-desc", 0, 21, width=20, height=4),
            block("c-title", 0, 50, width=20, height=5),
            block("c-desc", 0, 56, width=20, height=4),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "distribute",
                "target_groups": [["a-title", "a-desc"], ["b-title", "b-desc"], ["c-title", "c-desc"]],
                "axis": "y",
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"b-title": 25.0, "b-desc": 31.0})

    def test_single_target_group_spaces_its_members_individually(self):
        elements = [
            block("role", 10, 10, width=40, height=10),
            block("company", 10, 24, width=40, height=8),
            block("description", 10, 36, width=40, height=12),
        ]

        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "space",
                "target_groups": [["role", "company", "description"]],
                "axis": "y",
                "gap": 10,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_issues"], [])
        changed = {patch["element_id"]: patch["top"] for patch in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"company": 30.0, "description": 48.0})

    def test_target_groups_align_moves_blocks_to_a_shared_value(self):
        elements = [
            block("a1", 10, 10, width=20, height=10),
            block("a2", 10, 25, width=20, height=8),
            block("b1", 40, 10, width=20, height=10),
            block("b2", 40, 25, width=20, height=8),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {
                "type": "align",
                "target_groups": [["a1", "a2"], ["b1", "b2"]],
                "axis": "x",
                "anchor": "start",
                "target": 5,
            },
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"a1": 5.0, "a2": 5.0, "b1": 5.0, "b2": 5.0})

    def test_target_groups_rejects_a_block_whose_members_span_multiple_pages(self):
        elements = [
            block("title", 10, 10, page=1),
            block("desc", 10, 30, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "desc"]], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_target_groups_rejects_blocks_on_different_pages(self):
        elements = [
            block("a1", 10, 10, page=1),
            block("a2", 10, 30, page=1),
            block("b1", 10, 10, page=2),
            block("b2", 10, 30, page=2),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["a1", "a2"], ["b1", "b2"]], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_target_groups_skips_empty_or_unmatched_groups(self):
        elements = [
            block("title", 10, 10, width=20, height=10),
            block("desc", 10, 25, width=20, height=8),
        ]
        result = layout_analysis.resolve_directed_operation(
            elements,
            {"type": "shift", "target_groups": [["title", "desc"], ["ghost"], []], "dx": 5, "dy": 0},
            PAGE_SIZE,
        )
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(len(result["layout_groups"]), 1)
        changed = {p["element_id"]: p["left"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title": 15.0, "desc": 15.0})


if __name__ == "__main__":
    unittest.main()
