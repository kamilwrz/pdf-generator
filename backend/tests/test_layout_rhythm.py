"""Tests for soft freestyle vertical-gap unification (±15 px, frozen identity)."""
import unittest

from app.services.layout_rhythm import (
    MAX_RHYTHM_NUDGE_PX,
    pack_rhythm_classification,
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

    def test_never_moves_name_or_job_label(self):
        elements = [
            el("name", 200, 40, height=28, category="text", fontSize=28, content="Kamil Wrzochalski"),
            el("role", 200, 72, height=14, category="text", fontSize=12, content="AML ANALYST"),
            el("sum-h", 40, 180, height=16, category="text", content="PODSUMOWANIE ZAWODOWE"),
            el("sum-b", 40, 220, height=40, content="Summary text"),
        ]
        classification = {
            "ignored_element_ids": ["name", "role"],
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
            el("b", 40, 300, height=20, content="far below"),  # wants ~138, delta >> 15
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
        for element_id, patch in by_id.items():
            original = next(e for e in elements if e["element_id"] == element_id)
            self.assertLessEqual(abs(patch["top"] - original["top"]), MAX_RHYTHM_NUDGE_PX + 0.01)
            self.assertEqual(patch["left"], original["left"])

    def test_freezes_large_font_name_by_heuristic(self):
        elements = [
            el("nm", 180, 50, height=30, category="text", fontSize=26, content="Anna Nowak"),
            el("x", 40, 200, height=20, content="body a"),
            el("y", 40, 230, height=20, content="body b"),
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

    def test_falls_back_when_gpt_json_is_empty(self):
        elements = [
            el("a", 40, 120),
            el("b", 55, 200),
            el("c", 40, 280),
        ]
        group, error = pack_rhythm_classification(elements, {"message": "oops"}, PAGE)
        self.assertEqual(error, "")
        self.assertIsNotNone(group)
        for patch in group["patches"]:
            original = next(e for e in elements if e["element_id"] == patch["element_id"])
            self.assertLessEqual(abs(patch["top"] - original["top"]), MAX_RHYTHM_NUDGE_PX + 0.01)


if __name__ == "__main__":
    unittest.main()
