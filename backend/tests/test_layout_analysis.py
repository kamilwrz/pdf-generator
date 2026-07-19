import unittest

from app.services.layout_analysis import analyze_layout


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


if __name__ == "__main__":
    unittest.main()
