# Etap 2a: Free-plan watermark + 1-lifetime-free-import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free-plan PDF exports carry a diagonal watermark; Free-plan accounts get exactly one lifetime free `extract_cv` (CV import) call. Standard/Premium are untouched. No plan restructuring, no pricing changes — those are Etap 2b.

**Architecture:** A new `watermark: bool` parameter threads through the existing ReportLab render path (`PDF_Generator.render_elements` → `_draw_watermark` overlay, drawn after normal element rendering so it never touches the coordinate system other draws rely on). A new `Pdf.watermarked` column tracks what's *currently baked into* the stored file; `download_pdf` only re-renders when that stops matching the account's current plan (e.g. right after an upgrade), so the common case (no plan change) stays a cheap static-file serve — no added cost for paying Standard/Premium users. A new `elements_from_rows` helper reconstructs full `PdfElement` objects from stored `PdfElements` rows (unpacking `extra_properties`) so that re-render can happen without the client re-sending anything. Import gating is a boolean flag on `UserSubscription`, checked in the existing `assert_can_extract_cv` gate.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, ReportLab, Pydantic — all existing, no new dependencies.

## Global Constraints

- Watermark applies **only** to the `free` plan (`entitlements["plan_slug"] == "free"`). Standard/Premium rendering, storage, and download behavior must be byte-identical to before this plan, in every task.
- The no-watermark path through `render_elements` (default `watermark=False`) must stay byte-for-byte unchanged — this repo's Canvas↔PDF parity convention (see `backend/tests/test_pdf_inline_runs.py` for the pattern) requires every new rendering feature to keep its old behavior reachable and untouched when unused.
- The free import is consumed **only on a successful** `extract_cv_data()` call — a failed/errored extraction must never burn the user's one try.
- Watermark copy: **"CV STUDIO — WERSJA DARMOWA"**, diagonal, ~45°, low-opacity gray, repeated down the page.
- No Stripe, no new billing UI — plan changes still go through the existing manual `POST /billing/select-plan` path.

---

### Task 1: Migration — `free_import_used` and `watermarked` columns

**Files:**
- Create: `backend/alembic/versions/20260809_0004_watermark_free_import.py`
- Modify: `backend/app/models/models.py:164-177` (`UserSubscription`), `backend/app/models/models.py:62-87` (`Pdf`)

**Interfaces:**
- Produces: `UserSubscription.free_import_used: bool` (default `False`), `Pdf.watermarked: bool` (default `False`) — both consumed by Task 2 and Task 6/7.

- [ ] **Step 1: Add the columns to the ORM models**

In `backend/app/models/models.py`, inside `class UserSubscription(Base):` (around line 176, right after `updated_at`):

```python
    updated_at = Column(DateTime, nullable=False)
    # Consumed once, on a successful /ai/extract_cv call, while on the Free
    # plan — see entitlements.assert_can_extract_cv / mark_free_import_used.
    free_import_used = Column(Boolean, nullable=False, default=False)
```

Inside `class Pdf(Base):` (around line 87, right after `spacing_px`):

```python
    spacing_px = Column(JSON, nullable=True)
    # What is CURRENTLY baked into the stored file at file_path — not the
    # account's current plan. download_pdf compares this against the live
    # entitlement and only re-renders when they differ (e.g. right after an
    # upgrade), so an unchanged plan never pays a re-render cost.
    watermarked = Column(Boolean, nullable=False, default=False)
```

Check the top of `models.py` already imports `Boolean` from `sqlalchemy` — if not, add it to the existing `from sqlalchemy import ...` line.

- [ ] **Step 2: Write the migration**

```python
"""Add watermarked (pdfs) and free_import_used (user_subscriptions).

Revision ID: 20260809_0004
Revises: 20260804_0003
Create Date: 2026-08-09

Etap 2a: Free-plan export watermark + one lifetime free CV import.
`pdfs.watermarked` tracks what the stored file currently contains (not the
account's current plan) so download_pdf can skip re-rendering when they
already match. `user_subscriptions.free_import_used` gates the one-time
free `/ai/extract_cv` call for Free accounts.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260809_0004"
down_revision: Union[str, Sequence[str], None] = "20260804_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    pdf_cols = _existing_columns("pdfs")
    if pdf_cols and "watermarked" not in pdf_cols:
        op.add_column(
            "pdfs",
            sa.Column("watermarked", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    sub_cols = _existing_columns("user_subscriptions")
    if sub_cols and "free_import_used" not in sub_cols:
        op.add_column(
            "user_subscriptions",
            sa.Column("free_import_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for SQLite-friendly safety.
    pass
```

- [ ] **Step 3: Run the migration locally**

```bash
cd backend && alembic upgrade head
```

