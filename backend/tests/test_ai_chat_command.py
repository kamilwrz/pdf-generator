import unittest
from unittest.mock import patch

from app.services import ai_assistant_service


class ChatCommandTests(unittest.TestCase):
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

        def fake_gpt(system, user):
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
            }

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

        def fake_gpt(system, user):
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
            }

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

    def test_dispatcher_reports_an_issue_instead_of_a_broken_position_operation(self):
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

        def fake_gpt(system, user):
            return {
                "message": "Przesuwam nagłówek o 900px w lewo.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_element_ids": ["heading-1"],
                    "dx": -900,
                    "dy": 0,
                },
            }

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="przesuń ten nagłówek o 900px w lewo",
                page_size={"width": 595, "height": 842},
            )

        self.assertEqual(result["layout_groups"], [])
        self.assertEqual(len(result["layout_issues"]), 1)

    def test_extract_positional_includes_visual_elements_with_geometry(self):
        # _extract_structured() excludes visual elements because they have no
        # editable text, but position instructions must still be able to
        # target a photo, line, or decorative rectangle by id.
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

        def fake_gpt(system, user):
            return {
                "message": "Przesunąłem cały wpis o pracę o 30px w dół.",
                "corrections": [],
                "position_operation": {
                    "type": "shift",
                    "target_groups": [["title-1", "desc-1"]],
                    "dx": 0,
                    "dy": 30,
                },
            }

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

        def fake_gpt(system, user):
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
            }

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


if __name__ == "__main__":
    unittest.main()
