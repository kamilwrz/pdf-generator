"""Unit tests for PDF document service image resolution."""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import BACKEND_URL
from app.models.models import Base, Image, User
from app.services import document_service
from app.services.document_service import resolve_image_src_for_pdf
from app.testing_support import ensure_test_auth_env


class DocumentServiceImageResolverTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine("sqlite:///:memory:")
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
        self._tmp = tempfile.TemporaryDirectory()
        self._image_root_patch = patch.object(
            document_service,
            "IMAGES_UPLOAD_DIR",
            Path(self._tmp.name),
        )
        self._image_root_patch.start()
        self.file_path = Path(self._tmp.name) / "photo.png"
        self.file_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
        user = self.db.query(User).one()
        self.db.add(Image(
            filename="photo.png",
            file_size=self.file_path.stat().st_size,
            file_path=str(self.file_path),
            mime_type="image/png",
            owner_id=user.id,
        ))
        self.db.commit()
        self.img_id = self.db.query(Image).one().id

    def tearDown(self):
        self._image_root_patch.stop()
        self.db.close()
        self.engine.dispose()
        self._tmp.cleanup()

    def test_resolves_authenticated_content_url_via_img_id(self):
        # Absolute URLs are accepted only for the configured backend host;
        # allowing an arbitrary origin here would reopen server-side fetching.
        src = f"{BACKEND_URL.rstrip('/')}/images/{self.img_id}/content"
        owner_id = self.db.query(User).one().id
        resolved = resolve_image_src_for_pdf(self.db, src, owner_id)
        self.assertEqual(Path(resolved).resolve(), self.file_path.resolve())

    def test_rejects_local_image_locator_outside_private_root(self):
        outside = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        outside_path = Path(outside.name)
        outside.close()
        self.addCleanup(outside_path.unlink, missing_ok=True)
        image = self.db.query(Image).one()
        image.file_path = str(outside_path)
        self.db.commit()

        src = f"{BACKEND_URL.rstrip('/')}/images/{self.img_id}/content"
        owner_id = self.db.query(User).one().id
        with self.assertRaisesRegex(Exception, "404"):
            resolve_image_src_for_pdf(self.db, src, owner_id)

    def test_render_temp_artifacts_are_removed_after_failure(self):
        observed_directory = None

        def fake_resolver(_db, _owner_id, _elements, *, temporary_image_dir):
            nonlocal observed_directory
            observed_directory = Path(temporary_image_dir)
            (observed_directory / "downloaded.png").write_bytes(b"image")
            return lambda src: src

        with patch.object(
            document_service,
            "make_image_resolver",
            side_effect=fake_resolver,
        ), patch.object(
            document_service,
            "build_pdf_to_buffer",
            side_effect=RuntimeError("render failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "render failed"):
                document_service._render_bytes(
                    self.db,
                    user=SimpleNamespace(id=self.db.query(User).one().id),
                    pdf_data=SimpleNamespace(),
                    elements=[SimpleNamespace(category="text")],
                )

        self.assertIsNotNone(observed_directory)
        self.assertFalse(observed_directory.exists())

    def test_request_scoped_cleanup_uses_small_fixed_limit(self):
        with patch.object(document_service, "process_cleanup_jobs") as process:
            document_service._drain_cleanup_best_effort(self.db)

        self.assertEqual(
            process.call_args.kwargs["limit"],
            document_service.REQUEST_CLEANUP_LIMIT,
        )


if __name__ == "__main__":
    unittest.main()
