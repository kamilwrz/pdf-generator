"""Security checks for the image upload endpoint.

These tests pin the upload trust boundary end-to-end through the real FastAPI
app: only genuine raster images are accepted, oversize bodies are rejected, the
per-user count is enforced, and a malicious filename can never influence the
stored path (path-traversal guard). They run against an in-memory SQLite DB so
an accepted upload provably creates the expected `images` row.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import inspect
import tempfile
from threading import Barrier, Event, Lock
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import images as images_route
from app.core.security import DEFAULT_JWT_KEY_VERSION, verify_token
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Image, Pdf, PdfElements, StorageCleanupJob, User
from app.services import image_storage, pdf_storage
from app.testing_support import ensure_test_auth_env

# Minimal byte payloads. Format sniffing only inspects the leading signature, so
# a valid header followed by padding is enough — no decodable image is required.
_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
_HTML_BYTES = b"<html><script>alert(1)</script></html>"


class ImageUploadSecurityTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        # StaticPool + one shared connection so the request thread and this
        # thread see the same in-memory database.
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(User(
            username="u1",
            email="u1@e.pl",
            hashed_password="x",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        ))
        self.db.commit()

        # Redirect writes to a throwaway directory so the suite never touches the
        # real backend/uploads folder. Force the route's imported storage flag
        # off as well: a developer may legitimately keep S3_BUCKET_NAME in the
        # local .env, but a security test must never upload fixtures to that
        # external bucket.
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_upload_dir = images_route.IMAGES_UPLOAD_DIR
        self._orig_use_s3 = images_route.USE_S3
        images_route.IMAGES_UPLOAD_DIR = Path(self._tmp.name)
        images_route.USE_S3 = False

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        images_route.IMAGES_UPLOAD_DIR = self._orig_upload_dir
        images_route.USE_S3 = self._orig_use_s3
        self._tmp.cleanup()
        self.db.close()
        self.engine.dispose()

    def _uid(self) -> int:
        return self.db.query(User).filter(User.username == "u1").one().id

    def _upload(self, filename, data, content_type):
        return self.client.post(
            "/images/upload_image",
            files={"file": (filename, data, content_type)},
        )

    def test_valid_png_is_accepted_and_stored_with_generated_name(self):
        resp = self._upload("photo.png", _PNG_BYTES, "image/png")
        self.assertEqual(resp.status_code, 200)
        row = self.db.query(Image).filter(Image.owner_id == self._uid()).one()
        # MIME comes from the sniffed format, not the client-declared type.
        self.assertEqual(row.mime_type, "image/png")
        self.assertTrue(row.file_path.endswith(".png"))
        # Original name kept for display, but the stored name is server-generated.
        self.assertEqual(row.filename, "photo.png")
        self.assertNotIn("photo", Path(row.file_path).name)
        self.assertEqual(
            self.db.query(User).filter(User.id == self._uid()).one().image_slots_used,
            1,
        )
        self.assertRegex(
            Path(row.file_path).relative_to(Path(self._tmp.name)).as_posix(),
            rf"^images/{self._uid()}/[0-9a-f]{{32}}\.png$",
        )

    def test_html_disguised_as_png_is_rejected(self):
        # Correct extension + declared image MIME, but the bytes are HTML: this
        # is the stored-XSS payload the sniffer must reject.
        resp = self._upload("evil.png", _HTML_BYTES, "image/png")
        self.assertEqual(resp.status_code, 415)
        self.assertEqual(self.db.query(Image).count(), 0)
        self.assertEqual(self.db.query(User).one().image_slots_used, 0)

    def test_traversal_filename_cannot_escape_upload_dir(self):
        resp = self._upload("..\\..\\..\\evil.png", _PNG_BYTES, "image/png")
        self.assertEqual(resp.status_code, 200)
        row = self.db.query(Image).filter(Image.owner_id == self._uid()).one()
        # The stored path is derived from a UUID, so no '..' segment survives.
        self.assertNotIn("..", row.file_path)

    def test_oversize_upload_is_rejected(self):
        original = images_route.MAX_UPLOAD_BYTES
        images_route.MAX_UPLOAD_BYTES = 16
        try:
            resp = self._upload("big.png", _PNG_BYTES, "image/png")
        finally:
            images_route.MAX_UPLOAD_BYTES = original
        self.assertEqual(resp.status_code, 413)
        self.assertEqual(self.db.query(Image).count(), 0)
        self.assertEqual(self.db.query(User).one().image_slots_used, 0)

    def test_per_user_count_limit_is_enforced(self):
        original = images_route.MAX_IMAGES_PER_USER
        images_route.MAX_IMAGES_PER_USER = 1
        try:
            first = self._upload("a.png", _PNG_BYTES, "image/png")
            second = self._upload("b.png", _PNG_BYTES, "image/png")
        finally:
            images_route.MAX_IMAGES_PER_USER = original
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 403)
        self.assertEqual(self.db.query(Image).count(), 1)
        self.assertEqual(self.db.query(User).one().image_slots_used, 1)

    def test_twenty_parallel_uploads_reserve_only_the_configured_slots(self):
        """The DB gate must stop excess requests before they publish bytes."""

        with tempfile.TemporaryDirectory() as database_directory:
            database_path = Path(database_directory) / "parallel-images.db"
            engine = create_engine(
                f"sqlite:///{database_path.as_posix()}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            Base.metadata.create_all(bind=engine)
            session_factory = sessionmaker(bind=engine)
            seed_db = session_factory()
            concurrent_user = User(
                username="parallel-owner",
                email="parallel-owner@example.test",
                hashed_password="x",
                created_at=datetime.now(timezone.utc),
                is_active=True,
            )
            seed_db.add(concurrent_user)
            seed_db.commit()
            seed_db.refresh(concurrent_user)
            owner_id = int(concurrent_user.id)
            seed_db.close()

            start = Barrier(20)
            put_lock = Lock()
            published_keys: list[str] = []

            def counted_put(*args, **kwargs):
                with put_lock:
                    published_keys.append(args[1])
                # Model the provider boundary without performing concurrent
                # Windows path resolution; the assertion counts precisely how
                # many requests crossed into the storage publisher.
                return str(Path(kwargs["root"]) / Path(args[1]))

            def upload_one(index: int):
                request_db = session_factory()
                try:
                    start.wait(timeout=10)
                    result = images_route.create_upload_image(
                        file=UploadFile(
                            file=BytesIO(_PNG_BYTES),
                            filename=f"parallel-{index}.png",
                        ),
                        payload={
                            "sub": str(owner_id),
                            "ver": DEFAULT_JWT_KEY_VERSION,
                        },
                        db=request_db,
                    )
                    return (200, result["id"])
                except HTTPException as exc:
                    request_db.rollback()
                    return (exc.status_code, None)
                finally:
                    request_db.close()

            try:
                with patch.object(images_route, "MAX_IMAGES_PER_USER", 4), patch.object(
                    images_route,
                    "put_image_bytes",
                    side_effect=counted_put,
                ):
                    with ThreadPoolExecutor(max_workers=20) as executor:
                        results = list(executor.map(upload_one, range(20)))

                verification_db = session_factory()
                try:
                    status_codes = [status_code for status_code, _row_id in results]
                    self.assertEqual(status_codes.count(200), 4)
                    self.assertEqual(status_codes.count(403), 16)
                    self.assertEqual(len(published_keys), 4)
                    self.assertEqual(len(set(published_keys)), 4)
                    self.assertEqual(
                        verification_db.query(Image).filter(
                            Image.owner_id == owner_id
                        ).count(),
                        4,
                    )
                    owner = verification_db.query(User).filter(User.id == owner_id).one()
                    self.assertEqual(owner.image_slots_used, 4)
                finally:
                    verification_db.close()
            finally:
                engine.dispose()

    def test_image_content_requires_owner(self):
        # Bytes are served only through the authenticated content route —
        # not via a public StaticFiles mount.
        self.assertEqual(self._upload("photo.png", _PNG_BYTES, "image/png").status_code, 200)
        row = self.db.query(Image).filter(Image.owner_id == self._uid()).one()

        ok = self.client.get(f"/images/{row.id}/content")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.content[:8], _PNG_BYTES[:8])

        app.dependency_overrides[verify_token] = lambda: {"sub": "other"}
        denied = self.client.get(f"/images/{row.id}/content")
        # Foreign and missing image IDs intentionally share the same response
        # so the endpoint does not reveal whether another user's asset exists.
        self.assertEqual(denied.status_code, 404)

    def test_database_failure_compensates_newly_published_image(self):
        with patch.object(
            self.db,
            "commit",
            side_effect=RuntimeError("database commit failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "database commit failed"):
                self._upload("photo.png", _PNG_BYTES, "image/png")

        self.assertEqual(self.db.query(Image).count(), 0)
        self.assertEqual(list(Path(self._tmp.name).rglob("*.png")), [])
        self.assertEqual(self.db.query(User).one().image_slots_used, 0)

    def test_failed_upload_compensation_is_retained_in_cleanup_outbox(self):
        real_commit = self.db.commit
        commit_calls = 0

        def fail_metadata_commit_once():
            nonlocal commit_calls
            commit_calls += 1
            if commit_calls == 1:
                raise RuntimeError("image metadata commit failed")
            real_commit()

        with patch.object(
            self.db,
            "commit",
            side_effect=fail_metadata_commit_once,
        ), patch.object(
            images_route,
            "delete_image_object",
            side_effect=OSError("compensation delete failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "image metadata commit failed"):
                self._upload("photo.png", _PNG_BYTES, "image/png")

        self.assertEqual(self.db.query(Image).count(), 0)
        self.assertEqual(self.db.query(User).one().image_slots_used, 0)
        cleanup_job = self.db.query(StorageCleanupJob).one()
        self.assertEqual(cleanup_job.resource_kind, "image")
        self.assertEqual(cleanup_job.attempts, 1)
        self.assertEqual(cleanup_job.status, "pending")
        self.assertEqual(len(list(Path(self._tmp.name).rglob("*.png"))), 1)

        pdf_storage.process_cleanup_jobs(
            self.db,
            job_ids=[cleanup_job.id],
            image_root=Path(self._tmp.name),
        )
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)
        self.assertEqual(list(Path(self._tmp.name).rglob("*.png")), [])

    def test_delete_commits_outbox_and_retries_failed_storage_removal(self):
        self.assertEqual(
            self._upload("photo.png", _PNG_BYTES, "image/png").status_code,
            200,
        )
        row = self.db.query(Image).one()
        stored_path = Path(row.file_path)

        with patch.object(
            image_storage,
            "delete_image_object",
            side_effect=OSError("temporary image storage outage"),
        ):
            response = self.client.request(
                "DELETE",
                "/images/delete_image",
                json=row.id,
            )

        self.assertEqual(response.status_code, 202, msg=response.text)
        self.assertEqual(self.db.query(Image).count(), 0)
        self.assertEqual(self.db.query(User).one().image_slots_used, 0)
        cleanup_job = self.db.query(StorageCleanupJob).one()
        self.assertEqual(cleanup_job.resource_kind, "image")
        self.assertEqual(cleanup_job.attempts, 1)
        self.assertEqual(cleanup_job.status, "pending")
        self.assertTrue(stored_path.is_file())

        pdf_storage.process_cleanup_jobs(
            self.db,
            job_ids=[cleanup_job.id],
            image_root=Path(self._tmp.name),
        )
        self.assertFalse(stored_path.exists())
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)

    def test_delete_does_not_disclose_foreign_document_metadata(self):
        self.assertEqual(
            self._upload("photo.png", _PNG_BYTES, "image/png").status_code,
            200,
        )
        image = self.db.query(Image).one()
        other_user = User(
            username="other-user",
            email="other@example.test",
            hashed_password="x",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(other_user)
        self.db.flush()
        foreign_pdf = Pdf(
            title="FOREIGN SECRET TITLE",
            owner_id=other_user.id,
            watermarked=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(foreign_pdf)
        self.db.flush()
        self.db.add(PdfElements(
            pdf_id=foreign_pdf.id,
            img_id=image.id,
            element_id="corrupt-cross-owner-reference",
            category="image",
            src=f"/images/{image.id}/content",
            extra_properties={},
        ))
        self.db.commit()

        response = self.client.request(
            "DELETE",
            "/images/delete_image",
            json=image.id,
        )

        self.assertEqual(response.status_code, 202, msg=response.text)
        self.assertIn("używany", response.json()["message"])
        self.assertNotIn("FOREIGN SECRET TITLE", response.text)
        self.assertIsNotNone(self.db.query(Image).filter_by(id=image.id).first())

    def test_sqlite_delete_rechecks_reference_committed_after_locator_read(self):
        """A concurrent canvas save keeps both image metadata and private bytes."""

        with tempfile.TemporaryDirectory() as database_directory:
            database_path = Path(database_directory) / "image-delete-race.db"
            engine = create_engine(
                f"sqlite:///{database_path.as_posix()}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            with engine.connect() as connection:
                self.assertEqual(
                    connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one(),
                    1,
                )
                connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            Base.metadata.create_all(bind=engine)
            session_factory = sessionmaker(bind=engine, expire_on_commit=False)

            seed_db = session_factory()
            owner = User(
                username="delete-race-owner",
                email="delete-race-owner@example.test",
                hashed_password="x",
                created_at=datetime.now(timezone.utc),
                is_active=True,
                image_slots_used=1,
            )
            seed_db.add(owner)
            seed_db.flush()
            pdf = Pdf(
                title="Delete race",
                owner_id=owner.id,
                watermarked=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            seed_db.add(pdf)
            seed_db.flush()
            key = image_storage.make_image_key(owner.id, ".png")
            stored_locator = image_storage.put_image_bytes(
                image_storage.LOCAL_BACKEND,
                key,
                _PNG_BYTES,
                content_type="image/png",
                root=Path(self._tmp.name),
                owner_id=owner.id,
            )
            image = Image(
                filename="race.png",
                file_path=stored_locator,
                file_size=len(_PNG_BYTES),
                mime_type="image/png",
                uploaded_at=datetime.now(timezone.utc),
                owner_id=owner.id,
            )
            seed_db.add(image)
            seed_db.commit()
            owner_id = int(owner.id)
            pdf_id = int(pdf.id)
            image_id = int(image.id)
            seed_db.close()

            delete_reached_cas = Event()
            allow_delete_cas = Event()
            real_exists = images_route.exists

            def pause_before_conditional_delete(*args, **kwargs):
                delete_reached_cas.set()
                self.assertTrue(allow_delete_cas.wait(timeout=10))
                return real_exists(*args, **kwargs)

            def delete_in_worker():
                delete_db = session_factory()
                try:
                    return images_route.delete_user_image(
                        payload={
                            "sub": str(owner_id),
                            "ver": DEFAULT_JWT_KEY_VERSION,
                        },
                        db=delete_db,
                        img_id=image_id,
                    )
                finally:
                    delete_db.close()

            try:
                with patch.object(
                    images_route,
                    "exists",
                    side_effect=pause_before_conditional_delete,
                ):
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        deleting = executor.submit(delete_in_worker)
                        self.assertTrue(delete_reached_cas.wait(timeout=10))
                        save_db = session_factory()
                        try:
                            save_db.add(PdfElements(
                                pdf_id=pdf_id,
                                img_id=image_id,
                                element_id="concurrent-image",
                                category="image",
                                src=f"/images/{image_id}/content",
                                extra_properties={},
                            ))
                            save_db.commit()
                        finally:
                            save_db.close()
                        allow_delete_cas.set()
                        delete_result = deleting.result(timeout=10)

                verification_db = session_factory()
                try:
                    self.assertIn("używany", delete_result["message"])
                    self.assertIsNotNone(
                        verification_db.query(Image).filter(Image.id == image_id).one_or_none()
                    )
                    self.assertEqual(
                        verification_db.query(PdfElements).filter(
                            PdfElements.img_id == image_id
                        ).count(),
                        1,
                    )
                    self.assertEqual(verification_db.query(StorageCleanupJob).count(), 0)
                    self.assertEqual(
                        verification_db.query(User.image_slots_used).filter(
                            User.id == owner_id
                        ).scalar(),
                        1,
                    )
                    self.assertEqual(
                        verification_db.execute(
                            text("PRAGMA foreign_key_check")
                        ).first(),
                        None,
                    )
                    self.assertTrue(Path(stored_locator).is_file())
                finally:
                    verification_db.close()
            finally:
                engine.dispose()

    def test_image_routes_keep_sync_database_session_in_one_worker_thread(self):
        for route in (
            images_route.create_upload_image,
            images_route.fetch_user_images,
            images_route.get_image_content,
            images_route.delete_user_image,
        ):
            with self.subTest(route=route.__name__):
                self.assertFalse(inspect.iscoroutinefunction(route))


if __name__ == "__main__":
    unittest.main()
