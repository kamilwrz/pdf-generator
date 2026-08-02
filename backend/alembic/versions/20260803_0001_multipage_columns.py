"""Add multi-page columns previously applied via ad-hoc ALTER.

Revision ID: 20260803_0001
Revises:
Create Date: 2026-08-03

These columns already exist on databases that ran the old
``_run_lightweight_migrations`` helper. The upgrade path is idempotent:
each ADD COLUMN is skipped when the column is already present.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260803_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    element_cols = _existing_columns("pdf_elements")
    if element_cols and "page" not in element_cols:
        op.add_column(
            "pdf_elements",
            sa.Column("page", sa.Integer(), server_default="1"),
        )

    pdf_cols = _existing_columns("pdfs")
    if pdf_cols:
        if "pages" not in pdf_cols:
            op.add_column(
                "pdfs",
                sa.Column("pages", sa.Integer(), server_default="1"),
            )
        if "page_width" not in pdf_cols:
            op.add_column(
                "pdfs",
                sa.Column("page_width", sa.Float(), server_default="595"),
            )
        if "page_height" not in pdf_cols:
            op.add_column(
                "pdfs",
                sa.Column("page_height", sa.Float(), server_default="842"),
            )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for SQLite-friendly safety: dropping
    # columns that existing rows rely on is not worth the risk on local DBs.
    pass
