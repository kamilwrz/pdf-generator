"""Add monthly CV-import allowances and usage metering.

Revision ID: 20260829_0007
Revises: 20260824_0006

The legacy user_subscriptions.free_import_used column is intentionally kept so
rolling deployments can coexist. New code ignores it and uses the monthly
usage counter introduced here.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260829_0007"
down_revision: Union[str, Sequence[str], None] = "20260824_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable plan limits and a zero-filled monthly usage column."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "plans" in table_names:
        plan_columns = {column["name"] for column in inspector.get_columns("plans")}
        if "max_cv_imports_per_month" not in plan_columns:
            op.add_column(
                "plans",
                sa.Column("max_cv_imports_per_month", sa.Integer(), nullable=True),
            )

    if "usage_counters" in table_names:
        usage_columns = {
            column["name"] for column in inspector.get_columns("usage_counters")
        }
        if "cv_imports_count" not in usage_columns:
            op.add_column(
                "usage_counters",
                sa.Column(
                    "cv_imports_count",
                    sa.Integer(),
                    nullable=False,
                    server_default=sa.text("0"),
                ),
            )


def downgrade() -> None:
    """Remove only the monthly import columns; legacy trial data is unchanged."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "usage_counters" in table_names:
        usage_columns = {
            column["name"] for column in inspector.get_columns("usage_counters")
        }
        if "cv_imports_count" in usage_columns:
            op.drop_column("usage_counters", "cv_imports_count")

    if "plans" in table_names:
        plan_columns = {column["name"] for column in inspector.get_columns("plans")}
        if "max_cv_imports_per_month" in plan_columns:
            op.drop_column("plans", "max_cv_imports_per_month")
