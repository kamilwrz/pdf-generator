"""Tests for GPT layout session snapshot + frontend patch compilation."""
import unittest

from app.services.layout_gpt import (
    DEFAULT_LAYOUT_QUESTION,
    LAYOUT_CORRECTOR_SYSTEM,
    MAX_LAYOUT_MOVE_PX,
    build_layout_snapshot,
    build_layout_user_prompt,
    build_section_rhythm,
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
        self.assertIn("section_rhythm", prompt)
        self.assertTrue(LAYOUT_CORRECTOR_SYSTEM.startswith("Jesteś korektorem"))
        self.assertIn("rytm", DEFAULT_LAYOUT_QUESTION.lower())

    def test_section_rhythm_flags_header_to_body_outliers(self):
        # Two headers ~14–16 px to body; DOŚWIADCZENIE only ~8 px (user: 6 vs 14).
        elements = [
            el("h1", 70, 180, height=16, category="text", content="PODSUMOWANIE ZAWODOWE", bold=True),
            el("l1", 70, 198, width=400, height=2, category="line"),
            el("b1", 70, 212, height=40, content="Aml analyst summary paragraph"),

            el("h2", 70, 280, height=16, category="text", content="DOŚWIADCZENIE ZAWODOWE", bold=True),
            el("l2", 70, 298, width=400, height=2, category="line"),
            el("b2", 70, 304, height=20, content="Senior AML Analyst"),

            el("h3", 70, 400, height=16, category="text", content="UMIEJĘTNOŚCI", bold=True),
            el("l3", 70, 418, width=400, height=2, category="line"),
            el("b3", 70, 432, height=20, content="Python and SQL skills"),
        ]
        snap = build_layout_snapshot(elements, PAGE)
        rhythm = snap["section_rhythm"]
        self.assertEqual(len(rhythm["sections"]), 3)
        by_section = {row["section"]: row for row in rhythm["sections"]}
        # With underlines, primary_gap is line→body (visual ruler under the rule).
        self.assertEqual(by_section["DOŚWIADCZENIE ZAWODOWE"]["primary_metric"], "line_to_body_gap")
        self.assertAlmostEqual(by_section["DOŚWIADCZENIE ZAWODOWE"]["primary_gap"], 4.0, places=1)
        self.assertAlmostEqual(by_section["PODSUMOWANIE ZAWODOWE"]["primary_gap"], 12.0, places=1)
        self.assertAlmostEqual(by_section["UMIEJĘTNOŚCI"]["primary_gap"], 12.0, places=1)
        outlier_sections = {o["section"] for o in rhythm["outliers"]}
        self.assertIn("DOŚWIADCZENIE ZAWODOWE", outlier_sections)
        self.assertTrue(any(c["section"] == "DOŚWIADCZENIE ZAWODOWE" for c in rhythm["comparison"]))
        self.assertEqual(
            build_section_rhythm(snap["elements"])["median_primary_gap"],
            rhythm["median_primary_gap"],
        )

    def test_section_rhythm_uses_narrow_width_job_title(self):
        # Regression: freestyle titles often store width=3. Old filter used
        # left+width and skipped them, then reported ~51 px to a wide textarea.
        elements = [
            el("h1", 70, 180, height=18, category="text", content="PODSUMOWANIE ZAWODOWE"),
            el("l1", 70, 200, width=400, height=2, category="line"),
            el("b1", 70, 214, width=400, height=40, content="Summary paragraph about aml"),

            el("h2", 70, 280, height=18, category="text", content="DOŚWIADCZENIE ZAWODOWE"),
            el("l2", 70, 300, width=400, height=2, category="line"),
            # Title slightly left of header, tiny stored width (like the editor panel).
            el("title", 50, 306, width=3, height=14, category="text", content="Senior AML Analyst with German"),
            el("desc", 50, 357, width=400, height=40, content="Long experience description textarea"),

            el("h3", 70, 450, height=18, category="text", content="WYKSZTAŁCENIE"),
            el("l3", 70, 470, width=400, height=2, category="line"),
            el("edu", 50, 476, width=3, height=14, category="text", content="Bachelor of Laws"),
        ]
        rhythm = build_section_rhythm(build_layout_snapshot(elements, PAGE)["elements"])
        by_section = {row["section"]: row for row in rhythm["sections"]}
        self.assertEqual(by_section["DOŚWIADCZENIE ZAWODOWE"]["body_element_id"], "title")
        self.assertAlmostEqual(by_section["DOŚWIADCZENIE ZAWODOWE"]["primary_gap"], 4.0, places=1)
        self.assertEqual(by_section["WYKSZTAŁCENIE"]["body_element_id"], "edu")
        self.assertAlmostEqual(by_section["WYKSZTAŁCENIE"]["primary_gap"], 4.0, places=1)
        self.assertAlmostEqual(by_section["PODSUMOWANIE ZAWODOWE"]["primary_gap"], 12.0, places=1)
        # Must NOT invent a 51 px gap to the description.
        self.assertLess(by_section["DOŚWIADCZENIE ZAWODOWE"]["primary_gap"], 20)

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
