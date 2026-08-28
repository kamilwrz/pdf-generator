# Auth + Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google login (auto-link by email), post-registration email verification (Resend), and Stripe Checkout for the Pro 30-day pass to CV Studio.

**Architecture:** Stateless-first. Google `id_token` is verified server-side and exchanged for the app's own JWT (no server sessions). Email verification uses a signed, short-lived JWT (`purpose=verify_email`) instead of a new table. Stripe activates Pro **only** from a signature-verified `checkout.session.completed` webhook, which reuses the existing `set_user_plan(pro)` 30-day-pass path. One Alembic migration adds three columns to `users` and makes `hashed_password` nullable.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, python-jose (JWT), httpx (Resend REST), `google-auth`, `stripe`, React 19 + react-router 7, custom `node:test` frontend runner.

**Spec:** `docs/superpowers/specs/2026-08-27-auth-billing-design.md` — read it alongside this plan; the plan implements it phase-by-phase.

## Global Constraints

- **Config flags are read once at import time by value.** `ALLOW_UNPAID_PLAN_SELECTION` and any new env-derived flags used inside a route/crud module must be imported into that module's namespace; tests patch `app.<module>.<FLAG>`, never `os.environ`, after import. Copy this pattern from `app/api/routes/billing.py:20` and `app/crud/user.py:22`.
- **JWT signing:** reuse `app.core.security.secret_key` / `algorithm` (HS256). Do not introduce a second signing key.
- **All user-facing copy is Polish.** Error `detail` for structured errors uses `{"code": ..., "message": ...}` (see `PlanLimitError` in `app/services/entitlements.py:89`).
- **Alembic migrations are idempotent and column-guarded.** Follow `backend/alembic/versions/20260809_0004_watermark_free_import.py`: inspect existing columns before `add_column`; `downgrade()` is a safe no-op. New head chains from `20260824_0006`.
- **Backend tests** run from `backend/` with `python -m pytest`; they build in-memory SQLite via `Base.metadata.create_all`, call `ent.seed_plans(db)`, and set auth env with `ensure_test_auth_env()` (`app/testing_support.py`). HTTP tests use `app.dependency_overrides[get_db]` and `app.dependency_overrides[verify_token]`.
- **Frontend tests** run via `npm test` (`frontend/scripts/run-tests.mjs`), which collects `*.test.js` only under `src/utils`, `src/templates`, `src/hooks`, `src/services`, and `src/components/ai/AiAssistant`. Tests are `node:test` + `node:assert` and assert on **source strings** (`readFileSync`) or on pure exported functions — there is no jsdom/testing-library. **Therefore: put all new auth/billing client logic in `src/services` or `src/utils` (behaviorally unit-tested); keep page components thin** and cover them with source-string assertions placed under a tested root.
- **Documentation (CLAUDE.md):** each phase's final task updates `README.md` (EN + PL) for auth/billing/API/env/tests, and adds inline comments explaining non-obvious logic (token validation, account linking, webhook idempotency).

---

## File Structure

**Backend — created:**
- `backend/alembic/versions/20260827_0007_auth_billing_columns.py` — migration: `is_verified`, `auth_provider`, `google_sub` (+unique) on `users`; `hashed_password` nullable; backfill `is_verified=TRUE`.
- `backend/app/services/email_service.py` — Resend HTTP client; `send_verification_email`.
- `backend/app/services/stripe_service.py` — thin wrapper: create Checkout Session, construct/verify webhook event. Isolates the `stripe` SDK so routes stay testable.
- `backend/tests/test_email_verification.py`, `test_google_login.py`, `test_stripe_checkout.py`, `test_stripe_webhook.py`, `test_auth_billing_migration.py`.

**Backend — modified:**
- `backend/app/models/models.py` — `User` columns.
- `backend/app/core/security.py` — `create_email_verification_token`, `verify_email_token`.
- `backend/app/core/config.py` — new env vars.
- `backend/app/crud/user.py` — `is_verified` on create; password auth rejects passwordless accounts; Google account helpers.
- `backend/app/api/routes/auth.py` — register change, `/auth/verify-email`, `/auth/resend-verification`, `/auth/google`, login verification gate.
- `backend/app/api/routes/billing.py` — `/billing/select-plan` creates Checkout; `POST /billing/webhook`.
- `backend/app/schemas/user_schema.py` — request bodies for new endpoints.
- `backend/requirements.txt` — `httpx`, `google-auth`, `stripe`.

**Frontend — created:**
- `frontend/src/services/authApi.js` — `verifyEmail`, `resendVerification`, `googleLogin` (unit-tested).
- `frontend/src/pages/VerifyEmail/VerifyEmail.jsx` (+ `.module.css`) — verification landing.
- `frontend/src/pages/Billing/CheckoutResult.jsx` (+ `.module.css`) — success/cancel return pages.
- `frontend/src/services/authApi.test.js`, and source-assertion tests under `src/services` for the new pages.

**Frontend — modified:**
- `frontend/src/services/api.js` — new `ENDPOINTS.AUTH.*` / return-page constants.
- `frontend/src/App.jsx` — routes `/verify-email`, `/billing/success`, `/billing/cancel`.
- `frontend/src/pages/Login/Login.jsx`, `Register/Register.jsx` — Google button + email flows.

---

## Phase 0 — Migration & model

### Task 0.1: `users` columns + nullable password + backfill

**Files:**
- Modify: `backend/app/models/models.py:35-45` (User)
- Create: `backend/alembic/versions/20260827_0007_auth_billing_columns.py`
- Test: `backend/tests/test_auth_billing_migration.py`

**Interfaces:**
- Produces: `User.is_verified` (Boolean, default False), `User.auth_provider` (String, default `"password"`), `User.google_sub` (String, unique, nullable). `User.hashed_password` becomes nullable. Migration revision id `"20260827_0007"`, down_revision `"20260824_0006"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_auth_billing_migration.py
"""Migration 0007 adds auth/billing columns and backfills is_verified."""
from __future__ import annotations

import os
import tempfile
import unittest

from alembic import command
from alembic.config import Config
from pathlib import Path
from sqlalchemy import create_engine, inspect, text


def _alembic_config(db_url: str) -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    cfg = Config(str(backend_root / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_root / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


class MigrationTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.db_url = f"sqlite:///{self.path}"
        self.engine = create_engine(self.db_url)

    def tearDown(self):
        self.engine.dispose()
        os.remove(self.path)

    def test_backfill_marks_existing_users_verified(self):
        # Simulate a pre-migration users table (no new columns) with one row.
        with self.engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, "
                "email TEXT, hashed_password TEXT, created_at DATETIME, is_active BOOLEAN)"
            ))
            conn.execute(text(
                "INSERT INTO users (id, username, email, hashed_password, is_active) "
                "VALUES (1, 'old', 'old@e.pl', 'hash', 1)"
            ))
        # Stamp to the previous head so upgrade runs only 0007.
        cfg = _alembic_config(self.db_url)
        command.stamp(cfg, "20260824_0006")
        command.upgrade(cfg, "20260827_0007")

        cols = {c["name"] for c in inspect(self.engine).get_columns("users")}
        self.assertIn("is_verified", cols)
        self.assertIn("auth_provider", cols)
        self.assertIn("google_sub", cols)
        with self.engine.connect() as conn:
            row = conn.execute(text(
                "SELECT is_verified FROM users WHERE id = 1"
            )).one()
        self.assertTrue(bool(row[0]))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth_billing_migration.py -v`
Expected: FAIL — revision `20260827_0007` does not exist (`alembic.util.exc.CommandError: Can't locate revision`).

- [ ] **Step 3: Update the `User` model**

```python
# backend/app/models/models.py — replace the User column block (lines ~40-45)
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True)
    # Nullable because Google-only accounts never set a password.
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime)
    is_active = Column(Boolean)
    # Email ownership confirmed (password signups start False; Google True).
    # Distinct from is_active, which is account enable/ban.
    is_verified = Column(Boolean, nullable=False, default=False)
    # "password" | "google" — informational + drives the "no password" logic.
    auth_provider = Column(String, nullable=False, default="password")
    # Stable Google subject claim; unique so one Google identity maps to one row.
    google_sub = Column(String, unique=True, nullable=True)
```

