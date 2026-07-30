"""Tests for GPT layout session snapshot + frontend patch compilation."""
import unittest

from app.services.layout_gpt import (
    MAX_LAYOUT_MOVE_PX,
    build_layout_snapshot,
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
