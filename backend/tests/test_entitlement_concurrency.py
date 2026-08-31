"""Concurrency regression coverage for finite Free-plan quotas."""
from __future__ import annotations

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import Barrier

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.crud.cv_import_snapshots import (
    create_snapshot,
    mark_snapshot_failed,
    mark_snapshot_succeeded,
)
from app.models.models import Base, CvImportSnapshot, Pdf, UsageCounter, User
from app.services import entitlements as ent


class EntitlementConcurrencyTests(unittest.TestCase):
    """Exercise the SQLite path used locally; Postgres uses equivalent locks.

    A file-backed database gives each worker its own connection. An in-memory
    StaticPool would share one connection and cannot model two simultaneous
    transactions accurately.
    """

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "quota.db"
        self.engine = create_engine(
            f"sqlite:///{database_path.as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 15},
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.Session() as db:
            ent.seed_plans(db)
            now = datetime.now(timezone.utc)
            db.add_all([
                User(
                    username="projects",
                    email="projects@example.com",
                    hashed_password="x",
                    created_at=now,
                    is_active=True,
                ),
                User(
                    username="exports",
                    email="exports@example.com",
                    hashed_password="x",
                    created_at=now,
                    is_active=True,
                ),
                User(
                    username="imports",
                    email="imports@example.com",
                    hashed_password="x",
                    created_at=now,
                    is_active=True,
                ),
            ])
            db.commit()
            for user in db.query(User).all():
                ent.ensure_free_subscription(db, user.id)

    def tearDown(self):
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_two_simultaneous_creates_claim_only_one_free_project_slot(self):
        barrier = Barrier(2)

        def create_one(index: int) -> str:
            with self.Session() as db:
                user = db.query(User).filter(User.username == "projects").one()
                barrier.wait(timeout=10)
                try:
                    # The gate keeps its user-scope lock until this document
                    # insert commits, making count + insert one critical section.
                    ent.assert_can_create_project(db, user)
                    now = datetime.now(timezone.utc)
                    db.add(Pdf(
                        title=f"cv-{index}.pdf",
                        file_path=f"/tmp/cv-{index}.pdf",
                        owner_id=user.id,
                        pages=1,
                        page_width=595,
                        page_height=842,
                        created_at=now,
                        updated_at=now,
                    ))
                    db.commit()
                    return "created"
                except ent.PlanLimitError as exc:
                    self.assertEqual(exc.detail["code"], "plan_limit_projects")
                    return "blocked"

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create_one, range(2)))

        self.assertCountEqual(results, ["created", "blocked"])
        with self.Session() as db:
            owner = db.query(User).filter(User.username == "projects").one()
            self.assertEqual(db.query(Pdf).filter(Pdf.owner_id == owner.id).count(), 1)

    def test_four_simultaneous_exports_cannot_exceed_three(self):
        barrier = Barrier(4)

        def claim_one(_: int) -> str:
            with self.Session() as db:
                user_id = db.query(User.id).filter(User.username == "exports").scalar()
                barrier.wait(timeout=10)
                try:
                    ent.record_export(db, int(user_id))
                    return "claimed"
                except ent.PlanLimitError as exc:
                    self.assertEqual(exc.detail["code"], "plan_limit_exports")
                    return "blocked"

        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(claim_one, range(4)))

        self.assertEqual(results.count("claimed"), 3)
        self.assertEqual(results.count("blocked"), 1)
        with self.Session() as db:
            owner = db.query(User).filter(User.username == "exports").one()
            usage = db.query(UsageCounter).filter(
                UsageCounter.user_id == owner.id,
                UsageCounter.period_key == ent.current_period_key(),
            ).one()
            self.assertEqual(usage.exports_count, 3)

    def test_two_simultaneous_import_finalizations_commit_one_snapshot(self):
        with self.Session() as db:
            owner = db.query(User).filter(User.username == "imports").one()
            snapshot_ids = [
                create_snapshot(
                    db,
                    owner_id=owner.id,
                    filename=f"cv-{index}.pdf",
                    size_bytes=100,
                ).id
                for index in range(2)
            ]

        barrier = Barrier(2)

        def finalize_one(snapshot_id: int) -> str:
            with self.Session() as db:
                owner = db.query(User).filter(User.username == "imports").one()
                snapshot = db.query(CvImportSnapshot).filter(
                    CvImportSnapshot.id == snapshot_id,
                ).one()
                barrier.wait(timeout=10)
                try:
                    ent.record_cv_import(db, owner.id, commit=False)
                    mark_snapshot_succeeded(
                        db, snapshot, {"name": f"CV {snapshot_id}"}, commit=False,
                    )
                    db.commit()
                    return "succeeded"
                except ent.PlanLimitError:
                    db.rollback()
                    mark_snapshot_failed(db, snapshot, "plan_limit_cv_imports")
                    return "blocked"

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(finalize_one, snapshot_ids))

        self.assertCountEqual(results, ["succeeded", "blocked"])
        with self.Session() as db:
            owner = db.query(User).filter(User.username == "imports").one()
            usage = db.query(UsageCounter).filter(
                UsageCounter.user_id == owner.id,
                UsageCounter.period_key == ent.current_period_key(),
            ).one()
            statuses = {
                row.status
                for row in db.query(CvImportSnapshot).filter(
                    CvImportSnapshot.owner_id == owner.id,
                ).all()
            }
            self.assertEqual(usage.cv_imports_count, 1)
            self.assertEqual(statuses, {"succeeded", "failed"})


if __name__ == "__main__":
    unittest.main()
