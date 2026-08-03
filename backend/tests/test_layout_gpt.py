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

    def test_snapshot_includes_layout_contract_and_flow_role(self):
        elements = [
            el(
                "h1", 50, 100, content="DOŚWIADCZENIE",
                flowRole="section_heading",
            ),
            el("body", 50, 130, content="Opis", category="textarea", flowRole="entry_body"),
        ]
        snap = build_layout_snapshot(elements, PAGE, template_id="words")
        contract = snap["layout_contract"]
        self.assertEqual(contract["template_id"], "words")
        self.assertEqual(contract["spacing_px"]["stack"], 4.0)
        self.assertEqual(contract["spacing_px"]["record"], 10.0)
        self.assertEqual(contract["spacing_px"]["section"], 21.0)
        self.assertEqual(contract["spacing_px"]["after_rule"], 8.0)
        self.assertEqual(
            contract["section_header_gap_px"],
            snap["constraints"]["section_header_gap_px"],
        )
        self.assertIn("Words", contract["hint"])
        by_content = {item["content"]: item for item in snap["elements"]}
        self.assertEqual(by_content["DOŚWIADCZENIE"]["flowRole"], "section_heading")
        self.assertEqual(by_content["Opis"]["flowRole"], "entry_body")

        unknown = build_layout_snapshot(elements, PAGE, template_id="!!!bad")
        self.assertIsNone(unknown["layout_contract"]["template_id"])

    def test_user_prompt_includes_corrector_contract(self):
        snap = build_layout_snapshot([el("a", 70, 100)], PAGE, template_id="monument")
        prompt = build_layout_user_prompt(snap, "Który nagłówek odstaje?")
        self.assertIn("Który nagłówek odstaje?", prompt)
        self.assertIn("layout_contract", prompt)
        self.assertIn("stack=4", prompt)
        self.assertIn("record=10", prompt)
        self.assertIn("section=21", prompt)
        self.assertIn("after_rule=8", prompt)
        self.assertIn("Monument", prompt)
        self.assertIn("changes", prompt)
        self.assertIn("no_changes", prompt)
        self.assertIn("gap = next_row.top", prompt)
        self.assertIn("real_gap", prompt)
        self.assertIn("section_header_gap_px", prompt)
        self.assertIn("około 6 px", prompt)
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
        self.assertIn("Język dla użytkownika", prompt)
        self.assertIn("Nigdy nie pokazuj referencji", prompt)
        self.assertTrue(LAYOUT_CORRECTOR_SYSTEM.startswith("Jesteś korektorem"))
        self.assertIn("category=`textarea`", LAYOUT_CORRECTOR_SYSTEM)
        self.assertIn("layout_contract", LAYOUT_CORRECTOR_SYSTEM)
        self.assertIn("rytm", DEFAULT_LAYOUT_QUESTION.lower())

    def test_user_prompt_standardizes_positive_section_header_gaps(self):
        snap = build_layout_snapshot([el("a", 70, 100)], PAGE)
        prompt = build_layout_user_prompt(snap, "Sprawdź odstępy pod nagłówkami.")

        self.assertEqual(
            snap["constraints"]["section_header_gap_px"],
            {"min": 6.0, "target": 6.0, "max": 10.0, "peer_tolerance": 2.0},
        )
        self.assertIn("około 6 px", prompt)
        self.assertIn("NIGDY nie celuj w 0 px", prompt)
        self.assertIn("za ciasno", prompt)
        self.assertIn('change_type="section_header_gap"', prompt)
        self.assertIn("real_gap_before", prompt)
        self.assertIn("różne dolne odstępy", prompt)

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
        self.assertEqual(title["lineHeightSource"], "text_css_line_height_1")
        shared_row = next(
            row for row in snap["text_rows"] if row["row_ref"] == title["row_ref"]
        )
        self.assertEqual(set(shared_row["member_refs"]), {title["ref"], date["ref"]})
        self.assertEqual(shared_row["bottom"], 274)

    def test_snapshot_normalizes_near_zero_height_text_nodes(self):
        elements = [
            el(
                "icon", 70, 614, width=8, height=0.2, category="text",
                content="◆", fontSize=14, lineHeight=0,
            ),
            el(
                "heading", 82, 614, width=145, height=0.2, category="text",
                content="WYKSZTAŁCENIE", fontSize=14, lineHeight=0,
            ),
            el(
                "degree", 70, 636, width=240, height=14,
                content="Bachelor of Laws",
            ),
        ]

        snap = build_layout_snapshot(elements, PAGE)
        by_content = {item["content"]: item for item in snap["elements"]}
        heading = by_content["WYKSZTAŁCENIE"]
        icon = by_content["◆"]

        self.assertEqual(heading["height"], 14)
        self.assertEqual(heading["bottom"], 628)
        self.assertEqual(icon["row_ref"], heading["row_ref"])
        header_row = next(
            row for row in snap["text_rows"] if row["row_ref"] == heading["row_ref"]
        )
        self.assertEqual(header_row["bottom"], 628)

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
        self.assertIn("odstaje", summary.lower())
        self.assertEqual(len(groups), 1)
        self.assertEqual(issues, [])
        self.assertNotIn("left", groups[0]["reason"].lower())
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
        self.assertIn("Przejrzałem układ CV", summary)
        self.assertEqual(len(groups), 1)
        self.assertEqual(issues, [])
        self.assertNotIn("left", groups[0]["reason"].lower())
        by_id = {p["element_id"]: p for p in groups[0]["patches"]}
        self.assertEqual(by_id["exp"]["left"], 70)
        # Unchanged after == before is skipped by validator.
        self.assertNotIn("exp-line", by_id)

    def test_compile_replaces_technical_layout_copy_with_plain_polish(self):
        elements = [
            el("heading", 70, 200, category="text", content="DOŚWIADCZENIE"),
            el("entry", 70, 230, category="text", content="Senior Analyst"),
        ]
        gpt = {
            "status": "corrected",
            "summary": "e2 ma real_gap 11 px; top-to-top wynosi 23 px.",
            "section_inventory": inventory_for(elements, section="DOŚWIADCZENIE"),
            "changes": [{
                "group": "DOŚWIADCZENIE — e2",
                "reason": "e2 top:230, bottom:241, left:70.",
                "severity": "low",
                "change_type": "section_header_gap",
                "real_gap_before": 11,
                "real_gap_after": 10,
                "elements": [{"ref": "e2", "delta": {"top": -1, "left": 0}}],
            }],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(issues, [])
        self.assertEqual(len(groups), 1)
        visible_copy = " ".join((summary, groups[0]["title"], groups[0]["reason"])).lower()
        self.assertNotRegex(visible_copy, r"\be\d+\b|real_gap|top-to-top|\b(?:top|bottom|left|px)\b")
        self.assertIn("odstęp pod nagłówkiem", groups[0]["title"].lower())

    def test_compile_rejects_collapsing_section_header_gap_to_zero(self):
        elements = [
            el(
                "heading", 70, 614.2, width=130, height=14,
                category="text", content="WYKSZTAŁCENIE", fontSize=14,
            ),
            el(
                "degree", 50, 636.2, width=180, height=12,
                category="text", content="Bachelor of Laws", fontSize=12,
            ),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Przesuń pierwszy wpis edukacji o 8 px w górę.",
            "section_inventory": inventory_for(elements, section="WYKSZTAŁCENIE"),
            "changes": [{
                "group": "WYKSZTAŁCENIE — odstęp pod nagłówkiem",
                "reason": "real_gap 8 px vs 0 px w innych sekcjach.",
                "severity": "medium",
                "change_type": "section_header_gap",
                "real_gap_before": 8,
                "real_gap_after": 0,
                "move_scope": "elements",
                "delta": {"top": -8, "left": 0},
                "elements": [{"ref": "e2"}],
            }],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertTrue(any("zbyt blisko nagłówka" in issue["message"] for issue in issues))
        self.assertIn("Nie zastosowano propozycji", summary)

    def test_compile_allows_standardizing_section_header_gap_to_target(self):
        elements = [
            el(
                "heading", 70, 614.2, width=130, height=14,
                category="text", content="WYKSZTAŁCENIE", fontSize=14,
            ),
            el(
                "degree", 50, 628.2, width=180, height=12,
                category="text", content="Bachelor of Laws", fontSize=12,
            ),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Ujednolić odstęp pod nagłówkiem do 6 px.",
            "section_inventory": inventory_for(elements, section="WYKSZTAŁCENIE"),
            "changes": [{
                "group": "WYKSZTAŁCENIE — odstęp pod nagłówkiem",
                "reason": "real_gap 0 px vs rytm 6 px.",
                "severity": "medium",
                "change_type": "section_header_gap",
                "real_gap_before": 0,
                "real_gap_after": 6,
                "move_scope": "elements",
                "delta": {"top": 6, "left": 0},
                "elements": [{"ref": "e2"}],
            }],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(len(groups), 1)
        self.assertAlmostEqual(groups[0]["patches"][0]["top"], 634.2, places=2)
        self.assertEqual(issues, [])
        self.assertIn("Przejrzałem układ CV", summary)

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

    def test_compile_soft_completes_incomplete_text_inventory_when_safe(self):
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

        # One omitted text that is not part of any move must not kill the reply.
        self.assertEqual(error, "")
        self.assertEqual(groups, [])
        self.assertIn("spójny", summary.lower())
        self.assertTrue(any("pominął drobny element" in issue["message"] for issue in issues))

    def test_compile_keeps_changes_when_omitted_text_is_not_moved(self):
        elements = [
            el("title", 50, 260, height=18, width=220, content="Senior AML Analyst"),
            el("date", 400, 260, height=14, width=120, content="2020-2024"),
            el("footer", 50, 800, height=10, width=40, content="1"),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Wyrównuję datę.",
            "section_inventory": [{
                "section": "DOŚWIADCZENIE",
                "blocks": [{
                    "block_id": "entry-1",
                    "members": [
                        {"ref": "e1", "role": "entry_title"},
                        {"ref": "e2", "role": "entry_date"},
                    ],
                }],
            }],
            "changes": [{
                "group": "Data",
                "reason": "Data odstaje od tytułu.",
                "change_type": "alignment",
                "move_scope": "elements",
                "delta": {"top": 0, "left": -4},
                "elements": [
                    {
                        "ref": "e2",
                        "before": {"top": 260, "left": 400},
                        "after": {"top": 260, "left": 396},
                    },
                ],
            }],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "")
        self.assertEqual(len(groups), 1)
        self.assertAlmostEqual(groups[0]["patches"][0]["left"], 396, places=2)
        self.assertTrue(any("pominął drobny element" in issue["message"] for issue in issues))
        self.assertIn("dat", summary.lower())

    def test_compile_rejects_incomplete_inventory_when_omitted_text_is_moved(self):
        elements = [
            el("title", 50, 260, height=18, width=220, content="Senior AML Analyst"),
            el("date", 400, 260, height=14, width=120, content="2020-2024"),
        ]
        gpt = {
            "status": "corrected",
            "summary": "Wyrównuję datę.",
            # Inventory lists only the title, but the change moves the omitted date.
            "section_inventory": inventory_for(elements[:1], section="DOŚWIADCZENIE"),
            "changes": [{
                "group": "Data",
                "reason": "Data odstaje.",
                "move_scope": "elements",
                "elements": [
                    {
                        "ref": "e2",
                        "before": {"top": 260, "left": 400},
                        "after": {"top": 260, "left": 396},
                    },
                ],
            }],
        }

        groups, issues, summary, error = compile_layout_gpt_response(elements, gpt, PAGE)

        self.assertEqual(error, "incomplete_text_inventory")
        self.assertEqual(groups, [])
        self.assertIn("propozycji ruchu", summary)
        self.assertTrue(any("propozycji ruchu" in issue["message"] for issue in issues))

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
