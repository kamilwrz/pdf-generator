"""Tests for freestyle vertical-gap unification (SPACE_* rhythm)."""
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

    def test_nudges_overlapping_jobs_with_record_gap_keeps_left(self):
        elements = [
            el("h-exp", 40, 200, height=16, category="text", content="DOSWIADCZENIE"),
            el("t1", 40, 240, height=18, content="Senior AML"),
            el("m1", 42, 250, height=14, content="PwC"),  # slightly different left — keep it
            el("b1", 40, 255, height=40, content="Opis 1"),
            el("t2", 41, 245, height=18, content="CSR"),
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

        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        self.assertEqual(group["id"], "rhythm-reflow")
        by_id = {patch["element_id"]: patch for patch in group["patches"]}

        # First classified item is the anchor — not moved.
        self.assertNotIn("h-exp", by_id)

        self.assertIn("t2", by_id)
        self.assertIn("b1", by_id)
        self.assertGreaterEqual(
            by_id["t2"]["top"],
            by_id["b1"]["top"] + 40 + 14 - 0.5,
        )
        # Freestyle left edges preserved on nudged items.
        self.assertEqual(by_id["t2"]["left"], 41.0)
        if "m2" in by_id:
            self.assertEqual(by_id["m2"]["left"], 40.0)

    def test_skips_locked_and_fixed_elements(self):
        elements = [
            el("locked-title", 40, 100, locked=True),
            el("a", 40, 120),
            el("b", 40, 160),
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
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("locked-title", patched)

    def test_accepts_line_rules_in_validation(self):
        elements = [
            el("heading", 40, 200, height=16, category="text", content="EXPERIENCE"),
            el("rule", 40, 220, width=72, height=1.5, category="line"),
            el("body", 40, 250, height=40, content="Opis"),
        ]
        classification = {
            "profile": {"content_left": 40, "content_width": 400},
            "sections": [{
                "id": "experience",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "heading", "role": "heading"},
                        {"element_id": "rule", "role": "rule"},
                        {"element_id": "body", "role": "body"},
                    ],
                }],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        # body should sit AFTER_RULE below the rule (rule may stay put if already correct).
        self.assertIn("body", by_id)
        rule_bottom = (by_id["rule"]["top"] if "rule" in by_id else 220) + 1.5
        self.assertAlmostEqual(by_id["body"]["top"], rule_bottom + 12, delta=0.6)

    def test_falls_back_when_gpt_json_is_empty(self):
        elements = [
            el("a", 40, 120),
            el("b", 55, 200),
            el("c", 40, 280),
        ]
        group, error = pack_rhythm_classification(elements, {"message": "oops"}, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        # Preserve freestyle left on nudged items.
        if "b" in by_id:
            self.assertEqual(by_id["b"]["left"], 55.0)

    def test_shrinks_oversized_gap_to_section_spacing(self):
        elements = [
            el("end-exp", 40, 100, height=20, content="last job"),
            el("edu-h", 40, 300, height=16, category="text", content="EDU"),  # huge gap
            el("edu-b", 40, 340, height=20, content="school"),
        ]
        classification = {
            "sections": [
                {
                    "id": "experience",
                    "order": 1,
                    "blocks": [{
                        "id": "j1",
                        "order": 1,
                        "elements": [{"element_id": "end-exp", "role": "body"}],
                    }],
                },
                {
                    "id": "education",
                    "order": 2,
                    "blocks": [{
                        "id": "e1",
                        "order": 1,
                        "elements": [
                            {"element_id": "edu-h", "role": "heading"},
                            {"element_id": "edu-b", "role": "body"},
                        ],
                    }],
                },
            ],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        self.assertIn("edu-h", by_id)
        # 100+20+18 = 138 (SECTION), not 300.
        self.assertAlmostEqual(by_id["edu-h"]["top"], 138.0, delta=0.6)


if __name__ == "__main__":
    unittest.main()
