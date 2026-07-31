import unittest
from unittest.mock import patch

from app.services import ai_assistant_service


class ChatCommandTests(unittest.TestCase):
    def test_normalize_chat_history_keeps_recent_user_and_assistant_turns(self):
        history = [
            {"role": "system", "content": "ignore"},
            {"role": "user", "content": "przenieś wykształcenie"},
            {"role": "assistant", "content": "Przeniosłem sekcję."},
            {"role": "user", "text": "teraz dopasuj kolor"},
            {"role": "assistant", "content": ""},
            {"role": "tool", "content": "nope"},
        ]
        normalized = ai_assistant_service._normalize_chat_history(history)
        self.assertEqual(
            normalized,
            [
                {"role": "user", "content": "przenieś wykształcenie"},
                {"role": "assistant", "content": "Przeniosłem sekcję."},
                {"role": "user", "content": "teraz dopasuj kolor"},
            ],
        )

    def test_chat_prompt_includes_session_history_for_follow_ups(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "color": "#13293D",
                "left": 20, "top": 40, "width": 150, "height": 22, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("HISTORIA SESJI CZATU", user)
            self.assertIn("przenieś wykształcenie do sidebara", user)
            self.assertIn("historię bieżącej sesji", system)
            return {
                "message": "Dopasowuję kolor nagłówka do pozostałych sekcji sidebara.",
                "corrections": [{"element_id": "heading-1", "color": "#37D1EE"}],
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="zmień kolor jak w innych sekcjach",
                history=[
                    {"role": "user", "content": "przenieś wykształcenie do sidebara"},
                    {"role": "assistant", "content": "Przeniosłem WYKSZTAŁCENIE pod JĘZYKI."},
                ],
            )

        self.assertEqual(result["corrections"], [{"element_id": "heading-1", "color": "#37D1EE"}])

    def test_dispatcher_gives_chat_structured_elements_and_filters_hallucinated_fields(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            # The prompt must carry structured per-element data (id + style),
            # not just the element's plain joined text. Position is now
            # intentionally included too (see _extract_positional) — the
            # safety guarantee lives in the OUTPUT filter below, not in
            # withholding position from the prompt.
            self.assertIn('"element_id": "heading-1"', user)
            self.assertIn('"fontSize": 16', user)
            return {
                "message": "Zmieniono rozmiar czcionki nagłówka na 13px.",
                "corrections": [
                    {"element_id": "heading-1", "fontSize": 13, "left": 999, "page": 2},
                ],
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="zmień rozmiar czcionki nagłówka na 13px",
            )

        # The hallucinated left/page fields must be stripped — only the
        # requested, allowed field survives.
        self.assertEqual(result["corrections"], [{"element_id": "heading-1", "fontSize": 13}])

    def test_dispatcher_resolves_position_operation_directive_into_layout_groups(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 100, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn('"left": 100.0', user)
            return {
                "message": "Przesunąłem nagłówek o 50px w lewo.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_element_ids": ["heading-1"],
                    "dx": -50,
                    "dy": 0,
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń ten nagłówek o 50px w lewo",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(len(result["layout_groups"]), 1)
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "heading-1", "left": 50.0, "top": 40.0}],
        )
        self.assertEqual(result["layout_issues"], [])

    def test_dispatcher_moves_a_section_to_another_page_with_reference_alignment(self):
        elements = [
            {
                "element_id": "education-heading",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "left": 20, "top": 40, "width": 150, "height": 22, "page": 1,
            },
            {
                "element_id": "education-entry",
                "category": "textarea",
                "content": "Uniwersytet",
                "fontSize": 11,
                "left": 35, "top": 75, "width": 200, "height": 30, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn('"move_to_page"', system)
            self.assertIn('"target_page"', system)
            self.assertIn("ZAWSZE użyj tego powiązanego elementu", system)
            self.assertIn('"page": 1', user)
            return {
                "message": "Przeniosłem sekcję wykształcenia na stronę 2.",
                "corrections": [],
                "position_operation": {
                    "type": "move_to_page",
                    "target_groups": [["education-heading", "education-entry"]],
                    "target_page": 2,
                    "reference_element_id": "education-heading",
                    "align_element_ids": ["education-entry"],
                    "axis": "x",
                    "anchor": "start",
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przenieś sekcję wykształcenia na stronę 2 i wyrównaj wpis do nagłówka",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(result["layout_groups"][0]["target_page"], 2)
        self.assertEqual(result["layout_groups"][0]["patches"], [
            {"element_id": "education-heading", "left": 20.0, "top": 40.0, "page": 2},
            {"element_id": "education-entry", "left": 20.0, "top": 75.0, "page": 2},
        ])

    def test_dispatcher_clamps_an_overshooting_shift_to_the_page_edge(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            return {
                "message": "Przesuwam nagłówek o 900px w lewo.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_element_ids": ["heading-1"],
                    "dx": -900,
                    "dy": 0,
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń ten nagłówek o 900px w lewo",
                page_size={"width": 595, "height": 842},
            )

        # dx=-900 would leave the page; Python shortens the move to the left edge.
        self.assertEqual(result["layout_issues"], [])
        self.assertEqual(
            result["layout_groups"][0]["patches"],
            [{"element_id": "heading-1", "left": 0.0, "top": 40.0}],
        )

    def test_extract_positional_includes_text_color_and_font_family(self):
        # Style-match chat prompts ("dopasuj kolor do sidebara") need hex colors
        # in context — without them GPT refuses to invent a color.
        elements = [
            {
                "element_id": "languages-heading",
                "category": "text",
                "content": "JĘZYKI",
                "fontSize": 8,
                "fontFamily": "Inter",
                "color": "#37D1EE",
                "left": 24, "top": 400, "width": 100, "height": 12, "page": 1,
            },
            {
                "element_id": "education-heading",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 8,
                "fontFamily": "Inter",
                "color": "#13293D",
                "left": 24, "top": 480, "width": 120, "height": 12, "page": 1,
            },
            {
                "element_id": "education-body",
                "category": "textarea",
                "content": "Informatyka",
                "fontSize": 8.4,
                "left": 24, "top": 500, "width": 136, "height": 20, "page": 1,
            },
        ]
        result = ai_assistant_service._extract_positional(elements)
        by_id = {item["element_id"]: item for item in result}
        self.assertEqual(by_id["languages-heading"]["color"], "#37D1EE")
        self.assertEqual(by_id["education-heading"]["color"], "#13293D")
        self.assertEqual(by_id["education-heading"]["fontFamily"], "Inter")
        # Missing color falls back so the model always sees a hex.
        self.assertEqual(by_id["education-body"]["color"], "#2B2B2B")

    def test_extract_positional_includes_visual_elements_with_geometry(self):
        # _extract_structured() excludes visual elements because they have no
        # editable text, but position instructions must still be able to
        # target images and decorative shapes by id.
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "left": 20, "top": 40, "width": 150, "height": 22, "page": 1,
            },
            {
                "element_id": "photo-1",
                "category": "image",
                "content": "",
                "left": 450, "top": 20, "width": 100, "height": 100, "page": 1,
            },
            {
                "element_id": "section-line",
                "category": "line",
                "content": "",
                "left": 20, "top": 150, "width": 200, "height": 2, "page": 1,
            },
            {
                "element_id": "accent-box",
                "category": "rectangle",
                "content": "",
                "left": 30, "top": 180, "width": 160, "height": 80, "page": 1,
            },
            {
                "element_id": "accent-circle",
                "category": "circle",
                "filled": True,
                "locked": True,
                "left": 400, "top": 180, "width": 60, "height": 60, "page": 1,
            },
            {
                "element_id": "accent-ellipse",
                "category": "ellipse",
                "left": 360, "top": 260, "width": 120, "height": 50, "page": 1,
            },
        ]

        result = ai_assistant_service._extract_positional(elements)

        by_id = {item["element_id"]: item for item in result}
        self.assertIn("photo-1", by_id)
        self.assertEqual(by_id["photo-1"]["category"], "image")
        self.assertEqual(by_id["photo-1"]["left"], 450.0)
        self.assertEqual(by_id["photo-1"]["top"], 20.0)
        self.assertEqual(by_id["section-line"]["category"], "line")
        self.assertEqual(by_id["section-line"]["height"], 2.0)
        self.assertEqual(by_id["accent-box"]["category"], "rectangle")
        self.assertEqual(by_id["accent-box"]["width"], 160.0)
        self.assertEqual(by_id["accent-circle"]["category"], "circle")
        self.assertEqual(by_id["accent-circle"]["height"], 60.0)
        self.assertTrue(by_id["accent-circle"]["filled"])
        self.assertTrue(by_id["accent-circle"]["locked"])
        self.assertEqual(by_id["accent-ellipse"]["category"], "ellipse")
        self.assertEqual(by_id["accent-ellipse"]["width"], 120.0)
        self.assertFalse(by_id["accent-ellipse"]["filled"])

    def test_dispatcher_routes_target_groups_directive_to_block_resolution(self):
        elements = [
            {
                "element_id": "title-1", "category": "text", "content": "Programista",
                "fontSize": 12, "bold": True, "italic": False, "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 15, "page": 1,
            },
            {
                "element_id": "desc-1", "category": "textarea", "content": "Opis obowiązków.",
                "fontSize": 11, "bold": False, "italic": False, "align": "left",
                "left": 20, "top": 58, "width": 150, "height": 20, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            return {
                "message": "Przesunąłem cały wpis o pracę o 30px w dół.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_groups": [["title-1", "desc-1"]],
                    "dx": 0,
                    "dy": 30,
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń cały wpis o pracę 30px w dół",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_issues"], [])
        changed = {p["element_id"]: p["top"] for p in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"title-1": 70.0, "desc-1": 88.0})

    def test_dispatcher_resolves_exact_spacing_within_a_work_history_block(self):
        elements = [
            {
                "element_id": "pwc-role", "category": "text", "content": "Konsultant",
                "fontSize": 12, "bold": True, "italic": False, "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 10, "page": 1,
            },
            {
                "element_id": "pwc-company", "category": "text", "content": "PwC · 2022–2024",
                "fontSize": 11, "bold": False, "italic": False, "align": "left",
                "left": 20, "top": 54, "width": 150, "height": 8, "page": 1,
            },
            {
                "element_id": "pwc-description", "category": "textarea", "content": "Opis obowiązków.",
                "fontSize": 11, "bold": False, "italic": False, "align": "left",
                "left": 20, "top": 66, "width": 150, "height": 20, "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn('"type": "shift"|"align"|"distribute"|"space"', system)
            self.assertIn("ustaw odstępy 10 px", system)
            return {
                "message": "Ustawiłem odstępy 10 px w bloku PwC.",
                "corrections": [],
                "position_operation": {
                    "type": "space",
                    "target_element_ids": ["pwc-role", "pwc-company", "pwc-description"],
                    "axis": "y",
                    "gap": 10,
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="ustaw odstępy 10 px między elementami w bloku PwC",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_issues"], [])
        changed = {patch["element_id"]: patch["top"] for patch in result["layout_groups"][0]["patches"]}
        self.assertEqual(changed, {"pwc-company": 60.0, "pwc-description": 78.0})

    def test_dispatcher_returns_a_reviewed_section_restructure_without_canvas_geometry(self):
        elements = [{
            "element_id": "education",
            "category": "textarea",
            "content": (
                "WYKSZTAŁCENIE\n"
                "Magister ekonomii\n"
                "Uniwersytet Warszawski · 2016–2019\n"
                "Specjalizacja: finanse przedsiębiorstw."
            ),
            "fontSize": 11,
            "fontFamily": "Inter",
            "color": "#223344",
            "left": 40, "top": 100, "width": 260, "height": 76, "page": 1,
        }]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("structure_operation", system)
            self.assertIn("NIE podawaj nowych ID", system)
            self.assertIn('"element_id": "education"', user)
            return {
                "message": "Przygotowałem czytelniejszą strukturę wykształcenia.",
                "corrections": [],
                "position_operation": None,
                "structure_operation": {
                    "type": "restructure_section",
                    "source_element_id": "education",
                    "blocks": [
                        {"role": "heading", "content": "WYKSZTAŁCENIE"},
                        {"role": "entry_title", "content": "Magister ekonomii"},
                        {"role": "entry_meta", "content": "Uniwersytet Warszawski · 2016–2019"},
                        {"role": "body", "content": "Specjalizacja: finanse przedsiębiorstw."},
                    ],
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="sformatuj wykształcenie jako osobne pola",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(result["structure_issues"], [])
        self.assertEqual(len(result["structure_groups"]), 1)
        group = result["structure_groups"][0]
        self.assertEqual(group["remove_element_ids"], ["education"])
        self.assertTrue(all("left" in element and "top" in element for element in group["add_elements"]))
        self.assertTrue(any(element["category"] == "line" for element in group["add_elements"]))

    def test_dispatcher_returns_a_reviewed_delete_group_and_preserves_fixed_background(self):
        elements = [
            {
                "element_id": "background", "category": "image", "left": 0, "top": 0,
                "width": 595, "height": 842, "page": 2, "fixedToPage": True,
            },
            {
                "element_id": "section-heading", "category": "text", "content": "PROFIL",
                "fontSize": 12, "left": 40, "top": 70, "width": 80, "height": 16, "page": 2,
            },
            {
                "element_id": "section-body", "category": "textarea", "content": "Treść profilu",
                "fontSize": 10, "left": 40, "top": 100, "width": 220, "height": 40, "page": 2,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("delete_operation", system)
            self.assertIn("fixedToPage=true", system)
            self.assertIn('"page": 2', user)
            return {
                "message": "Przygotowałem usunięcie treści ze strony 2.",
                "corrections": [],
                "position_operation": None,
                "structure_operation": None,
                "delete_operation": {
                    "type": "delete_elements",
                    "target_element_ids": ["section-heading", "section-body"],
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="usuń wszystkie elementy ze strony 2 poza tłem",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["deletion_issues"], [])
        self.assertEqual(result["deletion_groups"][0]["remove_element_ids"], ["section-heading", "section-body"])

    def test_chat_prompt_requires_cv_scope_gate(self):
        def fake_gpt(system, user, **kwargs):
            self.assertIn("in_scope", system)
            self.assertIn("CV STUDIO", system)
            self.assertIn("Poza zakresem", system)
            return {
                "in_scope": True,
                "message": "Mogę pomóc z CV.",
                "corrections": [],
            }, {"cost_pln_estimate": 0.01}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=[],
                message="jak poprawić podsumowanie zawodowe?",
            )

        self.assertEqual(result["message"], "Mogę pomóc z CV.")
        self.assertEqual(result["usage"]["cost_pln_estimate"], 0.01)

    def test_chat_out_of_scope_refuses_and_strips_operations_but_keeps_usage(self):
        usage = {
            "model": "gpt-test",
            "action": "chat",
            "prompt_tokens": 120,
            "completion_tokens": 40,
            "total_tokens": 160,
            "cost_usd": 0.002,
            "cost_pln_estimate": 0.008,
            "rates_usd_per_1m": {"input": 0.0, "output": 0.0},
        }

        def fake_gpt(system, user, **kwargs):
            return {
                "in_scope": False,
                "message": (
                    "Nie mogę wypowiadać się na ten temat — wykracza poza zakres CV STUDIO. "
                    "Zadaj proszę pytanie o CV lub edycję dokumentu."
                ),
                # Model must not be trusted if it also emits ops — strip them.
                "corrections": [{"element_id": "x", "content": "hack"}],
                "position_operation": {"type": "shift", "dx": 10, "target_element_ids": ["x"]},
                "delete_operation": {"type": "delete_elements", "target_element_ids": ["x"]},
                "tips": ["nie powinno przejść"],
            }, usage

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=[{
                    "element_id": "x",
                    "category": "text",
                    "content": "Test",
                    "left": 10, "top": 10, "width": 40, "height": 20, "page": 1,
                }],
                message="jaka jest stolica Francji?",
            )

        self.assertIn("poza zakres", result["message"].lower())
        self.assertEqual(result["corrections"], [])
        self.assertEqual(result["tips"], [])
        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(result["deletion_groups"], [])
        self.assertEqual(result["clone_groups"], [])
        self.assertEqual(result["usage"], usage)


class DesignRatingTemplateRespectTests(unittest.TestCase):
    def test_extract_typography_marks_fixed_and_locked_chrome(self):
        items = ai_assistant_service._extract_typography([
            {
                "element_id": "page-num",
                "category": "text",
                "content": "01",
                "fontSize": 8,
                "fixedToPage": True,
            },
            {
                "element_id": "sidebar-label",
                "category": "text",
                "content": "KONTAKT",
                "fontSize": 8,
                "locked": True,
            },
            {
                "element_id": "body",
                "category": "textarea",
                "content": "Doświadczenie w SRE.",
                "fontSize": 10,
            },
        ])
        by_id = {item["element_id"]: item for item in items}
        self.assertTrue(by_id["page-num"]["fixedToPage"])
        self.assertTrue(by_id["sidebar-label"]["locked"])
        self.assertNotIn("fixedToPage", by_id["body"])
        self.assertNotIn("locked", by_id["body"])

    def test_design_rating_prompt_rejects_absolute_font_size_critique(self):
        elements = [
            {
                "element_id": "page-num",
                "category": "text",
                "content": "01",
                "fontSize": 8,
                "fixedToPage": True,
                "left": 500,
                "top": 800,
                "width": 20,
                "height": 10,
                "page": 1,
            },
            {
                "element_id": "label",
                "category": "text",
                "content": "KONTAKT",
                "fontSize": 8,
                "left": 40,
                "top": 120,
                "width": 80,
                "height": 10,
                "page": 1,
            },
            {
                "element_id": "name",
                "category": "text",
                "content": "Jan Kowalski",
                "fontSize": 24,
                "bold": True,
                "left": 40,
                "top": 40,
                "width": 200,
                "height": 28,
                "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("świadomym wyborem projektowym", system)
            self.assertIn("Nie obniżaj oceny za „zbyt małą czcionkę”", user)
            self.assertNotIn("tekst główny 10–12 px", user)
            self.assertIn('"fixedToPage": true', user)
            self.assertNotIn("RAPORT GEOMETRII", user)
            return {
                "message": "Szablon jest spójny; etykiety 8 px są częścią systemu.",
                "rating": 8,
                "tips": ["Rozkład oceny: Hierarchia 3/3"],
                "corrections": [
                    {"element_id": "page-num", "fontSize": 12},
                    {"element_id": "label", "bold": True},
                ],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="design_rating",
                elements=elements,
                message="",
            )

        self.assertEqual(result["rating"], 8)
        self.assertEqual(result["corrections"], [{"element_id": "label", "bold": True}])

    def test_design_rating_caps_score_when_elements_overlap(self):
        elements = [
            {
                "element_id": "a",
                "category": "textarea",
                "content": "Pierwszy wpis",
                "fontSize": 11,
                "left": 10,
                "top": 10,
                "width": 40,
                "height": 20,
                "page": 1,
            },
            {
                "element_id": "b",
                "category": "textarea",
                "content": "Drugi wpis",
                "fontSize": 11,
                "left": 10,
                "top": 15,
                "width": 40,
                "height": 20,
                "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertNotIn("RAPORT GEOMETRII", user)
            self.assertNotIn("nakładające się bloki treści", user)
            self.assertNotIn("rating MAX = 5", user)
            return {
                "message": "Typografia jest spójna.",
                "rating": 9,
                "tips": ["Hierarchia OK"],
                "corrections": [],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="design_rating",
                elements=elements,
                message="",
                page_size={"width": 100, "height": 100},
            )

        self.assertEqual(result["rating"], 5)
        self.assertFalse(any("Geometria:" in tip for tip in result["tips"]))
        self.assertNotIn("koliz", result["message"].lower())

    def test_design_rating_ignores_fixed_template_backgrounds(self):
        elements = [
            {
                "element_id": "background-image",
                "category": "image",
                "left": 0,
                "top": 0,
                "width": 100,
                "height": 100,
                "page": 1,
                "zIndex": 0,
                "fixedToPage": True,
            },
            {
                "element_id": "background-rule",
                "category": "line",
                "left": 0,
                "top": 15,
                "width": 100,
                "height": 1,
                "page": 1,
                "zIndex": 1,
                "fixedToPage": True,
            },
            {
                "element_id": "content",
                "category": "textarea",
                "content": "Treść doświadczenia zawodowego.",
                "fontSize": 11,
                "left": 10,
                "top": 5,
                "width": 60,
                "height": 20,
                "page": 1,
                "zIndex": 3,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            return {
                "message": "Hierarchia i typografia są spójne.",
                "rating": 9,
                "tips": ["Hierarchia jest czytelna."],
                "corrections": [],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="design_rating",
                elements=elements,
                message="",
                page_size={"width": 100, "height": 100},
            )

        self.assertEqual(result["rating"], 9)

    def test_design_rating_preserves_intentional_identity_font_and_baseline(self):
        elements = [
            {
                "element_id": "name",
                "category": "text",
                "content": "Eryk Kaczmarek",
                "fontSize": 30,
                "fontFamily": "Times-Roman",
                "bold": True,
                "left": 40,
                "top": 40,
                "width": 220,
                "height": 36,
                "page": 1,
            },
            {
                "element_id": "role",
                "category": "text",
                "content": "Senior Full Stack Developer",
                "fontSize": 9,
                "fontFamily": "Inter",
                "left": 40,
                "top": 86,
                "width": 180,
                "height": 12,
                "page": 1,
            },
            {
                "element_id": "body",
                "category": "textarea",
                "content": "Tworzę niezawodne produkty cyfrowe.",
                "fontSize": 10,
                "fontFamily": "Inter",
                "left": 40,
                "top": 112,
                "width": 300,
                "height": 30,
                "page": 1,
            },
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("świadomym elementem szablonu", system)
            self.assertIn('"templateRole": "primary_identity"', user)
            return {
                "message": "Nazwa używa innego kroju niż reszta dokumentu.",
                "rating": 5,
                "tips": ["Ujednolić font imienia z tekstem głównym."],
                "corrections": [{"element_id": "name", "fontFamily": "Inter"}],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="design_rating",
                elements=elements,
                message="",
            )

        self.assertEqual(result["corrections"], [])
        self.assertEqual(result["rating"], 8)


if __name__ == "__main__":
    unittest.main()
