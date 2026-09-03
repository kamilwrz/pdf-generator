import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from openai import APITimeoutError, RateLimitError

from app.api.routes import ai_assistant as ai_assistant_route
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.services import ai_assistant_service
from app.services.ai_assistant_service import AIServiceError
from app.testing_support import ensure_test_auth_env


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
        ensure_test_auth_env()
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db
        self.client = TestClient(app)
        self._user_patch = patch.object(
            ai_assistant_route,
            "resolve_user_from_payload",
            return_value=SimpleNamespace(id=1, username="testuser"),
        )
        self._entitlement_patch = patch.object(
            ai_assistant_route, "assert_can_use_ai_action", return_value=None
        )
        self._reserve_patch = patch.object(
            ai_assistant_route,
            "reserve_ai_credits",
            return_value=SimpleNamespace(reservation_id="r-1", replay_response=None),
        )
        self._release_patch = patch.object(
            ai_assistant_route, "release_ai_reservation", return_value=None
        )
        self._settle_failed_patch = patch.object(
            ai_assistant_route, "settle_failed_ai_reservation", return_value=None
        )
        self._user_patch.start()
        self._entitlement_patch.start()
        self.reserve_mock = self._reserve_patch.start()
        self.release_mock = self._release_patch.start()
        self.settle_failed_mock = self._settle_failed_patch.start()

    def tearDown(self):
        self._user_patch.stop()
        self._entitlement_patch.stop()
        self._reserve_patch.stop()
        self._release_patch.stop()
        self._settle_failed_patch.stop()
        app.dependency_overrides.clear()

    def _post(self):
        return self.client.post(
            "/ai/assistant",
            json={"action": "rating", "elements": []},
            headers={"Idempotency-Key": "rating-test-key"},
        )

    def test_ai_service_error_reaches_app_handler_with_generic_message(self):
        def raise_ai_service_error(**kwargs):
            raise AIServiceError("OpenAI request failed: RateLimitError", action="rating")

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_ai_service_error):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "ai_provider_unavailable")
        self.assertEqual(
            detail["message"],
            "Asystent AI jest chwilowo niedostępny, spróbuj ponownie.",
        )
        self.release_mock.assert_called_once_with(
            unittest.mock.ANY,
            user_id=1,
            reservation_id="r-1",
        )

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
        self.assertEqual(detail["code"], "ai_internal_error")
        self.assertEqual(detail["message"], "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.")
        self.assertNotIn("some_internal_field_name", response.text)

    def test_ats_reserves_credits_before_downloading_owned_images(self):
        events = []

        def validate_images(*_args, resolve_paths, **_kwargs):
            events.append("download" if resolve_paths else "authorize")
            return {"/images/1/content": "C:/request-scoped/profile.png"}

        def reserve(*_args, **_kwargs):
            events.append("reserve")
            return SimpleNamespace(reservation_id="r-ats", replay_response=None)

        self.reserve_mock.side_effect = reserve
        with patch.object(
            ai_assistant_route,
            "validate_and_resolve_image_elements",
            side_effect=validate_images,
        ), patch.object(
            ai_assistant_route,
            "analyze_action",
            return_value={"message": "ok", "usage": {"cost_pln_estimate": 0}},
        ), patch.object(
            ai_assistant_route,
            "settle_ai_reservation",
            return_value={"message": "ok"},
        ):
            response = self.client.post(
                "/ai/assistant",
                json={
                    "action": "ats_score",
                    "elements": [{
                        "category": "image",
                        "element_id": "profile",
                        "src": "/images/1/content",
                        "img_id": 1,
                    }],
                },
                headers={"Idempotency-Key": "ats-reserve-before-download"},
            )

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(events, ["authorize", "reserve", "download"])

    def test_ats_materialization_failure_releases_reserved_credits(self):
        validation_calls = 0

        def validate_images(*_args, resolve_paths, **_kwargs):
            nonlocal validation_calls
            validation_calls += 1
            if resolve_paths:
                raise ai_assistant_route.HTTPException(
                    status_code=404,
                    detail={
                        "code": "image_not_found",
                        "message": "Nie znaleziono obrazu.",
                    },
                )
            return {}

        with patch.object(
            ai_assistant_route,
            "validate_and_resolve_image_elements",
            side_effect=validate_images,
        ):
            response = self.client.post(
                "/ai/assistant",
                json={"action": "ats_score", "elements": []},
                headers={"Idempotency-Key": "ats-local-image-failure"},
            )

        self.assertEqual(response.status_code, 404, msg=response.text)
        self.assertEqual(validation_calls, 2)
        self.release_mock.assert_called_once_with(
            unittest.mock.ANY,
            user_id=1,
            reservation_id="r-1",
        )
        self.release_mock.assert_called_once()

    def test_provider_success_with_failed_settlement_keeps_reservation_pending(self):
        provider_result = {
            "message": "ok",
            "usage": {"cost_pln_estimate": 0.06},
        }
        with (
            patch.object(ai_assistant_route, "analyze_action", return_value=provider_result),
            patch.object(
                ai_assistant_route,
                "settle_ai_reservation",
                side_effect=RuntimeError("database commit failed"),
            ),
        ):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"]["code"], "ai_settlement_pending")
        self.assertNotIn("database commit failed", response.text)
        self.release_mock.assert_not_called()

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
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt("system", "user")
        self.assertEqual(raised.exception.reservation_outcome, "release")

    def test_gpt_timeout_is_the_only_uncertain_provider_error(self):
        fake_error = APITimeoutError(request=unittest.mock.Mock())
        with patch.object(
            ai_assistant_service._client.chat.completions, "create", side_effect=fake_error
        ):
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt("system", "user")
        self.assertEqual(raised.exception.reservation_outcome, "uncertain")

    def test_gpt_wraps_malformed_json_as_ai_service_error(self):
        fake_response = unittest.mock.Mock()
        fake_response.choices = [unittest.mock.Mock(message=unittest.mock.Mock(content="not json"), finish_reason="stop")]
        with patch.object(
            ai_assistant_service._client.chat.completions, "create", return_value=fake_response
        ):
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt("system", "user")
        self.assertEqual(raised.exception.reservation_outcome, "settle_usage")
        self.assertIsNotNone(raised.exception.usage)

    def test_gpt_rejects_non_object_json_and_preserves_usage(self):
        fake_response = unittest.mock.Mock()
        fake_response.choices = [
            unittest.mock.Mock(
                message=unittest.mock.Mock(content='[{"message":"wrong shape"}]'),
                finish_reason="stop",
            )
        ]
        fake_response.usage = None
        with patch.object(
            ai_assistant_service._client.chat.completions,
            "create",
            return_value=fake_response,
        ):
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt("system", "user", action="rating")

        self.assertEqual(raised.exception.reservation_outcome, "settle_usage")
        self.assertIsNotNone(raised.exception.usage)

    def test_wrong_shaped_corrections_preserve_provider_usage(self):
        with patch.object(
            ai_assistant_service,
            "_gpt",
            return_value=(
                {"message": "shape", "corrections": 1},
                {"cost_pln_estimate": 0.06},
            ),
        ):
            with self.assertRaises(AIServiceError) as raised:
                ai_assistant_service._gpt_result("system", "user", action="rating")

        self.assertEqual(raised.exception.reservation_outcome, "settle_usage")
        self.assertEqual(raised.exception.usage["cost_pln_estimate"], 0.06)

    def test_usage_bearing_invalid_response_settles_actual_usage(self):
        error = AIServiceError(
            "OpenAI returned malformed JSON",
            action="rating",
            reservation_outcome="settle_usage",
            usage={"cost_pln_estimate": 0.06},
        )
        with patch.object(ai_assistant_route, "analyze_action", side_effect=error):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        self.settle_failed_mock.assert_called_once_with(
            unittest.mock.ANY,
            user_id=1,
            reservation_id="r-1",
            cost_pln=0.06,
        )
        self.release_mock.assert_not_called()

    def test_timeout_keeps_reservation_pending_for_uncertain_result(self):
        error = AIServiceError(
            "OpenAI request failed: APITimeoutError",
            action="rating",
            reservation_outcome="uncertain",
        )
        with patch.object(ai_assistant_route, "analyze_action", side_effect=error):
            response = self._post()

        self.assertEqual(response.status_code, 500)
        self.release_mock.assert_not_called()
        self.settle_failed_mock.assert_not_called()

    def test_gpt_empty_length_exposes_actionable_user_message(self):
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
                ai_assistant_service._gpt("system", "user", action="chat")

        self.assertIn("empty content", str(raised.exception))
        self.assertIn("uprość polecenie", raised.exception.user_message.lower())

    def test_ai_service_error_user_message_reaches_client(self):
        def raise_budget_error(**kwargs):
            raise AIServiceError(
                "Model returned empty content (finish_reason=length)",
                action="chat",
                user_message="Model wyczerpał limit odpowiedzi. Uprość polecenie.",
            )

        with patch.object(ai_assistant_route, "analyze_action", side_effect=raise_budget_error):
            response = self.client.post(
                "/ai/assistant",
                json={"action": "chat", "elements": [], "message": "test"},
                headers={"Idempotency-Key": "chat-budget-test-key"},
            )

        self.assertEqual(response.status_code, 500)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "ai_provider_unavailable")
        self.assertIn("Uprość polecenie", detail["message"])
        self.assertNotIn("finish_reason", detail["message"])

    def test_assistant_defaults_to_terra_with_high_reasoning(self):
        self.assertEqual(ai_assistant_service._model_for_action("chat"), "gpt-5.6-terra")
        self.assertEqual(ai_assistant_service._reasoning_effort_for_action("chat"), "high")


if __name__ == "__main__":
    unittest.main()
