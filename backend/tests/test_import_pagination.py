"""Cursor pagination and privacy regressions for CV import history."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud.user import create_user
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, CvImportSnapshot, Pdf, User
from app.schemas.user_schema import UserCreateRequest
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


class ImportPaginationTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.db = sessionmaker(bind=engine)()
        self.engine = engine
        Base.metadata.create_all(bind=engine)
        seed_plans(self.db)
        create_user(
            self.db,
            UserCreateRequest(username="owner", email="owner@example.test", password="correct horse battery"),
        )
        self.owner = self.db.query(User).filter_by(username="owner").one()
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        for index in range(25):
            self.db.add(CvImportSnapshot(
                owner_id=self.owner.id,
                source_filename=f"private-person-{index}.pdf",
                source_size_bytes=100 + index,
                status="succeeded",
                cv_data={"name": f"Private Person {index}", "email": f"p{index}@example.test"},
                created_at=start + timedelta(seconds=index),
                completed_at=start + timedelta(seconds=index),
            ))
        self.db.commit()
        linked = self.db.query(CvImportSnapshot).order_by(CvImportSnapshot.id.asc()).first()
        self.db.add(Pdf(
            owner_id=self.owner.id,
            title="Private document title",
            source_import_id=linked.id,
            created_at=start,
            updated_at=start,
        ))
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "owner"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_list_is_bounded_owner_readable_and_cursor_paginated(self):
        first = self.client.get("/ai/imports").json()
        self.assertEqual(len(first["items"]), 20)
        self.assertIsNotNone(first["next_cursor"])
        serialized = str(first)
        self.assertNotIn("Private Person", serialized)
        self.assertNotIn("cv_data", serialized)
        self.assertNotIn("Private document title", serialized)
        self.assertEqual(first["items"][0]["filename"], "private-person-24.pdf")

        second = self.client.get(
            "/ai/imports",
            params={"cursor": first["next_cursor"]},
        ).json()
        self.assertEqual(len(second["items"]), 5)
        self.assertIsNone(second["next_cursor"])
        first_ids = {item["id"] for item in first["items"]}
        second_ids = {item["id"] for item in second["items"]}
        self.assertFalse(first_ids & second_ids)

    def test_limit_is_capped_and_malformed_cursor_has_stable_error(self):
        self.assertEqual(self.client.get("/ai/imports?limit=51").status_code, 422)
        response = self.client.get("/ai/imports?cursor=not-a-cursor")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "invalid_cursor")

    def test_single_import_keeps_owner_authorized_full_payload(self):
        snapshot_id = self.db.query(CvImportSnapshot.id).order_by(CvImportSnapshot.id.asc()).first()[0]
        payload = self.client.get(f"/ai/imports/{snapshot_id}").json()
        self.assertEqual(payload["filename"], "private-person-0.pdf")
        self.assertEqual(payload["cv_data"]["name"], "Private Person 0")
        self.assertEqual(payload["documents"][0]["title"], "Private document title")


if __name__ == "__main__":
    unittest.main()
