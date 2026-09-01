"""Paid-template enforcement across PDF persistence and render routes."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _payload(*, template_id: str, pdf_id: int | None = None) -> dict:
    payload = {
        "root": [{
            "category": "text",
            "element_id": "e1",
            "page": 1,
            "left": 10,
            "top": 10,
            "content": "CV",
            "fontFamily": "Inter",
            "fontSize": 12,
            "color": "#000000",
        }],
        "pdf_title": "cv.pdf",
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
        "editor_mode": "template",
        "template_id": template_id,
    }
    if pdf_id is not None:
        payload["pdf_id"] = pdf_id
        payload["expected_revision"] = 1
    return payload


class PdfTemplateEntitlementTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)
        user_crud.create_user(self.db, UserCreateRequest(
            username="free", email="free@example.com", password="correct horse battery",
        ))
        user_crud.create_user(self.db, UserCreateRequest(
            username="other", email="other@example.com", password="correct horse battery",
        ))
        self.user = self.db.query(User).filter(User.username == "free").one()
        other = self.db.query(User).filter(User.username == "other").one()
        now = datetime.now(timezone.utc)
        self.legacy = Pdf(
            title="legacy-regent.pdf",
            file_path="/tmp/legacy-regent.pdf",
            owner_id=self.user.id,
            template_id="regent",
            editor_mode="template",
            pages=1,
            page_width=595,
            page_height=842,
            created_at=now,
            updated_at=now,
        )
        self.starter = Pdf(
            title="starter.pdf",
            file_path="/tmp/starter.pdf",
            owner_id=self.user.id,
            template_id="sterling",
            editor_mode="template",
            pages=1,
            page_width=595,
            page_height=842,
            created_at=now,
            updated_at=now,
        )
        self.other_legacy = Pdf(
            title="other-regent.pdf",
            file_path="/tmp/other-regent.pdf",
            owner_id=other.id,
            template_id="regent",
            editor_mode="template",
            pages=1,
            page_width=595,
            page_height=842,
            created_at=now,
            updated_at=now,
        )
        self.db.add_all([self.legacy, self.starter, self.other_legacy])
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "free"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def assert_template_blocked(self, response) -> None:
        self.assertEqual(response.status_code, 403, msg=response.text)
        self.assertEqual(response.json()["detail"]["code"], "plan_feature_template")

    def test_create_pdf_rejects_paid_template_even_with_legacy_pdf_id(self):
        # `/create_pdf` must not treat a client-supplied existing id as proof;
        # otherwise the same row could authorize creation of extra paid CVs.
        with patch.object(pdf_route, "create_pdf_document") as create:
            response = self.client.post(
                "/pdf/create_pdf",
                json=_payload(template_id="regent", pdf_id=self.legacy.id),
                headers={"Idempotency-Key": "paid-template-create"},
            )
        self.assert_template_blocked(response)
        create.assert_not_called()

    def test_unsaved_render_rejects_paid_template(self):
        with patch.object(pdf_route, "render_document_bytes") as render:
            response = self.client.post(
                "/pdf/render_pdf", json=_payload(template_id="regent"),
            )
        self.assert_template_blocked(response)
        render.assert_not_called()

    def test_render_allows_same_owned_legacy_paid_template_after_downgrade(self):
        with patch.object(
            pdf_route, "render_document_bytes", return_value=b"%PDF-legacy",
        ) as render:
            response = self.client.post(
                "/pdf/render_pdf",
                json=_payload(template_id="regent", pdf_id=self.legacy.id),
            )
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.content, b"%PDF-legacy")
        render.assert_called_once()

    def test_render_rejects_using_starter_document_as_paid_template_proof(self):
        with patch.object(pdf_route, "render_document_bytes") as render:
            response = self.client.post(
                "/pdf/render_pdf",
                json=_payload(template_id="regent", pdf_id=self.starter.id),
            )
        self.assert_template_blocked(response)
        render.assert_not_called()

    def test_render_rejects_another_users_legacy_document(self):
        with patch.object(pdf_route, "render_document_bytes") as render:
            response = self.client.post(
                "/pdf/render_pdf",
                json=_payload(template_id="regent", pdf_id=self.other_legacy.id),
            )
        self.assert_template_blocked(response)
        render.assert_not_called()

    def test_update_preserves_legacy_template_but_blocks_paid_template_switch(self):
        with patch.object(
            pdf_route,
            "update_pdf_document",
            return_value={"updated": "ok", "pdf_id": self.legacy.id},
        ) as update:
            legacy_response = self.client.put(
                "/pdf/update_pdf",
                json=_payload(template_id="regent", pdf_id=self.legacy.id),
            )
            switched_response = self.client.put(
                "/pdf/update_pdf",
                json=_payload(template_id="regent", pdf_id=self.starter.id),
            )

        self.assertEqual(legacy_response.status_code, 201, msg=legacy_response.text)
        self.assert_template_blocked(switched_response)
        update.assert_called_once()


if __name__ == "__main__":
    unittest.main()
