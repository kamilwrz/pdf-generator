"""Render-on-demand download (POST /pdf/render_pdf).

Covers the "Pobierz" button that is independent of "Zapisz": the current canvas
is rendered and streamed without ever creating a "Moje dokumenty" row, while
still being export-metered exactly like /download_pdf. A separate unit check
asserts the Free plan renders the same clean PDF as Pro.
"""
from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Image as ImageRow, Pdf, UsageCounter, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service as doc_service
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


# Minimal but valid canvas payload: one text element plus A4 geometry.
def _payload(title: str = "unsaved-cv") -> dict:
    return {
        "root": [
            {
                "category": "text",
                "element_id": "e1",
                "page": 1,
                "left": 10,
                "top": 10,
                "content": "hi",
                "fontFamily": "Inter",
                "fontSize": 12,
                "color": "#000000",
            }
        ],
        "pdf_title": title,
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
    }


class RenderOnDemandTests(unittest.TestCase):
    """Wire-contract coverage for POST /pdf/render_pdf."""

    def setUp(self):
        ensure_test_auth_env()
        # StaticPool + one shared connection so the TestClient worker thread and
        # this thread see the same in-memory database.
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

        user_crud.create_user(self.db, UserCreateRequest(
            username="usr1", email="u1@e.pl", password="correct horse battery"))
        self.user = self.db.query(User).filter(User.username == "usr1").one()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "usr1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _exports_count(self) -> int:
        period = ent.current_period_key()
        row = (
            self.db.query(UsageCounter)
            .filter(
                UsageCounter.user_id == self.user.id,
                UsageCounter.period_key == period,
            )
            .first()
        )
        return int(row.exports_count) if row is not None else 0

    def test_render_streams_pdf_meters_and_persists_no_document(self):
        response = self.client.post("/pdf/render_pdf", json=_payload())
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertIn("application/pdf", response.headers.get("content-type", ""))
        self.assertTrue(response.content.startswith(b"%PDF"))
        # The download is metered like /download_pdf.
        self.assertEqual(self._exports_count(), 1)
        # Independence from Save: no "Moje dokumenty" row was created.
        self.assertEqual(self.db.query(Pdf).count(), 0)

    def test_render_streams_pdf_with_authenticated_circular_profile_photo(self):
        """Exercise the live editor's real image URL and circular PDF clip."""
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is required for the profile-photo export check")

        with TemporaryDirectory() as tmp_dir:
            photo_path = Path(tmp_dir) / "profile.jpg"
            # Phone portraits are commonly much larger than their 104 pt CV
            # slot. Noise prevents the fixture from compressing into an
            # unrealistically tiny source and catches full-resolution embeds.
            Image.effect_noise((1600, 1200), 80).convert("RGB").save(
                photo_path, quality=90,
            )
            image_row = ImageRow(
                filename="profile.jpg",
                file_path=str(photo_path),
                file_size=photo_path.stat().st_size,
                mime_type="image/jpeg",
                owner_id=self.user.id,
            )
            self.db.add(image_row)
            self.db.commit()

            payload = _payload("cv-with-photo")
            payload["root"].append({
                "category": "circle",
                "element_id": "profile-frame",
                "page": 1,
                "left": 433,
                "top": 36,
                "width": 104,
                "height": 104,
                "backgroundColor": "#E7ECE8",
                "filled": True,
                "zIndex": 3,
            })
            payload["root"].append({
                "category": "image",
                "element_id": "profile-photo",
                "src": f"/images/{image_row.id}/content",
                "img_id": image_row.id,
                "page": 1,
                "left": 433,
                "top": 36,
                "width": 104,
                "height": 104,
                "photoSlot": "image",
                "objectFit": "cover",
                "borderRadius": 52,
                "alignWithText": False,
                "zIndex": 4,
            })
            # The resolver accepts only DB locators contained by the configured
            # private image root. This temporary directory stands in for that
            # root without touching real uploads.
            with patch.object(
                doc_service,
                "IMAGES_UPLOAD_DIR",
                Path(tmp_dir),
            ):
                response = self.client.post("/pdf/render_pdf", json=payload)

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertIn("application/pdf", response.headers.get("content-type", ""))
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertLess(len(response.content), 750_000)
        import fitz

        document = fitz.open(stream=response.content, filetype="pdf")
        pixmap = document[0].get_pixmap()
        raster = Image.frombytes(
            "RGB", (pixmap.width, pixmap.height), pixmap.samples,
        )
        # The image is drawn above the sage frame. A missing/empty ellipse clip
        # leaves the center at the frame colour (230, 235, 232).
        center = raster.getpixel((485, 88))
        self.assertLess(sum(center), 620)

    def test_free_plan_export_quota_blocks_fourth_render(self):
        for i in range(3):
            ok = self.client.post("/pdf/render_pdf", json=_payload())
            self.assertEqual(ok.status_code, 200, msg=f"render {i + 1}: {ok.text}")
        self.assertEqual(self._exports_count(), 3)

        blocked = self.client.post("/pdf/render_pdf", json=_payload())
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["code"], "plan_limit_exports")
        # A blocked export neither renders nor increments past the free limit.
        self.assertEqual(self._exports_count(), 3)

    def test_empty_canvas_is_rejected_before_metering(self):
        empty = _payload()
        empty["root"] = []
        response = self.client.post("/pdf/render_pdf", json=empty)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self._exports_count(), 0)

    def test_free_plan_forwards_clean_render_flag_to_renderer(self):
        # Capture the shared render-buffer call without decoding PDF bytes. Free
        # exports must remain clean even though the helper retains its legacy
        # watermark parameter for stored-file compatibility.
        from app.schemas.pdf_schema import PDFCreateRequest

        pdf_data = PDFCreateRequest(**_payload())
        with patch.object(doc_service, "build_pdf_to_buffer", return_value=b"%PDF-fake") as buf:
            doc_service.render_document_bytes(self.db, user=self.user, pdf_data=pdf_data)
        self.assertTrue(buf.called)
        self.assertFalse(buf.call_args.kwargs["watermark"])


if __name__ == "__main__":
    unittest.main()
