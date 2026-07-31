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


def inventory_for(elements, *, section="DOKUMENT"):
    """Complete one-block inventory for tests not concerned with semantics."""
    ordered = sorted(
        elements,
        key=lambda element: (
            element.get("page", 1),
            element.get("top", 0),
            element.get("left", 0),
            element["element_id"],
        ),
    )
    refs_by_id = {
        element["element_id"]: f"e{index}"
        for index, element in enumerate(ordered, start=1)
    }
    members = [
        {"ref": refs_by_id[element["element_id"]], "role": "other"}
        for element in elements
        if element["category"] in {"text", "textarea"}
    ]
    return [{
        "section": section,
        "blocks": [{"block_id": "all-text", "members": members}],
    }]


class LayoutGptTests(unittest.TestCase):
    def test_snapshot_includes_geometry_and_pages(self):
        elements = [
            el("a", 70, 100, content="PODSUMOWANIE"),
            el("b", 95, 200, page=2, content="UMIEJETNOSCI"),
            el("bg", 0, 0, width=595, height=842, category="rectangle", fixedToPage=True),
        ]
        snap = build_layout_snapshot(elements, PAGE)
        self.assertEqual(snap["page"]["page_count"], 2)
        by_content = {item["content"]: item for item in snap["elements"]}
        self.assertTrue(by_content["PODSUMOWANIE"]["movable"])
        self.assertFalse(by_content["[rectangle]"]["movable"])
        self.assertIn("fontSize", by_content["PODSUMOWANIE"])
        self.assertEqual(
            [item["ref"] for item in snap["elements"]],
            ["e1", "e2", "e3"],
        )
        self.assertTrue(all("element_id" not in item for item in snap["elements"]))

    def test_user_prompt_includes_corrector_contract(self):
        snap = build_layout_snapshot([el("a", 70, 100)], PAGE)
        prompt = build_layout_user_prompt(snap, "Który nagłówek odstaje?")
        self.assertIn("Który nagłówek odstaje?", prompt)
        self.assertIn("changes", prompt)
        self.assertIn("no_changes", prompt)
        self.assertIn("gap = next_row.top", prompt)
        self.assertIn("real_gap", prompt)
        self.assertIn("6 px", prompt)
        self.assertIn("14 px", prompt)
        self.assertIn("width≈0–3", prompt)
        self.assertIn("section_inventory", prompt)
        self.assertIn("text_element_refs", prompt)
        self.assertIn("category=`textarea`", prompt)
        self.assertIn("move_scope", prompt)
        self.assertIn("affected_blocks", prompt)
        self.assertIn("header_row.bottom", prompt)
        self.assertIn("NIE licz ponownie", prompt)
        self.assertIn("text_rows", prompt)
        self.assertIn("row_top", prompt)
        self.assertIn("effectiveLineHeight", prompt)
        self.assertTrue(LAYOUT_CORRECTOR_SYSTEM.startswith("Jesteś korektorem"))
        self.assertIn("category=`textarea`", LAYOUT_CORRECTOR_SYSTEM)
        self.assertIn("rytm", DEFAULT_LAYOUT_QUESTION.lower())

    def test_snapshot_preserves_narrow_width_for_model_reasoning(self):
        # GPT sees the raw width=3 title and must not discard it; Python no
        # longer invents a section_rhythm metric from unreliable authoring width.
        elements = [
            el("h2", 70, 280, height=18, category="text", content="DOŚWIADCZENIE ZAWODOWE"),
            el("l2", 70, 300, width=400, height=2, category="line"),
            el("title", 50, 306, width=3, height=14, category="text", content="Senior AML Analyst with German"),
        ]
        snap = build_layout_snapshot(elements, PAGE)
        title = next(item for item in snap["elements"] if item["content"] == "Senior AML Analyst with German")
        self.assertEqual(title["width"], 3)
        self.assertEqual(title["bottom"], title["top"] + title["height"])
        self.assertNotIn("section_rhythm", snap)

    def test_snapshot_groups_side_by_side_text_nodes_into_one_row(self):
        elements = [
            el(
                "title", 50, 260, width=210, height=14, category="text",
                content="Senior AML Analyst", fontSize=14, lineHeight=0,
            ),
            el(
                "date", 430, 261, width=90, height=11, category="text",
                content="2021–2024", fontSize=11,
            ),
            el(
                "company", 50, 280, width=300, height=14,
                content="Example Bank",
            ),
        ]

        snap = build_layout_snapshot(elements, PAGE)
        by_content = {item["content"]: item for item in snap["elements"]}
        title = by_content["Senior AML Analyst"]
        date = by_content["2021–2024"]
        company = by_content["Example Bank"]

        self.assertEqual(title["row_ref"], date["row_ref"])
        self.assertIn(date["ref"], title["row_peer_refs"])
        self.assertIn(title["ref"], date["row_peer_refs"])
        self.assertNotEqual(company["row_ref"], title["row_ref"])
        self.assertEqual(title["effectiveLineHeight"], 14)
        self.assertEqual(title["lineHeightSource"], "measured_text_box")
        shared_row = next(
            row for row in snap["text_rows"] if row["row_ref"] == title["row_ref"]
        )
        self.assertEqual(set(shared_row["member_refs"]), {title["ref"], date["ref"]})
        self.assertEqual(shared_row["bottom"], 274)

    def test_snapshot_keeps_unrelated_columns_in_separate_rows(self):
        elements = [
            el(
                "sidebar", 24, 260, width=136, height=14, category="text",
                content="UMIEJĘTNOŚCI",
            ),
            el(
                "main", 220, 260, width=300, height=14, category="text",
                content="PODSUMOWANIE ZAWODOWE",
            ),
        ]

        snap = build_layout_snapshot(elements, PAGE)
        by_content = {item["content"]: item for item in snap["elements"]}

        self.assertNotEqual(
            by_content["UMIEJĘTNOŚCI"]["row_ref"],
            by_content["PODSUMOWANIE ZAWODOWE"]["row_ref"],
        )

    def test_snapshot_inventory_includes_experience_and_education_textareas(self):
        elements = [
            el("exp-heading", 50, 250, category="text", content="DOŚWIADCZENIE ZAWODOWE"),
            el("exp-title", 50, 270, content="Senior AML Analyst"),
            el("exp-meta", 50, 286, content="Bank · Warszawa · 2021–2024"),
            el("exp-body", 50, 302, height=40, content="• Analiza AML\n• Raportowanie"),
            el("edu-heading", 50, 370, category="text", content="WYKSZTAŁCENIE"),
            el("edu-title", 50, 390, content="Bachelor of Laws"),
            el("edu-body", 50, 406, content="Uniwersytet · 2020"),
        ]

        snap = build_layout_snapshot(elements, PAGE)

        self.assertEqual(snap["text_element_count"], len(elements))
        self.assertEqual(set(snap["text_element_refs"]), {
            "e1", "e2", "e3", "e4", "e5", "e6", "e7",
        })
        self.assertEqual(
            {item["ref"] for item in snap["elements"]},
            set(snap["text_element_refs"]),
        )

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
            "section_inventory": inventory_for(elements),
            "changes": [{
                "group": "DOŚWIADCZENIE — left",
                "reason": "PODSUMOWANIE left:70, DOŚWIADCZENIE left:95.",
                "severity": "high",
                "delta": {"top": 0, "left": -25},
                "elements": [
                    {
                        "ref": "e2",
                        "before": {"top": 280, "left": 95},
                        "after": {"top": 280, "left": 70},
                    },
                    {
                        "ref": "e3",
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
            "section_inventory": [{
                "section": "DOŚWIADCZENIE ZAWODOWE",
                "blocks": [{
                    "block_id": "experience-entry-1",
                    "members": [
                        {"ref": "e1", "role": "entry_title"},
                        {"ref": "e2", "role": "entry_meta"},
                        {"ref": "e3", "role": "entry_body"},
                    ],
                }],
            }],
            "changes": [{
                "group": "Citibank block",
                "reason": "gap 18 vs 13",
                "move_scope": "blocks",
                "affected_blocks": [{
                    "section": "DOŚWIADCZENIE ZAWODOWE",
                    "block_id": "experience-entry-1",
                }],
                "delta": {"top": -5, "left": 0},
                "elements": [
                    {"ref": "e1"},
                    {"ref": "e2"},
                    {"ref": "e3"},
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

    def test_compile_rejects_incomplete_block_move(self):
        elements = [
            el("title", 50, 460, height=18),
            el("firm", 50, 480, height=16),
            el("desc", 50, 500, height=40),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Przesuń cały wpis.",
            "section_inventory": [{
                "section": "DOŚWIADCZENIE ZAWODOWE",
                "blocks": [{
                    "block_id": "experience-entry-1",
                    "members": [
                        {"ref": "e1", "role": "entry_title"},
                        {"ref": "e2", "role": "entry_meta"},
                        {"ref": "e3", "role": "entry_body"},
                    ],
                }],
            }],
            "changes": [{
                "group": "Niekompletny wpis",
                "reason": "Model pominął opis.",
                "move_scope": "blocks",
                "affected_blocks": [{
                    "section": "DOŚWIADCZENIE ZAWODOWE",
                    "block_id": "experience-entry-1",
                }],
                "delta": {"top": -5, "left": 0},
                "elements": [
                    {"ref": "e1"},
                    {"ref": "e2"},
                ],
            }],
        }

        groups, issues, _summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertTrue(any("niekompletne" in issue["message"] for issue in issues))

    def test_compile_rejects_incomplete_text_inventory(self):
        elements = [
            el("exp", 50, 260, content="Senior AML Analyst"),
            el("edu", 50, 390, content="Bachelor of Laws"),
        ]
        gpt = {
            "status": "no_changes",
            "summary": "Układ jest spójny.",
            "section_inventory": inventory_for(elements[:1]),
            "changes": [],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "incomplete_text_inventory")
        self.assertEqual(groups, [])
        self.assertIn("pominięto 1", summary)
        self.assertTrue(any("kompletnego inwentarza" in issue["message"] for issue in issues))

    def test_compile_rejects_unknown_compact_reference(self):
        elements = [el("exp", 50, 260, content="Senior AML Analyst")]
        gpt = {
            "status": "no_changes",
            "summary": "Układ jest spójny.",
            "section_inventory": [{
                "section": "DOŚWIADCZENIE",
                "blocks": [{
                    "block_id": "entry-1",
                    "members": [{"ref": "e99", "role": "entry_title"}],
                }],
            }],
            "changes": [],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "unknown_element_ref")
        self.assertEqual(groups, [])
        self.assertIn("nieznane referencje", summary)
        self.assertTrue(any("nieznane referencje" in issue["message"] for issue in issues))

    def test_compile_tolerates_known_decoration_in_text_inventory_members(self):
        elements = [
            el("heading", 50, 100, category="text", content="WYKSZTAŁCENIE"),
            el("rule", 50, 120, width=300, height=2, category="line"),
        ]
        gpt = {
            "status": "no_changes",
            "summary": "Układ jest spójny.",
            "section_inventory": [{
                "section": "WYKSZTAŁCENIE",
                "blocks": [{
                    "block_id": "header",
                    # e2 is a known line. It is tolerated but not counted as text.
                    "members": [
                        {"ref": "e1", "role": "section_header"},
                        {"ref": "e2", "role": "decoration"},
                    ],
                }],
            }],
            "changes": [],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertEqual(issues, [])
        self.assertEqual(summary, "Układ jest spójny.")

    def test_status_no_changes(self):
        elements = [el("a", 40, 200)]
        groups, issues, summary, error = compile_layout_gpt_response(
            elements,
            {
                "status": "no_changes",
                "summary": "Wszystko spójne.",
                "section_inventory": inventory_for(elements),
                "changes": [],
            },
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
