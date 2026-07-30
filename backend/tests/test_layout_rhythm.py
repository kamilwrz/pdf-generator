"""Tests for selective freestyle rhythm (deadband, local pairs, ±15 px)."""
import unittest

from app.services.cv_generator import SPACE_STACK
from app.services.layout_rhythm import (
    MAX_RHYTHM_NUDGE_PX,
    MIN_GAP_SAMPLES,
    RHYTHM_DEADBAND_PX,
    pack_rhythm_classification,
    _infer_gap_profile,
    _normalize_classification,
)


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

    def test_normalize_parses_keep_and_adjust_pairs(self):
        raw = {
            "keep_element_ids": ["a", "ghost"],
            "adjust_pairs": [
                {"before_id": "a", "after_id": "b", "action": "tighten"},
                {"before_id": "a", "after_id": "b", "action": "loosen"},
                {"before_id": "missing", "after_id": "b", "action": "fix"},
            ],
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "a", "role": "body"},
                        {"element_id": "b", "role": "body"},
                    ],
                }],
            }],
        }
        normalized = _normalize_classification(raw, {"a", "b"})
        self.assertIsNotNone(normalized)
        self.assertIn("a", normalized["keep_element_ids"])
        self.assertIn("a", normalized["ignored_element_ids"])
        self.assertNotIn("ghost", normalized["keep_element_ids"])
        self.assertEqual(len(normalized["adjust_pairs"]), 1)
        self.assertEqual(normalized["adjust_pairs"][0]["action"], "tighten")

    def test_never_moves_name_or_job_label(self):
        elements = [
            el("name", 200, 40, height=28, category="text", fontSize=28, content="Kamil Wrzochalski"),
            el("role", 200, 72, height=14, category="text", fontSize=12, content="AML ANALYST"),
            el("sum-h", 40, 180, height=16, category="text", content="PODSUMOWANIE ZAWODOWE"),
            el("sum-b", 40, 220, height=40, content="Summary text"),
        ]
        classification = {
            "ignored_element_ids": ["name", "role"],
            "keep_element_ids": ["name", "role"],
            "sections": [
                {
                    "id": "header",
                    "order": 0,
                    "blocks": [{
                        "id": "id",
                        "order": 1,
                        "elements": [
                            {"element_id": "name", "role": "name"},
                            {"element_id": "role", "role": "job_label"},
                        ],
                    }],
                },
                {
                    "id": "summary",
                    "order": 1,
                    "blocks": [{
                        "id": "s1",
                        "order": 1,
                        "elements": [
                            {"element_id": "sum-h", "role": "heading"},
                            {"element_id": "sum-b", "role": "body"},
                        ],
                    }],
                },
            ],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("name", patched)
        self.assertNotIn("role", patched)

    def test_caps_each_nudge_to_15px(self):
        elements = [
            el("a", 40, 100, height=20, content="first"),
            el("b", 40, 300, height=20, content="far below"),
        ]
        classification = {
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [
                    {"id": "b1", "order": 1, "elements": [{"element_id": "a", "role": "body"}]},
                    {"id": "b2", "order": 2, "elements": [{"element_id": "b", "role": "body"}]},
                ],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        self.assertIn("b", by_id)
        self.assertLessEqual(abs(by_id["b"]["top"] - 300), MAX_RHYTHM_NUDGE_PX + 0.01)
        self.assertEqual(by_id["b"]["page"], 1)

    def test_deadband_skips_near_perfect_gaps(self):
        # a bottom=120; target STACK=4 → ideal top=124. Actual 126 is within deadband.
        elements = [
            el("a", 40, 100, height=20, content="first"),
            el("b", 40, 100 + 20 + SPACE_STACK + 2, height=20, content="almost ideal"),
            el("c", 40, 400, height=20, content="far outlier"),
        ]
        classification = {
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "a", "role": "body"},
                        {"element_id": "b", "role": "body"},
                        {"element_id": "c", "role": "body"},
                    ],
                }],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("b", patched)
        self.assertIn("c", patched)

    def test_no_cascade_from_one_local_fix(self):
        # Only b overlaps a. c already has a healthy STACK gap from original b —
        # fixing b must not emit a patch for c (no cascade).
        elements = [
            el("a", 40, 100, height=20, content="first"),
            el("b", 40, 110, height=20, content="overlap"),
            el("c", 40, 110 + 20 + SPACE_STACK, height=20, content="ok vs original b"),
        ]
        classification = {
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "a", "role": "body"},
                        {"element_id": "b", "role": "body"},
                        {"element_id": "c", "role": "body"},
                    ],
                }],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"]: patch for patch in group["patches"]}
        self.assertIn("b", patched)
        self.assertNotIn("c", patched)

    def test_gpt_adjust_pairs_limit_scope(self):
        elements = [
            el("a", 40, 100, height=20),
            el("b", 40, 250, height=20),  # loose vs a
            el("c", 40, 400, height=20),  # loose vs b — must stay if not nominated
        ]
        classification = {
            "adjust_pairs": [
                {"before_id": "a", "after_id": "b", "action": "tighten"},
            ],
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [
                    {"id": "b1", "order": 1, "elements": [{"element_id": "a", "role": "body"}]},
                    {"id": "b2", "order": 2, "elements": [{"element_id": "b", "role": "body"}]},
                    {"id": "b3", "order": 3, "elements": [{"element_id": "c", "role": "body"}]},
                ],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertEqual(patched, {"b"})

    def test_keep_element_ids_are_frozen(self):
        elements = [
            el("a", 40, 100, height=20),
            el("keep-me", 40, 250, height=20),
            el("c", 40, 400, height=20),
        ]
        classification = {
            "keep_element_ids": ["keep-me"],
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [
                    {"id": "b1", "order": 1, "elements": [{"element_id": "a", "role": "body"}]},
                    {"id": "b2", "order": 2, "elements": [{"element_id": "keep-me", "role": "body"}]},
                    {"id": "b3", "order": 3, "elements": [{"element_id": "c", "role": "body"}]},
                ],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("keep-me", patched)
        self.assertIn("c", patched)

    def test_nudges_overlapping_jobs_within_cap(self):
        elements = [
            el("h-exp", 40, 200, height=16, category="text", content="DOSWIADCZENIE ZAWODOWE"),
            el("t1", 40, 240, height=18, content="Senior AML"),
            el("m1", 42, 250, height=14, content="PwC"),
            el("b1", 40, 255, height=40, content="Opis 1"),
            el("t2", 41, 245, height=18, content="CSR"),
            el("m2", 40, 250, height=14, content="Amazon"),
            el("b2", 40, 252, height=40, content="Opis 2"),
        ]
        classification = {
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
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        self.assertGreaterEqual(len(by_id), 1)
        for element_id, patch in by_id.items():
            original = next(e for e in elements if e["element_id"] == element_id)
            self.assertLessEqual(abs(patch["top"] - original["top"]), MAX_RHYTHM_NUDGE_PX + 0.01)
            self.assertEqual(patch["left"], original["left"])

    def test_freezes_large_font_name_by_heuristic(self):
        elements = [
            el("nm", 180, 50, height=30, category="text", fontSize=26, content="Anna Nowak"),
            el("x", 40, 200, height=20, content="body a"),
            el("y", 40, 280, height=20, content="body b"),
        ]
        classification = {
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "nm", "role": "other"},
                        {"element_id": "x", "role": "body"},
                        {"element_id": "y", "role": "body"},
                    ],
                }],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        patched = {patch["element_id"] for patch in group["patches"]}
        self.assertNotIn("nm", patched)
        self.assertIn("y", patched)

    def test_falls_back_when_gpt_json_is_empty(self):
        elements = [
            el("a", 40, 120),
            el("b", 55, 200),
            el("c", 40, 280),
        ]
        group, error = pack_rhythm_classification(elements, {"message": "oops"}, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        self.assertLessEqual(len(group["patches"]), 8)
        for patch in group["patches"]:
            original = next(e for e in elements if e["element_id"] == patch["element_id"])
            self.assertLessEqual(abs(patch["top"] - original["top"]), MAX_RHYTHM_NUDGE_PX + 0.01)

    def test_deadband_constant_is_positive(self):
        self.assertGreater(RHYTHM_DEADBAND_PX, 0)
        self.assertLess(RHYTHM_DEADBAND_PX, MAX_RHYTHM_NUDGE_PX)
        self.assertGreaterEqual(MIN_GAP_SAMPLES, 3)

    def test_infers_stack_gap_from_document_majority(self):
        # Author rhythm ≈ 8 px inside the block; one far outlier should move toward 8,
        # not toward the template SPACE_STACK=4.
        stack = 8
        elements = [
            el("a", 40, 100, height=20),
            el("b", 40, 100 + 20 + stack, height=20),
            el("c", 40, 100 + 2 * (20 + stack), height=20),
            el("d", 40, 100 + 3 * (20 + stack), height=20),
            el("e", 40, 100 + 3 * (20 + stack) + 20 + 50, height=20),
        ]
        classification = {
            "sections": [{
                "id": "content",
                "order": 1,
                "blocks": [{
                    "id": "one",
                    "order": 1,
                    "elements": [
                        {"element_id": "a", "role": "body"},
                        {"element_id": "b", "role": "body"},
                        {"element_id": "c", "role": "body"},
                        {"element_id": "d", "role": "body"},
                        {"element_id": "e", "role": "body"},
                    ],
                }],
            }],
        }
        group, error = pack_rhythm_classification(elements, classification, PAGE)
        self.assertEqual(error, "")
        by_id = {patch["element_id"]: patch for patch in group["patches"]}
        self.assertIn("e", by_id)
        self.assertNotIn("b", by_id)
        self.assertNotIn("c", by_id)
        self.assertNotIn("d", by_id)
        # Toward majority 8: d bottom = 100+3*(28)=184 → wait let's compute:
        # a100, b128, c156, d184, e254 (gap from d: 254-204=50)
        # desired e top = 204 + 8 = 212; clamped from 254 → 239
        self.assertLess(by_id["e"]["top"], 254)
        self.assertAlmostEqual(by_id["e"]["top"], 254 - MAX_RHYTHM_NUDGE_PX, places=1)

    def test_infer_gap_profile_requires_min_samples(self):
        from app.services.layout_analysis import extract_bounds, AUTO_LAYOUT_CATEGORIES

        elements = [
            el("a", 40, 100, height=20),
            el("b", 40, 128, height=20),
        ]
        bounds = {
            item["element_id"]: item
            for item in extract_bounds(elements, AUTO_LAYOUT_CATEGORIES)
        }
        flow = [
            {"element_id": "a", "role": "body", "section_id": "s", "block_id": "b"},
            {"element_id": "b", "role": "body", "section_id": "s", "block_id": "b"},
        ]
        profile, meta = _infer_gap_profile(flow, bounds, 842.0)
        self.assertFalse(meta["used_document_majority"])
        self.assertEqual(profile["stack"], float(SPACE_STACK))


if __name__ == "__main__":
    unittest.main()