- [ ] **Step 4: Write the migration**

```python
# backend/alembic/versions/20260827_0007_auth_billing_columns.py
"""Add auth/billing columns to users (Google login + email verification).

Revision ID: 20260827_0007
Revises: 20260824_0006
Create Date: 2026-08-27

Adds is_verified, auth_provider, google_sub and makes hashed_password nullable.
Existing accounts are backfilled to is_verified=TRUE so the new login-time
verification gate does not lock out users who registered before this feature.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260827_0007"
down_revision: Union[str, Sequence[str], None] = "20260824_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    cols = _existing_columns("users")
    if not cols:
        return  # fresh installs get the current schema from create_all
    if "is_verified" not in cols:
        op.add_column(
            "users",
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        # Backfill: pre-existing accounts are trusted as already verified.
        op.execute("UPDATE users SET is_verified = TRUE")
    if "auth_provider" not in cols:
        op.add_column(
            "users",
            sa.Column("auth_provider", sa.String(), nullable=False, server_default="password"),
        )
    if "google_sub" not in cols:
        op.add_column("users", sa.Column("google_sub", sa.String(), nullable=True))
        # Partial-friendly unique index (SQLite/Postgres both allow multiple NULLs).
        op.create_index("uq_users_google_sub", "users", ["google_sub"], unique=True)
    # hashed_password nullable: SQLite cannot ALTER a column, and the app's
    # create_all already treats it as nullable for fresh DBs. On Postgres, drop
    # the NOT NULL constraint when present.
    if bind_is_postgres():
        op.alter_column("users", "hashed_password", existing_type=sa.String(), nullable=True)


def bind_is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def downgrade() -> None:
    # Intentional no-op (SQLite-friendly, matches existing migrations).
    pass
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth_billing_migration.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full auth/billing-adjacent suite for regressions**

Run: `cd backend && python -m pytest tests/test_plan_selection.py tests/test_entitlements.py tests/test_auth_token_lifetime.py -v`
Expected: PASS (model change is additive; `create_user` still works because new columns have defaults).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/models.py backend/alembic/versions/20260827_0007_auth_billing_columns.py backend/tests/test_auth_billing_migration.py
git commit -m "feat(auth): add is_verified/auth_provider/google_sub columns + migration"
```

---

## Phase 1 — Email verification (Resend)

*Depends on Phase 0. Independent of Phase 2.*

### Task 1.1: Email verification token helpers

**Files:**
- Modify: `backend/app/core/security.py` (append helpers)
- Test: `backend/tests/test_email_verification.py`

**Interfaces:**
- Produces:
  - `create_email_verification_token(email: str) -> str` — JWT `{"sub": email, "purpose": "verify_email", "exp": now+24h}`.
  - `verify_email_token(token: str) -> str` — returns the email, or raises `HTTPException(400, {"code": "invalid_or_expired_token", "message": ...})` on bad signature/expiry/purpose.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_email_verification.py
"""Email verification tokens and the register/verify/login flow."""
from __future__ import annotations

import os
import unittest

os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-32chars-min")

from fastapi import HTTPException  # noqa: E402
from app.core import security  # noqa: E402


class VerificationTokenTests(unittest.TestCase):
    def test_roundtrip_returns_email(self):
        token = security.create_email_verification_token("user@e.pl")
        self.assertEqual(security.verify_email_token(token), "user@e.pl")

    def test_wrong_purpose_rejected(self):
        # A normal access token must not pass as a verification token.
        access = security.create_access_token({"sub": "user@e.pl"})
        with self.assertRaises(HTTPException) as ctx:
            security.verify_email_token(access)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail["code"], "invalid_or_expired_token")

    def test_tampered_signature_rejected(self):
        token = security.create_email_verification_token("user@e.pl")
        with self.assertRaises(HTTPException):
            security.verify_email_token(token + "x")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_email_verification.py::VerificationTokenTests -v`
Expected: FAIL — `AttributeError: module 'app.core.security' has no attribute 'create_email_verification_token'`.

- [ ] **Step 3: Implement the helpers in `security.py`**

```python
# backend/app/core/security.py — append near the JWT helpers

# Verification tokens are short-lived (24h) and carry a distinct purpose claim
# so an access token can never be replayed as a verification link, and vice
# versa. Stateless: no DB row, signed with the same SECRET_KEY as access tokens.
EMAIL_VERIFICATION_PURPOSE = "verify_email"
EMAIL_VERIFICATION_TTL_HOURS = 24


