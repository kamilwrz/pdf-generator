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
            # not just the element's plain joined text.
            self.assertIn('"element_id": "heading-1"', user)
            self.assertIn('"fontSize": 16', user)
            # And it must never carry positional data GPT has no business touching.
            self.assertNotIn('"left":', user)
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


if __name__ == "__main__":
    unittest.main()