Expected: no errors; `sqlite3 pdfgenerator.db ".schema pdfs"` shows `watermarked BOOLEAN NOT NULL DEFAULT 0` and `.schema user_subscriptions` shows `free_import_used BOOLEAN NOT NULL DEFAULT 0`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260809_0004_watermark_free_import.py backend/app/models/models.py
git commit -m "feat: add pdfs.watermarked and user_subscriptions.free_import_used columns"
```

---

### Task 2: Free-plan lifetime import gate

**Files:**
- Modify: `backend/app/services/entitlements.py:313-357` (`get_entitlements`), `backend/app/services/entitlements.py:442-450` (`assert_can_extract_cv`)
- Modify: `backend/app/api/routes/ai.py:82-107` (`extract_cv`)
- Modify: `backend/tests/test_extract_cv_rejection.py` (existing test asserts unconditional Free rejection — now false; must be rewritten)
- Test: `backend/tests/test_extract_cv_rejection.py`

**Interfaces:**
- Produces: `entitlements.mark_free_import_used(db: Session, user_id: int) -> None`; `get_entitlements(...)` return dict gains `"free_import_used": bool`.
- Consumes: `get_or_create_subscription(db, user_id) -> UserSubscription` (existing, `entitlements.py:191-192`).

- [ ] **Step 1: Expose `free_import_used` in `get_entitlements`**

In `backend/app/services/entitlements.py`, inside `get_entitlements` (around line 331), add one key to the returned dict:

```python
    return {
        "plan_slug": plan.slug,
        "plan_name": plan.name,
        "status": sub.status,
        "ai_assistant": bool(plan.ai_assistant),
        "extract_cv": bool(plan.extract_cv),
        "free_import_used": bool(sub.free_import_used),
        "template_tier": plan.template_tier,
```

- [ ] **Step 2: Add `mark_free_import_used`**

Right after `assert_can_extract_cv` (around line 451), add:

```python
def mark_free_import_used(db: Session, user_id: int) -> None:
    """Consume the Free plan's one lifetime `extract_cv` trial.

    Safe to call unconditionally after ANY successful extraction — it is a
    no-op for accounts that are not on Free, or that have already used it.
    Callers must only invoke this after `extract_cv_data()` succeeds; a
    failed/errored extraction must never consume the free try (see
    `assert_can_extract_cv` for the corresponding gate).
    """
    sub = get_or_create_subscription(db, user_id)
    if sub.plan_slug != "free" or sub.free_import_used:
        return
    sub.free_import_used = True
    db.add(sub)
    db.commit()
```

- [ ] **Step 3: Update `assert_can_extract_cv`**

Replace the existing function (around line 442-450):

```python
def assert_can_extract_cv(db: Session, user: User) -> None:
    """Require extract_cv feature flag plus remaining AI credits.

    Free-plan accounts get exactly one lifetime free extract before this
    gate blocks them (see `mark_free_import_used`, called by the
    `/ai/extract_cv` route only after a successful extraction).
    """
    entitlements = get_entitlements(db, user)
    if not entitlements["extract_cv"]:
        if entitlements["plan_slug"] == "free" and not entitlements["free_import_used"]:
            return
        if entitlements["plan_slug"] == "free":
            raise PlanLimitError(
                "plan_feature_extract_cv",
                "Wykorzystano już darmowy import CV. Ulepsz plan do Standard, "
                "aby importować więcej dokumentów.",
            )
        raise PlanLimitError(
            "plan_feature_extract_cv",
            "Ekstrakcja CV z PDF jest dostępna w planie Standard.",
        )
    assert_has_ai_credits(db, user)
```

- [ ] **Step 4: Wire the route to consume the free import on success**

In `backend/app/api/routes/ai.py`, add the import and call it after a successful extraction (around line 103-105):

```python
from app.services.entitlements import (
    FREE_STARTER_TEMPLATE_IDS,
    PlanLimitError,
    assert_can_extract_cv,
    assert_template_allowed,
    charge_ai_credits,
    mark_free_import_used,
)
```

```python
    try:
        cv_data, usage = extract_cv_data(data)
        charge_ai_credits(db, user.id, usage.get("cost_pln_estimate", 0.0))
        mark_free_import_used(db, user.id)
        return {"cv_data": cv_data, "usage": usage}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Nie udało się wyodrębnić danych z CV: {exc}")
```

- [ ] **Step 5: Rewrite the now-stale rejection test**

`backend/tests/test_extract_cv_rejection.py` currently asserts a Free user's **first** `extract_cv` call is rejected — that is no longer true. Replace its body:

```python
"""Free-plan gate on POST /ai/extract_cv: one lifetime free import, then blocked."""
from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, User, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _extract_must_not_run(*_args, **_kwargs):
    raise AssertionError("extract_cv_data must not be called once the free import is used")


class ExtractCvFreeImportTests(unittest.TestCase):
    """Free plans get exactly one lifetime free `/ai/extract_cv` call."""

    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

        user_crud.create_user(self.db, UserCreateRequest(
            username="u1", email="u1@e.pl", password="pw"))
        self.user = self.db.query(User).filter(User.username == "u1").one()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _sub(self) -> UserSubscription:
        return self.db.query(UserSubscription).filter(
            UserSubscription.user_id == self.user.id
        ).one()

    def test_free_users_first_import_succeeds_and_consumes_the_trial(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            return_value=({"name": "Test"}, {"cost_pln_estimate": 0.0}),
        ):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._sub())
        self.assertTrue(self._sub().free_import_used)

    def test_free_users_second_import_is_rejected(self):
        self._sub().free_import_used = True
        self.db.commit()

        with patch("app.api.routes.ai.extract_cv_data", side_effect=_extract_must_not_run):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        self.assertEqual(response.status_code, 403)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "plan_feature_extract_cv")

    def test_failed_extraction_does_not_consume_the_free_import(self):
        with patch(
            "app.api.routes.ai.extract_cv_data",
            side_effect=RuntimeError("openai boom"),
        ):
            response = self.client.post(
                "/ai/extract_cv",
                files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
        self.assertEqual(response.status_code, 500)
        self.db.refresh(self._sub())
        self.assertFalse(self._sub().free_import_used)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 6: Run the tests**

```bash
cd backend && python -m unittest tests.test_extract_cv_rejection -v
```

Expected: 3/3 PASS.

- [ ] **Step 7: Run the full backend suite** (confirm no other test asserted the old unconditional-rejection behavior)

```bash
cd backend && python -m unittest discover -s tests
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/entitlements.py backend/app/api/routes/ai.py backend/tests/test_extract_cv_rejection.py
git commit -m "feat: allow Free-plan accounts one lifetime free CV import"
```

---

### Task 3: Frontend — surface the free-import state

**Files:**
- Modify: `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx:63,88-93`

**Interfaces:**
- Consumes: `entitlements.plan_slug`, `entitlements.free_import_used`, `entitlements.extract_cv` (all now present on the object `useEntitlements` already returns — no hook change needed, Task 2 added the field server-side).

- [ ] **Step 1: Extend `canExtract`**

In `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`, replace line 63:

```javascript
    const canExtract = Boolean(entitlements?.extract_cv)
        || (entitlements?.plan_slug === "free" && !entitlements?.free_import_used);
```

- [ ] **Step 2: Fix the pre-check error copy for the "already used" case**

Replace the `handleExtract` guard (around lines 88-93):

```javascript
    const handleExtract = useCallback(async () => {
        if (!fileData) return;
        if (!canExtract) {
            setError(
                entitlements?.plan_slug === "free"
                    ? "Wykorzystano już darmowy import CV. Ulepsz plan do Standard, aby importować więcej dokumentów."
                    : "Ekstrakcja CV z PDF jest dostępna w planie Standard.",
            );
            return;
        }
```

- [ ] **Step 3: Manual verification**

Start both dev servers (`backend`: `uvicorn app.main:app --reload`; `frontend`: `npm run dev`). Register a fresh account (defaults to Free). Open **Importuj CV**, upload any PDF — the extract button must be enabled and the call must succeed. Reopen the panel and try again — the button click must show "Wykorzystano już darmowy import CV..." without any network call (check the browser Network tab).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx
git commit -m "feat: let Free-plan users use their one free CV import in the UI"
```

---

### Task 4: Watermark rendering primitive

**Files:**
- Modify: `backend/app/services/pdf_generator.py:130-142` (`__init__`), `backend/app/services/pdf_generator.py:952-1022` (`render_elements`)
- Test: `backend/tests/test_pdf_watermark.py`

**Interfaces:**
- Produces: `PDF_Generator.render_elements(elements, image_resolver, pages=1, watermark=False)` — new optional 4th parameter, default `False` (existing call sites unaffected until Task 6 updates them). `PDF_Generator._draw_watermark()` — private, no external consumers.
- Consumes: `self.c` (ReportLab canvas, existing), `self.page_h` (existing), `self.page_w` (new, this task).

- [ ] **Step 1: Write the failing test**

```python
"""Watermark overlay: opt-in, drawn after elements, byte-identical when unused."""
from __future__ import annotations

import unittest

from app.services.pdf_generator import PDF_Generator


class RecordingCanvas:
    def __init__(self):
        self.calls = []

    def saveState(self):
        self.calls.append(("saveState",))

    def restoreState(self):
        self.calls.append(("restoreState",))

    def setFillColor(self, color):
        self.calls.append(("fill_color", color))

    def setFillAlpha(self, alpha):
        self.calls.append(("fill_alpha", alpha))

    def setFont(self, name, size):
        self.calls.append(("font", name, size))

    def translate(self, x, y):
        self.calls.append(("translate", x, y))

    def rotate(self, degrees):
        self.calls.append(("rotate", degrees))

    def drawCentredString(self, x, y, text):
        self.calls.append(("drawCentredString", x, y, text))

    def showPage(self):
        self.calls.append(("showPage",))

    def save(self):
        self.calls.append(("save",))


class PdfWatermarkTests(unittest.TestCase):
    def setUp(self):
        self.generator = PDF_Generator.__new__(PDF_Generator)
        self.generator.page_h = 842
        self.generator.page_w = 595
        self.generator.c = RecordingCanvas()

    def test_draw_watermark_rotates_and_lowers_alpha(self):
        self.generator._draw_watermark()
        calls = self.generator.c.calls
        self.assertIn(("fill_alpha", 0.14), calls)
        self.assertIn(("rotate", 45), calls)
        texts = [c[3] for c in calls if c[0] == "drawCentredString"]
        self.assertTrue(all(t == "CV STUDIO — WERSJA DARMOWA" for t in texts))
        self.assertGreaterEqual(len(texts), 2)

    def test_render_elements_skips_watermark_by_default(self):
        self.generator.render_elements([], lambda src: src, pages=1)
        calls = self.generator.c.calls
        self.assertNotIn(("rotate", 45), calls)
        self.assertNotIn(("fill_alpha", 0.14), calls)

    def test_render_elements_draws_watermark_when_requested(self):
        self.generator.render_elements([], lambda src: src, pages=1, watermark=True)
        calls = self.generator.c.calls
        self.assertIn(("rotate", 45), calls)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && python -m unittest tests.test_pdf_watermark -v
```

Expected: FAIL — `_draw_watermark` does not exist, and `render_elements` does not accept `watermark`.

- [ ] **Step 3: Store `page_w` in `__init__`**

In `backend/app/services/pdf_generator.py`, `__init__` (around line 137-142):

```python
    def __init__(self, DATA, CANVAS):
        self.data = DATA
        self.c = CANVAS
        # Page height/width drive the top-left -> bottom-left y flip and the
        # watermark's horizontal centering. A4 portrait (595×842) is the
        # default document geometry.
        self.page_h = float(getattr(DATA, "page_height", 842) or 842)
        self.page_w = float(getattr(DATA, "page_width", 595) or 595)
```

- [ ] **Step 4: Add `_draw_watermark` and thread `watermark` through `render_elements`**

Add this method right before `render_elements` (before line 952):

```python
    def _draw_watermark(self):
        """Overlay a faint diagonal "free plan" watermark on the current page.

        Drawn AFTER normal element rendering and fully isolated with
        saveState/restoreState, so it can never affect the coordinate
        system or fill/stroke state other draw calls rely on. Opt-in via
        `render_elements(..., watermark=True)` — the default path stays
        byte-for-byte unchanged (this repo's Canvas<->PDF parity rule).
        """
        self.c.saveState()
        try:
            self.c.setFillColor(HexColor("#8A8A8A"))
            self.c.setFillAlpha(0.14)
            self.c.setFont("Helvetica-Bold", 28)
            cx, cy = self.page_w / 2, self.page_h / 2
            # Three repeats spaced down the page so at least one is visible
            # regardless of where real content sits.
            for offset in (-260, 0, 260):
                self.c.saveState()
                self.c.translate(cx, cy + offset)
                self.c.rotate(45)
                self.c.drawCentredString(0, 0, "CV STUDIO — WERSJA DARMOWA")
                self.c.restoreState()
        finally:
            self.c.restoreState()

    def render_elements(self, elements, image_resolver, pages=1, watermark=False):
        """Render every element onto the canvas, one ReportLab page per
        document page. Elements are grouped by their ``page`` attribute
        (1-based). Empty pages are still emitted so the page count is
        preserved. ``image_resolver(src)`` returns a local path ReportLab
        can read. ``watermark=True`` overlays a diagonal "free plan" stamp
        on every page after its elements are drawn (Free-plan exports only
        — see `document_service.py` / `pdf.py` callers)."""
```

Then, inside the existing per-page loop (around line 1020), right before `self.c.showPage()`:

```python
            if watermark:
                self._draw_watermark()
            self.c.showPage()
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && python -m unittest tests.test_pdf_watermark -v
```

Expected: 3/3 PASS.

- [ ] **Step 6: Run the full backend suite** (confirm the default-`False` path really is unchanged for every existing PDF-rendering test)

```bash
cd backend && python -m unittest discover -s tests
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/pdf_generator.py backend/tests/test_pdf_watermark.py
git commit -m "feat: add opt-in diagonal watermark overlay to PDF_Generator"
```

---

### Task 5: Reconstruct renderable elements from stored rows

**Files:**
- Modify: `backend/app/crud/pdfs.py:1-22` (imports), add function after `serialize_runs` (around line 38)
- Test: `backend/tests/test_elements_from_rows.py`

**Interfaces:**
- Produces: `elements_from_rows(rows: list[PdfElements]) -> list[PdfElement]` — consumed by Task 7's `download_pdf` re-render.
- Consumes: `PdfElements` ORM model (existing), `PdfElement` / `TextRun` Pydantic schemas (existing, `app/schemas/pdf_schema.py`).

- [ ] **Step 1: Write the failing test**

```python
"""elements_from_rows must round-trip everything create_new_pdf packs away
into extra_properties — bold/runs/connectors/borderRadius/flowRole/etc."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.crud.pdfs import create_new_pdf, elements_from_rows, request_pdf_by_id_show
from app.models.models import Base
from app.schemas.pdf_schema import PdfElement, TextRun


class ElementsFromRowsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_round_trips_every_style_field(self):
        elements = [
            PdfElement(
                category="text", element_id="e1", page=1, left=10, top=20,
                fontFamily="Inter", fontSize=12, color="#111111",
                content="Hello world", bold=True, italic=False, underline=True,
                runs=[TextRun(start=0, end=5, bold=False, color="#ff0000")],
                fixedToPage=True, locked=True, flowRole="section-chrome",
            ),
            PdfElement(
                category="rectangle", element_id="e2", page=1, left=0, top=0,
                width=100, height=50, backgroundColor="#eeeeee",
                borderWidth=2, borderRadius=6,
            ),
            PdfElement(
                category="connector", element_id="e3", page=1, left=0, top=0,
                source_id="e1", target_id="e2", arrow=True,
            ),
        ]
        pdf_id = create_new_pdf(
            self.db, "t", 1, "/tmp/t.pdf", elements,
            pages=1, page_width=595, page_height=842,
            editor_mode="freeform", template_id=None, spacing_px=None,
        )
        rows = request_pdf_by_id_show(self.db, pdf_id)
        rebuilt = {el.element_id: el for el in elements_from_rows(rows)}

        text_el = rebuilt["e1"]
        self.assertTrue(text_el.bold)
        self.assertTrue(text_el.underline)
        self.assertTrue(text_el.fixedToPage)
        self.assertTrue(text_el.locked)
        self.assertEqual(text_el.flowRole, "section-chrome")
        self.assertEqual(len(text_el.runs), 1)
        self.assertEqual(text_el.runs[0].color, "#ff0000")

        rect_el = rebuilt["e2"]
        self.assertEqual(rect_el.borderRadius, 6)
        self.assertEqual(rect_el.borderWidth, 2)

        conn_el = rebuilt["e3"]
        self.assertEqual(conn_el.source_id, "e1")
        self.assertEqual(conn_el.target_id, "e2")
        self.assertTrue(conn_el.arrow)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && python -m unittest tests.test_elements_from_rows -v
```

Expected: FAIL — `elements_from_rows` does not exist. (Note: `create_new_pdf`'s actual signature has `db, title, owner_id, file_path, elements, pages, page_width, page_height, editor_mode, template_id, spacing_px` as positional/keyword — check `backend/app/crud/pdfs.py`'s existing `create_new_pdf` definition and adjust the call above to match its exact parameter order if it differs.)

- [ ] **Step 3: Implement `elements_from_rows`**

In `backend/app/crud/pdfs.py`, add the import:

```python
from app.schemas.pdf_schema import PdfElement
```

Add the function right after `serialize_runs` (after its closing line, around line 38):

```python
def elements_from_rows(rows) -> list[PdfElement]:
    """Reconstruct full `PdfElement` objects from stored `PdfElements` rows.

    Unpacks `extra_properties` back into the flat shape `PDF_Generator.
    render_elements` expects — the inverse of the packing this module does
    in `create_new_pdf` / `update_pdf_elements`. Keep both in sync: a new
    key packed into `extra_properties` there must be unpacked here too, or
    a re-rendered download (see `document_service.render_pdf_for_download`)
    will silently drop that field.
    """
    elements = []
    for row in rows:
        extra = row.extra_properties or {}
        elements.append(PdfElement(
            category=row.category,
            element_id=row.element_id,
            page=row.page or 1,
            left=row.left,
            top=row.top,
            width=row.width,
            height=row.height,
            content=row.content,
            fontFamily=row.fontFamily,
            fontSize=row.fontSize,
            color=row.color,
            src=row.src,
            backgroundColor=row.backgroundColor,
            img_id=row.img_id,
            lineHeight=extra.get("lineHeight"),
            letterSpacing=extra.get("letterSpacing"),
            bold=extra.get("bold", False),
            italic=extra.get("italic", False),
            underline=extra.get("underline", False),
            runs=extra.get("runs"),
            align=extra.get("align", "left"),
            bulletList=extra.get("bulletList", False),
            autoHeight=extra.get("autoHeight", False),
            flowRole=extra.get("flowRole"),
            flowGroup=extra.get("flowGroup"),
            isDecorativeChromeText=extra.get("isDecorativeChromeText", False),
            preserveInitialLayout=extra.get("preserveInitialLayout", False),
            alignWithText=extra.get("alignWithText"),
            id=extra.get("id"),
            photoSlot=extra.get("photoSlot"),
            photoShape=extra.get("photoShape"),
            fixedToPage=extra.get("fixedToPage", False),
            repeatOnContinuation=extra.get("repeatOnContinuation", True),
            locked=extra.get("locked", False),
            borderWidth=extra.get("borderWidth"),
            borderRadius=extra.get("borderRadius"),
            filled=extra.get("filled", False),
            source_id=extra.get("source_id"),
            target_id=extra.get("target_id"),
            arrow=extra.get("arrow", False),
        ))
    return elements
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && python -m unittest tests.test_elements_from_rows -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/crud/pdfs.py backend/tests/test_elements_from_rows.py
git commit -m "feat: reconstruct renderable PdfElements from stored rows"
```

---

### Task 6: Set `Pdf.watermarked` at save time

**Files:**
- Modify: `backend/app/services/document_service.py:70-133` (`create_pdf_document`), `backend/app/services/document_service.py:136-181` (`update_pdf_document`)
- Modify: `backend/app/api/routes/pdf.py:138-151` (`update_user_pdf` — needs to fetch and pass `user`)

**Interfaces:**
- Consumes: `entitlements.get_entitlements(db, user) -> dict` (existing).
- Produces: `Pdf.watermarked` set correctly at every create/update, consumed by Task 7.

- [ ] **Step 1: Compute and apply the watermark flag in `create_pdf_document`**

In `backend/app/services/document_service.py`, add the import:

```python
from app.services.entitlements import get_entitlements
```

At the top of `create_pdf_document` (right after the `if not elements:` guard, around line 79):

```python
    watermark = get_entitlements(db, user)["plan_slug"] == "free"
```

Pass it to both render call sites. S3 branch (around line 95):

```python
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, resolver, watermark=watermark)
```

Local branch (around line 127):

```python
    pdf.render_elements(elements, resolver, pdf_data.pages, watermark=watermark)
```

Both `create_new_pdf` calls (S3 branch around line 97, local branch around line 114) need `watermarked=watermark` added as a kwarg — check `create_new_pdf`'s exact signature in `crud/pdfs.py` and add the parameter there too (it currently builds the `Pdf(...)` row without a `watermarked` field; add `watermarked=watermarked` to that constructor call, threading a new `watermarked: bool = False` parameter through `create_new_pdf`'s own signature).

- [ ] **Step 2: Add `watermark` to `build_pdf_to_buffer`**

In `backend/app/utils/build_pdf.py`:

```python
def build_pdf_to_buffer(pdf_data, elements, image_src_resolver, watermark: bool = False) -> bytes:
    """Render `elements` with ReportLab and return PDF bytes.

    `image_src_resolver(src)` must return a filesystem path ReportLab can open.
    Page size defaults to A4 portrait when the payload omits geometry.
    `watermark=True` overlays the Free-plan diagonal stamp on every page.
    """
    buffer = io.BytesIO()
    page_w = float(getattr(pdf_data, "page_width", 595) or 595)
    page_h = float(getattr(pdf_data, "page_height", 842) or 842)
    c = canvas.Canvas(buffer, pagesize=(page_w, page_h))
    pdf = PDF_Generator(pdf_data, c)
    pdf.setTitle(pdf_data.pdf_title if hasattr(pdf_data, "pdf_title") else "untitled")
    pages = getattr(pdf_data, "pages", 1) or 1
    pdf.render_elements(elements, image_src_resolver, pages, watermark=watermark)
    return buffer.getvalue()
```

- [ ] **Step 3: Do the same in `update_pdf_document`, and give it a `user` parameter**

In `backend/app/services/document_service.py`, change the signature:

```python
def update_pdf_document(db: Session, *, pdf_row, user, username: str, pdf_data) -> dict:
    """Regenerate the downloadable PDF and sync PdfElements for an owned row."""
    elements = pdf_data.root
    title = pdf_data.pdf_title
    pdf_id = pdf_data.pdf_id
    resolver = make_image_resolver(db)
    watermark = get_entitlements(db, user)["plan_slug"] == "free"
```

S3 branch (around line 145):

```python
        pdf_bytes = build_pdf_to_buffer(pdf_data, elements, resolver, watermark=watermark)
```

And right before `return {"updated": ...}` (S3 branch), add `pdf_row.watermarked = watermark`.

Local branch: after `pdf.render_elements(elements, resolver, pdf_data.pages)` (around line 180), change that call to:

```python
    pdf.render_elements(elements, resolver, pdf_data.pages, watermark=watermark)
    pdf_row.watermarked = watermark
```

- [ ] **Step 4: Update the route call site**

In `backend/app/api/routes/pdf.py`, `update_user_pdf` (around line 138-151):

```python
@router.put("/update_pdf", status_code=status.HTTP_201_CREATED)
async def update_user_pdf(
    pdf_data: PDFUpdateRequest,
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_token),
):
    """Persist elements and regenerate the downloadable PDF for an owned document.

    Heavier than autosave: rewrites the file on disk/S3 and syncs PdfElements
    to the authoritative client list (including deletions).
    """
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    pdf_row = _require_owned_pdf(db, payload, pdf_data.pdf_id)
    return update_pdf_document(db, pdf_row=pdf_row, user=db_user, username=username, pdf_data=pdf_data)
```

- [ ] **Step 5: Update `create_new_pdf`'s signature in `crud/pdfs.py`** (from Step 1's forward reference)

`backend/app/crud/pdfs.py:51-63` — add `watermarked: bool = False` as the last parameter:

```python
def create_new_pdf(
    db: Session,
    title: str,
    user_id: int,
    file_path: str,
    elements: list,
    pages: int = 1,
    page_width: float = 595,
    page_height: float = 842,
    editor_mode: str = "freeform",
    template_id: str | None = None,
    spacing_px: Mapping[str, Any] | None = None,
    watermarked: bool = False,
) -> int:
```

And add `watermarked=watermarked` to the `Pdf(...)` constructor call (`pdfs.py:71-83`), alongside `spacing_px=serialize_spacing_px(spacing_px)`.

Update both call sites in `document_service.py` (`create_pdf_document`, S3 branch around line 97 and local branch around line 114) to pass `watermarked=watermark`.

- [ ] **Step 6: Run the full backend suite**

```bash
cd backend && python -m unittest discover -s tests
```

Expected: all PASS — this task only adds a new parameter with defaults everywhere and one new stored field, so existing create/update behavior for Standard/Premium (`watermark=False`) must be unaffected.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/document_service.py backend/app/utils/build_pdf.py backend/app/api/routes/pdf.py backend/app/crud/pdfs.py
git commit -m "feat: set Pdf.watermarked from the account's plan at save time"
```

---

### Task 7: `download_pdf` self-heals a stale watermark

**Files:**
- Modify: `backend/app/api/routes/pdf.py:185-208` (`download_pdf`)
- Create: `backend/app/services/document_service.py` — add `render_pdf_for_download`
- Test: `backend/tests/test_download_watermark.py`
- Modify: `backend/tests/test_export_metering.py` (verify still passes; the local branch now touches the filesystem)

**Interfaces:**
- Produces: `document_service.render_pdf_for_download(db: Session, pdf_row: Pdf, watermark: bool) -> None` — re-renders in place (local: overwrites `pdf_row.file_path`; S3: re-uploads to the existing key) and sets `pdf_row.watermarked = watermark`. Caller commits.
- Consumes: `elements_from_rows` (Task 5), `request_pdf_by_id_show` (existing), `PDF_Generator` / `build_pdf_to_buffer` (existing + Task 6 watermark param), `make_image_resolver` (existing).

- [ ] **Step 1: Write the failing test**

```python
"""download_pdf re-renders only when the stored file's watermark state no
longer matches the account's current plan."""
from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import pdf as pdf_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Pdf, PdfElements, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class DownloadWatermarkTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)

        user_crud.create_user(self.db, UserCreateRequest(
            username="u1", email="u1@e.pl", password="pw"))
        self.user = self.db.query(User).filter(User.username == "u1").one()

        self.tmpdir = tempfile.mkdtemp()
        self.file_path = str(Path(self.tmpdir) / "cv.pdf")

        now = datetime.now(timezone.utc)
        pdf = Pdf(
            title="cv", file_path=self.file_path, owner_id=self.user.id,
            pages=1, page_width=595.0, page_height=842.0,
            watermarked=False, created_at=now, updated_at=now,
        )
        self.db.add(pdf)
        self.db.commit()
        self.db.refresh(pdf)
        self.pdf_id = pdf.id
        self.db.add(PdfElements(
            pdf_id=self.pdf_id, element_id="e1", category="text", page=1,
            left=10, top=10, content="hi", fontFamily="Inter", fontSize=12,
            color="#000000", extra_properties={},
        ))
        self.db.commit()

        def _override_db():
            yield self.db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _pdf_row(self) -> Pdf:
        return self.db.query(Pdf).filter(Pdf.id == self.pdf_id).one()

    def test_free_plan_download_re_renders_and_marks_watermarked(self):
        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._pdf_row())
        self.assertTrue(self._pdf_row().watermarked)
        self.assertTrue(Path(self.file_path).exists())

    def test_already_matching_state_skips_rerender(self):
        self._pdf_row().watermarked = True  # already matches Free's requirement
        self.db.commit()
        with patch.object(pdf_route, "USE_S3", False), \
             patch("app.services.document_service.render_pdf_for_download") as mock_render:
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        mock_render.assert_not_called()

    def test_upgrade_triggers_clean_rerender(self):
        self._pdf_row().watermarked = True  # stale from before the upgrade
        self.db.commit()
        ent.set_user_plan(self.db, self.user.id, "standard")

        with patch.object(pdf_route, "USE_S3", False):
            response = self.client.post("/pdf/download_pdf", json=self.pdf_id)
        self.assertEqual(response.status_code, 200, msg=response.text)
        self.db.refresh(self._pdf_row())
        self.assertFalse(self._pdf_row().watermarked)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && python -m unittest tests.test_download_watermark -v