def create_email_verification_token(email: str) -> str:
    """Return a signed JWT proving control of `email` for 24 hours."""
    expire = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFICATION_TTL_HOURS)
    payload = {"sub": email, "purpose": EMAIL_VERIFICATION_PURPOSE, "exp": expire}
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def verify_email_token(token: str) -> str:
    """Validate a verification token and return the email it was issued for.

    Raises HTTP 400 with code ``invalid_or_expired_token`` on any failure
    (bad signature, expiry, missing/incorrect purpose, missing subject) so the
    frontend can show one consistent "link invalid or expired" screen.
    """
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
    except JWTError:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_or_expired_token", "message": "Link jest nieprawidłowy lub wygasł."},
        )
    if payload.get("purpose") != EMAIL_VERIFICATION_PURPOSE or not payload.get("sub"):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_or_expired_token", "message": "Link jest nieprawidłowy lub wygasł."},
        )
    return payload["sub"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_email_verification.py::VerificationTokenTests -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/security.py backend/tests/test_email_verification.py
git commit -m "feat(auth): add email verification token helpers"
```

### Task 1.2: Resend email service + config env

**Files:**
- Create: `backend/app/services/email_service.py`
- Modify: `backend/app/core/config.py` (append), `backend/requirements.txt`
- Test: `backend/tests/test_email_verification.py` (append `EmailServiceTests`)

**Interfaces:**
- Consumes: `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` from `app.core.config`.
- Produces: `send_verification_email(to: str, verify_url: str) -> None`. When `RESEND_API_KEY` is empty it logs and returns without raising (dev mode). Never raises on transport failure in a way that blocks registration — logs and returns.

- [ ] **Step 1: Add config vars**

```python
# backend/app/core/config.py — append after ADMIN_RESET_SECRET

# Transactional email (Resend). Empty key disables sending (local/dev): the
# email service logs the link instead of calling the API so registration works
# without credentials. EMAIL_FROM must be a Resend-verified sender in prod.
RESEND_API_KEY = (os.getenv("RESEND_API_KEY") or "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "CV Studio <onboarding@resend.dev>")

# Base URL of the SPA, used to build absolute links (email verification, Stripe
# return pages). No trailing slash.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
```

- [ ] **Step 2: Add the dependency**

Append to `backend/requirements.txt`:
```
httpx==0.28.1
```
Run: `cd backend && python -m pip install -r requirements.txt`
Expected: `httpx` installs (already a transitive dep of `openai`).

- [ ] **Step 3: Write the failing test**

```python
# backend/tests/test_email_verification.py — append

from unittest.mock import patch  # noqa: E402
from app.services import email_service  # noqa: E402


class EmailServiceTests(unittest.TestCase):
    def test_missing_key_skips_send_without_error(self):
        with patch.object(email_service, "RESEND_API_KEY", ""):
            with patch("app.services.email_service.httpx.post") as mock_post:
                email_service.send_verification_email("u@e.pl", "https://x/verify?token=t")
                mock_post.assert_not_called()

    def test_present_key_posts_to_resend(self):
        with patch.object(email_service, "RESEND_API_KEY", "re_test_key"):
            with patch("app.services.email_service.httpx.post") as mock_post:
                mock_post.return_value.status_code = 200
                email_service.send_verification_email("u@e.pl", "https://x/verify?token=t")
                mock_post.assert_called_once()
                _, kwargs = mock_post.call_args
                self.assertIn("Authorization", kwargs["headers"])
                self.assertIn("u@e.pl", kwargs["json"]["to"])
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_email_verification.py::EmailServiceTests -v`
Expected: FAIL — module `app.services.email_service` does not exist.

- [ ] **Step 5: Implement the service**

```python
# backend/app/services/email_service.py
"""Transactional email via the Resend HTTP API.

Only one message type today: the post-registration verification link. When
RESEND_API_KEY is empty (local/dev), sending is skipped and the link is logged
so registration still completes without external credentials. Transport
failures are logged and swallowed — a temporarily unreachable email provider
must not turn a successful signup into a 500.
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import EMAIL_FROM, RESEND_API_KEY

logger = logging.getLogger(__name__)

_RESEND_ENDPOINT = "https://api.resend.com/emails"


def send_verification_email(to: str, verify_url: str) -> None:
    """Send (or, in dev, log) the account verification link to `to`."""
    if not RESEND_API_KEY:
        logger.info("RESEND_API_KEY unset — skipping email. Verify URL for %s: %s", to, verify_url)
        return

    html = (
        f"<p>Dziękujemy za rejestrację w CV Studio.</p>"
        f"<p>Potwierdź swój adres e-mail, klikając w link poniżej:</p>"
        f'<p><a href="{verify_url}">Potwierdź adres e-mail</a></p>'
        f"<p>Link jest ważny przez 24 godziny.</p>"
    )
    try:
        response = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": EMAIL_FROM,
                "to": [to],
                "subject": "Potwierdź swój adres e-mail — CV Studio",
                "html": html,
            },
            timeout=10.0,
        )
        if response.status_code >= 400:
            logger.error("Resend send failed (%s): %s", response.status_code, response.text)
    except httpx.HTTPError:
        logger.exception("Resend request errored while sending verification email to %s", to)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_email_verification.py::EmailServiceTests -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/email_service.py backend/app/core/config.py backend/requirements.txt backend/tests/test_email_verification.py
git commit -m "feat(auth): add Resend email service and email/frontend env config"
```

### Task 1.3: Register change, verify/resend endpoints, login gate

**Files:**
- Modify: `backend/app/crud/user.py` (`create_user` sets `is_verified=False`; `authenticate_user` rejects passwordless accounts)
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/schemas/user_schema.py` (add `ResendVerificationRequest`)
- Test: `backend/tests/test_email_verification.py` (append `RegisterVerifyLoginTests`)

**Interfaces:**
- Consumes: `create_email_verification_token`, `verify_email_token` (Task 1.1); `send_verification_email` (Task 1.2); `FRONTEND_URL`.
- Produces:
  - `POST /auth/register` → creates `is_verified=False` user, sends email, returns `{"message": ..., "email": ...}` (no token).
  - `GET /auth/verify-email?token=...` → sets `is_verified=True`, returns `{"message": ...}`.
  - `POST /auth/resend-verification` body `{"email": str}` → always `{"message": ...}` (no account enumeration); ≥60s throttle per email.
  - `POST /auth/token` → adds `403 {"code": "email_unverified", "message": ...}` after successful credential check when `is_verified` is False.
- `authenticate_user` returns `False` when `hashed_password is None` (Google-only account attempting password login).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_email_verification.py — append

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.crud import user as user_crud  # noqa: E402
from app.dependencies import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.models import Base, User  # noqa: E402
from app.schemas.user_schema import UserCreateRequest  # noqa: E402
from app.services import entitlements as ent  # noqa: E402
from app.testing_support import ensure_test_auth_env  # noqa: E402


class RegisterVerifyLoginTests(unittest.TestCase):
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
        app.dependency_overrides[get_db] = lambda: (yield self.db)
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _register(self):
        with patch("app.api.routes.auth.send_verification_email") as mock_send:
            resp = self.client.post("/auth/register", json={
                "username": "neo", "email": "neo@e.pl", "password": "pw123456",
            })
        return resp, mock_send

    def test_register_creates_unverified_user_and_sends_email(self):
        resp, mock_send = self._register()
        self.assertEqual(resp.status_code, 200)
        user = self.db.query(User).filter(User.username == "neo").one()
        self.assertFalse(user.is_verified)
        mock_send.assert_called_once()

    def test_login_blocked_until_verified(self):
        self._register()
        resp = self.client.post("/auth/token", data={"username": "neo", "password": "pw123456"})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["detail"]["code"], "email_unverified")

    def test_verify_then_login_succeeds(self):
        self._register()
        from app.core.security import create_email_verification_token
        token = create_email_verification_token("neo@e.pl")
        v = self.client.get(f"/auth/verify-email?token={token}")
        self.assertEqual(v.status_code, 200)
        resp = self.client.post("/auth/token", data={"username": "neo", "password": "pw123456"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access_token", resp.json())

    def test_resend_is_indifferent_to_account_existence(self):
        with patch("app.api.routes.auth.send_verification_email"):
            a = self.client.post("/auth/resend-verification", json={"email": "ghost@e.pl"})
            b = self.client.post("/auth/resend-verification", json={"email": "neo@e.pl"})
        self.assertEqual(a.status_code, b.status_code)
        self.assertEqual(a.json(), b.json())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_email_verification.py::RegisterVerifyLoginTests -v`
Expected: FAIL — register does not send email / login not gated / endpoints 404.

- [ ] **Step 3: Update `crud/user.py`**

```python
# backend/app/crud/user.py — in create_user, set is_verified on the new User
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        created_at=datetime.now(timezone.utc),
        is_active=True,
        # New password accounts must confirm their email before first login.
        is_verified=False,
        auth_provider="password",
    )
```

```python
# backend/app/crud/user.py — harden authenticate_user against passwordless accounts
def authenticate_user(username: str, password: str, db: Session):
    """Return the User on valid credentials, otherwise False.

    Google-only accounts have hashed_password=None and must never authenticate
    through the password form — treat them as a normal auth failure.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.hashed_password:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user
```

- [ ] **Step 4: Add the resend request schema**

```python
# backend/app/schemas/user_schema.py — append
class ResendVerificationRequest(BaseModel):
    """Body for POST /auth/resend-verification. Email is format-checked."""

    email: str

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        normalized = value.strip()
        if not _EMAIL_PATTERN.match(normalized):
            raise ValueError("Nieprawidłowy adres e-mail.")
        return normalized
```

- [ ] **Step 5: Rewrite the auth routes**

```python
# backend/app/api/routes/auth.py — updated imports
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.security import (
    create_access_token, get_access_token_expire_minutes, verify_token,
    create_email_verification_token, verify_email_token,
)
from app.core.config import FRONTEND_URL
from app.crud.user import (
    get_user_by_username, get_user_by_email, create_user, authenticate_user,
)
from app.models.models import User
from app.schemas.user_schema import UserCreateRequest, ResendVerificationRequest
from app.services.email_service import send_verification_email

# In-process throttle: last verification-send timestamp per email. Good enough
# for a single-dyno deploy; a distributed cache would be needed for multi-node.
_RESEND_MIN_INTERVAL_SECONDS = 60
_last_verification_send: dict[str, float] = {}


def _build_verify_url(email: str) -> str:
    token = create_email_verification_token(email)
    return f"{FRONTEND_URL}/verify-email?token={token}"
```

```python
# backend/app/api/routes/auth.py — register now sends the email, does not log in
@router.post("/register")
async def register_user(user: UserCreateRequest, db: Session = Depends(get_db)):
    """Create an unverified account and email a verification link.

    The account is created with is_verified=False; login is blocked until the
    link is followed. Duplicate username/email return 400 as before. Email send
    failures are swallowed by the email service so signup still succeeds.
    """
    if get_user_by_username(db, username=user.username):
        raise HTTPException(status_code=400, detail="Nazwa użytkownika jest już zarejestrowana.")
    if get_user_by_email(db, email=user.email):
        raise HTTPException(status_code=400, detail="Ten adres e-mail jest już zarejestrowany.")
    create_user(db=db, user=user)
    send_verification_email(user.email, _build_verify_url(user.email))
    _last_verification_send[user.email] = time.monotonic()
    return {
        "message": "Konto utworzone. Sprawdź skrzynkę i potwierdź adres e-mail.",
        "email": user.email,
    }
```

```python
# backend/app/api/routes/auth.py — verification + resend endpoints
@router.get("/verify-email")
async def verify_email(token: str = Query(...), db: Session = Depends(get_db)):
    """Confirm an email address from a signed token and flip is_verified."""
    email = verify_email_token(token)  # raises 400 on invalid/expired
    user = get_user_by_email(db, email=email)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_or_expired_token", "message": "Link jest nieprawidłowy lub wygasł."},
        )
    if not user.is_verified:
        user.is_verified = True
        db.add(user)
        db.commit()
    return {"message": "Adres e-mail potwierdzony. Możesz się zalogować."}


@router.post("/resend-verification")
async def resend_verification(
    request: ResendVerificationRequest, db: Session = Depends(get_db)
):
    """Re-send the verification link. The response never reveals whether the
    account exists (anti-enumeration); a per-email 60s throttle limits abuse."""
    email = request.email
    generic = {"message": "Jeśli konto istnieje i nie jest potwierdzone, wysłaliśmy nowy link."}
    now = time.monotonic()
    last = _last_verification_send.get(email)
    if last is not None and now - last < _RESEND_MIN_INTERVAL_SECONDS:
        return generic  # throttled, but still indistinguishable to the caller
    user = get_user_by_email(db, email=email)
    if user is not None and not user.is_verified:
        send_verification_email(email, _build_verify_url(email))
        _last_verification_send[email] = now
    return generic
```

```python
# backend/app/api/routes/auth.py — add the verification gate to /auth/token
    user = authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowa nazwa użytkownika lub hasło.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Block login for accounts that have not confirmed their email. Placed after
    # credential verification so it does not leak which usernames exist.
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "email_unverified",
                "message": "Potwierdź adres e-mail, aby się zalogować. Sprawdź skrzynkę lub wyślij link ponownie.",
            },
        )
    access_token_expires = timedelta(minutes=get_access_token_expire_minutes())
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_email_verification.py -v`
Expected: PASS (all classes).

- [ ] **Step 7: Guard existing auth tests**

Run: `cd backend && python -m pytest tests/test_plan_selection.py tests/test_auth_token_lifetime.py -v`
Expected: PASS. If `test_auth_token_lifetime.py` logs in a freshly created user, update its fixture to set `is_verified=True` (or verify via the endpoint) — note this in the commit.

- [ ] **Step 8: Commit**

```bash
git add backend/app/crud/user.py backend/app/api/routes/auth.py backend/app/schemas/user_schema.py backend/tests/test_email_verification.py
git commit -m "feat(auth): email verification flow with login gate and safe resend"
```

### Task 1.4: Frontend — verify-email page, post-register screen, login handling

**Files:**
- Modify: `frontend/src/services/api.js` (endpoints)
- Create: `frontend/src/services/authApi.js`, `frontend/src/services/authApi.test.js`
- Create: `frontend/src/pages/VerifyEmail/VerifyEmail.jsx` (+ `.module.css`)
- Modify: `frontend/src/App.jsx`, `frontend/src/pages/Register/Register.jsx`, `frontend/src/pages/Login/Login.jsx`
- Create: `frontend/src/services/authPages.test.js` (source assertions for the pages)

**Interfaces:**
- Consumes: backend endpoints from Task 1.3.
- Produces (in `authApi.js`, unit-testable pure-ish functions built on `ApiClient`):
  - `verifyEmail(token) -> Promise<{message}>`
  - `resendVerification(email) -> Promise<{message}>`
- New `ENDPOINTS.AUTH.VERIFY_EMAIL`, `ENDPOINTS.AUTH.RESEND_VERIFICATION`.

- [ ] **Step 1: Add endpoint constants**

```javascript
// frontend/src/services/api.js — extend ENDPOINTS.AUTH
    AUTH: {
        LOGIN: "/auth/token",
        REGISTER: "/auth/register",
        TOKEN: "/auth/verify-token/",
        ENTITLEMENTS: "/auth/me/entitlements",
        VERIFY_EMAIL: "/auth/verify-email",
        RESEND_VERIFICATION: "/auth/resend-verification",
        GOOGLE: "/auth/google",
    },
