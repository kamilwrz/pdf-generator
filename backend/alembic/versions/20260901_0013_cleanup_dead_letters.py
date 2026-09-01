"""Bound private-storage cleanup retries and retain terminal dead letters.

Revision ID: 20260901_0013
Revises: 20260901_0012

Existing rows remain pending and are interpreted as PDF cleanup requests.
Image uploads start using ``resource_kind=image`` only after this additive
migration, so an N-1 worker can continue inserting the legacy column shape.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0013"
down_revision: Union[str, Sequence[str], None] = "20260901_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add resource routing and an operator-visible terminal retry state."""

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "storage_cleanup_jobs" not in set(inspector.get_table_names()):
        return

    columns = {
        column["name"] for column in inspector.get_columns("storage_cleanup_jobs")
    }
    if "resource_kind" not in columns:
        op.add_column(
            "storage_cleanup_jobs",
            sa.Column(
                "resource_kind",
                sa.String(length=16),
                server_default=sa.text("'pdf'"),
                nullable=False,
            ),
        )
    if "status" not in columns:
        op.add_column(
            "storage_cleanup_jobs",
            sa.Column(
                "status",
                sa.String(length=16),
                server_default=sa.text("'pending'"),
                nullable=False,
            ),
        )
    if "terminal_at" not in columns:
        op.add_column(
            "storage_cleanup_jobs",
            sa.Column("terminal_at", sa.DateTime(), nullable=True),
        )

    inspector = sa.inspect(bind)
    indexes = {
        index["name"] for index in inspector.get_indexes("storage_cleanup_jobs")
    }
    if "ix_storage_cleanup_jobs_status_next_attempt" not in indexes:
        op.create_index(
            "ix_storage_cleanup_jobs_status_next_attempt",
            "storage_cleanup_jobs",
            ["status", "next_attempt_at"],
            unique=False,
        )


def downgrade() -> None:
    """Remove retry-state metadata without deleting cleanup requests."""

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "storage_cleanup_jobs" not in set(inspector.get_table_names()):
        return

    indexes = {
        index["name"] for index in inspector.get_indexes("storage_cleanup_jobs")
    }
    if "ix_storage_cleanup_jobs_status_next_attempt" in indexes:
        op.drop_index(
            "ix_storage_cleanup_jobs_status_next_attempt",
            table_name="storage_cleanup_jobs",
        )

    columns = {
        column["name"] for column in sa.inspect(bind).get_columns(
            "storage_cleanup_jobs"
        )
    }
    if "terminal_at" in columns:
        op.drop_column("storage_cleanup_jobs", "terminal_at")
    if "status" in columns:
        op.drop_column("storage_cleanup_jobs", "status")
    if "resource_kind" in columns:
        op.drop_column("storage_cleanup_jobs", "resource_kind")