```

Expected: FAIL — `download_pdf` doesn't re-render or check `watermarked` yet.

- [ ] **Step 3: Implement `render_pdf_for_download`**

In `backend/app/services/document_service.py`, add:

```python
from types import SimpleNamespace
from reportlab.pdfgen import canvas as reportlab_canvas


def render_pdf_for_download(db: Session, pdf_row, watermark: bool) -> None:
    """Re-render `pdf_row`'s stored file in place, matching `watermark`.

    Called only when the file's current `watermarked` state no longer
    matches the account's live plan (see `download_pdf`) — an upgrade or
    downgrade is the only time this runs; an unchanged plan never re-renders
    on download. Sets `pdf_row.watermarked = watermark`; caller commits.
    """
    rows = request_pdf_elements_by_element_id(db, pdf_row.id)
    elements = elements_from_rows(list(rows.values()))
    resolver = make_image_resolver(db)
    render_data = SimpleNamespace(
        page_width=pdf_row.page_width,
        page_height=pdf_row.page_height,
        pdf_title=pdf_row.title,
        pages=pdf_row.pages or 1,
    )

    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_row.file_path)
        pdf_bytes = build_pdf_to_buffer(render_data, elements, resolver, watermark=watermark)
        s3_storage.upload_bytes(key, pdf_bytes, content_type="application/pdf")
    else:
        c = reportlab_canvas.Canvas(
            pdf_row.file_path, pagesize=(pdf_row.page_width, pdf_row.page_height),
        )
        pdf = PDF_Generator(render_data, c)
        pdf.setTitle(pdf_row.title or "untitled")
        pdf.render_elements(elements, resolver, pdf_row.pages or 1, watermark=watermark)

    pdf_row.watermarked = watermark