```

- [ ] **Step 2: Write the failing test for `authApi.js`**

```javascript
// frontend/src/services/authApi.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./authApi.js", import.meta.url), "utf8");

describe("authApi client", () => {
  it("exports verify + resend + google helpers", () => {
    assert.match(source, /export function verifyEmail/);
    assert.match(source, /export function resendVerification/);
    assert.match(source, /export function googleLogin/);
  });

  it("verifyEmail issues a GET to the verify-email endpoint with the token", () => {
    assert.match(source, /ENDPOINTS\.AUTH\.VERIFY_EMAIL/);
    assert.match(source, /encodeURIComponent/);
  });

  it("googleLogin posts the id_token to the google endpoint", () => {
    assert.match(source, /ENDPOINTS\.AUTH\.GOOGLE/);
    assert.match(source, /id_token/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `authApi.js` does not exist (module read throws) / assertions unmet.

- [ ] **Step 4: Implement `authApi.js`**

```javascript
// frontend/src/services/authApi.js
/**
 * Auth API helpers layered over ApiClient. Kept out of page components so the
 * request/response contracts are unit-testable by the node:test runner (pages
 * themselves are only covered by source assertions).
 */
import { ApiClient, ENDPOINTS } from "./api";

/** Confirm an email address from a signed token. */
export function verifyEmail(token) {
  const api = new ApiClient();
  const url = `${ENDPOINTS.AUTH.VERIFY_EMAIL}?token=${encodeURIComponent(token)}`;
  return api.httpRequest(url, "GET", null, "Nie udało się potwierdzić adresu e-mail.");
}

/** Ask the backend to resend a verification link. Response is intentionally generic. */
export function resendVerification(email) {
  const api = new ApiClient();
  return api.httpRequest(
    ENDPOINTS.AUTH.RESEND_VERIFICATION,
    "POST",
    JSON.stringify({ email }),
    "Nie udało się wysłać linku ponownie.",
  );
}

/** Exchange a Google id_token for an app JWT. Returns {access_token, username}. */
export function googleLogin(idToken) {
  const api = new ApiClient();
  return api.httpRequest(
    ENDPOINTS.AUTH.GOOGLE,
    "POST",
    JSON.stringify({ id_token: idToken }),
    "Logowanie przez Google nie powiodło się.",
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS for `authApi.test.js`.

- [ ] **Step 6: Create the VerifyEmail page**

```jsx
// frontend/src/pages/VerifyEmail/VerifyEmail.jsx
/**
 * Verification landing page. Reads ?token=..., calls GET /auth/verify-email,
 * and shows success or an "invalid/expired link" state with a path back to
 * login. No auto-login: the user confirms, then signs in.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../services/authApi";
import classes from "./VerifyEmail.module.css";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState("loading"); // loading | ok | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Brak tokena w linku.");
      return;
    }
    let cancelled = false;
    verifyEmail(token)
      .then((data) => {
        if (cancelled) return;
        setState("ok");
        setMessage(data.message || "Adres e-mail potwierdzony.");
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err.planMessage || err.message || "Link jest nieprawidłowy lub wygasł.");
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className={classes.container}>
      <div className={classes.card}>
        <h1>{state === "ok" ? "Adres potwierdzony" : state === "error" ? "Nie udało się potwierdzić" : "Potwierdzanie…"}</h1>
        <p role="status" aria-live="polite">{message}</p>
        {state !== "loading" && <Link to="/login" className={classes.cta}>Przejdź do logowania</Link>}
      </div>
    </div>
  );
}
```

Create `frontend/src/pages/VerifyEmail/VerifyEmail.module.css` following DESIGN.md: sharp 0px corners, off-black text, centered card, `min-h-[100dvh]` equivalent (`min-height: 100dvh`). Mirror the structure of `Login.module.css` container/card tokens.

- [ ] **Step 7: Wire the route**

```jsx
// frontend/src/App.jsx — add import and route entry
import VerifyEmail from './pages/VerifyEmail/VerifyEmail';
// ...inside createBrowserRouter array:
  { path: "/verify-email", element: <VerifyEmail /> },
```

- [ ] **Step 8: Post-register screen + resend button (Register.jsx)**

After a successful `register`, instead of navigating straight to `/login`, set a `registered` state that renders: "Wysłaliśmy link na {email}" plus a "Wyślij ponownie" button calling `resendVerification(email)` with a 60s client-side cooldown (disable button, count down). Keep the existing intent handling for the eventual `/login` link.

- [ ] **Step 9: Handle `email_unverified` on Login.jsx**

In the `catch` of `handleSubmit`, when `err.code === "email_unverified"`, show the Polish message plus an inline "Wyślij link ponownie" action that calls `resendVerification(username)` — note: login uses username, but resend needs email. Since login form has no email, render the message with a link to `/register` guidance OR add an email prompt in that error state. **Decision:** show the message and a "Wyślij link ponownie" control that reveals a small email input, then calls `resendVerification(email)`.

- [ ] **Step 10: Source-assertion test for the pages**

```javascript
// frontend/src/services/authPages.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const verify = readFileSync(new URL("../pages/VerifyEmail/VerifyEmail.jsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/Login/Login.jsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../pages/Register/Register.jsx", import.meta.url), "utf8");

describe("auth pages wiring", () => {
  it("verify page calls verifyEmail and links back to login", () => {
    assert.match(verify, /verifyEmail\(/);
    assert.match(verify, /to="\/login"/);
  });
  it("login handles the email_unverified code", () => {
    assert.match(login, /email_unverified/);
    assert.match(login, /resendVerification/);
  });
  it("register shows a post-signup verify screen with resend", () => {
    assert.match(register, /resendVerification/);
    assert.match(register, /Wysłaliśmy link/);
  });
});
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS. Also run `cd frontend && npm run lint`.

- [ ] **Step 12: Update README (EN + PL) + commit**

Add to `README.md` an "Email verification" subsection under auth (both languages): flow, endpoints, env (`RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`), and the login block. Then:

```bash
git add frontend/src/services/api.js frontend/src/services/authApi.js frontend/src/services/authApi.test.js frontend/src/services/authPages.test.js frontend/src/pages/VerifyEmail frontend/src/App.jsx frontend/src/pages/Register/Register.jsx frontend/src/pages/Login/Login.jsx README.md
git commit -m "feat(auth): frontend email verification pages and flows"
```

---

## Phase 2 — Google login (auto-link by email)

*Depends on Phase 0. Independent of Phase 1.*

### Task 2.1: `POST /auth/google` backend

**Files:**
- Modify: `backend/requirements.txt` (`google-auth`), `backend/app/core/config.py` (`GOOGLE_CLIENT_ID`)
- Modify: `backend/app/crud/user.py` (add `get_user_by_google_sub`, `generate_unique_username`, `create_google_user`, `link_google_to_user`)
- Modify: `backend/app/api/routes/auth.py` (`/auth/google`)
- Test: `backend/tests/test_google_login.py`

**Interfaces:**
- Consumes: `google.oauth2.id_token.verify_oauth2_token`; `GOOGLE_CLIENT_ID`; `ensure_free_subscription`, `set_user_plan` from entitlements; `create_access_token`.
- Produces: `POST /auth/google` body `{"id_token": str}` → `{"access_token": str, "token_type": "bearer", "username": str}`. Errors: 401 `{"code": "invalid_google_token"}`.

- [ ] **Step 1: Add dependency + config**

Append to `backend/requirements.txt`:
```
google-auth==2.38.0
```
```python
# backend/app/core/config.py — append
# Google Identity Services client ID. Backend verifies id_token audience against
# this; the frontend uses the same value to initialise GIS. Empty disables the
# /auth/google endpoint (returns 503) so a misconfigured deploy fails loudly.
GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
```
Run: `cd backend && python -m pip install -r requirements.txt`

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_google_login.py
"""POST /auth/google: verify id_token, auto-link by email, auto-create."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-32chars-min")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import auth as auth_route
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, User
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _claims(email="g@e.pl", sub="google-123", verified=True, name="Grace"):
    return {"email": email, "email_verified": verified, "sub": sub, "name": name}


class GoogleLoginTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)
        app.dependency_overrides[get_db] = lambda: (yield self.db)
        # Endpoint reads GOOGLE_CLIENT_ID at call time via the module binding.
        self._cid = patch.object(auth_route, "GOOGLE_CLIENT_ID", "test-client-id")
        self._cid.start()
        self.client = TestClient(app)

    def tearDown(self):
        self._cid.stop()
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _post(self, claims):
        with patch.object(auth_route, "verify_google_id_token", return_value=claims):
            return self.client.post("/auth/google", json={"id_token": "x"})

    def test_new_email_creates_verified_passwordless_account(self):
        resp = self._post(_claims())
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access_token", resp.json())
        user = self.db.query(User).filter(User.email == "g@e.pl").one()
        self.assertTrue(user.is_verified)
        self.assertIsNone(user.hashed_password)
        self.assertEqual(user.auth_provider, "google")
        self.assertEqual(user.google_sub, "google-123")

    def test_existing_password_email_gets_linked_and_verified(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="grace", email="g@e.pl", password="pw123456"))
        resp = self._post(_claims())
        self.assertEqual(resp.status_code, 200)
        user = self.db.query(User).filter(User.email == "g@e.pl").one()
        self.assertEqual(user.google_sub, "google-123")
        self.assertTrue(user.is_verified)

    def test_existing_google_sub_logs_in_without_duplicate(self):
        self._post(_claims())
        self._post(_claims())
        self.assertEqual(self.db.query(User).filter(User.email == "g@e.pl").count(), 1)

    def test_unverified_google_email_rejected(self):
        resp = self._post(_claims(verified=False))
        self.assertEqual(resp.status_code, 401)

    def test_username_collision_generates_unique(self):
        user_crud.create_user(self.db, UserCreateRequest(
            username="g", email="other@e.pl", password="pw123456"))
        resp = self._post(_claims(email="g@e.pl", sub="google-999"))
        self.assertEqual(resp.status_code, 200)
        new = self.db.query(User).filter(User.email == "g@e.pl").one()
        self.assertNotEqual(new.username, "g")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_google_login.py -v`
Expected: FAIL — `/auth/google` 404 and `verify_google_id_token` missing.

- [ ] **Step 4: CRUD helpers**

```python
# backend/app/crud/user.py — append
import re


def get_user_by_google_sub(db: Session, google_sub: str):
    """Return the User linked to this Google subject, or None."""
    return db.query(User).filter(User.google_sub == google_sub).first()


def generate_unique_username(db: Session, seed: str) -> str:
    """Derive a unique username from an email local-part or display name.

    Non-alphanumeric characters are collapsed to nothing; on collision a numeric
    suffix is appended until the username is free. Falls back to 'user' when the
    seed has no usable characters.
    """
    base = re.sub(r"[^a-z0-9]", "", (seed or "").lower()) or "user"
    candidate = base
    suffix = 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def create_google_user(db: Session, email: str, google_sub: str, name: str | None) -> User:
    """Create a verified, passwordless account for a first-time Google sign-in."""
    seed = (email.split("@", 1)[0] if email else "") or (name or "")
    db_user = User(
        username=generate_unique_username(db, seed),
        email=email,
        hashed_password=None,
        created_at=datetime.now(timezone.utc),
        is_active=True,
        is_verified=True,
        auth_provider="google",
        google_sub=google_sub,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    ensure_free_subscription(db, db_user.id)
    return db_user


def link_google_to_user(db: Session, user: User, google_sub: str) -> User:
    """Attach a Google identity to an existing account and mark it verified.

    Google has already confirmed the email, so this also resolves the case of a
    password account that never completed email verification.
    """
    user.google_sub = google_sub
    user.is_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

- [ ] **Step 5: Add the endpoint + token verifier to `auth.py`**

```python
# backend/app/api/routes/auth.py — imports
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from app.core.config import GOOGLE_CLIENT_ID
from app.crud.user import (
    get_user_by_google_sub, create_google_user, link_google_to_user,
)
from app.schemas.user_schema import GoogleLoginRequest


def verify_google_id_token(token: str) -> dict:
    """Verify a Google id_token and return its claims.

    Wrapped in a module-level function so tests can patch it without a network
    call. Audience is checked against GOOGLE_CLIENT_ID inside Google's library.
    """
    return google_id_token.verify_oauth2_token(
        token, google_requests.Request(), GOOGLE_CLIENT_ID
    )


@router.post("/google")
async def login_with_google(request: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Verify a Google id_token, link/create the account, and issue an app JWT.

    Linking rules (spec §6): match by google_sub → login; else match by email →
    link and verify; else create a verified passwordless account. Google id
    tokens with email_verified=false are rejected.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Logowanie Google jest niedostępne.")
    try:
        claims = verify_google_id_token(request.id_token)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_google_token", "message": "Nieprawidłowy token Google."},
        )
    email = claims.get("email")
    if not claims.get("email_verified") or not email:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_google_token", "message": "Adres e-mail Google nie jest potwierdzony."},
        )
    google_sub = claims.get("sub")
    name = claims.get("name")

    user = get_user_by_google_sub(db, google_sub)
    if user is None:
        user = get_user_by_email(db, email=email)
        if user is not None:
            user = link_google_to_user(db, user, google_sub)
        else:
            user = create_google_user(db, email=email, google_sub=google_sub, name=name)

    access_token_expires = timedelta(minutes=get_access_token_expire_minutes())
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer", "username": user.username}
```

- [ ] **Step 6: Add the request schema**

```python
# backend/app/schemas/user_schema.py — append
class GoogleLoginRequest(BaseModel):
    """Body for POST /auth/google: a Google Identity Services id_token."""

    id_token: str
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_google_login.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/app/crud/user.py backend/app/api/routes/auth.py backend/app/schemas/user_schema.py backend/tests/test_google_login.py
git commit -m "feat(auth): Google login endpoint with email auto-link"
```

### Task 2.2: Frontend — Google button on login + register

**Files:**
- Modify: `frontend/src/pages/Login/Login.jsx`, `frontend/src/pages/Register/Register.jsx`
- Create: `frontend/src/hooks/useGoogleSignIn.js` + `frontend/src/hooks/useGoogleSignIn.test.js`
- Modify: `frontend/index.html` (load GIS script) OR load it dynamically in the hook
- Modify: `frontend/src/services/authPages.test.js` (assert Google wiring)

**Interfaces:**
- Consumes: `googleLogin(idToken)` from `authApi.js`; `VITE_GOOGLE_CLIENT_ID`.
- Produces: `useGoogleSignIn({ onCredential })` hook that loads GIS, renders/initialises the button, and calls `onCredential(idToken)` on success.

- [ ] **Step 1: Write the failing test (source assertions for the hook)**

```javascript
// frontend/src/hooks/useGoogleSignIn.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./useGoogleSignIn.js", import.meta.url), "utf8");

describe("useGoogleSignIn", () => {
  it("reads the client id from Vite env", () => {
    assert.match(source, /VITE_GOOGLE_CLIENT_ID/);
  });
  it("loads the GIS script and initialises with the credential callback", () => {
    assert.match(source, /accounts\.google\.com\/gsi\/client/);
    assert.match(source, /initialize/);
    assert.match(source, /onCredential/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `useGoogleSignIn.js` missing. (Note: `src/hooks` is a tested root.)

- [ ] **Step 3: Implement the hook**

```javascript
// frontend/src/hooks/useGoogleSignIn.js
/**
 * Loads Google Identity Services once, initialises it with the app client id,
 * and renders a Google button into `buttonRef`. On successful sign-in the GIS
 * callback receives a credential (id_token) which is handed to `onCredential`.
 *
 * The GIS script is injected on demand (not in index.html) so the auth pages
 * stay self-contained and the script is not loaded on the landing/editor.
 */
import { useCallback, useEffect, useRef } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || "";

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Nie udało się załadować Google Sign-In."));
    document.head.appendChild(script);
  });
}

export function useGoogleSignIn({ onCredential }) {
  const buttonRef = useRef(null);
  const handler = useCallback((response) => {
    if (response?.credential) onCredential(response.credential);
  }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return;
    let cancelled = false;
    loadGisScript().then(() => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handler });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline", size: "large", width: 320, text: "continue_with",
      });
    }).catch(() => { /* button simply does not appear; password login still works */ });
    return () => { cancelled = true; };
  }, [handler]);

  return { buttonRef, enabled: Boolean(CLIENT_ID) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS for `useGoogleSignIn.test.js`.

- [ ] **Step 5: Wire the button into Login.jsx and Register.jsx**

In both pages: call `useGoogleSignIn({ onCredential })` where `onCredential` runs:
```javascript
const data = await googleLogin(idToken);         // {access_token, username}
localStorage.setItem("token", data.access_token);
setSessionUsername(data.username);
const editorIntent = startIntent === "wizard" ? null : startIntent;
navigate(getEditorPath({ start: editorIntent }), { replace: true });
```
Render `{enabled && <div ref={buttonRef} className={classes.googleBtn} />}` with a "lub" divider above the form, styled per DESIGN.md (sharp corners, 1.5px border ghost aesthetic — but the GIS button renders itself, so only wrap/space it).

- [ ] **Step 6: Extend the pages source-assertion test**

```javascript
// frontend/src/services/authPages.test.js — append
describe("google login wiring", () => {
  const login = readFileSync(new URL("../pages/Login/Login.jsx", import.meta.url), "utf8");
  const register = readFileSync(new URL("../pages/Register/Register.jsx", import.meta.url), "utf8");
  it("both auth pages use the Google hook and googleLogin", () => {
    for (const src of [login, register]) {
      assert.match(src, /useGoogleSignIn/);
      assert.match(src, /googleLogin/);
    }
  });
});
```

- [ ] **Step 7: Run tests + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Update README (EN + PL) + commit**

Document Google login (flow, `/auth/google`, `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`, auto-link behavior) in both language sections.

```bash
git add frontend/src/hooks/useGoogleSignIn.js frontend/src/hooks/useGoogleSignIn.test.js frontend/src/pages/Login/Login.jsx frontend/src/pages/Register/Register.jsx frontend/src/services/authPages.test.js README.md
git commit -m "feat(auth): Google Sign-In button on login and register"
```

---

## Phase 3 — Stripe Checkout (one-time 30-day pass)

*Depends on Phase 0. Recommended last.*

### Task 3.1: Stripe service + `/billing/select-plan` creates Checkout

**Files:**
- Modify: `backend/requirements.txt` (`stripe`), `backend/app/core/config.py` (Stripe env)
- Create: `backend/app/services/stripe_service.py`
- Modify: `backend/app/api/routes/billing.py`
- Test: `backend/tests/test_stripe_checkout.py`

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `FRONTEND_URL`.
- Produces:
  - `stripe_service.create_checkout_session(user_id: int, price_id: str, success_url: str, cancel_url: str) -> object` (has `.url`, `.id`).
  - `/billing/select-plan` for `pro` when `ALLOW_UNPAID_PLAN_SELECTION=False` returns `{"checkout_url": <url>, "payment_required": True, "plan_slug": "pro"}` (200), instead of 402.

- [ ] **Step 1: Dependency + config**

Append to `backend/requirements.txt`:
```
stripe==11.4.1
```
```python
# backend/app/core/config.py — append
# Stripe one-time Pro pass. All three are required in production; when
# STRIPE_SECRET_KEY is empty the checkout branch behaves as before (402 seam).
STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
STRIPE_PRICE_PRO = (os.getenv("STRIPE_PRICE_PRO") or "").strip()
```
Run: `cd backend && python -m pip install -r requirements.txt`

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_stripe_checkout.py
"""POST /billing/select-plan creates a Stripe Checkout Session for Pro."""
from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-32chars-min")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import billing as billing_route
from app.core.security import verify_token
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


class SelectPlanCheckoutTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)
        user_crud.create_user(self.db, UserCreateRequest(
            username="u1", email="u1@e.pl", password="pw123456"))
        app.dependency_overrides[get_db] = lambda: (yield self.db)
        app.dependency_overrides[verify_token] = lambda: {"sub": "u1"}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _plan_of(self, username):
        u = user_crud.get_user_by_username(self.db, username)
        return self.db.query(UserSubscription).filter_by(user_id=u.id).first().plan_slug

    def test_pro_returns_checkout_url_and_does_not_activate(self):
        fake = SimpleNamespace(url="https://checkout.stripe.test/s/abc", id="cs_test_1")
        with patch.object(billing_route, "ALLOW_UNPAID_PLAN_SELECTION", False), \
             patch.object(billing_route, "STRIPE_SECRET_KEY", "sk_test"), \
             patch.object(billing_route, "STRIPE_PRICE_PRO", "price_123"), \
             patch("app.api.routes.billing.create_checkout_session", return_value=fake) as mk:
            resp = self.client.post("/billing/select-plan", json={"plan_slug": "pro"})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["checkout_url"], "https://checkout.stripe.test/s/abc")
        self.assertTrue(body["payment_required"])
        self.assertEqual(self._plan_of("u1"), "free")  # activation waits for webhook
        mk.assert_called_once()

    def test_free_plan_still_activates_immediately(self):
        # Selecting free never needs Stripe.
        resp = self.client.post("/billing/select-plan", json={"plan_slug": "free"})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["payment_required"])
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_stripe_checkout.py -v`
Expected: FAIL — `create_checkout_session` not importable in billing; branch still raises 402.

- [ ] **Step 4: Implement `stripe_service.py`**

```python
# backend/app/services/stripe_service.py
"""Thin wrapper around the Stripe SDK.

Isolating SDK calls here keeps the billing routes unit-testable (tests patch
these functions) and confines the one place the secret key is configured. The
Pro plan is a one-time payment (mode="payment"), not a subscription.
"""
from __future__ import annotations

