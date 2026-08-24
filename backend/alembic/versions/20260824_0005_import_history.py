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
        if "source_import_id" not in columns:
            op.add_column("pdfs", sa.Column("source_import_id", sa.Integer(), nullable=True))
            op.create_foreign_key("fk_pdfs_source_import_id", "pdfs", "cv_import_snapshots", ["source_import_id"], ["id"])
            op.create_index("ix_pdfs_source_import_id", "pdfs", ["source_import_id"])


def downgrade() -> None:
    pass