```

Add the two new imports at the top of the file:

```python
from app.crud.pdfs import elements_from_rows  # alongside the existing crud.pdfs import block
```

(`request_pdf_elements_by_element_id`, `make_image_resolver`, `build_pdf_to_buffer`, `PDF_Generator`, `USE_S3`, `s3_storage` are all already imported in this file.)

- [ ] **Step 4: Wire it into `download_pdf`**

In `backend/app/api/routes/pdf.py`, replace `download_pdf` (lines 185-208):

```python
@router.post("/download_pdf", status_code=status.HTTP_200_OK)
async def download_pdf(
    db: Session = Depends(get_db),
    id=Body(),
    payload: dict = Depends(verify_token),
):
    """Return a download URL or row for an owned PDF after export entitlement check.

    Side effects: increments the monthly export counter via `record_export`.
    Re-renders the stored file in place when its watermark state no longer
    matches the account's current plan (e.g. right after an upgrade) — an
    unchanged plan never pays that cost. S3 deployments return a short-lived
    presigned URL; local returns the Pdf row.
    """
    pdf_row = _require_owned_pdf(db, payload, id)
    username = payload.get("sub")
    db_user = get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=401, detail="Nie znaleziono konta użytkownika.")
    assert_can_export(db, db_user)
    watermark_required = get_entitlements(db, db_user)["plan_slug"] == "free"
    if bool(pdf_row.watermarked) != watermark_required:
        render_pdf_for_download(db, pdf_row, watermark_required)
        db.commit()
    if USE_S3:
        key = s3_storage.key_from_file_path(pdf_row.file_path)
        download_url = s3_storage.generate_presigned_download_url(key)
        record_export(db, db_user.id)
        return {"url": download_url, "title": pdf_row.title}
    record_export(db, db_user.id)
    return pdf_row
