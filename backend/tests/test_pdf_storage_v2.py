"""Storage V2 security, saga, and legacy-compatibility regression tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud.pdfs import create_new_pdf, enqueue_storage_cleanup
from app.models.models import Base, Pdf, StorageCleanupJob, User
from app.schemas.pdf_schema import PDFCreateRequest, PDFUpdateRequest
from app.services import document_service, pdf_storage
from app.utils.pdf_file_ops import delete_pdf_file


def _text_element(content: str = "Storage V2") -> dict:
    """Return the smallest real element accepted by the PDF renderer."""
    return {
        "category": "text",
        "element_id": "storage-text",
        "page": 1,
        "left": 24,
        "top": 24,
        "content": content,
        "fontFamily": "Inter",
        "fontSize": 12,
        "color": "#111111",
    }


class PdfStorageV2Tests(unittest.TestCase):
    """Exercise immutable keys, compensation, cleanup retry, and containment."""

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            username="storage-owner",
            email="storage-owner@example.com",
            hashed_password="unused",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.temporary_storage = TemporaryDirectory()
        self.storage_root = Path(self.temporary_storage.name)
        self.root_patch = patch.object(
            document_service,
            "PDF_UPLOAD_DIR",
            self.storage_root,
        )
        self.s3_patch = patch.object(document_service, "USE_S3", False)
        self.root_patch.start()
        self.s3_patch.start()

    def tearDown(self) -> None:
        self.s3_patch.stop()
        self.root_patch.stop()
        self.db.close()
        self.engine.dispose()
        self.temporary_storage.cleanup()

    def _create_request(self, title: str = "My CV") -> PDFCreateRequest:
        return PDFCreateRequest(
            root=[_text_element()],
            pdf_title=title,
            pages=1,
            page_width=595,
            page_height=842,
        )

    def test_title_is_normalized_and_path_or_control_characters_are_rejected(self) -> None:
        normalized = self._create_request("  Re\u0301sume\u0301  ")
        self.assertEqual(normalized.pdf_title, "R\u00e9sum\u00e9")

        for invalid_title in (
            "../other-user.pdf",
            "..\\other-user.pdf",
            "header\r\nvalue.pdf",
            "nul\x00byte.pdf",
            " ",
            "x" * 121,
        ):
            with self.subTest(title=repr(invalid_title)):
                with self.assertRaises(ValidationError):
                    self._create_request(invalid_title)

    def test_create_and_update_rotate_immutable_keys_without_title_rename(self) -> None:
        created = document_service.create_pdf_document(
            self.db,
            user=self.user,
            username=self.user.username,
            pdf_data=self._create_request('Quarterly "CV"'),
        )
        pdf_row = self.db.query(Pdf).filter(Pdf.id == created["pdf_id"]).one()
        first_key = pdf_row.storage_key
        first_path = Path(pdf_row.file_path)

        self.assertEqual(pdf_row.storage_backend, pdf_storage.LOCAL_BACKEND)
        self.assertRegex(
            first_key,
            rf"^pdfs/{self.user.id}/{pdf_row.id}/[0-9a-f]{{32}}\.pdf$",
        )
        self.assertNotIn("Quarterly", first_key)
        self.assertTrue(first_path.is_file())
        self.assertTrue(first_path.read_bytes().startswith(b"%PDF"))

        updated_payload = PDFUpdateRequest(
            pdf_id=pdf_row.id,
            expected_revision=1,
            root=[_text_element("Updated")],
            pdf_title="Renamed CV",
            pages=1,
            page_width=595,
            page_height=842,
        )
        document_service.update_pdf_document(
            self.db,
            pdf_row=pdf_row,
            user=self.user,
            username=self.user.username,
            pdf_data=updated_payload,
        )

        self.db.expire_all()
        updated_row = self.db.query(Pdf).filter(Pdf.id == pdf_row.id).one()
        self.assertEqual(updated_row.title, "Renamed CV")
        self.assertNotEqual(updated_row.storage_key, first_key)
        self.assertNotIn("Renamed", updated_row.storage_key)
        self.assertTrue(Path(updated_row.file_path).is_file())
        self.assertFalse(first_path.exists())
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)

    def test_title_only_update_keeps_the_existing_physical_object(self) -> None:
        created = document_service.create_pdf_document(
            self.db,
            user=self.user,
            username=self.user.username,
            pdf_data=self._create_request("Original display title"),
        )
        pdf_row = self.db.query(Pdf).filter(Pdf.id == created["pdf_id"]).one()
        original_backend = pdf_row.storage_backend
        original_key = pdf_row.storage_key
        original_path = pdf_row.file_path
        original_bytes = Path(original_path).read_bytes()
        renamed = PDFUpdateRequest(
            pdf_id=pdf_row.id,
            expected_revision=1,
            root=[_text_element()],
            pdf_title="Renamed display title",
            pages=1,
            page_width=595,
            page_height=842,
        )

        with patch.object(
            document_service,
            "_render_bytes",
            side_effect=AssertionError("title-only updates must not render"),
        ), patch.object(
            document_service,
            "put_pdf_bytes",
            side_effect=AssertionError("title-only updates must not publish bytes"),
        ):
            result = document_service.update_pdf_document(
                self.db,
                pdf_row=pdf_row,
                user=self.user,
                username=self.user.username,
                pdf_data=renamed,
            )

        self.db.expire_all()
        persisted = self.db.query(Pdf).filter_by(id=pdf_row.id).one()
        self.assertEqual(result["revision"], 2)
        self.assertEqual(persisted.title, "Renamed display title")
        self.assertEqual(persisted.revision, 2)
        self.assertEqual(persisted.storage_backend, original_backend)
        self.assertEqual(persisted.storage_key, original_key)
        self.assertEqual(persisted.file_path, original_path)
        self.assertEqual(Path(original_path).read_bytes(), original_bytes)
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)

    def test_legacy_title_only_update_migrates_bytes_to_storage_v2(self) -> None:
        legacy_directory = self.storage_root / self.user.username
        legacy_directory.mkdir(parents=True)
        legacy_path = legacy_directory / "legacy.pdf"
        legacy_path.write_bytes(b"%PDF-1.4 legacy bytes")
        pdf_id = create_new_pdf(
            self.db,
            "Legacy display title",
            self.user.id,
            str(legacy_path),
            self._create_request().root,
            commit=True,
        )
        pdf_row = self.db.query(Pdf).filter_by(id=pdf_id).one()
        renamed = PDFUpdateRequest(
            pdf_id=pdf_id,
            expected_revision=1,
            root=[_text_element()],
            pdf_title="Renamed legacy title",
            pages=1,
            page_width=595,
            page_height=842,
        )

        with patch.object(
            document_service,
            "_render_bytes",
            return_value=b"%PDF-1.4 migrated V2 bytes",
        ) as render:
            result = document_service.update_pdf_document(
                self.db,
                pdf_row=pdf_row,
                user=self.user,
                username=self.user.username,
                pdf_data=renamed,
            )

        self.db.expire_all()
        migrated = self.db.query(Pdf).filter_by(id=pdf_id).one()
        render.assert_called_once()
        self.assertEqual(result["revision"], 2)
        self.assertEqual(migrated.title, "Renamed legacy title")
        self.assertEqual(migrated.storage_backend, pdf_storage.LOCAL_BACKEND)
        self.assertRegex(
            migrated.storage_key,
            rf"^pdfs/{self.user.id}/{pdf_id}/[0-9a-f]{{32}}\.pdf$",
        )
        self.assertEqual(
            Path(migrated.file_path).read_bytes(),
            b"%PDF-1.4 migrated V2 bytes",
        )
        self.assertFalse(legacy_path.exists())

    def test_create_commit_failure_compensates_the_published_object(self) -> None:
        with patch.object(self.db, "commit", side_effect=RuntimeError("database unavailable")):
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                document_service.create_pdf_document(
                    self.db,
                    user=self.user,
                    username=self.user.username,
                    pdf_data=self._create_request("Compensated CV"),
                )

        self.assertEqual(self.db.query(Pdf).count(), 0)
        self.assertEqual(list(self.storage_root.rglob("*.pdf")), [])

    def test_failed_create_compensation_is_recorded_for_later_cleanup(self) -> None:
        real_commit = self.db.commit
        commit_calls = 0

        def _fail_metadata_commit_once() -> None:
            nonlocal commit_calls
            commit_calls += 1
            if commit_calls == 1:
                raise RuntimeError("metadata commit failed")
            real_commit()

        with patch.object(self.db, "commit", side_effect=_fail_metadata_commit_once), patch.object(
            document_service,
            "delete_v2_object",
            side_effect=OSError("compensation delete failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "metadata commit failed"):
                document_service.create_pdf_document(
                    self.db,
                    user=self.user,
                    username=self.user.username,
                    pdf_data=self._create_request("Durable compensation"),
                )

        self.assertEqual(self.db.query(Pdf).count(), 0)
        cleanup_job = self.db.query(StorageCleanupJob).one()
        self.assertEqual(cleanup_job.attempts, 1)
        self.assertIn("compensation delete failed", cleanup_job.last_error)
        self.assertEqual(len(list(self.storage_root.rglob("*.pdf"))), 1)

        pdf_storage.process_cleanup_jobs(
            self.db,
            job_ids=[cleanup_job.id],
            root=self.storage_root,
        )
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)
        self.assertEqual(list(self.storage_root.rglob("*.pdf")), [])

    def test_failed_old_object_cleanup_remains_durable_and_retryable(self) -> None:
        created = document_service.create_pdf_document(
            self.db,
            user=self.user,
            username=self.user.username,
            pdf_data=self._create_request("Durable cleanup"),
        )
        pdf_row = self.db.query(Pdf).filter(Pdf.id == created["pdf_id"]).one()
        old_path = Path(pdf_row.file_path)
        updated_payload = PDFUpdateRequest(
            pdf_id=pdf_row.id,
            expected_revision=1,
            root=[_text_element("New bytes")],
            pdf_title="Durable cleanup renamed",
        )

        with patch.object(
            pdf_storage,
            "delete_storage_target",
            side_effect=OSError("temporary storage outage"),
        ):
            document_service.update_pdf_document(
                self.db,
                pdf_row=pdf_row,
                user=self.user,
                username=self.user.username,
                pdf_data=updated_payload,
            )

        cleanup_job = self.db.query(StorageCleanupJob).one()
        cleanup_job_id = cleanup_job.id
        self.assertEqual(cleanup_job.attempts, 1)
        self.assertIn("temporary storage outage", cleanup_job.last_error)
        self.assertTrue(old_path.exists())

        # Supplying the durable job id is an explicit retry and therefore does
        # not wait for the scheduled backoff window.
        pdf_storage.process_cleanup_jobs(
            self.db,
            job_ids=[cleanup_job_id],
            root=self.storage_root,
        )
        self.assertFalse(old_path.exists())
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)

    def test_scheduled_cleanup_does_not_starve_due_jobs_behind_backoff_page(self) -> None:
        """The SQL limit must apply after excluding jobs still in backoff."""

        future_retry = datetime.now(timezone.utc) + timedelta(days=1)
        for index in range(500):
            self.db.add(StorageCleanupJob(
                storage_backend="local",
                storage_key=f"pdfs/1/1/{index + 1:032x}.pdf",
                attempts=1,
                next_attempt_at=future_retry,
                created_at=datetime.now(timezone.utc),
            ))
        due_job = StorageCleanupJob(
            storage_backend="local",
            storage_key=f"pdfs/1/1/{501:032x}.pdf",
            attempts=0,
            next_attempt_at=None,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(due_job)
        self.db.commit()
        due_job_id = due_job.id

        attempted = pdf_storage.process_cleanup_jobs(
            self.db,
            root=self.storage_root,
            limit=500,
        )

        self.assertEqual(attempted, 1)
        self.assertIsNone(
            self.db.query(StorageCleanupJob).filter_by(id=due_job_id).first(),
        )
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 500)

    def test_cleanup_failure_becomes_terminal_dead_letter(self) -> None:
        cleanup_job = StorageCleanupJob(
            storage_backend="local",
            storage_key=f"pdfs/1/1/{'d' * 32}.pdf",
            resource_kind="pdf",
            status="pending",
            attempts=0,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(cleanup_job)
        self.db.commit()
        cleanup_job_id = cleanup_job.id

        with patch.object(
            pdf_storage,
            "delete_storage_target",
            side_effect=OSError("permanent storage failure"),
        ):
            for _attempt in range(pdf_storage.MAX_CLEANUP_ATTEMPTS):
                attempted = pdf_storage.process_cleanup_jobs(
                    self.db,
                    job_ids=[cleanup_job_id],
                    root=self.storage_root,
                )
                self.assertEqual(attempted, 1)

            # Terminal jobs are excluded even from an explicit request retry.
            attempted_after_terminal = pdf_storage.process_cleanup_jobs(
                self.db,
                job_ids=[cleanup_job_id],
                root=self.storage_root,
            )

        self.db.expire_all()
        terminal = self.db.query(StorageCleanupJob).filter_by(
            id=cleanup_job_id,
        ).one()
        self.assertEqual(attempted_after_terminal, 0)
        self.assertEqual(terminal.attempts, pdf_storage.MAX_CLEANUP_ATTEMPTS)
        self.assertEqual(terminal.status, pdf_storage.DEAD_LETTER_CLEANUP)
        self.assertIsNotNone(terminal.terminal_at)
        self.assertIsNone(terminal.next_attempt_at)

    def test_ambiguous_update_upload_failure_keeps_old_pointer_and_compensates(self) -> None:
        created = document_service.create_pdf_document(
            self.db,
            user=self.user,
            username=self.user.username,
            pdf_data=self._create_request("Stable pointer"),
        )
        pdf_row = self.db.query(Pdf).filter(Pdf.id == created["pdf_id"]).one()
        old_key = pdf_row.storage_key
        old_path = Path(pdf_row.file_path)
        replacement_key = f"pdfs/{self.user.id}/{pdf_row.id}/{'a' * 32}.pdf"
        updated_payload = PDFUpdateRequest(
            pdf_id=pdf_row.id,
            expected_revision=1,
            root=[_text_element("Upload failed")],
            pdf_title="Must not switch",
        )

        with patch.object(
            document_service,
            "make_pdf_key",
            return_value=replacement_key,
        ), patch.object(
            document_service,
            "put_pdf_bytes",
            side_effect=OSError("ambiguous upload failure"),
        ), patch.object(document_service, "delete_v2_object") as compensate:
            with self.assertRaisesRegex(OSError, "ambiguous upload failure"):
                document_service.update_pdf_document(
                    self.db,
                    pdf_row=pdf_row,
                    user=self.user,
                    username=self.user.username,
                    pdf_data=updated_payload,
                )

        self.db.expire_all()
        unchanged = self.db.query(Pdf).filter(Pdf.id == pdf_row.id).one()
        self.assertEqual(unchanged.title, "Stable pointer")
        self.assertEqual(unchanged.storage_key, old_key)
        self.assertTrue(old_path.exists())
        compensate.assert_called_once_with(
            pdf_storage.LOCAL_BACKEND,
            replacement_key,
            root=self.storage_root,
        )

    def test_delete_retries_latest_pointer_when_update_commits_before_cas(self) -> None:
        """A delete that loses to A→B must enqueue B instead of orphaning it."""

        created = document_service.create_pdf_document(
            self.db,
            user=self.user,
            username=self.user.username,
            pdf_data=self._create_request("Delete race"),
        )
        pdf_id = created["pdf_id"]
        stale_route_row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()
        first_backend = stale_route_row.storage_backend
        first_key = stale_route_row.storage_key
        first_path = Path(stale_route_row.file_path)
        replacement_key = pdf_storage.make_pdf_key(self.user.id, pdf_id)
        replacement_path = Path(
            pdf_storage.put_pdf_bytes(
                pdf_storage.LOCAL_BACKEND,
                replacement_key,
                b"newer private bytes",
                root=self.storage_root,
                owner_id=self.user.id,
                pdf_id=pdf_id,
            )
        )
        real_delete = document_service.delete_pdf_by_id
        injected_update = False

        def delete_after_concurrent_update(db, candidate_pdf_id, **kwargs):
            nonlocal injected_update
            if not injected_update:
                injected_update = True
                # Commit a complete pointer rotation after delete loaded A but
                # before its CAS. This is the SQLite race window where
                # ``FOR UPDATE`` is intentionally a no-op.
                enqueue_storage_cleanup(db, (first_backend, first_key))
                updated = db.query(Pdf).filter(Pdf.id == pdf_id).update(
                    {
                        Pdf.storage_backend: pdf_storage.LOCAL_BACKEND,
                        Pdf.storage_key: replacement_key,
                        Pdf.file_path: str(replacement_path),
                        Pdf.revision: 2,
                    },
                    synchronize_session=False,
                )
                self.assertEqual(updated, 1)
                db.commit()
            return real_delete(db, candidate_pdf_id, **kwargs)

        with patch.object(
            document_service,
            "delete_pdf_by_id",
            side_effect=delete_after_concurrent_update,
        ), patch.object(document_service, "_drain_cleanup_best_effort"):
            document_service.delete_pdf_document(
                self.db,
                pdf_row=stale_route_row,
                username=self.user.username,
            )

        self.assertTrue(injected_update)
        self.assertIsNone(self.db.query(Pdf).filter(Pdf.id == pdf_id).one_or_none())
        cleanup_keys = {
            row.storage_key for row in self.db.query(StorageCleanupJob).all()
        }
        self.assertEqual(cleanup_keys, {first_key, replacement_key})
        self.assertTrue(first_path.exists())
        self.assertTrue(replacement_path.exists())

        processed = pdf_storage.process_cleanup_jobs(
            self.db,
            root=self.storage_root,
        )
        self.assertEqual(processed, 2)
        self.assertFalse(first_path.exists())
        self.assertFalse(replacement_path.exists())
        self.assertEqual(self.db.query(StorageCleanupJob).count(), 0)

    def test_legacy_local_and_s3_locators_are_owner_scoped_and_contained(self) -> None:
        owner_dir = self.storage_root / self.user.username
        owner_dir.mkdir(parents=True)
        legacy_path = owner_dir / "legacy.pdf"
        legacy_path.write_bytes(b"legacy")
        legacy_row = SimpleNamespace(
            id=77,
            owner_id=self.user.id,
            file_path=str(legacy_path),
            storage_backend=None,
            storage_key=None,
        )
        self.assertEqual(
            pdf_storage.read_pdf_bytes(
                legacy_row,
                root=self.storage_root,
                legacy_owner_segment=self.user.username,
            ),
            b"legacy",
        )

        sibling_dir = self.storage_root / "other-user"
        sibling_dir.mkdir()
        sibling_path = sibling_dir / "private.pdf"
        sibling_path.write_bytes(b"private")
        legacy_row.file_path = str(sibling_path)
        with self.assertRaises(pdf_storage.UnsafeStorageLocator):
            pdf_storage.read_pdf_bytes(
                legacy_row,
                root=self.storage_root,
                legacy_owner_segment=self.user.username,
            )

        outside_path = self.storage_root.parent / "outside-private.pdf"
        legacy_row.file_path = str(outside_path)
        with self.assertRaises(pdf_storage.UnsafeStorageLocator):
            pdf_storage.target_for_pdf(
                legacy_row,
                root=self.storage_root,
                legacy_owner_segment=self.user.username,
            )

        legacy_row.file_path = (
            "https://bucket.s3.eu-central-1.amazonaws.com/"
            "pdfs/other-user/private.pdf"
        )
        with self.assertRaises(pdf_storage.UnsafeStorageLocator):
            pdf_storage.target_for_pdf(
                legacy_row,
                root=self.storage_root,
                legacy_owner_segment=self.user.username,
            )

        legacy_row.file_path = (
            "https://bucket.s3.eu-central-1.amazonaws.com.evil.invalid/"
            f"pdfs/{self.user.username}/private.pdf"
        )
        with self.assertRaises(pdf_storage.UnsafeStorageLocator):
            pdf_storage.target_for_pdf(
                legacy_row,
                root=self.storage_root,
                legacy_owner_segment=self.user.username,
            )

    def test_v2_key_grammar_is_exact_and_bound_to_the_database_row(self) -> None:
        key = pdf_storage.make_pdf_key(self.user.id, 9)
        self.assertEqual(
            pdf_storage.validate_pdf_key(key, owner_id=self.user.id, pdf_id=9),
            key,
        )
        invalid_keys = (
            key.replace(f"pdfs/{self.user.id}/", "pdfs/999/"),
            key.replace("/9/", "/10/"),
            key.replace("/", "\\"),
            f"pdfs/{self.user.id}/9/../secret.pdf",
            f"pdfs/{self.user.id}/9/not-a-uuid.pdf",
        )
        for invalid_key in invalid_keys:
            with self.subTest(key=invalid_key):
                with self.assertRaises(pdf_storage.UnsafeStorageLocator):
                    pdf_storage.validate_pdf_key(
                        invalid_key,
                        owner_id=self.user.id,
                        pdf_id=9,
                    )

    def test_s3_provider_read_error_is_wrapped_without_leaking_sdk_details(self) -> None:
        key = pdf_storage.make_pdf_key(self.user.id, 41)
        pdf_row = SimpleNamespace(
            id=41,
            owner_id=self.user.id,
            file_path="https://private.invalid/never-used",
            storage_backend=pdf_storage.S3_BACKEND,
            storage_key=key,
        )
        with patch(
            "app.services.s3_storage.download_bytes",
            side_effect=RuntimeError("bucket=secret-bucket credential=secret"),
        ):
            with self.assertRaisesRegex(OSError, "private PDF object") as raised:
                pdf_storage.read_pdf_bytes(pdf_row, root=self.storage_root)
        self.assertNotIn("secret-bucket", str(raised.exception))

    def test_legacy_delete_helper_never_unlinks_outside_private_storage(self) -> None:
        contained = self.storage_root / "legacy.pdf"
        contained.write_bytes(b"contained")
        outside_storage = TemporaryDirectory()
        self.addCleanup(outside_storage.cleanup)
        outside = Path(outside_storage.name) / "must-survive.pdf"
        outside.write_bytes(b"outside")

        self.assertIsNone(delete_pdf_file(contained, root=self.storage_root))
        self.assertFalse(contained.exists())
        failure = delete_pdf_file(outside, root=self.storage_root)
        self.assertIn("message", failure)
        self.assertTrue(outside.exists())


if __name__ == "__main__":
    unittest.main()
