"""Security checks for the image upload endpoint.

These tests pin the upload trust boundary end-to-end through the real FastAPI
app: only genuine raster images are accepted, oversize bodies are rejected, the
per-user count is enforced, and a malicious filename can never influence the
stored path (path-traversal guard). They run against an in-memory SQLite DB so
an accepted upload provably creates the expected `images` row.
"""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import images as images_route
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Image, User

# Minimal byte payloads. Format sniffing only inspects the leading signature, so
# a valid header followed by padding is enough — no decodable image is required.
_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
_HTML_BYTES = b"<html><script>alert(1)</script></html>"


class ImageUploadSecurityTests(unittest.TestCase):
    def setUp(self):
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
        # real backend/uploads folder.
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_upload_dir = images_route.IMAGES_UPLOAD_DIR
        images_route.IMAGES_UPLOAD_DIR = Path(self._tmp.name)

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        images_route.IMAGES_UPLOAD_DIR = self._orig_upload_dir
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

    def test_html_disguised_as_png_is_rejected(self):
        # Correct extension + declared image MIME, but the bytes are HTML: this
        # is the stored-XSS payload the sniffer must reject.
        resp = self._upload("evil.png", _HTML_BYTES, "image/png")
        self.assertEqual(resp.status_code, 415)
        self.assertEqual(self.db.query(Image).count(), 0)

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


if __name__ == "__main__":
    unittest.main()