```

Add the imports:

```python
from app.services.document_service import create_pdf_document, update_pdf_document, render_pdf_for_download
from app.services.entitlements import assert_can_create_project, assert_can_export, get_entitlements, record_export
```

- [ ] **Step 5: Run the new test**

```bash
cd backend && python -m unittest tests.test_download_watermark -v
```

Expected: 3/3 PASS.

- [ ] **Step 6: Re-run `test_export_metering.py`** — its fixture creates a `Pdf` row with zero `PdfElements` and a hardcoded `/tmp/export-cv.pdf` path; this task's change makes the local branch potentially re-render (only on the FIRST call, since `watermarked` defaults to `False` and a Free account's `watermark_required` is `True` — the very first download in that test WILL now trigger a real re-render of an empty-element document).

```bash
cd backend && python -m unittest tests.test_export_metering -v
```

Expected: PASS. If it fails because `/tmp` is not writable in the test environment, change the fixture's `file_path` to use `tempfile.mkdtemp()` the same way `test_download_watermark.py` does, and re-run.

- [ ] **Step 7: Run the full backend suite**

```bash
cd backend && python -m unittest discover -s tests
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/document_service.py backend/app/api/routes/pdf.py backend/tests/test_download_watermark.py backend/tests/test_export_metering.py
git commit -m "feat: self-healing watermark re-render on download after a plan change"
```

---

### Task 8: End-to-end manual verification

No new files — this task is a live verification pass, matching this project's established `/verify` habit (see `README.md`'s Testing section: manual/browser verification is how `PdfCanvas.jsx`-level flows are checked, since that file has no dedicated unit-test harness).

- [ ] **Step 1: Start both dev servers**

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev
```

