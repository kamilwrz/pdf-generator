"""IDOR guards on PDF show/download: non-owners get 403, owners get 200."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, PdfElements, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class PdfOwnershipIdorTests(unittest.TestCase):
    """Wire-contract coverage for ownership checks on by-id PDF routes.

    Runs against a real in-memory SQLite DB so a 403 is a real ownership
    rejection (not a missing-row 404) and the owner's show path returns 200.
    """

    def setUp(self):
        ensure_test_auth_env()
        # StaticPool + a single shared connection so the request runs (on the
        # TestClient's worker thread) see the same in-memory DB as this thread.
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

        user_crud.create_user(self.db, UserCreateRequest(
            username="usr1", email="u1@e.pl", password="correct horse battery"))
        user_crud.create_user(self.db, UserCreateRequest(
            username="usr2", email="u2@e.pl", password="correct horse battery"))

        u1 = self.db.query(User).filter(User.username == "usr1").one()
        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title="u1-cv",
            file_path="/tmp/u1-cv.pdf",
            owner_id=u1.id,
            pages=1,
            page_width=595.0,
            page_height=842.0,
            cv_data={"name": "Owner", "experience": []},
            created_at=now,
            updated_at=now,
        )
        self.db.add(pdf)
        self.db.commit()
        self.db.refresh(pdf)
        self.pdf_id = pdf.id

        # show_pdf treats an empty element query as 404 (`if not pdf_to_show`),
        # so seed one row so the owner path can return 200 after the IDOR gate.
        self.db.add(PdfElements(
            pdf_id=self.pdf_id,
            element_id="el-1",
            category="text",
            page=1,
            left=40.0,
            top=40.0,
            width="100",
            height="20",
            content="Hello",
        ))
        self.db.commit()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        # Default identity is the non-owner; ownership tests flip as needed.
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr2"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_non_owner_show_pdf_returns_403(self):
        response = self.client.post("/pdf/show_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 403)

    def test_non_owner_download_pdf_returns_403(self):
        response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 403)

    def test_owner_show_pdf_returns_200(self):
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr1"}
        response = self.client.post("/pdf/show_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["document"]["id"], self.pdf_id)
        self.assertEqual(body["document"]["cv_data"]["name"], "Owner")
        self.assertEqual(len(body["elements"]), 1)
        self.assertEqual(body["elements"][0]["element_id"], "el-1")


if __name__ == "__main__":
    unittest.main()
