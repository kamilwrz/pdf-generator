"""Argon2id, canonical identity, JWT, and atomic auth throttle regressions."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import bcrypt
from fastapi.testclient import TestClient
import jwt
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.core.security import (
    DEFAULT_JWT_KEY_VERSION,
    hash_password,
    resolve_user_from_payload,
    verify_password,
)
from app.api.routes import auth as auth_routes
from app.crud.user import (
    authenticate_user,
    create_user,
    get_user_by_email,
    get_user_by_username,
)
from app.dependencies import get_db
from app.main import app
from app.models.models import AuthRateLimit, Base, User, UserSubscription
from app.schemas.user_schema import UserCreateRequest
from app.services.auth_rate_limit import (
    AuthRateLimitExceeded,
    claim_rate_limit,
    client_ip,
)
from app.services.entitlements import seed_plans
from app.testing_support import ensure_test_auth_env


SAFE_PASSWORD = "correct horse battery"


class PasswordAndIdentityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        seed_plans(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_registration_contract_enforces_username_and_password_bounds(self):
        for username in ("ab", "contains space", "x" * 33):
            with self.assertRaises(ValidationError):
                UserCreateRequest(username=username, email="valid@example.test", password=SAFE_PASSWORD)
        for password in ("too-short", "x" * 129):
            with self.assertRaises(ValidationError):
                UserCreateRequest(username="valid-user", email="valid@example.test", password=password)

    def test_new_hash_is_argon2id_and_does_not_truncate_after_72_bytes(self):
        first = "a" * 72 + "first-tail"
        second = "a" * 72 + "second-tail"
        hashed = hash_password(first)
        self.assertTrue(hashed.startswith("$argon2id$"))
        self.assertTrue(verify_password(first, hashed))
        self.assertFalse(verify_password(second, hashed))

    def test_successful_legacy_bcrypt_login_adds_argon2_without_destroying_n1_hash(self):
        legacy_hash = bcrypt.hashpw(SAFE_PASSWORD.encode(), bcrypt.gensalt()).decode("ascii")
        user = User(
            username="legacy-user",
            email="legacy@example.test",
            hashed_password=legacy_hash,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        authenticated = authenticate_user("LEGACY-USER", SAFE_PASSWORD, self.db)
        self.assertEqual(authenticated.id, user.id)
        self.assertTrue(authenticated.hashed_password.startswith("$2"))
        self.assertTrue(authenticated.argon2_password_hash.startswith("$argon2id$"))
        # The previous release can still verify the same account after rollback.
        self.assertTrue(bcrypt.checkpw(
            SAFE_PASSWORD.encode(),
            authenticated.hashed_password.encode("ascii"),
        ))

    def test_new_registration_writes_argon2_and_n1_bcrypt_bridge(self):
        create_user(self.db, UserCreateRequest(
            username="bridge-user",
            email="bridge@example.test",
            password=SAFE_PASSWORD,
        ))
        user = get_user_by_username(self.db, "bridge-user")
        self.assertTrue(user.argon2_password_hash.startswith("$argon2id$"))
        self.assertTrue(user.hashed_password.startswith("$2"))
        self.assertTrue(verify_password(SAFE_PASSWORD, user.argon2_password_hash))
        self.assertTrue(bcrypt.checkpw(
            SAFE_PASSWORD.encode(),
            user.hashed_password.encode("ascii"),
        ))

    def test_argon2_remains_authoritative_beyond_bcrypts_legacy_limit(self):
        registered_password = "a" * 72 + "registered-tail"
        colliding_legacy_prefix = "a" * 72 + "different-tail"
        create_user(self.db, UserCreateRequest(
            username="long-password-user",
            email="long-password@example.test",
            password=registered_password,
        ))

        self.assertFalse(authenticate_user(
            "long-password-user",
            colliding_legacy_prefix,
            self.db,
        ))
        self.assertIsInstance(authenticate_user(
            "long-password-user",
            registered_password,
            self.db,
        ), User)

    def test_canonical_identity_is_unique_and_subscription_is_atomic(self):
        create_user(self.db, UserCreateRequest(
            username="Case.User",
            email="Owner@Example.Test",
            password=SAFE_PASSWORD,
        ))
        user = get_user_by_username(self.db, "case.user")
        self.assertEqual(user.email_canonical, "owner@example.test")
        self.assertIsNotNone(
            self.db.query(UserSubscription).filter_by(user_id=user.id).one_or_none()
        )

    def test_n1_user_with_null_canonical_keys_can_still_log_in(self):
        legacy = User(
            username="Rolling.User",
            email="Rolling@Example.Test",
            hashed_password=hash_password(SAFE_PASSWORD),
            is_active=True,
        )
        self.db.add(legacy)
        self.db.commit()
        legacy_id = legacy.id
        # Bulk SQL mirrors an insert made by an N-1 worker, which does not run
        # the canonical-key listeners from the current model.
        self.db.query(User).filter(User.id == legacy_id).update({
            User.username_canonical: None,
            User.email_canonical: None,
        }, synchronize_session=False)
        self.db.commit()
        self.db.expunge_all()

        self.assertEqual(get_user_by_username(self.db, "rolling.user").id, legacy_id)
        self.assertEqual(get_user_by_email(self.db, "rolling@example.test").id, legacy_id)
        self.assertEqual(
            authenticate_user("ROLLING.USER", SAFE_PASSWORD, self.db).id,
            legacy_id,
        )

    def test_legacy_username_subject_resolves_exact_row_not_canonical_collision(self):
        create_user(self.db, UserCreateRequest(
            username="Alice",
            email="alice-owner@example.test",
            password=SAFE_PASSWORD,
        ))
        owner = self.db.query(User).filter(User.username == "Alice").one()
        # Raw SQL mirrors an N-1 worker that does not know canonical columns;
        # current ORM listeners intentionally cannot create this row shape.
        self.db.execute(text(
            """
            INSERT INTO users (username, email, hashed_password, is_active)
            VALUES (:username, :email, :hashed_password, 1)
            """
        ), {
            "username": "alice",
            "email": "alice-legacy@example.test",
            "hashed_password": hash_password(SAFE_PASSWORD),
        })
        self.db.commit()
        legacy_id = self.db.query(User.id).filter(User.username == "alice").scalar()

        resolved = resolve_user_from_payload(self.db, {"sub": "alice"})

        self.assertEqual(resolved.id, legacy_id)
        self.assertNotEqual(resolved.id, owner.id)

    def test_numeric_legacy_username_is_not_interpreted_as_current_user_id(self):
        numeric_id_owner = User(
            id=123,
            username="different-owner",
            email="different-owner@example.test",
            hashed_password=hash_password(SAFE_PASSWORD),
            is_active=True,
        )
        self.db.add(numeric_id_owner)
        self.db.commit()
        create_user(self.db, UserCreateRequest(
            username="123",
            email="numeric-username@example.test",
            password=SAFE_PASSWORD,
        ))
        numeric_username_owner = self.db.query(User).filter(User.username == "123").one()

        legacy = resolve_user_from_payload(self.db, {"sub": "123"})
        current = resolve_user_from_payload(self.db, {
            "sub": "123",
            "ver": os.getenv("JWT_KEY_VERSION", DEFAULT_JWT_KEY_VERSION),
        })

        self.assertEqual(legacy.id, numeric_username_owner.id)
        self.assertEqual(current.id, numeric_id_owner.id)


class JwtAndRouteTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        seed_plans(self.db)
        create_user(self.db, UserCreateRequest(
            username="token-user",
            email="token@example.test",
            password=SAFE_PASSWORD,
        ))
        self.user = get_user_by_username(self.db, "token-user")

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_new_jwt_uses_immutable_user_id_and_only_bearer_verification(self):
        response = self.client.post(
            "/auth/token",
            data={"username": "TOKEN-USER", "password": SAFE_PASSWORD},
        )
        self.assertEqual(response.status_code, 200)
        token = response.json()["access_token"]
        decoded = jwt.decode(token, os.environ["SECRET_KEY"], algorithms=["HS256"])
        self.assertEqual(decoded["sub"], str(self.user.id))
        self.assertIn("ver", decoded)
        self.assertEqual(
            self.client.get(
                "/auth/verify-token",
                headers={"Authorization": f"Bearer {token}"},
            ).status_code,
            200,
        )
        registered_paths = {getattr(route, "path", "") for route in app.routes}
        self.assertNotIn("/auth/verify-token/{token}", registered_paths)

    def test_pre_migration_token_without_version_works_until_secret_rotation(self):
        old_token = jwt.encode(
            {"sub": "token-user"},
            os.environ["SECRET_KEY"],
            algorithm="HS256",
        )
        response = self.client.get(
            "/auth/verify-token",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        self.assertEqual(response.status_code, 200)

        with patch.dict(os.environ, {"SECRET_KEY": "n" * 40}):
            rotated = self.client.get(
                "/auth/verify-token",
                headers={"Authorization": f"Bearer {old_token}"},
            )
        self.assertEqual(rotated.status_code, 401)
        self.assertEqual(rotated.json()["detail"]["code"], "invalid_token")

    def test_verify_token_rejects_a_deactivated_account(self):
        response = self.client.post(
            "/auth/token",
            data={"username": "token-user", "password": SAFE_PASSWORD},
        )
        self.assertEqual(response.status_code, 200, msg=response.text)
        token = response.json()["access_token"]
        self.user.is_active = False
        self.db.add(self.user)
        self.db.commit()

        verified = self.client.get(
            "/auth/verify-token",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(verified.status_code, 401)
        self.assertEqual(verified.json()["detail"]["code"], "invalid_token")

    def test_five_failed_logins_lock_the_account_window(self):
        for _ in range(5):
            response = self.client.post(
                "/auth/token",
                data={"username": "token-user", "password": "wrong password value"},
            )
            self.assertEqual(response.status_code, 401)
        blocked = self.client.post(
            "/auth/token",
            data={"username": "token-user", "password": SAFE_PASSWORD},
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()["detail"]["code"], "auth_rate_limited")
        self.assertIn("Retry-After", blocked.headers)


class AuthRateLimitConcurrencyTests(unittest.TestCase):
    @staticmethod
    def _request(*, peer: str, forwarded_for: str) -> Request:
        return Request({
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": "/auth/token",
            "raw_path": b"/auth/token",
            "query_string": b"",
            "headers": [(b"x-forwarded-for", forwarded_for.encode("ascii"))],
            "client": (peer, 12345),
            "server": ("api.example.test", 443),
        })

    def test_forwarded_ip_requires_an_explicitly_trusted_proxy_peer(self):
        environment = {
            "TRUST_PROXY_HEADERS": "true",
            "TRUSTED_PROXY_CIDRS": "10.0.0.0/8,100.64.0.0/10",
        }
        with patch.dict(os.environ, environment, clear=False):
            direct = client_ip(self._request(
                peer="198.51.100.20",
                forwarded_for="203.0.113.99, 198.51.100.20",
            ))
            proxied = client_ip(self._request(
                peer="10.20.30.40",
                # A client-supplied left entry must not override the address
                # appended by the trusted edge. The right-to-left walk skips
                # trusted proxy hops and returns the first untrusted address.
                forwarded_for="198.18.0.1, 203.0.113.7, 10.20.30.40",
            ))

        self.assertEqual(direct, "198.51.100.20")
        self.assertEqual(proxied, "203.0.113.7")

    def test_proxy_flag_without_cidr_allowlist_fails_closed(self):
        with patch.dict(
            os.environ,
            {"TRUST_PROXY_HEADERS": "true", "TRUSTED_PROXY_CIDRS": ""},
            clear=False,
        ):
            resolved = client_ip(self._request(
                peer="198.51.100.20",
                forwarded_for="203.0.113.99",
            ))
        self.assertEqual(resolved, "198.51.100.20")

    def test_concurrent_claims_are_capped_atomically(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "auth-rate.db"
            engine = create_engine(
                f"sqlite:///{db_path.as_posix()}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            Base.metadata.create_all(bind=engine)
            Session = sessionmaker(bind=engine)

            def claim(_index: int) -> bool:
                with Session() as db:
                    try:
                        claim_rate_limit(
                            db,
                            scope="login_ip",
                            raw_key="203.0.113.10",
                            limit=5,
                            window_seconds=900,
                        )
                        return True
                    except AuthRateLimitExceeded:
                        return False

            with patch.dict(os.environ, {"SECRET_KEY": "r" * 40}):
                with ThreadPoolExecutor(max_workers=20) as executor:
                    outcomes = list(executor.map(claim, range(20)))
            with Session() as db:
                row = db.query(AuthRateLimit).one()
            engine.dispose()
        self.assertEqual(outcomes.count(True), 5)
        self.assertEqual(row.attempts, 5)

    def test_concurrent_login_burst_is_admitted_before_expensive_hashing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "login-admission.db"
            engine = create_engine(
                f"sqlite:///{db_path.as_posix()}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            Base.metadata.create_all(bind=engine)
            Session = sessionmaker(bind=engine)
            calls = 0
            calls_lock = threading.Lock()

            def expensive_invalid_login(*_args):
                nonlocal calls
                with calls_lock:
                    calls += 1
                # Holding admitted calls briefly makes the regression exercise
                # a real concurrent burst instead of a serial scheduling fluke.
                time.sleep(0.03)
                return False

            def attempt(_index: int) -> int:
                with Session() as db:
                    try:
                        auth_routes.login_for_acess_token(
                            request=self._request(
                                peer="203.0.113.10",
                                forwarded_for="",
                            ),
                            form_data=SimpleNamespace(
                                username="victim-account",
                                password="invalid password",
                            ),
                            db=db,
                        )
                    except HTTPException as exc:
                        return exc.status_code
                return 200

            from fastapi import HTTPException

            with (
                patch.dict(os.environ, {"SECRET_KEY": "r" * 40}),
                patch.object(
                    auth_routes,
                    "authenticate_user",
                    side_effect=expensive_invalid_login,
                ),
                ThreadPoolExecutor(max_workers=20) as executor,
            ):
                statuses = list(executor.map(attempt, range(20)))
            engine.dispose()

        self.assertEqual(calls, 5)
        self.assertEqual(statuses.count(401), 5)
        self.assertEqual(statuses.count(429), 15)


if __name__ == "__main__":
    unittest.main()
