"""Add atomic AI credit reservations and idempotency records.

Revision ID: 20260901_0010
Revises: 20260901_0009
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0010"
down_revision: Union[str, Sequence[str], None] = "20260901_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the reservation meter and durable request ledger additively."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    usage_columns = {column["name"] for column in inspector.get_columns("usage_counters")}
    if "ai_credits_reserved" not in usage_columns:
        op.add_column(
            "usage_counters",
            sa.Column(
                "ai_credits_reserved",
                sa.Integer(),
                server_default=sa.text("0"),
                nullable=False,
            ),
        )

    if "ai_credit_reservations" not in set(inspector.get_table_names()):
        op.create_table(
            "ai_credit_reservations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("period_key", sa.String(length=7), nullable=False),
            sa.Column("action", sa.String(length=32), nullable=False),
            sa.Column("idempotency_key", sa.String(length=128), nullable=False),
            sa.Column("request_hash", sa.String(length=64), nullable=False),
            sa.Column("reserved_credits", sa.Integer(), nullable=False),
            sa.Column("charged_credits", sa.Integer(), server_default=sa.text("0"), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("active_slot", sa.Integer(), nullable=True),
            sa.Column("response_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("settled_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "active_slot",
                name="uq_ai_reservation_user_active_slot",
            ),
            sa.UniqueConstraint(
                "user_id",
                "idempotency_key",
                name="uq_ai_reservation_user_idempotency",
            ),
        )
        op.create_index(
            "ix_ai_credit_reservations_user_id",
            "ai_credit_reservations",
            ["user_id"],
        )
        op.create_index(
            "ix_ai_credit_reservations_period_key",
            "ai_credit_reservations",
            ["period_key"],
        )
        op.create_index(
            "ix_ai_reservation_user_status",
            "ai_credit_reservations",
            ["user_id", "status"],
        )
        op.create_index(
            "ix_ai_reservation_expires_at",
            "ai_credit_reservations",
            ["expires_at"],
        )


def downgrade() -> None:
    """Remove reservation state; settled usage remains in ai_actions_count."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "ai_credit_reservations" in set(inspector.get_table_names()):
        op.drop_index("ix_ai_reservation_expires_at", table_name="ai_credit_reservations")
        op.drop_index("ix_ai_reservation_user_status", table_name="ai_credit_reservations")
        op.drop_index("ix_ai_credit_reservations_period_key", table_name="ai_credit_reservations")
        op.drop_index("ix_ai_credit_reservations_user_id", table_name="ai_credit_reservations")
        op.drop_table("ai_credit_reservations")
    usage_columns = {column["name"] for column in inspector.get_columns("usage_counters")}
    if "ai_credits_reserved" in usage_columns:
        op.drop_column("usage_counters", "ai_credits_reserved")
