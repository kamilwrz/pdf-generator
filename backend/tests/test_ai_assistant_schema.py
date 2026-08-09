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