import stripe

from app.core.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET


def _client() -> None:
    # Set the module-level key lazily so import never fails when unset (dev).
    stripe.api_key = STRIPE_SECRET_KEY


def create_checkout_session(user_id: int, price_id: str, success_url: str, cancel_url: str):
    """Create a one-time Checkout Session for the Pro pass.

    client_reference_id carries our user id back on the webhook so activation
    can target the right account without trusting anything from the browser.
    """
    _client()
    return stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        client_reference_id=str(user_id),
        success_url=success_url,
        cancel_url=cancel_url,
    )


def construct_webhook_event(payload: bytes, signature: str):
    """Verify a webhook signature and return the parsed event (raises on bad sig)."""
    return stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
```

- [ ] **Step 5: Update `/billing/select-plan`**

```python
# backend/app/api/routes/billing.py — imports
from app.core.config import (
    ALLOW_UNPAID_PLAN_SELECTION, FRONTEND_URL, STRIPE_SECRET_KEY, STRIPE_PRICE_PRO,
)
from app.services.stripe_service import create_checkout_session
```

```python
# backend/app/api/routes/billing.py — replace the paid-plan branch in select_plan
    if plan_slug != "free" and not ALLOW_UNPAID_PLAN_SELECTION:
        # Production path: create a Stripe Checkout Session instead of activating.
        # Activation happens only from the signed webhook (see /billing/webhook).
        if not STRIPE_SECRET_KEY or not STRIPE_PRICE_PRO:
            # Misconfigured deploy: keep the original 402 seam rather than 500.
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "payment_required",
                    "message": "Płatności są chwilowo niedostępne.",
                    "plan_slug": plan_slug,
                    "checkout_url": None,
                },
            )
        session = create_checkout_session(
            user_id=user.id,
            price_id=STRIPE_PRICE_PRO,
            success_url=f"{FRONTEND_URL}/billing/success",
            cancel_url=f"{FRONTEND_URL}/billing/cancel",
        )
        return {"checkout_url": session.url, "payment_required": True, "plan_slug": plan_slug}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_stripe_checkout.py -v`
Expected: PASS.

- [ ] **Step 7: Guard the existing 402 test**

Run: `cd backend && python -m pytest tests/test_plan_selection.py::SelectPlanEndpointTests -v`
Expected: `test_paid_plan_while_unpaid_disabled_returns_402` still passes because that test does not set `STRIPE_SECRET_KEY`, so the misconfigured-fallback 402 branch runs. Confirm; if the test asserted on the 402 body it remains valid.

- [ ] **Step 8: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/app/services/stripe_service.py backend/app/api/routes/billing.py backend/tests/test_stripe_checkout.py
git commit -m "feat(billing): create Stripe Checkout Session for Pro pass"
```

