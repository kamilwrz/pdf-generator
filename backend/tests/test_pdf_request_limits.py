"""Resource limits and pre-render export admission for PDF routes."""
from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

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
from app.models.models import Base, UsageCounter, User
from app.schemas.pdf_schema import (
    MAX_PATH_CURVES,
    MAX_PDF_ELEMENTS,
    MAX_PDF_PAGES,
    MAX_PDF_REQUEST_BYTES,
    MAX_POLYGON_POINTS,
    MAX_RESOLVED_TEXT_LINES,
    MAX_TEXT_RUNS,
    PDFCreateRequest,
    PdfElement,
)
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _element(index: int = 1) -> dict:
    return {
        "category": "text",
        "element_id": f"element-{index}",
        "page": 1,
        "left": 10,
        "top": 10,
        "content": "CV",
    }


def _payload() -> dict:
    return {
        "root": [_element()],
        "pdf_title": "bounded-cv",
        "pages": 1,
        "page_width": 595,
        "page_height": 842,
    }


class PdfSchemaResourceLimitTests(unittest.TestCase):
    """Keep parser and renderer work proportional to a legitimate CV."""

    def test_root_element_limit_accepts_boundary_and_rejects_one_more(self):
        boundary = PDFCreateRequest(
            root=[_element(index) for index in range(MAX_PDF_ELEMENTS)],
            pdf_title="large-but-valid",
        )
        self.assertEqual(len(boundary.root), MAX_PDF_ELEMENTS)

        with self.assertRaises(ValidationError):
            PDFCreateRequest(
                root=[_element(index) for index in range(MAX_PDF_ELEMENTS + 1)],
                pdf_title="too-large",
            )

    def test_nested_geometry_and_text_arrays_are_bounded(self):
        valid = PdfElement(
            category="path",
            element_id="boundary",
            runs=[{"start": 0, "end": 0}] * MAX_TEXT_RUNS,
            resolvedLines=[
                {"text": "", "start": 0, "end": 0}
            ] * MAX_RESOLVED_TEXT_LINES,
            points=[[0.0, 0.0]] * MAX_POLYGON_POINTS,
            curves=[{"type": "M", "x": 0, "y": 0}] * MAX_PATH_CURVES,
        )
        self.assertEqual(len(valid.runs or []), MAX_TEXT_RUNS)
        self.assertEqual(len(valid.resolvedLines or []), MAX_RESOLVED_TEXT_LINES)

        for field, value in (
            ("runs", [{"start": 0, "end": 0}] * (MAX_TEXT_RUNS + 1)),
            (
                "resolvedLines",
                [{"text": "", "start": 0, "end": 0}]
                * (MAX_RESOLVED_TEXT_LINES + 1),
            ),
            ("points", [[0.0, 0.0]] * (MAX_POLYGON_POINTS + 1)),
            ("curves", [{"type": "M"}] * (MAX_PATH_CURVES + 1)),
        ):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                PdfElement(category="path", element_id="too-many", **{field: value})

    def test_page_count_is_bounded_before_reportlab_allocates_pages(self):
        accepted = PDFCreateRequest(
            root=[_element()],
            pdf_title="twenty-pages",
            pages=MAX_PDF_PAGES,
        )
        self.assertEqual(accepted.pages, MAX_PDF_PAGES)
        with self.assertRaises(ValidationError):
            PDFCreateRequest(
                root=[_element()],
                pdf_title="too-many-pages",
                pages=MAX_PDF_PAGES + 1,
            )


