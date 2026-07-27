import unittest

from app.services.layout_analysis import analyze_layout
from app.services import layout_analysis


PAGE_SIZE = {"width": 100, "height": 100}


def block(element_id, left, top, *, width=12, height=10, page=1, category="textarea", locked=False):
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
        "locked": locked,
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

    def test_automatic_layout_skips_locked_elements(self):
        result = analyze_layout([block("locked-off-page", 94, 20, locked=True)], PAGE_SIZE)

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(result["layout_issues"], [])

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

    def test_distribute_equalizes_y_gaps_using_available_page_space(self):
        # Page content bottom = 100 - 12 = 88. Three 10px items → gap (88-30)/2 = 29.
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 15, width=10, height=10),
            block("last", 0, 50, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(items, {"first", "middle", "last"}, "y", 100, 100)
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["top"] for p in group["patches"]}
        self.assertEqual(changed, {"middle": 39.0, "last": 78.0})

    def test_distribute_y_stops_before_next_content_in_column(self):
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 15, width=10, height=10),
            block("last", 0, 40, width=10, height=10),
            block("education", 0, 70, width=10, height=10),
        ])
        group = layout_analysis.resolve_distribute(
            items, {"first", "middle", "last"}, "y", 100, 100,
        )
        self.assertIsNotNone(group)
        # Region ends at education.top - 8 = 62 → gap (62-30)/2 = 16.
        changed = {p["element_id"]: p["top"] for p in group["patches"]}
        self.assertEqual(changed, {"middle": 26.0, "last": 52.0})

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

    def test_directed_operation_rejects_locked_elements(self):
        result = layout_analysis.resolve_directed_operation(
            [block("locked-title", 20, 30, locked=True)],
            {
                "type": "shift",
                "target_element_ids": ["locked-title"],
                "dx": 10,
                "dy": 5,
            },
            PAGE_SIZE,
        )

        self.assertEqual(result["layout_groups"], [])
        self.assertIn("zablokowanego", result["layout_issues"][0]["message"])

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

    def test_move_to_sidebar_rewraps_a_section_below_its_reference(self):
        areas = block("areas-list", 24, 456, width=136, height=58, page=1)
        areas.update({"content": "Strategia\nBadania\nFacylitacja", "fontSize": 8.3, "lineHeight": 13})
        languages_heading = block("languages-heading", 220, 120, width=326, height=11, page=2, category="text")
        languages_heading.update({"content": "JĘZYKI", "fontSize": 8.4})
        languages_body = block("languages-body", 220, 140, width=326, height=18, page=2)
        languages_body.update({
            "content": "Polski — C2\nAngielski — C1",
            "fontSize": 9,
            "lineHeight": 12,
        })

        result = layout_analysis.resolve_directed_operation(
            [areas, languages_heading, languages_body],
            {
                "type": "move_to_sidebar",
                "target_element_ids": ["languages-heading", "languages-body"],
                "target_page": 1,
                "reference_element_id": "areas-list",
                "gap": 20,
            },
            {"width": 595, "height": 842},
        )

        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(result["layout_groups"][0]["target_page"], 1)
        self.assertEqual(result["layout_groups"][0]["patches"], [
            {
                "element_id": "languages-heading",
                "left": 24.0,
                "top": 534.0,
                "width": 136.0,
                "height": 11.0,
                "page": 1,
            },
            {
                "element_id": "languages-body",
                "left": 24.0,
                "top": 551.0,
                "width": 136.0,
                "height": 30.0,
                "page": 1,
            },
        ])

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
        # Already matches page-aware layout: tops 0 / 39 / 78 with gap 29 on a 100px page.
        items = layout_analysis.extract_bounds([
            block("first", 0, 0, width=10, height=10),
            block("middle", 0, 39, width=10, height=10),
            block("last", 0, 78, width=10, height=10),
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

    def test_shift_clamps_a_move_that_would_crush_stationary_content(self):
        # GPT often overshoots; Python shortens the vector so a ≥4px gap remains.
        items = layout_analysis.extract_bounds([
            block("moving", 10, 10, width=12, height=10),
            block("stationary", 30, 10, width=12, height=10),
        ])
        group = layout_analysis.resolve_shift(items, {"moving"}, 15.0, 0.0, 100, 100)
        self.assertIsNotNone(group)
        moved_left = group["patches"][0]["left"]
        # Full dx=15 → left 25 overlaps stationary@30. Clamp keeps ≥4px gap.
        self.assertLess(moved_left, 25.0)
        self.assertGreaterEqual(30.0 - (moved_left + 12.0), 3.5)

    def test_shift_up_stops_before_kept_paragraph(self):
        items = layout_analysis.extract_bounds([
            block("kept", 10, 20, width=40, height=16),
            block("body", 10, 80, width=40, height=20),
            block("skills", 10, 120, width=40, height=12),
        ])
        group = layout_analysis.resolve_shift(
            items, {"body", "skills"}, 0.0, -100.0, 100, 200,
        )
        self.assertIsNotNone(group)
        changed = {p["element_id"]: p["top"] for p in group["patches"]}
        # kept bottom=36; requested dy=-100 would put body at -20 — must stop near 40.
        self.assertGreaterEqual(changed["body"] - 36.0, 3.5)
        self.assertLess(changed["body"], 80.0)
        self.assertAlmostEqual(changed["skills"] - changed["body"], 40.0, places=1)

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
        # Page-aware: region to y=88, three 10px blocks → gap 29 → tops 0 / 39 / 78.
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(
            changed,
            {
                "b-title": 39.0,
                "b-desc": 45.0,
                "c-title": 78.0,
                "c-desc": 84.0,
            },
        )

    def test_target_groups_distribute_respects_following_section(self):
        elements = [
            block("a-title", 0, 0, width=20, height=5),
            block("a-desc", 0, 6, width=20, height=4),
            block("b-title", 0, 15, width=20, height=5),
            block("b-desc", 0, 21, width=20, height=4),
            block("c-title", 0, 40, width=20, height=5),
            block("c-desc", 0, 46, width=20, height=4),
            block("education", 0, 70, width=20, height=10),
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
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        # Region ends at 70 - 8 = 62 → gap 16 → tops 0 / 26 / 52.
        self.assertEqual(
            changed,
            {
                "b-title": 26.0,
                "b-desc": 32.0,
                "c-title": 52.0,
                "c-desc": 58.0,
            },
        )

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


class SectionRestructureTests(unittest.TestCase):
    def _source(self, **overrides):
        element = {
            "element_id": "education",
            "category": "textarea",
            "content": (
                "WYKSZTAŁCENIE\n"
                "Magister ekonomii\n"
                "Uniwersytet Warszawski · 2016–2019\n"
                "Specjalizacja: finanse przedsiębiorstw."
            ),
            "fontSize": 11,
            "fontFamily": "Inter",
            "color": "#223344",
            "left": 40,
            "top": 100,
            "width": 260,
            "height": 76,
            "page": 1,
            "zIndex": 3,
        }
        element.update(overrides)
        return element

    def _directive(self):
        return {
            "type": "restructure_section",
            "source_element_id": "education",
            "blocks": [
                {"role": "heading", "content": "WYKSZTAŁCENIE"},
                {"role": "entry_title", "content": "Magister ekonomii"},
                {"role": "entry_meta", "content": "Uniwersytet Warszawski · 2016–2019"},
                {"role": "body", "content": "Specjalizacja: finanse przedsiębiorstw."},
            ],
        }

    def test_restructure_preserves_content_and_reflows_the_following_lane(self):
        later = block("later", 40, 196, width=260, height=18, category="textarea")
        later["content"] = "DOŚWIADCZENIE"
        result = layout_analysis.resolve_restructure_section(
            [self._source(), later],
            self._directive(),
            {"width": 595, "height": 842},
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["remove_element_ids"], ["education"])
        self.assertEqual(
            " ".join(
                block["content"] for block in result["add_elements"]
                if block["category"] != "line"
            ).split(),
            self._source()["content"].split(),
        )
        self.assertTrue(any(block["category"] == "line" for block in result["add_elements"]))
        self.assertTrue(any(block["category"] == "text" for block in result["add_elements"]))
        self.assertTrue(any(block["category"] == "textarea" for block in result["add_elements"]))
        later_patch = next(patch for patch in result["patches"] if patch["element_id"] == "later")
        self.assertGreater(later_patch["top"], later["top"])

    def test_restructure_rejects_changed_content_and_locked_following_item(self):
        malformed = self._directive()
        malformed["blocks"][-1]["content"] = "Skrócony opis."
        self.assertIsNone(layout_analysis.resolve_restructure_section(
            [self._source()], malformed, {"width": 595, "height": 842}
        ))

        unsafe = self._directive()
        unsafe["blocks"][0]["left"] = 0
        self.assertIsNone(layout_analysis.resolve_restructure_section(
            [self._source()], unsafe, {"width": 595, "height": 842}
        ))

        locked_later = block("later", 40, 196, width=260, height=18, locked=True)
        self.assertIsNone(layout_analysis.resolve_restructure_section(
            [self._source(), locked_later], self._directive(), {"width": 595, "height": 842}
        ))

    def test_restructure_flows_overflow_to_a_new_page_without_moving_fixed_artwork(self):
        source = self._source(top=720, height=30, content=(
            "WYKSZTAŁCENIE\n"
            "Magister ekonomii\n"
            "Uniwersytet Warszawski · 2016–2019\n"
            + " ".join(["Opis programu i osiągnięć."] * 24)
        ))
        directive = self._directive()
        directive["blocks"][-1]["content"] = " ".join(["Opis programu i osiągnięć."] * 24)
        fixed_artwork = block("background", 0, 0, width=595, height=842, category="image")
        fixed_artwork["fixedToPage"] = True
        later = block("later", 40, 780, width=260, height=18)
        result = layout_analysis.resolve_restructure_section(
            [source, fixed_artwork, later],
            directive,
            {"width": 595, "height": 842},
        )

        self.assertIsNotNone(result)
        self.assertGreaterEqual(result["page_count"], 2)
        self.assertTrue(any(element["page"] == 2 for element in result["add_elements"]))
        self.assertNotIn("background", {patch["element_id"] for patch in result["patches"]})

    def test_restructure_pushes_colliding_following_content_down(self):
        # Starts above the source's bottom edge, so the flow-delta reflow skips
        # it — yet the taller rebuilt section grows into it. The resolver must
        # push it down instead of refusing.
        overlapping = block("overlap", 40, 170, width=260, height=18, category="textarea")
        overlapping["content"] = "DOŚWIADCZENIE"
        result = layout_analysis.resolve_restructure_section(
            [self._source(), overlapping],
            self._directive(),
            {"width": 595, "height": 842},
        )

        self.assertIsNotNone(result)
        pushed = next(patch for patch in result["patches"] if patch["element_id"] == "overlap")
        self.assertGreater(pushed["top"], overlapping["top"])
        # Pushed clear of every new element it could collide with.
        for added in result["add_elements"]:
            if added["page"] == pushed["page"]:
                self.assertLessEqual(added["top"] + added["height"], pushed["top"] + layout_analysis.EPSILON)

    def test_restructure_still_rejects_collision_with_locked_content(self):
        pinned = block("pinned", 40, 170, width=260, height=18, locked=True)
        self.assertIsNone(layout_analysis.resolve_restructure_section(
            [self._source(), pinned], self._directive(), {"width": 595, "height": 842}
        ))

    def test_restructure_ignores_preexisting_overlaps_it_did_not_create(self):
        # Two already-overlapping items in another column are the user's own
        # layout; they must not block an unrelated section rebuild.
        first = block("first", 400, 100, width=120, height=30, category="textarea")
        second = block("second", 410, 110, width=120, height=30, category="textarea")
        result = layout_analysis.resolve_restructure_section(
            [self._source(), first, second],
            self._directive(),
            {"width": 595, "height": 842},
        )

        self.assertIsNotNone(result)
        patched_ids = {patch["element_id"] for patch in result["patches"]}
        self.assertNotIn("first", patched_ids)
        self.assertNotIn("second", patched_ids)

    def test_delete_operation_accepts_explicit_content_and_rejects_protected_elements(self):
        content = block("content", 20, 60, width=180, height=30, page=2)
        fixed_background = block("background", 0, 0, width=100, height=100, page=2, category="image")
        fixed_background["fixedToPage"] = True
        locked = block("locked", 20, 100, width=180, height=30, page=2, locked=True)

        result = layout_analysis.resolve_delete_operation(
            [content, fixed_background, locked],
            {"type": "delete_elements", "target_element_ids": ["content"]},
        )
        self.assertEqual(result["remove_element_ids"], ["content"])
        self.assertEqual(result["target_page"], 2)

        self.assertIsNone(layout_analysis.resolve_delete_operation(
            [content, fixed_background, locked],
            {"type": "delete_elements", "target_element_ids": ["background"]},
        ))
        self.assertIsNone(layout_analysis.resolve_delete_operation(
            [content, fixed_background, locked],
            {"type": "delete_elements", "target_element_ids": ["locked"]},
        ))
        self.assertIsNone(layout_analysis.resolve_delete_operation(
            [content, fixed_background, locked],
            {"type": "delete_elements", "target_element_ids": ["missing"]},
        ))

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