### Task 3.2: `POST /billing/webhook` with idempotent activation

**Files:**
- Modify: `backend/app/api/routes/billing.py` (webhook route)
- Test: `backend/tests/test_stripe_webhook.py`

**Interfaces:**
- Consumes: `construct_webhook_event` (Task 3.1); `set_user_plan`; `Payment` model; `STRIPE_WEBHOOK_SECRET`.
- Produces: `POST /billing/webhook` reading raw body + `Stripe-Signature`. Bad signature → 400. `checkout.session.completed` → idempotent Pro activation + `Payment` row + `stripe_customer_id`. Other events → 200 ignored.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_stripe_webhook.py
"""Stripe webhook: signature check, idempotent activation, Payment ledger."""
from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-32chars-min")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import billing as billing_route
from app.crud import user as user_crud
from app.dependencies import get_db
from app.main import app
from app.models.models import Base, Payment, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services import entitlements as ent
from app.testing_support import ensure_test_auth_env


def _completed_event(user_id: int, session_id="cs_1"):
    return {
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": session_id,
            "client_reference_id": str(user_id),
            "customer": "cus_1",
            "amount_total": 5900,
            "currency": "pln",
        }},
    }


class WebhookTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        ent.seed_plans(self.db)
        user_crud.create_user(self.db, UserCreateRequest(
            username="u1", email="u1@e.pl", password="pw123456"))
        self.user = user_crud.get_user_by_username(self.db, "u1")
        app.dependency_overrides[get_db] = lambda: (yield self.db)
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def _plan_of(self):
        return self.db.query(UserSubscription).filter_by(user_id=self.user.id).first().plan_slug

    def test_bad_signature_returns_400(self):
        with patch("app.api.routes.billing.construct_webhook_event", side_effect=ValueError("bad")):
            resp = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"})
        self.assertEqual(resp.status_code, 400)

    def test_completed_activates_pro_and_records_payment(self):
        event = _completed_event(self.user.id)
        with patch("app.api.routes.billing.construct_webhook_event", return_value=event):
            resp = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._plan_of(), "pro")
        payments = self.db.query(Payment).filter_by(provider_ref="cs_1").all()
        self.assertEqual(len(payments), 1)
        self.assertEqual(payments[0].status, "succeeded")

    def test_idempotent_on_duplicate_delivery(self):
        event = _completed_event(self.user.id)
        with patch("app.api.routes.billing.construct_webhook_event", return_value=event):
            self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"})
            self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"})
        self.assertEqual(self.db.query(Payment).filter_by(provider_ref="cs_1").count(), 1)

    def test_other_event_type_ignored_with_200(self):
        with patch("app.api.routes.billing.construct_webhook_event",
                   return_value={"type": "payment_intent.created", "data": {"object": {}}}):
            resp = self.client.post("/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"})
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_stripe_webhook.py -v`
Expected: FAIL — `/billing/webhook` 404.

- [ ] **Step 3: Implement the webhook route**

```python
# backend/app/api/routes/billing.py — imports
from datetime import datetime, timezone

