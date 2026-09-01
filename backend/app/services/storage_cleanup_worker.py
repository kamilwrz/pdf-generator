"""Scheduled retry worker for durable private-storage cleanup jobs."""
from __future__ import annotations

import logging

from app.core.config import assert_private_storage_configured
from app.models.database import SessionLocal
from app.services.pdf_storage import process_cleanup_jobs

logger = logging.getLogger(__name__)


def run_cleanup_batch(*, limit: int = 500) -> int:
    """Attempt one bounded batch and return the number of processed jobs.

    The database outbox is the source of truth, so a process restart or S3
    outage cannot lose the retry request. Retryable failures retain exponential
    backoff; jobs that exhaust the finite attempt budget remain as terminal
    dead letters and are excluded from later automatic batches.
    """

    assert_private_storage_configured()
    with SessionLocal() as db:
        attempted = process_cleanup_jobs(db, limit=limit)
    logger.info("Storage cleanup batch attempted %s job(s).", attempted)
    return attempted


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    run_cleanup_batch()
