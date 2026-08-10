"""Tests for structured rating fields and the translate assistant action."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes import ai_assistant as ai_assistant_route
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.services import ai_assistant_service
from app.testing_support import ensure_test_auth_env


class SafeResultSchemaTests(unittest.TestCase):
    def test_safe_result_keeps_categories_and_strips_rozkład_tip(self):
        raw = {
            "message": "Dobre CV.",
            "rating": 7,
            "tips": [
                "Rozkład oceny: Sekcje 2/2 + Doświadczenie 2/3",
                "Dodaj metryki do doświadczenia.",
            ],
            "categories": [
                {"id": "experience", "label": "Doświadczenie", "score": 2, "max": 3},
                {"id": "bad", "label": "", "score": 1, "max": 1},
            ],
            "strengths": ["Mocny profil AML"],
            "priorities": [
                {"title": "Dodaj metryki", "description": "Uzupełnij % w bulletach."},
                "Skróć podsumowanie",
            ],
            "corrections": [],
            "web_sources": [],
        }
        result = ai_assistant_service._safe_result(raw)
        self.assertEqual(result["rating"], 7)
        self.assertEqual(result["tips"], ["Dodaj metryki do doświadczenia."])
        self.assertEqual(
            result["categories"],
            [{"id": "experience", "label": "Doświadczenie", "score": 2.0, "max": 3.0}],
        )
        self.assertEqual(result["strengths"], ["Mocny profil AML"])
        self.assertEqual(
            result["priorities"],
            [
                {"title": "Dodaj metryki", "description": "Uzupełnij % w bulletach."},
                {"title": "Skróć podsumowanie", "description": ""},
            ],
        )

    def test_safe_result_rewrites_ten_scale_scores_to_percent(self):
        # Dashboard shows rating×10 as %; prose must not keep "8/10" next to "80%".
        raw = {
            "message": "Oceniam to CV na 8/10. Mocny profil AML.",
            "rating": 8,
            "tips": ["Podnieś wynik z 7 / 10 po dodaniu metryk."],
            "strengths": ["Ocena blisko 10/10 w kompletności"],
            "priorities": [
                {
                    "title": "Język",
                    "description": "To obniża ocenę do 5/10.",
                }
            ],
            "corrections": [],
            "web_sources": [],
        }
        result = ai_assistant_service._safe_result(raw)
        self.assertEqual(result["message"], "Oceniam to CV na 80%. Mocny profil AML.")
        self.assertEqual(result["tips"], ["Podnieś wynik z 70% po dodaniu metryk."])
        self.assertEqual(result["strengths"], ["Ocena blisko 100% w kompletności"])
        self.assertEqual(
            result["priorities"],
            [{"title": "Język", "description": "To obniża ocenę do 50%."}],
        )


class EmploymentTenseAnnotationTests(unittest.TestCase):
    def test_annotate_marks_present_and_past_roles_from_period_lines(self):
        elements = [
            {
                "element_id": "cur_period",
                "category": "text",
                "content": "08/2023 – Obecnie",
                "page": 1,
                "top": 20,
                "left": 0,
            },
            {
                "element_id": "cur_bullets",
                "category": "textarea",
                "content": "Tworzyłem profile KYC.",
                "page": 1,
                "top": 40,
                "left": 0,
            },
            {
                "element_id": "past_period",
                "category": "text",
                "content": "01/2023 – 05/2023",
                "page": 1,
                "top": 120,
                "left": 0,
            },
            {
                "element_id": "past_bullets",
                "category": "textarea",
                "content": "Weryfikowałem zamówienia.",
                "page": 1,
                "top": 140,
                "left": 0,
            },
            {
                "element_id": "edu_header",
                "category": "text",
                "content": "EDUKACJA I KOMPETENCJE",
                "page": 1,
                "top": 220,
                "left": 0,
            },
            {
                "element_id": "edu_body",
                "category": "textarea",
                "content": "Studia ekonomiczne.",
                "page": 1,
                "top": 240,
                "left": 0,
            },
        ]

        tense_map = ai_assistant_service._annotate_employment_tense(elements)
        self.assertEqual(tense_map.get("cur_bullets"), "present")
        self.assertEqual(tense_map.get("past_bullets"), "past")
        self.assertNotIn("edu_body", tense_map)

        structured = {
            item["element_id"]: item
            for item in ai_assistant_service._extract_structured(elements)
        }
        self.assertEqual(structured["cur_bullets"]["employment_tense"], "present")
        self.assertEqual(structured["past_bullets"]["employment_tense"], "past")

    def test_language_prompt_forbids_rewriting_past_roles_to_present(self):
        elements = [
            {
                "element_id": "past_period",
                "category": "text",
                "content": "07/2022 – 12/2022",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "past_bullets",
                "category": "textarea",
                "content": "Prowadziłem procesy CDD.",
                "page": 1,
                "top": 30,
                "left": 0,
            },
        ]
        captured = {}

        def fake_gpt_result(system, user, **kwargs):
            captured["system"] = system
            captured["user"] = user
            return {
                "message": "ok",
                "rating": None,
                "tips": [],
                "corrections": [],
                "web_sources": [],
            }

        with patch.object(ai_assistant_service, "_gpt_result", side_effect=fake_gpt_result):
            ai_assistant_service._check_style(
                ai_assistant_service._extract_text(elements),
                elements,
            )

        self.assertIn("employment_tense", captured["user"])
        self.assertIn('"employment_tense": "past"', captured["user"])
        self.assertIn("NIGDY nie zamieniaj czasu przeszłego", captured["user"])
        self.assertIn("Obecnie", captured["system"])


class TranslateActionTests(unittest.TestCase):
    def test_translate_dispatches_with_target_language(self):
        elements = [
            {
                "element_id": "bio",
                "category": "textarea",
                "content": "Doświadczony analityk AML.",
            }
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("angielski", user)
            self.assertIn("bio", user)
            return {
                "message": "Przetłumaczono 1 element.",
                "rating": None,
                "tips": ["Sprawdź nazwy własne."],
                "corrections": [
                    {"element_id": "bio", "content": "Experienced AML analyst."},
                ],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="translate",
                elements=elements,
                target_language="en",
            )

        self.assertEqual(
            result["corrections"],
            [{"element_id": "bio", "content": "Experienced AML analyst."}],
        )
        self.assertIn("Przetłumaczono", result["message"])

    def test_shorten_dispatches_and_returns_content_corrections(self):
        elements = [
            {
                "element_id": "sum",
                "category": "textarea",
                "content": (
                    "Bardzo długie podsumowanie zawodowe z wieloma powtórzeniami "
                    "i ogólnikami, które można znacząco skrócić bez utraty sensu."
                ),
            }
        ]

        def fake_gpt(system, user, **kwargs):
            # The prompt must lead with shortening intent, not strengthening,
            # and forbid inventing new facts.
            self.assertIn("skrócić", user)
            self.assertIn("NIE wymyślasz", system)
            self.assertIn("NIE WYMYŚLAJ", user)
            return {
                "message": "Skrócono podsumowanie z 5 do 3 wierszy.",
                "rating": None,
                "tips": ["Sprawdź, czy skrócone punkty oddają najważniejsze osiągnięcia."],
                "corrections": [
                    {"element_id": "sum", "content": "Zwięzłe, mocne podsumowanie."},
                ],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="shorten",
                elements=elements,
            )

        self.assertEqual(
            result["corrections"],
            [{"element_id": "sum", "content": "Zwięzłe, mocne podsumowanie."}],
        )
        self.assertIn("Skrócono", result["message"])


class _FakeQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class _FakeDB:
    def query(self, *args, **kwargs):
        return _FakeQuery()


class TranslateRouteValidationTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        app.dependency_overrides[verify_token] = lambda: {"sub": "testuser"}

        def _fake_get_db():
            yield _FakeDB()

        app.dependency_overrides[get_db] = _fake_get_db
        self.client = TestClient(app)
        self._user_patch = patch.object(
            ai_assistant_route,
            "get_user_by_username",
            return_value=SimpleNamespace(id=1, username="testuser"),
        )
        self._entitlement_patch = patch.object(
            ai_assistant_route, "assert_can_use_ai_action", return_value=None
        )
        self._record_patch = patch.object(
            ai_assistant_route, "charge_ai_credits", return_value=None
        )
        self._user_patch.start()
        self._entitlement_patch.start()
        self._record_patch.start()

    def tearDown(self):
        self._user_patch.stop()
        self._entitlement_patch.stop()
        self._record_patch.stop()
        app.dependency_overrides.clear()

    def test_translate_requires_target_language(self):
        response = self.client.post(
            "/ai/assistant",
            json={"action": "translate", "elements": []},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("target_language", response.json()["detail"])

    def test_translate_rejects_unknown_language(self):
        response = self.client.post(
            "/ai/assistant",
            json={"action": "translate", "elements": [], "target_language": "xx"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Nieobsługiwany język", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
