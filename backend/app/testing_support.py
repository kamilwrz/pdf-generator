"""Helpers used only by backend unit tests (not imported by production routes)."""
from __future__ import annotations

import os

_WEAK = frozenset({
    "",
    "your-secret-key-here",
    "changeme",
    "secret",
    "test",
    "dev",
    "development",
})


def ensure_test_auth_env() -> None:
    """Make FastAPI lifespan auth checks pass under TestClient.

    Production boots reject missing/placeholder SECRET_KEY. Local `.env` files
    often still contain the example placeholder, which would fail every HTTP
    test that constructs ``TestClient(app)``.
    """
    key = (os.getenv("SECRET_KEY") or "").strip()
    if key and key.lower() not in _WEAK and len(key) >= 16:
        return
    os.environ["SECRET_KEY"] = "ci-test-secret-key-32chars-min"
