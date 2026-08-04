"""Add spacing_px JSON on pdfs.

Revision ID: 20260804_0003
Revises: 20260804_0002
Create Date: 2026-08-04

Persists per-document vertical rhythm overrides edited from the Sections panel
(stack / record / section / after_rule). Null keeps generator defaults.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260804_0003"
down_revision: Union[str, Sequence[str], None] = "20260804_0002"
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
    if "spacing_px" not in pdf_cols:
        op.add_column(
            "pdfs",
            sa.Column("spacing_px", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for SQLite-friendly safety.
    pass
