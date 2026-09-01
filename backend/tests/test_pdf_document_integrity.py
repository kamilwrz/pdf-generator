"""Regression coverage for document idempotency, revisions, and provenance."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, PdfElements, User
from app.schemas.pdf_schema import PDFUpdateRequest
from app.schemas.user_schema import UserCreateRequest
from app.services import document_service, entitlements
from app.testing_support import ensure_test_auth_env


def _element(content: str = "Initial") -> dict:
    return {
        "category": "text",
        "element_id": "integrity-text",
        "page": 1,
        "left": 24,
        "top": 24,
        "content": content,
        "fontFamily": "Inter",
        "fontSize": 12,
        "color": "#111111",
    }


def _payload(
    title: str,
    *,
    pdf_id: int | None = None,
    expected_revision: int | None = None,
    content: str = "Initial",
    editor_mode: str = "freeform",
    template_id: str | None = None,
) -> dict:
    payload = {
        "root": [_element(content)],
        "pdf_title": title,
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
        "editor_mode": editor_mode,
        "template_id": template_id,
    }
    if pdf_id is not None:
        payload["pdf_id"] = pdf_id
    if expected_revision is not None:
        payload["expected_revision"] = expected_revision
    return payload


class PdfDocumentIntegrityTests(unittest.TestCase):
    """Exercise public contracts and the storage/database saga boundary."""

    def setUp(self) -> None:
        ensure_test_auth_env()
        self.temporary_directory = TemporaryDirectory()
        root = Path(self.temporary_directory.name)
        self.storage_root = root / "storage"
        self.engine = create_engine(f"sqlite:///{(root / 'test.db').as_posix()}")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        entitlements.seed_plans(self.db)
        user_crud.create_user(
            self.db,
            UserCreateRequest(
                username="integrity-owner",
                email="integrity-owner@example.com",
                password="correct horse battery",
            ),
        )
        self.user = self.db.query(User).filter(
            User.username == "integrity-owner"
        ).one()
        entitlements.set_user_plan(self.db, self.user.id, "pro")

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": self.user.username}
        self.client = TestClient(app)
        self.patches = (
            patch.object(document_service, "PDF_UPLOAD_DIR", self.storage_root),
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
        self.temporary_directory.cleanup()

    def _create(self, title: str, key: str, **payload_overrides):
        return self.client.post(
            "/pdf/create_pdf",
            json=_payload(title, **payload_overrides),
            headers={"Idempotency-Key": key},
        )

    def test_create_requires_a_valid_idempotency_key(self) -> None:
        missing = self.client.post(
            "/pdf/create_pdf", json=_payload("Missing key"),
        )
        self.assertEqual(missing.status_code, 400, missing.text)
        self.assertEqual(missing.json()["detail"]["code"], "invalid_idempotency_key")

        control = self._create("Control key", "bad\rkey")
        self.assertEqual(control.status_code, 400, control.text)
        self.assertEqual(control.json()["detail"]["code"], "invalid_idempotency_key")

    def test_create_replays_same_payload_and_rejects_key_reuse(self) -> None:
        first = self._create("Retry-safe CV", "retry-safe-create")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["revision"], 1)
        self.assertFalse(first.json()["replayed"])

        replay = self._create("Retry-safe CV", "retry-safe-create")
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()["pdf_id"], first.json()["pdf_id"])
        self.assertTrue(replay.json()["replayed"])
        self.assertEqual(self.db.query(Pdf).count(), 1)
        self.assertEqual(len(list(self.storage_root.rglob("*.pdf"))), 1)

        mismatch = self._create("Different payload", "retry-safe-create")
        self.assertEqual(mismatch.status_code, 409, mismatch.text)
        self.assertEqual(
            mismatch.json()["detail"]["code"],
            "idempotency_payload_mismatch",
        )

    def test_canonical_title_collision_is_per_owner(self) -> None:
        first = self._create("Résumé", "canonical-title-one")
        self.assertEqual(first.status_code, 200, first.text)
        duplicate = self._create("RE\u0301SUME\u0301", "canonical-title-two")
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        self.assertEqual(duplicate.json()["detail"]["code"], "title_conflict")

    def test_full_update_advances_revision_and_rejects_stale_write(self) -> None:
        created = self._create("Revision CV", "revision-create")
        pdf_id = created.json()["pdf_id"]
        update = self.client.put(
            "/pdf/update_pdf",
            json=_payload(
                "Revision CV",
                pdf_id=pdf_id,
                expected_revision=1,
                content="Winning content",
            ),
        )
        self.assertEqual(update.status_code, 201, update.text)
        self.assertEqual(update.json()["revision"], 2)
        current_row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()
        current_key = current_row.storage_key

        stale = self.client.put(
            "/pdf/update_pdf",
            json=_payload(
                "Revision CV",
                pdf_id=pdf_id,
                expected_revision=1,
                content="Stale content",
            ),
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["detail"]["code"], "document_conflict")
        self.assertEqual(stale.json()["detail"]["current_revision"], 2)
        self.db.expire_all()
        self.assertEqual(self.db.query(Pdf).filter(Pdf.id == pdf_id).one().storage_key, current_key)
        element = self.db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).one()
        self.assertEqual(element.content, "Winning content")
        self.assertEqual(len(list(self.storage_root.rglob("*.pdf"))), 1)

    def test_atomic_claim_catches_a_stale_loaded_row(self) -> None:
        created = self._create("Concurrent CV", "concurrent-create")
        pdf_id = created.json()["pdf_id"]
        stale_row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()

        winner_db = self.Session()
        try:
            winner_user = winner_db.query(User).filter(User.id == self.user.id).one()
            winner_row = winner_db.query(Pdf).filter(Pdf.id == pdf_id).one()
            winner_payload = PDFUpdateRequest.model_validate(
                _payload(
                    "Concurrent CV",
                    pdf_id=pdf_id,
                    expected_revision=1,
                    content="Winner",
                )
            )
            winner = document_service.save_pdf_elements_document(
                winner_db,
                pdf_row=winner_row,
                user=winner_user,
                pdf_data=winner_payload,
            )
            self.assertEqual(winner["revision"], 2)
        finally:
            winner_db.close()

        stale_payload = PDFUpdateRequest.model_validate(
            _payload(
                "Concurrent CV",
                pdf_id=pdf_id,
                expected_revision=1,
                content="Loser",
            )
        )
        with self.assertRaises(HTTPException) as raised:
            document_service.save_pdf_elements_document(
                self.db,
                pdf_row=stale_row,
                user=self.user,
                pdf_data=stale_payload,
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["current_revision"], 2)

    def test_update_title_race_compensates_new_object(self) -> None:
        first = self._create("First title", "first-title-create")
        second = self._create("Second title", "second-title-create")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        before_paths = set(self.storage_root.rglob("*.pdf"))

        with patch.object(
            document_service,
            "_has_title_conflict",
            side_effect=[False, True],
        ):
            collision = self.client.put(
                "/pdf/update_pdf",
                json=_payload(
                    "FIRST TITLE",
                    pdf_id=second.json()["pdf_id"],
                    expected_revision=1,
                    content="Must roll back",
                ),
            )
        self.assertEqual(collision.status_code, 409, collision.text)
        self.assertEqual(collision.json()["detail"]["code"], "title_conflict")
        self.assertEqual(set(self.storage_root.rglob("*.pdf")), before_paths)
        self.db.expire_all()
        second_row = self.db.query(Pdf).filter(Pdf.id == second.json()["pdf_id"]).one()
        self.assertEqual(second_row.title, "Second title")
        self.assertEqual(second_row.revision, 1)

    def test_freeform_unlock_clears_current_template_but_keeps_origin(self) -> None:
        created = self._create(
            "Template CV",
            "template-provenance-create",
            editor_mode="template",
            template_id="sterling",
        )
        self.assertEqual(created.status_code, 200, created.text)
        pdf_id = created.json()["pdf_id"]
        unlocked = self.client.put(
            "/pdf/save_elements",
            json=_payload(
                "Template CV",
                pdf_id=pdf_id,
                expected_revision=1,
                editor_mode="freeform",
                template_id="sterling",
            ),
        )
        self.assertEqual(unlocked.status_code, 200, unlocked.text)
        self.db.expire_all()
        row = self.db.query(Pdf).filter(Pdf.id == pdf_id).one()
        self.assertEqual(row.editor_mode, "freeform")
        self.assertIsNone(row.template_id)
        self.assertEqual(row.origin_template_id, "sterling")

        invalid = _payload(
            "Invalid template",
            pdf_id=pdf_id,
            expected_revision=2,
            editor_mode="template",
        )
        with self.assertRaises(ValidationError):
            PDFUpdateRequest.model_validate(invalid)

    def test_unrelated_orm_update_preserves_migration_suffixed_title_key(self) -> None:
        row = Pdf(
            title="Legacy duplicate",
            title_key="legacy duplicate~42",
            owner_id=self.user.id,
            pages=1,
            page_width=595,
            page_height=842,
            revision=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(row)
        self.db.commit()
        row.pages = 2
        self.db.commit()
        self.db.refresh(row)
        self.assertEqual(row.title_key, "legacy duplicate~42")


if __name__ == "__main__":
    unittest.main()