- [ ] **Step 2: Register a fresh Free account and verify the import trial**

Register a new user (defaults to Free). Open the editor, click **Importuj CV**, upload a real PDF — it must succeed (200, `cv_data` returned). Reopen **Importuj CV** and try again — the button must show the "Wykorzystano już darmowy import CV..." message with **no** network request (check DevTools Network tab for zero `/ai/extract_cv` calls on the second attempt).

- [ ] **Step 3: Verify the watermark appears on Free exports**

From the same Free account, save a CV (`POST /pdf/create_pdf`), then click **Pobierz PDF**. Open the downloaded file — the diagonal "CV STUDIO — WERSJA DARMOWA" watermark must be visible, repeated down the page, low-opacity.

- [ ] **Step 4: Verify upgrading unlocks a clean re-download without re-saving**

Using the existing manual/ops activation path, upgrade this account to Standard:

```bash
curl -X POST http://localhost:8000/billing/select-plan \
  -H "Authorization: Bearer <token from browser localStorage>" \
  -H "Content-Type: application/json" \
  -d '{"plan_slug": "standard"}'
```

Without touching the editor again, click **Pobierz PDF** on the *same* document. The watermark must be gone — this proves `download_pdf`'s self-heal fired without the user needing to reopen/re-save the document.

- [ ] **Step 5: Confirm Standard/Premium accounts are completely unaffected**

