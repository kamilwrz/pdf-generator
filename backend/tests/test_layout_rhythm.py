"""Tests for freestyle → SPACE_* rhythm packing."""
import unittest

from app.services.layout_rhythm import pack_rhythm_classification, _normalize_classification


PAGE = {"width": 595, "height": 842}


def el(element_id, left, top, *, width=400, height=20, page=1, category="textarea", **extra):
    return {
        "element_id": element_id,
        "category": category,
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "page": page,
        "fontSize": 11,
        "lineHeight": 15,
        "content": element_id,
        "zIndex": 2,
        **extra,
    }


class LayoutRhythmTests(unittest.TestCase):
    def test_normalize_rejects_unknown_ids(self):
        raw = {
            "sections": [{
                "id": "experience",
                "order": 1,
                "blocks": [{
                    "id": "job",
                    "order": 1,
                    "elements": [
                        {"element_id": "missing", "role": "entry_title"},
                    ],
                }],
            }],
        }
        self.assertIsNone(_normalize_classification(raw, {"real"}))

    def test_packs_overlapping_jobs_with_record_gap(self):
        elements = [
            el("h-exp", 40, 200, height=16, category="text", content="DOSWIADCZENIE"),
            el("t1", 40, 240, height=18, content="Senior AML"),
            el("m1", 40, 250, height=14, content="PwC"),
            el("b1", 40, 255, height=40, content="Opis 1"),
            el("t2", 40, 245, height=18, content="CSR"),  # overlaps previous cluster
            el("m2", 40, 250, height=14, content="Amazon"),
            el("b2", 40, 252, height=40, content="Opis 2"),
        ]
        classification = {
            "profile": {"content_left": 40, "content_width": 400},
            "ignored_element_ids": [],
            "sections": [{
                "id": "experience",
                "order": 1,
                "blocks": [
                    {
                        "id": "job-1",
                        "order": 1,
                        "elements": [
                            {"element_id": "h-exp", "role": "heading"},
                            {"element_id": "t1", "role": "entry_title"},
                            {"element_id": "m1", "role": "entry_meta"},
                            {"element_id": "b1", "role": "body"},
                        ],
                    },
                    {
                        "id": "job-2",
                        "order": 2,
                        "elements": [
                            {"element_id": "t2", "role": "entry_title"},
                            {"element_id": "m2", "role": "entry_meta"},
                            {"element_id": "b2", "role": "body"},
                        ],
                    },
                ],
            }],
        }

        group = pack_rhythm_classification(elements, classification, PAGE)
        self.assertIsNotNone(group)
        self.assertEqual(group["id"], "rhythm-reflow")
        self.assertEqual(group["severity"], "critical")
        by_id = {patch["element_id"]: patch for patch in group["patches"]}

        # Second job title must sit below first body with at least RECORD gap.
        self.assertIn("t2", by_id)
        self.assertIn("b1", by_id)
        self.assertGreaterEqual(
            by_id["t2"]["top"],
            by_id["b1"]["top"] + by_id["b1"].get("height", 40) + 14 - 0.5,
        )
        # Shared column left edge.
        self.assertEqual(by_id["t1"]["left"], 40.0)
        self.assertEqual(by_id["t2"]["left"], 40.0)

    def test_skips_locked_and_fixed_elements(self):
        elements = [
            el("locked-title", 40, 100, locked=True),
            el("a", 40, 120),
            el("b", 40, 130),
        ]
        classification = {
            "sections": [{
                "id": "experience",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "locked-title", "role": "entry_title"},
                        {"element_id": "a", "role": "body"},
                        {"element_id": "b", "role": "body"},
                    ],
                }],
            }],
        }
        group = pack_rhythm_classification(elements, classification, PAGE)
        self.assertIsNotNone(group)
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("locked-title", patched)


if __name__ == "__main__":
    unittest.main()
