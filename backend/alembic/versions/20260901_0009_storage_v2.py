"""Add immutable PDF storage locators and durable cleanup jobs.

Revision ID: 20260901_0009
Revises: 20260831_0008

Existing ``pdfs.file_path`` values are deliberately not rewritten here. They
may refer to local files or S3 URLs and moving external bytes inside a schema
migration would make rollback unreliable. Application code dual-reads those
legacy locators and migrates a document to Storage V2 after a successful render.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0009"
down_revision: Union[str, Sequence[str], None] = "20260831_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable V2 pointers and the retryable cleanup outbox."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "pdfs" in table_names:
        pdf_columns = {column["name"] for column in inspector.get_columns("pdfs")}
        if "storage_backend" not in pdf_columns:
            op.add_column(
                "pdfs",
                sa.Column("storage_backend", sa.String(length=16), nullable=True),
            )
        if "storage_key" not in pdf_columns:
            op.add_column(
                "pdfs",
                sa.Column("storage_key", sa.String(length=255), nullable=True),
            )

        index_names = {index["name"] for index in inspector.get_indexes("pdfs")}
        if "ix_pdfs_storage_key" not in index_names:
            op.create_index(
                "ix_pdfs_storage_key",
                "pdfs",
                ["storage_key"],
                unique=True,
            )

    if "storage_cleanup_jobs" not in table_names:
        op.create_table(
            "storage_cleanup_jobs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("storage_backend", sa.String(length=16), nullable=False),
            sa.Column("storage_key", sa.String(length=255), nullable=False),
            sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "storage_backend",
                "storage_key",
                name="uq_storage_cleanup_backend_key",
            ),
        )
        op.create_index(
            "ix_storage_cleanup_jobs_id",
            "storage_cleanup_jobs",
            ["id"],
            unique=False,
        )


def downgrade() -> None:
    """Remove Storage V2 metadata without deleting external PDF objects."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "storage_cleanup_jobs" in table_names:
        op.drop_table("storage_cleanup_jobs")

    if "pdfs" in table_names:
        index_names = {index["name"] for index in inspector.get_indexes("pdfs")}
        if "ix_pdfs_storage_key" in index_names:
            op.drop_index("ix_pdfs_storage_key", table_name="pdfs")
        pdf_columns = {column["name"] for column in inspector.get_columns("pdfs")}
        if "storage_key" in pdf_columns:
            op.drop_column("pdfs", "storage_key")
        if "storage_backend" in pdf_columns:
            op.drop_column("pdfs", "storage_backend")
