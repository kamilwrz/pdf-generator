"""Render-on-demand download (POST /pdf/render_pdf).

Covers the "Pobierz" button that is independent of "Zapisz": the current canvas
is rendered and streamed without ever creating a "Moje dokumenty" row, while
still being export-metered exactly like /download_pdf. A separate unit check
asserts the Free plan forwards ``watermark=True`` into the renderer.
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service as doc_service
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


# Minimal but valid canvas payload: one text element plus A4 geometry.
def _payload(title: str = "unsaved-cv") -> dict:
    return {
        "root": [
            {
                "category": "text",
                "element_id": "e1",
                "page": 1,
                "left": 10,
                "top": 10,
                "content": "hi",
                "fontFamily": "Inter",
                "fontSize": 12,
                "color": "#000000",
            }
        ],
        "pdf_title": title,
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
    }


class RenderOnDemandTests(unittest.TestCase):
    """Wire-contract coverage for POST /pdf/render_pdf."""

    def setUp(self):
        ensure_test_auth_env()
        # StaticPool + one shared connection so the TestClient worker thread and
        # this thread see the same in-memory database.
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

        user_crud.create_user(self.db, UserCreateRequest(
            username="u1", email="u1@e.pl", password="pw"))
        self.user = self.db.query(User).filter(User.username == "u1").one()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _exports_count(self) -> int:
        period = ent.current_period_key()
        row = (
            self.db.query(UsageCounter)
            .filter(
                UsageCounter.user_id == self.user.id,
                UsageCounter.period_key == period,
            )
            .first()
        )
        return int(row.exports_count) if row is not None else 0

    def test_render_streams_pdf_meters_and_persists_no_document(self):
        response = self.client.post("/pdf/render_pdf", json=_payload())
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertIn("application/pdf", response.headers.get("content-type", ""))
        self.assertTrue(response.content.startswith(b"%PDF"))
        # The download is metered like /download_pdf.
        self.assertEqual(self._exports_count(), 1)
        # Independence from Save: no "Moje dokumenty" row was created.
        self.assertEqual(self.db.query(Pdf).count(), 0)

    def test_free_plan_export_quota_blocks_fourth_render(self):
        for i in range(3):
            ok = self.client.post("/pdf/render_pdf", json=_payload())
            self.assertEqual(ok.status_code, 200, msg=f"render {i + 1}: {ok.text}")
        self.assertEqual(self._exports_count(), 3)

        blocked = self.client.post("/pdf/render_pdf", json=_payload())
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["code"], "plan_limit_exports")
        # A blocked export neither renders nor increments past the free limit.
        self.assertEqual(self._exports_count(), 3)

    def test_empty_canvas_is_rejected_before_metering(self):
        empty = _payload()
        empty["root"] = []
        response = self.client.post("/pdf/render_pdf", json=empty)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self._exports_count(), 0)

    def test_free_plan_forwards_watermark_flag_to_renderer(self):
        # Assert the Free plan stamps the watermark without decoding PDF bytes:
        # capture the flag passed into the shared render buffer helper.
        from app.schemas.pdf_schema import PDFCreateRequest

        pdf_data = PDFCreateRequest(**_payload())
        with patch.object(doc_service, "build_pdf_to_buffer", return_value=b"%PDF-fake") as buf:
            doc_service.render_document_bytes(self.db, user=self.user, pdf_data=pdf_data)
        self.assertTrue(buf.called)
        self.assertTrue(buf.call_args.kwargs["watermark"])


if __name__ == "__main__":
    unittest.main()