from fastapi import Request
from app.core.config import STRIPE_WEBHOOK_SECRET
from app.models.models import Payment
from app.services.stripe_service import construct_webhook_event


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Activate Pro from a signature-verified checkout.session.completed event.

    Reads the RAW request body (Stripe signs the exact bytes) and verifies the
    signature before trusting anything. Activation is idempotent on the Checkout
    Session id so Stripe's automatic retries cannot grant two passes or write a
    duplicate Payment row. Activation NEVER happens from the success_url, which
    a user could forge.
    """
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = construct_webhook_event(payload, signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature.")

    event_type = event["type"] if isinstance(event, dict) else event.type
    if event_type != "checkout.session.completed":
        return {"status": "ignored", "type": event_type}

    session = (event["data"]["object"] if isinstance(event, dict) else event.data.object)
    session_id = session.get("id")

    # Idempotency guard: a Payment with this provider_ref means we already
    # processed this session on an earlier delivery.
    existing = db.query(Payment).filter(Payment.provider_ref == session_id).first()
    if existing is not None:
        return {"status": "already_processed"}

    user_id = int(session.get("client_reference_id"))
    set_user_plan(db, user_id, "pro")  # 30-day pass + AI credit reset

    db.add(Payment(
        user_id=user_id,
        provider="stripe",
        provider_ref=session_id,
        plan_slug="pro",
        amount_cents=session.get("amount_total"),
        currency=(session.get("currency") or "pln"),
        status="succeeded",
        raw=(event if isinstance(event, dict) else None),
        created_at=datetime.now(timezone.utc),
    ))
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if sub is not None and session.get("customer"):
        sub.stripe_customer_id = session.get("customer")
        db.add(sub)
    db.commit()
    return {"status": "activated"}
```

**Note on raw body:** the app has no global JSON body-parsing middleware (see `main.py`) — FastAPI parses per-route from type hints. This route takes `Request` and reads `await request.body()`, so no middleware bypass is needed. Verify no body-consuming middleware is added later.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_stripe_webhook.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/billing.py backend/tests/test_stripe_webhook.py
git commit -m "feat(billing): idempotent Stripe webhook activates Pro pass"
```

### Task 3.3: Frontend — success/cancel return pages

**Files:**
- Create: `frontend/src/pages/Billing/CheckoutResult.jsx` (+ `.module.css`)
- Modify: `frontend/src/App.jsx` (routes `/billing/success`, `/billing/cancel`)
- Create: `frontend/src/services/billingPages.test.js`

**Interfaces:**
- Consumes: `refreshEntitlements` via `useSession`; `getEditorPath`.
- Produces: one component rendered for both routes via a `variant` prop (`success` | `cancel`).

- [ ] **Step 1: Write the failing source-assertion test**

```javascript
// frontend/src/services/billingPages.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../pages/Billing/CheckoutResult.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

describe("checkout result pages", () => {
  it("success path re-fetches entitlements", () => {
    assert.match(page, /refreshEntitlements/);
  });
  it("routes are registered", () => {
    assert.match(app, /\/billing\/success/);
    assert.match(app, /\/billing\/cancel/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — page + routes missing.

- [ ] **Step 3: Implement the page**

```jsx
// frontend/src/pages/Billing/CheckoutResult.jsx
/**
 * Return page after Stripe Checkout. `success` re-fetches entitlements (the
 * webhook activates Pro server-side; this only reflects the new state) and
 * links into the editor. `cancel` explains nothing was charged and links back.
 *
 * IMPORTANT: this page never activates a plan — activation is webhook-only.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../store/session-context";
import { getEditorPath } from "../../utils/authSession";
import classes from "./CheckoutResult.module.css";

export default function CheckoutResult({ variant }) {
  const { refreshEntitlements } = useSession();
  useEffect(() => {
    if (variant === "success") refreshEntitlements?.();
  }, [variant, refreshEntitlements]);

  const success = variant === "success";
  return (
    <div className={classes.container}>
      <div className={classes.card}>
        <h1>{success ? "Pro aktywne" : "Płatność anulowana"}</h1>
        <p>{success
          ? "Dziękujemy! Twój 30-dniowy dostęp Pro jest już aktywny."
          : "Nie pobrano żadnej płatności. Możesz wrócić do wyboru planu w dowolnej chwili."}</p>
        <Link to={getEditorPath()} className={classes.cta}>
          {success ? "Przejdź do edytora" : "Wróć do CV Studio"}
        </Link>
      </div>
    </div>
  );
}
```

Create `CheckoutResult.module.css` per DESIGN.md (centered sharp-corner card, `min-height: 100dvh`).

- [ ] **Step 4: Register the routes**

```jsx
// frontend/src/App.jsx
import CheckoutResult from './pages/Billing/CheckoutResult';
// inside createBrowserRouter:
  { path: "/billing/success", element: <CheckoutResult variant="success" /> },
  { path: "/billing/cancel", element: <CheckoutResult variant="cancel" /> },
```

- [ ] **Step 5: Run tests + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Update README (EN + PL) + commit**

Document the Stripe flow: `/billing/select-plan` returning `checkout_url`, `/billing/webhook`, success/cancel routes, env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`), the webhook-only activation security note, and how to test webhooks locally (`stripe listen --forward-to localhost:8000/billing/webhook`). Update the env-vars summary table.

```bash
git add frontend/src/pages/Billing frontend/src/App.jsx frontend/src/services/billingPages.test.js README.md
git commit -m "feat(billing): Stripe success/cancel return pages"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 / §4 — migration, columns, backfill, nullable password, model | Task 0.1 |
| §5 backend — email token, Resend service, register change, verify/resend endpoints, login block | Tasks 1.1, 1.2, 1.3 |
| §5 frontend — /verify-email, post-register screen, email_unverified handling | Task 1.4 |
| §5 env — RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL | Task 1.2 |
| §6 backend — /auth/google, verify id_token, linking rules, unique username, Free sub | Task 2.1 |
| §6 frontend — GIS load, buttons, callback → JWT → redirect | Task 2.2 |
| §6 env — GOOGLE_CLIENT_ID | Task 2.1 |
| §7 backend — select-plan Checkout, webhook, idempotency, raw body, Payment/customer | Tasks 3.1, 3.2 |
| §7 frontend — success/cancel pages | Task 3.3 |
| §7 env — STRIPE_* | Task 3.1 |
| §8 env summary table | README steps in Tasks 1.4, 2.2, 3.3 |
| §9 roadmap ordering (0 → {1,2} → 3) | Phase structure; 1 and 2 both depend only on 0 |
| §11 documentation | README + comment steps in each phase's final task |

**2. Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above" — every code and test step carries real content. Two frontend steps (Task 1.4 Step 8/9, Task 2.2 Step 5) describe page-integration edits in prose rather than a full file rewrite because they modify large existing components; each names the exact functions to call, the exact state to add, and is covered by a concrete source-assertion test.

**3. Type consistency:** `create_email_verification_token`/`verify_email_token`, `send_verification_email(to, verify_url)`, `create_checkout_session(user_id, price_id, success_url, cancel_url)`, `construct_webhook_event(payload, signature)`, `verify_google_id_token(token)`, `googleLogin(idToken)`, `verifyEmail(token)`, `resendVerification(email)` are named identically in their producing and consuming tasks. `google_sub`, `is_verified`, `auth_provider` match the model in Task 0.1. Endpoint constants (`ENDPOINTS.AUTH.GOOGLE`, `VERIFY_EMAIL`, `RESEND_VERIFICATION`) are added in Task 1.4 Step 1 and reused in Task 2.

**Known follow-ups (spec §10, out of scope):** password reset, billing portal/history, invoices.

---

## Execution notes

- The `lambda: (yield self.db)` dependency override used in the tests is a compact generator override; if your Python/pytest setup rejects it, fall back to the explicit `def _override_db(): yield self.db` form shown in `tests/test_plan_selection.py`.
- Run the full backend suite once per phase: `cd backend && python -m pytest -q`.
- Run the frontend suite once per phase: `cd frontend && npm test`.