Repeat steps 2-3 with a Standard-plan account created directly via the manual activation path: import must work exactly as before this plan (no free-import messaging, no watermark ever, since a Standard account's `watermark_required` is always `False` and its files never get flagged `watermarked=True` in the first place — download should be the cheap "skip re-render" path every time).

- [ ] **Step 6: Report status**

Note any deviations from expected behavior in the final commit message or a follow-up fix — do not mark this task complete until all five checks above pass.

---

## Self-Review Notes

- **Spec coverage:** §4 (data model) → Task 1. §4 (watermark mechanics) → Tasks 4, 6, 7. §5 (import gating) → Tasks 2, 3. §6 (testing) → each task's own test plus Task 8's end-to-end pass.
- **Type consistency checked:** `mark_free_import_used(db, user_id)` (Task 2) matches its call site in `ai.py` (Task 2, Step 4) and its behavior described in Task 2's docstring. `elements_from_rows(rows) -> list[PdfElement]` (Task 5) matches its consumer in `render_pdf_for_download` (Task 7, Step 3). `render_pdf_for_download(db, pdf_row, watermark)` (Task 7) matches its call site in `download_pdf` (Task 7, Step 4).
- **Deviation from the original spec's pseudocode:** the design doc (§3) originally proposed "always re-render at download time." This plan instead adds `Pdf.watermarked` and only re-renders when it stops matching the account's current plan — confirmed with the user during writing-plans as a strictly-better implementation of the same approved user-facing behavior (immediate clean download after upgrade), at much lower cost for the common case (no plan change) and zero added risk for Standard/Premium accounts, which never re-render on download at all.
