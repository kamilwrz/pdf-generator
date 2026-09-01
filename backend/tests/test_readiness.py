"""Regression tests for liveness, readiness, and controlled bootstrap."""
from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.database import Base
from app.services import deployment_bootstrap
from app.services.entitlements import seed_plans
from app.services.readiness import (
    ReadinessGate,
    ReadinessProbe,
    ReadinessResult,
    is_database_route,
)
from app.testing_support import ensure_test_auth_env

ensure_test_auth_env()

from app import main  # noqa: E402  (SECRET_KEY must exist before app import)


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class ReadinessProbeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.probe = ReadinessProbe(
            database_engine=self.engine,
            session_factory=self.session_factory,
            alembic_config_path=BACKEND_ROOT / "alembic.ini",
        )

    def tearDown(self):
        self.engine.dispose()

    def _stamp_head(self, revision: str | None = None) -> None:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        head = revision or ScriptDirectory.from_config(config).get_current_head()
        with self.engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(64) NOT NULL)"))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                {"revision": head},
            )

    def test_probe_requires_current_migration_and_seed_catalog(self):
        self._stamp_head()
        with self.session_factory() as db:
            seed_plans(db)

        self.assertEqual(self.probe.check(), ReadinessResult(True))

    def test_probe_reports_migration_mismatch_before_seed(self):
        self._stamp_head("outdated_revision")

        self.assertEqual(
            self.probe.check(),
            ReadinessResult(False, "migrations"),
        )

    def test_probe_reports_missing_seed_after_current_migration(self):
        self._stamp_head()

        self.assertEqual(self.probe.check(), ReadinessResult(False, "seed"))

    def test_probe_rejects_residual_sqlite_foreign_key_violation(self):
        self._stamp_head()
        with self.session_factory() as db:
            seed_plans(db)

        raw_connection = self.engine.raw_connection()
        try:
            cursor = raw_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=OFF")
            cursor.execute(
                "INSERT INTO pdf_elements (id, pdf_id, img_id, element_id) "
                "VALUES (9001, NULL, 999999, 'legacy-orphan')"
            )
            raw_connection.commit()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        finally:
            raw_connection.close()

        self.assertEqual(
            self.probe.check(),
            ReadinessResult(False, "integrity"),
        )


class ReadinessHttpTests(unittest.TestCase):
    def test_health_never_invokes_database_probe(self):
        def should_not_run():
            raise AssertionError("liveness must not access the database")

        gate = ReadinessGate(should_not_run)
        with patch.object(main, "readiness_gate", gate):
            response = TestClient(main.app).get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_ready_returns_503_with_stable_error_when_database_is_unavailable(self):
        gate = ReadinessGate(lambda: ReadinessResult(False, "database"))
        with patch.object(main, "readiness_gate", gate):
            response = TestClient(main.app).get("/ready")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["Retry-After"], "5")
        self.assertEqual(response.json()["detail"]["code"], "service_not_ready")
        self.assertNotIn("database", response.text.lower())

    def test_database_route_is_rejected_before_routing_when_not_ready(self):
        gate = ReadinessGate(lambda: ReadinessResult(False, "migrations"))
        with patch.object(main, "readiness_gate", gate):
            response = TestClient(main.app).get("/auth/not-a-real-route")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "service_not_ready")

    def test_non_database_routes_are_not_blocked(self):
        gate = ReadinessGate(lambda: ReadinessResult(False, "seed"))
        with patch.object(main, "readiness_gate", gate):
            response = TestClient(main.app).get("/openapi.json")

        self.assertEqual(response.status_code, 200)

    def test_route_classifier_has_explicit_boundary(self):
        self.assertTrue(is_database_route("/pdf/download_pdf"))
        self.assertTrue(is_database_route("/auth"))
        self.assertFalse(is_database_route("/health"))
        self.assertFalse(is_database_route("/templates/catalog"))
        self.assertFalse(is_database_route("/template-assets/example.png"))
        self.assertFalse(is_database_route("/pdf-preview"))


