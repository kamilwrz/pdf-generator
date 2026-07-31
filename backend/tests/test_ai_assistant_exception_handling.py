import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from openai import RateLimitError

from app.api.routes import ai_assistant as ai_assistant_route
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.services import ai_assistant_service
from app.services.ai_assistant_service import AIServiceError



class _FakeQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class _FakeDB:
    def query(self, *args, **kwargs):
        return _FakeQuery()


def _fake_verify_token():
    return {"sub": "testuser"}


def _fake_get_db():
    yield _FakeDB()


class AiAssistantExceptionHandlingTests(unittest.TestCase):
    """Regression tests for the bug caught during /plan-eng-review's outside-voice
    pass: the route's own `except Exception` used to catch AIServiceError before
    FastAPI's app-level exception_handler ever ran, silently defeating the fix.
    These tests exercise the real route + app-level handler together (not just
    analyze_action in isolation) so a re-introduced broad except is caught.
    """

    def setUp(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
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

    def _post(self):
        return self.client.post(
            "/ai/assistant",
            json={"action": "rating", "elements": []},
        )

    def test_ai_service_error_reaches_app_handler_with_generic_message(self):
        def raise_ai_service_error(**kwargs):
            raise AIServiceError("OpenAI request failed: RateLimitError", action="rating")

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_ai_service_error):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        detail = response.json()["detail"]
        self.assertEqual(detail, "Asystent AI jest chwilowo niedostępny, spróbuj ponownie.")

    def test_ai_service_error_never_leaks_raw_exception_text(self):
        def raise_ai_service_error(**kwargs):
            raise AIServiceError("OpenAI request failed: RateLimitError — quota exceeded for org-xyz")

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_ai_service_error):
            response = self._post()

        body = response.text
        self.assertNotIn("quota exceeded", body)
        self.assertNotIn("org-xyz", body)

    def test_unexpected_non_ai_exception_returns_generic_message_not_leaked(self):
        def raise_unexpected(**kwargs):
            raise KeyError("some_internal_field_name")

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_unexpected):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        detail = response.json()["detail"]
        self.assertEqual(detail, "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.")
        self.assertNotIn("some_internal_field_name", response.text)

    def test_gpt_wraps_rate_limit_error_as_ai_service_error(self):
        # Extends the existing empty-content coverage: timeout/rate-limit/malformed
        # JSON must all become AIServiceError, not propagate as raw openai/json errors.
        fake_error = RateLimitError(
            message="rate limited",
            response=unittest.mock.Mock(request=unittest.mock.Mock()),
            body=None,
        )
        with patch.object(
            ai_assistant_service._client.chat.completions, "create", side_effect=fake_error
        ):
            with self.assertRaises(AIServiceError):
                ai_assistant_service._gpt("system", "user")

    def test_gpt_wraps_malformed_json_as_ai_service_error(self):
        fake_response = unittest.mock.Mock()
        fake_response.choices = [unittest.mock.Mock(message=unittest.mock.Mock(content="not json"), finish_reason="stop")]
        with patch.object(
            ai_assistant_service._client.chat.completions, "create", return_value=fake_response
        ):
            with self.assertRaises(AIServiceError):
                ai_assistant_service._gpt("system", "user")

    def test_gpt_empty_layout_length_exposes_actionable_user_message(self):
        fake_response = unittest.mock.Mock()
        fake_response.choices = [
            unittest.mock.Mock(
                message=unittest.mock.Mock(content=""),
                finish_reason="length",
            )
        ]
        fake_response.usage = None
        with patch.object(
            ai_assistant_service._client.chat.completions, "create", return_value=fake_response
        ):
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt("system", "user", action="layout")

        self.assertIn("empty content", str(raised.exception))
        self.assertIn("układu", raised.exception.user_message.lower())

    def test_ai_service_error_user_message_reaches_client(self):
        def raise_budget_error(**kwargs):
            raise AIServiceError(
                "Model returned empty content (finish_reason=length)",
                action="layout",
                user_message=ai_assistant_service._EMPTY_REASONING_BUDGET_MESSAGE,
            )

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_budget_error):
            response = self.client.post(
                "/ai/assistant",
                json={"action": "layout", "elements": [], "message": "test"},
            )

        self.assertEqual(response.status_code, 500)
        detail = response.json()["detail"]
        self.assertIn("węższego zlecenia", detail)
        self.assertNotIn("finish_reason", detail)

    def test_layout_defaults_to_medium_reasoning_and_fast_service_tier(self):
        self.assertEqual(ai_assistant_service._reasoning_effort_for_action("layout"), "medium")
        self.assertEqual(ai_assistant_service._service_tier_for_action("layout"), "fast")
        self.assertIsNone(ai_assistant_service._service_tier_for_action("chat"))

    def test_gpt_layout_passes_fast_tier_and_medium_effort(self):
        captured = {}

        def fake_create(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                service_tier="priority",
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content='{"status":"no_changes","summary":"ok"}'),
                        finish_reason="stop",
                    )
                ],
                usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20, total_tokens=120),
            )

        with patch.object(
            ai_assistant_service._client.chat.completions, "create", side_effect=fake_create
        ):
            payload, usage = ai_assistant_service._gpt("system", "user", action="layout")

        self.assertEqual(captured.get("reasoning_effort"), "medium")
        self.assertEqual(captured.get("service_tier"), "fast")
        self.assertEqual(payload.get("status"), "no_changes")
        self.assertEqual(usage["service_tier"], "priority")
        self.assertEqual(usage["rates_usd_per_1m"], {"input": 0.40, "output": 2.40})


if __name__ == "__main__":
    unittest.main()
