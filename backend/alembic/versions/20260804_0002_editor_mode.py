"""Add editor_mode and template_id on pdfs.

Revision ID: 20260804_0002
Revises: 20260803_0001
Create Date: 2026-08-04

Persists whether a document is a constrained template edit or a freeform
project, plus the originating template slug when known.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260804_0002"
down_revision: Union[str, Sequence[str], None] = "20260803_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    pdf_cols = _existing_columns("pdfs")
    if not pdf_cols:
        return
    if "editor_mode" not in pdf_cols:
        op.add_column(
            "pdfs",
            sa.Column("editor_mode", sa.String(), server_default="freeform"),
        )
    if "template_id" not in pdf_cols:
        op.add_column(
            "pdfs",
            sa.Column("template_id", sa.String(), nullable=True),
        )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for SQLite-friendly safety.
    pass
