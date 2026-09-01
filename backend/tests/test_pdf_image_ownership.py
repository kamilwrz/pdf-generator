"""Owner-scoped image validation for every PDF mutation/render endpoint."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import ai_assistant as ai_assistant_route
from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Image, Pdf, PdfElements, User
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service, entitlements, image_storage
from app.testing_support import ensure_test_auth_env


class PdfImageOwnershipTests(unittest.TestCase):
    """Reject cross-user or inconsistent image references before any write."""

    def setUp(self) -> None:
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        entitlements.seed_plans(self.db)
        user_crud.create_user(
            self.db,
            UserCreateRequest(
                username="image-owner",
                email="image-owner@example.com",
                password="correct horse battery",
            ),
        )
        user_crud.create_user(
            self.db,
            UserCreateRequest(
                username="document-owner",
                email="document-owner@example.com",
                password="correct horse battery",
            ),
        )
        self.image_owner = self.db.query(User).filter(
            User.username == "image-owner"
        ).one()
        self.document_owner = self.db.query(User).filter(
            User.username == "document-owner"
        ).one()
        entitlements.set_user_plan(self.db, self.document_owner.id, "pro")

        self.temporary_image_storage = TemporaryDirectory()
        self.image_storage_root = Path(self.temporary_image_storage.name)
        foreign_image_path = self.image_storage_root / "legacy" / "foreign.png"
        owned_image_path = self.image_storage_root / "legacy" / "owned.png"
        foreign_image_path.parent.mkdir(parents=True)
        foreign_image_path.write_bytes(b"foreign")
        owned_image_path.write_bytes(b"owned")

        now = datetime.now(timezone.utc)
        foreign_image = Image(
            filename="foreign.png",
            file_path=str(foreign_image_path),
            file_size=8,
            mime_type="image/png",
            uploaded_at=now,
            owner_id=self.image_owner.id,
        )
        owned_image = Image(
            filename="owned.png",
            file_path=str(owned_image_path),
            file_size=8,
            mime_type="image/png",
            uploaded_at=now,
            owner_id=self.document_owner.id,
        )
        self.db.add_all([foreign_image, owned_image])
        self.db.flush()
        self.foreign_image_id = foreign_image.id
        self.owned_image_id = owned_image.id

        pdf_row = Pdf(
            title="Owned document",
            file_path=None,
            owner_id=self.document_owner.id,
            pages=1,
            page_width=595,
            page_height=842,
            watermarked=False,
            created_at=now,
            updated_at=now,
        )
        self.db.add(pdf_row)
        self.db.flush()
        self.pdf_id = pdf_row.id
        self.db.add(
            PdfElements(
                pdf_id=self.pdf_id,
                element_id="existing-text",
                category="text",
                page=1,
                left=10,
                top=10,
                content="Existing",
                fontFamily="Inter",
                fontSize=12,
                color="#111111",
                extra_properties={},
            )
        )
        self.db.commit()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "document-owner"}
        self.client = TestClient(app)

        self.temporary_storage = TemporaryDirectory()
        storage_root = Path(self.temporary_storage.name)
        self.patches = (
            patch.object(document_service, "PDF_UPLOAD_DIR", storage_root),
            patch.object(
                document_service,
                "IMAGES_UPLOAD_DIR",
                self.image_storage_root,
            ),
            patch.object(document_service, "USE_S3", False),
            patch.object(pdf_route, "USE_S3", False),
        )
        for active_patch in self.patches:
            active_patch.start()

    def tearDown(self) -> None:
        for active_patch in reversed(self.patches):
            active_patch.stop()
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        self.temporary_storage.cleanup()
        self.temporary_image_storage.cleanup()

    def _payload(self, *, pdf_id: int | None = None, img_id: int | None = None) -> dict:
        image_id = self.foreign_image_id if img_id is None else img_id
        payload = {
            "root": [
                {
                    "category": "image",
                    "element_id": "profile-photo",
                    "page": 1,
                    "left": 24,
                    "top": 24,
                    "width": 96,
                    "height": 96,
                    "src": f"/images/{self.foreign_image_id}/content",
                    "img_id": image_id,
                }
            ],
            "pdf_title": "Image ownership",
            "pages": 1,
            "page_width": 595,
            "page_height": 842,
        }
        if pdf_id is not None:
            payload["pdf_id"] = pdf_id
            payload["expected_revision"] = 1
        return payload

    def test_foreign_image_is_rejected_by_create_update_render_and_autosave(self) -> None:
        requests = (
            ("POST", "/pdf/create_pdf", self._payload()),
            ("POST", "/pdf/render_pdf", self._payload()),
            ("PUT", "/pdf/update_pdf", self._payload(pdf_id=self.pdf_id)),
            ("PUT", "/pdf/save_elements", self._payload(pdf_id=self.pdf_id)),
        )
        for method, path, payload in requests:
            with self.subTest(path=path):
                headers = (
                    {"Idempotency-Key": "foreign-image-create"}
                    if path == "/pdf/create_pdf"
                    else None
                )
                response = self.client.request(
                    method, path, json=payload, headers=headers,
                )
                self.assertEqual(response.status_code, 404, msg=response.text)
                self.assertEqual(response.json()["detail"]["code"], "image_not_found")

        self.assertEqual(
            self.db.query(Pdf).filter(Pdf.owner_id == self.document_owner.id).count(),
            1,
        )
        self.assertEqual(
            self.db.query(PdfElements).filter(
                PdfElements.pdf_id == self.pdf_id,
                PdfElements.img_id == self.foreign_image_id,
            ).count(),
            0,
        )

    def test_owned_img_id_cannot_be_paired_with_another_users_src(self) -> None:
        response = self.client.put(
            "/pdf/save_elements",
            json=self._payload(pdf_id=self.pdf_id, img_id=self.owned_image_id),
        )
        self.assertEqual(response.status_code, 404, msg=response.text)
        self.assertEqual(response.json()["detail"]["code"], "image_not_found")
        self.assertEqual(
            self.db.query(PdfElements).filter(
                PdfElements.pdf_id == self.pdf_id,
                PdfElements.img_id.is_not(None),
            ).count(),
            0,
        )

    def test_owned_img_id_cannot_bypass_source_allowlist(self) -> None:
        for src in ("https://evil.example/track", "", "/uploads/owned.png"):
            with self.subTest(src=src):
                payload = self._payload(
                    pdf_id=self.pdf_id,
                    img_id=self.owned_image_id,
                )
                payload["root"][0]["src"] = src
                response = self.client.put("/pdf/save_elements", json=payload)
                self.assertEqual(response.status_code, 422, msg=response.text)
                self.assertEqual(
                    response.json()["detail"]["code"],
                    "invalid_image_source",
                )

    def test_autosave_authorizes_owned_s3_image_without_downloading_it(self) -> None:
        owned_image = self.db.query(Image).filter(Image.id == self.owned_image_id).one()
        owned_image.file_path = (
            "https://private-bucket.s3.eu-central-1.amazonaws.com/"
            f"images/{self.document_owner.id}/{'a' * 32}.png"
        )
        self.db.commit()
        payload = self._payload(pdf_id=self.pdf_id, img_id=self.owned_image_id)
        payload["root"][0]["src"] = f"/images/{self.owned_image_id}/content"

        with patch.object(
            document_service,
            "image_src_to_local_path",
            side_effect=AssertionError("autosave must not fetch image bytes"),
        ), patch.object(
            image_storage,
            "S3_BUCKET",
            "private-bucket",
        ), patch.object(
            image_storage,
            "AWS_REGION",
            "eu-central-1",
        ):
            response = self.client.put("/pdf/save_elements", json=payload)

        self.assertEqual(response.status_code, 200, msg=response.text)
        saved = self.db.query(PdfElements).filter(
            PdfElements.pdf_id == self.pdf_id,
            PdfElements.element_id == "profile-photo",
        ).one()
        self.assertEqual(saved.img_id, self.owned_image_id)

    def test_arbitrary_urls_and_legacy_upload_paths_are_rejected(self) -> None:
        for index, src in enumerate((
            "https://evil.example/images/1/content",
            "file:///private/profile.png",
            "/uploads/document-owner/profile.png",
            "//evil.example/images/1/content",
            "/api/images/1/content",
            "https://evil.example/template-assets/iconic/black/mail.png",
            "file:///template-assets/iconic/black/mail.png",
        )):
            with self.subTest(src=src):
                payload = self._payload(pdf_id=self.pdf_id)
                payload["root"][0]["src"] = src
                payload["root"][0]["img_id"] = None
                payload["root"][0]["element_id"] = f"invalid-source-{index}"
                response = self.client.put("/pdf/save_elements", json=payload)
                self.assertEqual(response.status_code, 422, msg=response.text)
                self.assertEqual(
                    response.json()["detail"]["code"],
                    "invalid_image_source",
                )

    def test_empty_image_source_without_owned_id_is_rejected(self) -> None:
        payload = self._payload(pdf_id=self.pdf_id)
        payload["root"][0]["src"] = ""
        payload["root"][0]["img_id"] = None

        response = self.client.put("/pdf/save_elements", json=payload)

        self.assertEqual(response.status_code, 422, msg=response.text)
        self.assertEqual(
            response.json()["detail"]["code"],
            "invalid_image_source",
        )

    def test_owned_database_row_cannot_resolve_local_path_outside_image_root(self) -> None:
        outside = TemporaryDirectory()
        self.addCleanup(outside.cleanup)
        outside_path = Path(outside.name) / "outside.png"
        outside_path.write_bytes(b"outside")
        owned_image = self.db.query(Image).filter_by(id=self.owned_image_id).one()
        owned_image.file_path = str(outside_path)
        self.db.commit()
        payload = self._payload(pdf_id=self.pdf_id, img_id=self.owned_image_id)
        payload["root"][0]["src"] = f"/images/{self.owned_image_id}/content"

        response = self.client.put("/pdf/save_elements", json=payload)

        self.assertEqual(response.status_code, 404, msg=response.text)
        self.assertEqual(response.json()["detail"]["code"], "image_not_found")

    def test_five_hundred_duplicate_image_elements_download_one_object(self) -> None:
        owned_image = self.db.query(Image).filter_by(id=self.owned_image_id).one()
        owned_image.file_path = (
            "https://private-bucket.s3.eu-central-1.amazonaws.com/"
            f"images/{self.document_owner.id}/{'e' * 32}.png"
        )
        self.db.commit()
        elements = [
            {
                "category": "image",
                "element_id": f"duplicate-{index}",
                "src": f"/images/{self.owned_image_id}/content",
                "img_id": self.owned_image_id,
            }
            for index in range(500)
        ]

        with patch.object(
            image_storage,
            "S3_BUCKET",
            "private-bucket",
        ), patch.object(
            image_storage,
            "AWS_REGION",
            "eu-central-1",
        ), patch.object(
            document_service,
            "image_src_to_local_path",
            return_value="C:/request-scoped/profile.png",
        ) as download:
            resolved = document_service.validate_and_resolve_image_elements(
                self.db,
                elements,
                owner_id=self.document_owner.id,
                resolve_paths=True,
                temporary_image_dir="C:/request-scoped",
            )

        self.assertEqual(download.call_count, 1)
        self.assertEqual(
            resolved[f"/images/{self.owned_image_id}/content"],
            "C:/request-scoped/profile.png",
        )

    def test_ai_rejects_foreign_image_before_provider_or_credit_reservation(self) -> None:
        payload = {
            "action": "rating",
            "elements": self._payload()["root"],
        }
        with patch.object(
            ai_assistant_route,
            "analyze_action",
            side_effect=AssertionError("provider must not run for a foreign image"),
        ):
            response = self.client.post(
                "/ai/assistant",
                json=payload,
                headers={"Idempotency-Key": "foreign-image-ai"},
            )

        self.assertEqual(response.status_code, 404, msg=response.text)
        self.assertEqual(response.json()["detail"]["code"], "image_not_found")


if __name__ == "__main__":
    unittest.main()
