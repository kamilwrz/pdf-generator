"""Tests for GPT layout session snapshot + frontend patch compilation."""
import unittest

from app.services.layout_gpt import (
    DEFAULT_LAYOUT_QUESTION,
    LAYOUT_CORRECTOR_SYSTEM,
    MAX_LAYOUT_MOVE_PX,
    build_layout_snapshot,
    build_layout_user_prompt,
    compile_layout_gpt_response,
)


PAGE = {"width": 595, "height": 842}


def el(element_id, left, top, *, width=200, height=20, page=1, category="textarea", **extra):
    return {
        "element_id": element_id,
        "category": category,
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "page": page,
        "fontSize": 11,
        "content": element_id,
        "zIndex": 2,
        **extra,
    }


class LayoutGptTests(unittest.TestCase):
    def test_snapshot_includes_geometry_and_pages(self):
        elements = [
            el("a", 70, 100, content="PODSUMOWANIE"),
            el("b", 95, 200, page=2, content="UMIEJETNOSCI"),
            el("bg", 0, 0, width=595, height=842, category="rectangle", fixedToPage=True),
        ]
        snap = build_layout_snapshot(elements, PAGE)
        self.assertEqual(snap["page"]["page_count"], 2)
        by_id = {item["element_id"]: item for item in snap["elements"]}
        self.assertTrue(by_id["a"]["movable"])
        self.assertFalse(by_id["bg"]["movable"])
        self.assertIn("fontSize", by_id["a"])

    def test_user_prompt_includes_corrector_contract(self):
        snap = build_layout_snapshot([el("a", 70, 100)], PAGE)
        prompt = build_layout_user_prompt(snap, "Który nagłówek odstaje?")
        self.assertIn("Który nagłówek odstaje?", prompt)
        self.assertIn("changes", prompt)
        self.assertIn("no_changes", prompt)
        self.assertIn("gap = next.top", prompt)
        self.assertTrue(LAYOUT_CORRECTOR_SYSTEM.startswith("Jesteś korektorem"))
        self.assertIn("rytm", DEFAULT_LAYOUT_QUESTION.lower())

    def test_compile_findings_to_layout_groups(self):
        elements = [
            el("sum", 70, 200, category="text", content="PODSUMOWANIE ZAWODOWE"),
            el("exp", 95, 280, category="text", content="DOSWIADCZENIE ZAWODOWE"),
        ]
        gpt = {
            "summary": "Nagłówek doświadczenia odstaje w prawo.",
            "findings": [{
                "id": "exp-left",
                "severity": "high",
                "title": "DOŚWIADCZENIE — za daleko w prawo",
                "analysis": "PODSUMOWANIE left:70, DOŚWIADCZENIE left:95 — odstaje o 25 px.",
                "moves": [{"element_id": "exp", "left": 70, "top": 280}],
            }],
        }
        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)
        self.assertEqual(error, "")
        self.assertIn("odstaje", summary.lower() + issues[0]["message"].lower())
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["patches"][0]["left"], 70)

    def test_compile_changes_format_with_after(self):
        elements = [
            el("sum", 70, 200, category="text", content="PODSUMOWANIE"),
            el("exp", 95, 280, category="text", content="DOSWIADCZENIE"),
            el("exp-line", 70, 295, width=200, height=2, category="line"),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Nagłówek DOŚWIADCZENIE odstaje o 25 px w prawo.",
            "changes": [{
                "group": "DOŚWIADCZENIE — left",
                "reason": "PODSUMOWANIE left:70, DOŚWIADCZENIE left:95.",
                "severity": "high",
                "delta": {"top": 0, "left": -25},
                "elements": [
                    {
                        "element_id": "exp",
                        "before": {"top": 280, "left": 95},
                        "after": {"top": 280, "left": 70},
                    },
                    {
                        "element_id": "exp-line",
                        "before": {"top": 295, "left": 70},
                        "after": {"top": 295, "left": 70},
                    },
                ],
            }],
        }
        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)
        self.assertEqual(error, "")
        self.assertIn("25", summary)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(issues), 1)
        by_id = {p["element_id"]: p for p in groups[0]["patches"]}
        self.assertEqual(by_id["exp"]["left"], 70)
        # Unchanged after == before is skipped by validator.
        self.assertNotIn("exp-line", by_id)

    def test_compile_changes_shared_delta_on_ids(self):
        elements = [
            el("title", 50, 460, height=18),
            el("firm", 50, 480, height=16),
            el("desc", 50, 500, height=40),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Citibank o 5 px za nisko.",
            "changes": [{
                "group": "Citibank block",
                "reason": "gap 18 vs 13",
                "delta": {"top": -5, "left": 0},
                "elements": [
                    {"element_id": "title"},
                    {"element_id": "firm"},
                    {"element_id": "desc"},
                ],
            }],
        }
        groups, _issues, _summary, error = compile_layout_gpt_response(elements, gpt, PAGE)
        self.assertEqual(error, "")
        self.assertEqual(len(groups), 1)
        tops = {p["element_id"]: p["top"] for p in groups[0]["patches"]}
        self.assertAlmostEqual(tops["title"], 455, places=2)
        self.assertAlmostEqual(tops["firm"], 475, places=2)
        self.assertAlmostEqual(tops["desc"], 495, places=2)

    def test_status_no_changes(self):
        elements = [el("a", 40, 200)]
        groups, issues, summary, error = compile_layout_gpt_response(
            elements,
            {"status": "no_changes", "summary": "Wszystko spójne.", "changes": []},
            PAGE,
        )
        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertEqual(issues, [])
        self.assertIn("spójne", summary.lower())

    def test_compile_clamps_extreme_moves(self):
        elements = [el("a", 40, 200), el("b", 40, 300)]
        gpt = {
            "summary": "test",
            "findings": [{
                "id": "far",
                "title": "Za daleko",
                "analysis": "duża dziura",
                "moves": [{"element_id": "b", "left": 40, "top": 10}],
            }],
        }
        groups, _issues, _summary, error = compile_layout_gpt_response(elements, gpt, PAGE)
        self.assertEqual(error, "")
        top = groups[0]["patches"][0]["top"]
        self.assertGreaterEqual(top, 300 - MAX_LAYOUT_MOVE_PX - 0.01)

    def test_qa_without_moves_is_ok(self):
        elements = [el("a", 40, 200)]
        groups, issues, summary, error = compile_layout_gpt_response(
            elements,
            {"summary": "Array to lista elementów A4 ze współrzędnymi.", "findings": []},
            PAGE,
        )
        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertEqual(issues, [])
        self.assertIn("Array", summary)


if __name__ == "__main__":
    unittest.main()
