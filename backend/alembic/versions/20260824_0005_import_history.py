"""Add private PDF extraction snapshots and document provenance.

Revision ID: 20260824_0005
Revises: 20260809_0004
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260824_0005"
down_revision: Union[str, Sequence[str], None] = "20260809_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create import history and link saved PDFs to their source snapshot.

    ``batch_alter_table`` is required for the foreign key because SQLite cannot
    add constraints with ``ALTER TABLE``. Alembic recreates the table and copies
    its rows while PostgreSQL continues to use ordinary ALTER statements. Each
    object is inspected independently so rerunning after a non-transactional
    SQLite failure repairs the missing constraint and index without duplicating
    the table or column that may already have been committed.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "cv_import_snapshots" not in tables:
        op.create_table(
            "cv_import_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("source_filename", sa.String(length=255), nullable=False),
            sa.Column("source_size_bytes", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False),
            sa.Column("cv_data", sa.JSON(), nullable=True),
            sa.Column("error_code", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_cv_import_snapshots_owner_created", "cv_import_snapshots", ["owner_id", "created_at"])
        op.create_index("ix_cv_import_snapshots_owner_status", "cv_import_snapshots", ["owner_id", "status"])

    if "pdfs" in tables:
        columns = {column["name"] for column in inspector.get_columns("pdfs")}
        foreign_keys = inspector.get_foreign_keys("pdfs")
        indexes = {index["name"] for index in inspector.get_indexes("pdfs")}
        source_column_missing = "source_import_id" not in columns
        source_foreign_key_missing = not any(
            foreign_key.get("constrained_columns") == ["source_import_id"]
            and foreign_key.get("referred_table") == "cv_import_snapshots"
            and foreign_key.get("referred_columns") == ["id"]
            for foreign_key in foreign_keys
        )

        if source_column_missing or source_foreign_key_missing:
            with op.batch_alter_table("pdfs") as batch_op:
                if source_column_missing:
                    batch_op.add_column(
                        sa.Column("source_import_id", sa.Integer(), nullable=True)
                    )
                if source_foreign_key_missing:
                    batch_op.create_foreign_key(
                        "fk_pdfs_source_import_id",
                        "cv_import_snapshots",
                        ["source_import_id"],
                        ["id"],
                    )

        if "ix_pdfs_source_import_id" not in indexes:
            op.create_index("ix_pdfs_source_import_id", "pdfs", ["source_import_id"])


def downgrade() -> None:
    pass
