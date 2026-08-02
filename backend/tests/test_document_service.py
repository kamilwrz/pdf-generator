"""Unit tests for PDF document service image resolution."""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.models import Base, Image, User
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
        self.db.close()
        self.engine.dispose()
        self._tmp.cleanup()

    def test_resolves_authenticated_content_url_via_img_id(self):
        src = f"https://api.example.com/images/{self.img_id}/content"
        resolved = resolve_image_src_for_pdf(self.db, src)
        self.assertEqual(Path(resolved).resolve(), self.file_path.resolve())


if __name__ == "__main__":
    unittest.main()
