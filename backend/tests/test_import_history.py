"""Ownership and lifecycle regressions for normalized PDF import history."""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud.cv_import_snapshots import create_snapshot, mark_snapshot_succeeded, soft_delete_snapshot
from app.crud.user import create_user
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, CvImportSnapshot, User
from app.schemas.user_schema import UserCreateRequest
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


class ImportHistoryTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.engine = engine
        seed_plans(self.db)
        create_user(self.db, UserCreateRequest(username="owner", email="owner@example.test", password="correct horse battery"))
        create_user(self.db, UserCreateRequest(username="other", email="other@example.test", password="correct horse battery"))
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
        self.assertEqual(
            self.client.get("/ai/imports").json(),
            {"items": [], "next_cursor": None},
        )

    def test_owner_can_delete_abandoned_processing_import(self):
        app.dependency_overrides[verify_token] = lambda: {"sub": "owner"}
        snapshot = create_snapshot(self.db, owner_id=self.owner.id, filename="old.pdf", size_bytes=123)
        snapshot.created_at = datetime.now(timezone.utc) - timedelta(days=12)
        self.db.commit()
        response = self.client.delete(f"/ai/imports/{snapshot.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": True})
        self.assertEqual(self.client.get(f"/ai/imports/{snapshot.id}").status_code, 404)
        self.assertNotIn(snapshot.id, [row["id"] for row in self.client.get("/ai/imports").json()["items"]])

    def test_delete_clears_data_even_when_deleting_session_loaded_processing_state(self):
        snapshot = create_snapshot(self.db, owner_id=self.owner.id, filename="race.pdf", size_bytes=123)
        with sessionmaker(bind=self.engine)() as worker:
            worker_snapshot = worker.get(CvImportSnapshot, snapshot.id)
            mark_snapshot_succeeded(worker, worker_snapshot, {"name": "Late result"})
        # This session still has cv_data=None. Deletion must issue an explicit
        # SQL clear even though assigning None would not make that field dirty.
        soft_delete_snapshot(self.db, snapshot)
        self.assertEqual(snapshot.status, "deleted")
        self.assertIsNone(snapshot.cv_data)


if __name__ == "__main__":
    unittest.main()
