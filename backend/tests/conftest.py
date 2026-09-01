"""Shared pytest isolation for process-level application gates."""
from __future__ import annotations

import pytest

from app.services.readiness import ReadinessResult, readiness_gate


@pytest.fixture(autouse=True)
def _assume_predeploy_completed(monkeypatch):
    """Keep route tests focused on their isolated dependency-overridden DB.

    Production readiness is covered independently in ``test_readiness.py``.
    Existing route tests replace ``get_db`` with an in-memory database, so
    probing the process-global development database would couple unrelated
    tests to the checkout's local Alembic state.
    """

    monkeypatch.setattr(
        readiness_gate,
        "_checker",
        lambda: ReadinessResult(True),
    )
    readiness_gate.reset()
    yield
    readiness_gate.reset()
