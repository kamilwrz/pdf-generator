import logging
import unittest

from fastapi.testclient import TestClient

from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
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


class EventsLogTests(unittest.TestCase):
    """T1b's events endpoint: auth-gated + schema-validated because its data
    is the sole signal gating the Phase 2 go/no-go decision (see
    docs/designs/cv-only-ux-monetization.md, Outside Voice finding 4).
    """

    def setUp(self):
        ensure_test_auth_env()
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.post(
            "/events/log",
            json={"event_type": "template_picked", "template_id": "nova"},
        )
        self.assertEqual(response.status_code, 401)

    def test_authenticated_valid_event_is_accepted(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        response = self.client.post(
            "/events/log",
            json={"event_type": "template_picked", "template_id": "nova"},
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(response.status_code, 200)

    def test_out_of_allowlist_event_type_is_rejected(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        response = self.client.post(
            "/events/log",
            json={"event_type": "something_not_allowed"},
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(response.status_code, 422)

    def test_logging_is_configured_so_info_logs_are_not_silently_dropped(self):
        # Regression test for a bug caught during live verification: without
        # logging.basicConfig() (or equivalent) at app startup, the root
        # logger has no handler, so every logger.info() call in this app
        # (events.py, ai_assistant.py) is silently dropped — no exception,
        # no output, nothing. The metrics this endpoint exists to produce
        # would never actually reach anywhere queryable.
        self.assertTrue(
            logging.getLogger().handlers,
            "Root logger has no handlers — logger.info() calls are silently "
            "dropped. app.main must call logging.basicConfig() (or equivalent) "
            "at import time.",
        )
        self.assertLessEqual(logging.getLogger().getEffectiveLevel(), logging.INFO)

    def test_dismissed_event_without_template_id_is_accepted(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        response = self.client.post(
            "/events/log",
            json={"event_type": "template_dismissed"},
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(response.status_code, 200)

    def test_guest_funnel_event_types_are_accepted(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        for event_type in (
            "landing_cta_clicked",
            "guest_editor_opened",
            "guest_demo_loaded",
            "guest_first_edit",
            "save_gate_shown",
            "register_completed",
            "guest_doc_claimed",
        ):
            with self.subTest(event_type=event_type):
                response = self.client.post(
                    "/events/log",
                    json={"event_type": event_type},
                    headers={"Authorization": "Bearer fake"},
                )
                self.assertEqual(response.status_code, 200)

    def test_landing_source_event_types_are_accepted(self):
        # The redesigned landing emits a per-source CTA event so the funnel can
        # distinguish which surface drove the click. Each must pass schema
        # validation the same way the guest-funnel events do.
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        for event_type in (
            "hero_wizard",
            "hero_import",
            "hero_demo",
            "before_after_import",
            "templates_wizard",
            "pricing_free",
            "pricing_pro",
            "final_wizard",
            "final_import",
        ):
            with self.subTest(event_type=event_type):
                response = self.client.post(
                    "/events/log",
                    json={"event_type": event_type},
                    headers={"Authorization": "Bearer fake"},
                )
                self.assertEqual(response.status_code, 200)

    def test_logging_failure_does_not_break_the_response(self):
        # A DB lookup failure while resolving the numeric user id must not
        # surface to the caller — fire-and-forget guarantee.
        app.dependency_overrides[verify_token] = _fake_verify_token

        def broken_db():
            class Broken:
                def query(self, *a, **k):
                    raise RuntimeError("db unavailable")
            yield Broken()

        app.dependency_overrides[get_db] = broken_db

        response = self.client.post(
            "/events/log",
            json={"event_type": "template_picked", "template_id": "nova"},
            headers={"Authorization": "Bearer fake"},
        )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
