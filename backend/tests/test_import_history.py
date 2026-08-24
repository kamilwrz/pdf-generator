"""Ownership and lifecycle regressions for normalized PDF import history."""
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud.cv_import_snapshots import create_snapshot, mark_snapshot_succeeded
from app.crud.user import create_user
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, User
from app.schemas.user_schema import UserCreateRequest
from app.testing_support import ensure_test_auth_env


class ImportHistoryTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.engine = engine
        create_user(self.db, UserCreateRequest(username="owner", email="owner@example.test", password="pw"))
        create_user(self.db, UserCreateRequest(username="other", email="other@example.test", password="pw"))
        self.owner = self.db.query(User).filter_by(username="owner").one()
        self.other = self.db.query(User).filter_by(username="other").one()
        self.snapshot = create_snapshot(self.db, owner_id=self.owner.id, filename="owner-cv.pdf", size_bytes=123)
        mark_snapshot_succeeded(self.db, self.snapshot, {"name": "Owner", "experience": []})

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "other"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_import_ids_cannot_read_or_delete_another_users_data(self):
        self.assertEqual(self.client.get(f"/ai/imports/{self.snapshot.id}").status_code, 404)
        self.assertEqual(self.client.delete(f"/ai/imports/{self.snapshot.id}").status_code, 404)
        self.assertEqual(self.client.get("/ai/imports").json(), {"imports": []})


if __name__ == "__main__":
    unittest.main()