class DeploymentBootstrapTests(unittest.TestCase):
    def test_render_startup_recovers_when_predeploy_was_not_configured(self):
        gate = ReadinessGate(
            Mock(
                side_effect=(
                    ReadinessResult(False, "migrations"),
                    ReadinessResult(True),
                )
            )
        )
        with (
            patch.object(main, "readiness_gate", gate),
            patch.object(main, "run_predeploy") as bootstrap,
        ):
            main._recover_render_database_bootstrap()

        bootstrap.assert_called_once_with()
        self.assertEqual(gate.last_result, ReadinessResult(True))

    def test_render_startup_skips_bootstrap_when_predeploy_already_succeeded(self):
        gate = ReadinessGate(lambda: ReadinessResult(True))
        with (
            patch.object(main, "readiness_gate", gate),
            patch.object(main, "run_predeploy") as bootstrap,
        ):
            main._recover_render_database_bootstrap()

        bootstrap.assert_not_called()

    def test_fresh_database_bootstrap_is_idempotent_and_n1_compatible(self):
        """Exercise the real create_all -> Alembic path on an empty database."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "fresh-bootstrap.db"
            environment = os.environ.copy()
            environment.update({
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
                "SECRET_KEY": "fresh-bootstrap-test-secret-key-32chars",
                "ALLOW_INSECURE_SECRET": "false",
                "ENVIRONMENT": "development",
            })

            for _attempt in range(2):
                completed = subprocess.run(
                    [sys.executable, "-m", "app.services.deployment_bootstrap"],
                    cwd=BACKEND_ROOT,
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=120,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)

            connection = sqlite3.connect(database_path)
            try:
                config = Config(str(BACKEND_ROOT / "alembic.ini"))
                config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
                expected_head = ScriptDirectory.from_config(config).get_current_head()
                self.assertEqual(
                    connection.execute(
                        "SELECT version_num FROM alembic_version"
                    ).fetchone(),
                    (expected_head,),
                )
                user_columns = {
                    row[1]: row for row in connection.execute("PRAGMA table_info(users)")
                }
                pdf_columns = {
                    row[1]: row for row in connection.execute("PRAGMA table_info(pdfs)")
                }
                cleanup_columns = {
                    row[1]: row
                    for row in connection.execute(
                        "PRAGMA table_info(storage_cleanup_jobs)"
                    )
                }
                # PRAGMA column tuple index 3 is the NOT NULL flag.
                self.assertEqual(user_columns["username_canonical"][3], 0)
                self.assertEqual(user_columns["email_canonical"][3], 0)
                self.assertEqual(user_columns["argon2_password_hash"][3], 0)
                self.assertEqual(user_columns["image_slots_used"][3], 1)
                self.assertIn("0", str(user_columns["image_slots_used"][4]))
                self.assertEqual(pdf_columns["title_key"][3], 0)
                self.assertEqual(cleanup_columns["resource_kind"][3], 1)
                self.assertEqual(cleanup_columns["status"][3], 1)
                self.assertIn("pdf", str(cleanup_columns["resource_kind"][4]))
                self.assertIn("pending", str(cleanup_columns["status"][4]))

                user_indexes = [
                    row[1] for row in connection.execute("PRAGMA index_list(users)")
                ]
                self.assertEqual(user_indexes.count("ix_users_username_canonical"), 1)
                self.assertEqual(user_indexes.count("ix_users_email_canonical"), 1)
            finally:
                connection.close()

    def test_predeploy_failure_propagates_without_a_destructive_cleanup_hook(self):
        with patch.object(
            deployment_bootstrap,
            "init_db",
            side_effect=RuntimeError("migration failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "migration failed"):
                deployment_bootstrap.run_predeploy()

        self.assertFalse(hasattr(deployment_bootstrap, "run_legacy_document_cleanup"))

    def test_predeploy_preserves_an_existing_a4_document_without_a_legacy_marker(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "preserve-documents.db"
            environment = os.environ.copy()
            environment.update({
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
                "SECRET_KEY": "preserve-documents-test-secret-32chars",
                "ALLOW_INSECURE_SECRET": "false",
                "ENVIRONMENT": "development",
            })
            command = [sys.executable, "-m", "app.services.deployment_bootstrap"]
            first = subprocess.run(
                command,
                cwd=BACKEND_ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
                timeout=120,
            )
            self.assertEqual(first.returncode, 0, first.stderr)
            connection = sqlite3.connect(database_path)
            try:
                connection.execute(
                    """
                    INSERT INTO pdfs (
                        title, title_key, revision, pages, page_width, page_height,
                        watermarked
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("Existing CV", "existing cv", 1, 1, 595.0, 842.0, 0),
                )
                connection.commit()
            finally:
                connection.close()

            second = subprocess.run(
                command,
                cwd=BACKEND_ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
                timeout=120,
            )
            self.assertEqual(second.returncode, 0, second.stderr)
            connection = sqlite3.connect(database_path)
            try:
                rows = connection.execute(
                    "SELECT title, page_width, page_height FROM pdfs"
                ).fetchall()
            finally:
                connection.close()

        self.assertEqual(rows, [("Existing CV", 595.0, 842.0)])

    def test_render_blueprint_uses_predeploy_and_readiness_probe(self):
        manifest = (BACKEND_ROOT.parent / "render.yaml").read_text(encoding="utf-8")

        self.assertIn("preDeployCommand: python -m app.services.deployment_bootstrap", manifest)
        self.assertIn("healthCheckPath: /ready", manifest)
        # The static bundle must use the API's public URL, not Render's private
        # service hostname, because requests originate in the user's browser.
        self.assertIn(
            """      - key: VITE_API_URL
        fromService:
          name: cv-studio-api
          type: web
          envVarKey: RENDER_EXTERNAL_URL""",
            manifest,
        )
        frontend_public_url_reference = """      - key: CORS_ORIGINS
        fromService:
          name: cv-studio-web
          type: web
          envVarKey: RENDER_EXTERNAL_URL"""
        # Both Python processes import the shared production configuration.
        # Supplying the generated HTTPS frontend origin to each process keeps
        # API startup and scheduled cleanup on the same fail-closed contract.
        self.assertEqual(manifest.count(frontend_public_url_reference), 2)
        self.assertIn(
            """      - key: BACKEND_URL
        fromService:
          name: cv-studio-api
          type: web
          envVarKey: RENDER_EXTERNAL_URL""",
            manifest,
        )
        self.assertEqual(manifest.count("autoDeployTrigger: checksPass"), 3)
        self.assertIn("key: TRUST_PROXY_HEADERS", manifest)
        self.assertIn("key: TRUSTED_PROXY_CIDRS", manifest)
        self.assertIn('value: "true"', manifest)
        self.assertIn("Preview environments are intentionally disabled", manifest)
        self.assertIn("name: cv-studio-storage-cleanup", manifest)
        self.assertIn("startCommand: python -m app.services.storage_cleanup_worker", manifest)
        self.assertGreaterEqual(manifest.count("key: S3_BUCKET_NAME"), 2)


if __name__ == "__main__":
    unittest.main()