class PdfRouteResourceLimitTests(unittest.TestCase):
    """Use independent sessions so concurrent claims exercise real SQL."""

    def setUp(self):
        ensure_test_auth_env()
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "pdf-limits.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 30},
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        with self.SessionLocal() as db:
            ent.seed_plans(db)
            user_crud.create_user(
                db,
                UserCreateRequest(
                    username="pdf-limit-user",
                    email="pdf-limit@example.test",
                    password="correct horse battery",
                ),
            )
            self.user_id = int(
                db.query(User.id).filter(User.username == "pdf-limit-user").scalar()
            )

        def _override_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {
            "sub": "pdf-limit-user"
        }
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _exports_count(self) -> int:
        with self.SessionLocal() as db:
            row = db.query(UsageCounter).filter_by(
                user_id=self.user_id,
                period_key=ent.current_period_key(),
            ).one_or_none()
            return int(row.exports_count) if row is not None else 0

    def test_transport_allows_exact_boundary_and_rejects_one_byte_more(self):
        encoded = json.dumps(_payload(), separators=(",", ":")).encode("utf-8")
        boundary_body = encoded + (b" " * (MAX_PDF_REQUEST_BYTES - len(encoded)))
        self.assertEqual(len(boundary_body), MAX_PDF_REQUEST_BYTES)

        with patch.object(
            pdf_route,
            "render_document_bytes",
            return_value=b"%PDF-bounded",
        ) as renderer:
            accepted = self.client.post(
                "/pdf/render_pdf",
                content=boundary_body,
                headers={"Content-Type": "application/json"},
            )
        self.assertEqual(accepted.status_code, 200, msg=accepted.text)
        renderer.assert_called_once()

        with patch.object(
            pdf_route,
            "render_document_bytes",
            return_value=b"%PDF-must-not-render",
        ) as renderer:
            rejected = self.client.post(
                "/pdf/render_pdf",
                content=boundary_body + b" ",
                headers={"Content-Type": "application/json"},
            )
        self.assertEqual(rejected.status_code, 413)
        self.assertEqual(
            rejected.json()["detail"],
            {
                "code": "pdf_request_too_large",
                "message": "Żądanie PDF przekracza limit 4 MiB.",
            },
        )
        renderer.assert_not_called()

    def test_transport_cap_covers_every_pdf_route_with_a_request_body(self):
        oversized = b"{}" + (b" " * (MAX_PDF_REQUEST_BYTES - 1))
        self.assertEqual(len(oversized), MAX_PDF_REQUEST_BYTES + 1)

        routes = (
            ("POST", "/pdf/create_pdf"),
            ("POST", "/pdf/render_pdf"),
            ("POST", "/pdf/show_pdf"),
            ("DELETE", "/pdf/delete_pdf"),
            ("PUT", "/pdf/update_pdf"),
            ("PUT", "/pdf/save_elements"),
            ("POST", "/pdf/download_pdf"),
        )
        for method, path in routes:
            with self.subTest(method=method, path=path):
                response = self.client.request(
                    method,
                    path,
                    content=oversized,
                    headers={"Content-Type": "application/json"},
                )
                self.assertEqual(response.status_code, 413, response.text)
                self.assertEqual(
                    response.json()["detail"]["code"],
                    "pdf_request_too_large",
                )

    def test_failed_local_render_refunds_provisional_export_claim(self):
        with patch.object(
            pdf_route,
            "render_document_bytes",
            side_effect=HTTPException(
                status_code=422,
                detail={"code": "invalid_canvas", "message": "Błędny dokument."},
            ),
        ):
            response = self.client.post("/pdf/render_pdf", json=_payload())

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self._exports_count(), 0)

    def test_burst_never_starts_more_renderers_than_available_export_slots(self):
        render_count = 0
        count_lock = threading.Lock()

        def _counted_render(*_args, **_kwargs):
            nonlocal render_count
            with count_lock:
                render_count += 1
            # Keep admitted work overlapping so the test represents a burst,
            # not twenty requests that happen to execute sequentially.
            time.sleep(0.03)
            return b"%PDF-burst"

        with patch.object(pdf_route, "render_document_bytes", _counted_render):
            with ThreadPoolExecutor(max_workers=20) as pool:
                responses = list(
                    pool.map(
                        lambda _index: self.client.post(
                            "/pdf/render_pdf", json=_payload()
                        ),
                        range(20),
                    )
                )

        statuses = [response.status_code for response in responses]
        self.assertEqual(statuses.count(200), 3, statuses)
        self.assertEqual(statuses.count(403), 17, statuses)
        self.assertEqual(render_count, 3)
        self.assertEqual(self._exports_count(), 3)
        for response in responses:
            if response.status_code == 403:
                self.assertEqual(
                    response.json()["detail"]["code"], "plan_limit_exports"
                )


if __name__ == "__main__":
    unittest.main()
