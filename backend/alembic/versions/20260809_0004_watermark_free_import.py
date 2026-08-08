"""Add watermarked (pdfs) and free_import_used (user_subscriptions).

Revision ID: 20260809_0004
Revises: 20260804_0003
Create Date: 2026-08-09

Etap 2a: Free-plan export watermark + one lifetime free CV import.
`pdfs.watermarked` tracks what the stored file currently contains (not the
account's current plan) so download_pdf can skip re-rendering when they
already match. `user_subscriptions.free_import_used` gates the one-time
free `/ai/extract_cv` call for Free accounts.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260809_0004"
down_revision: Union[str, Sequence[str], None] = "20260804_0003"
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
    if pdf_cols and "watermarked" not in pdf_cols:
        op.add_column(
            "pdfs",
            sa.Column("watermarked", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    sub_cols = _existing_columns("user_subscriptions")
    if sub_cols and "free_import_used" not in sub_cols:
        op.add_column(
            "user_subscriptions",
            sa.Column("free_import_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for SQLite-friendly safety.
    pass
