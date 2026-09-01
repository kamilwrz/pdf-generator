"""Bounded request and idempotency contracts for POST /ai/assistant."""
from __future__ import annotations

import inspect
import unittest

from fastapi.testclient import TestClient

from app.api.routes.ai_assistant import ai_assistant
from app.core.security import verify_token
from app.main import app
from app.testing_support import ensure_test_auth_env


class AiAssistantRequestLimitTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        app.dependency_overrides[verify_token] = lambda: {"sub": "nobody"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def _post(self, body: dict, *, key: str | None = "bounded-request"):
        headers = {"Idempotency-Key": key} if key else {}
        return self.client.post("/ai/assistant", json=body, headers=headers)

    def test_provider_route_is_sync_for_one_threadpool_session_boundary(self):
        self.assertFalse(inspect.iscoroutinefunction(ai_assistant))

    def test_idempotency_key_is_required_before_provider_or_user_lookup(self):
        response = self._post({"action": "rating", "elements": []}, key=None)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "idempotency_key_required")

    def test_element_and_history_counts_are_bounded(self):
        too_many_elements = self._post({
            "action": "rating",
            "elements": [{} for _ in range(501)],
        })
        too_many_history = self._post({
            "action": "chat",
            "elements": [],
            "history": [{"role": "user", "content": "x"} for _ in range(21)],
        })
        self.assertEqual(too_many_elements.status_code, 422)
        self.assertEqual(too_many_history.status_code, 422)

    def test_text_fields_and_nested_history_are_bounded(self):
        self.assertEqual(self._post({
            "action": "chat",
            "elements": [],
            "message": "x" * 4_001,
        }).status_code, 422)
        self.assertEqual(self._post({
            "action": "position_rating",
            "elements": [],
            "job_description": "x" * 20_001,
        }).status_code, 422)
        self.assertEqual(self._post({
            "action": "chat",
            "elements": [],
            "history": [{"role": "user", "content": "x" * 4_001}],
        }).status_code, 422)

    def test_total_canonical_payload_is_limited_to_one_mebibyte(self):
        response = self._post({
            "action": "rating",
            "elements": [],
            "cv_data": {"opaque": "x" * (1024 * 1024)},
        })
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "ai_request_too_large")

    def test_transport_limit_rejects_oversized_insignificant_whitespace(self):
        body = b'{"action":"rating","elements":[]}' + (b" " * (1024 * 1024))
        response = self.client.post(
            "/ai/assistant",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Idempotency-Key": "oversized-transport",
            },
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "ai_request_too_large")


if __name__ == "__main__":
    unittest.main()
