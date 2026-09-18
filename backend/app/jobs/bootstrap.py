"""Controlled pre-deploy database bootstrap for CV Studio.

Run this module as a release/pre-deploy command before starting new web
workers. Any migration or seed failure propagates as a non-zero exit so the
platform cannot promote a release whose database is not ready.
"""
from __future__ import annotations

from app.core.config import assert_private_storage_configured
from app.models.models import init_db


def run_predeploy() -> None:
    """Apply additive migrations and deterministic catalog seeds.

    Historical destructive cleanups are deliberately excluded from automatic
    deploys. A missing maintenance marker must never make a fresh environment
    delete user documents merely because they match an old page-size rule.
    Migration or seed failures are intentionally not caught: the deployment
    platform must stop promotion before new workers receive traffic.
    """

    assert_private_storage_configured()
    init_db()


if __name__ == "__main__":
    run_predeploy()
