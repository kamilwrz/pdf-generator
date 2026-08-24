"""Persist normalized CV data with saved canvas documents.

Revision ID: 20260824_0006
Revises: 20260824_0005
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260824_0006"
down_revision: Union[str, Sequence[str], None] = "20260824_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add an optional profile snapshot without changing existing canvases."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pdfs" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("pdfs")}
    if "cv_data" not in columns:
        op.add_column("pdfs", sa.Column("cv_data", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove only the snapshot column created by this migration."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pdfs" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("pdfs")}
    if "cv_data" in columns:
        op.drop_column("pdfs", "cv_data")
