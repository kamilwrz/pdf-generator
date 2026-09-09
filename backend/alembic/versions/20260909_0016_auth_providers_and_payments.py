"""Add verified identities and idempotent payment fields.

Revision ID: 20260909_0016
Revises: 20260901_0015
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260909_0016"
down_revision: Union[str, Sequence[str], None] = "20260901_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(inspector, table: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table)}


def _indexes(inspector, table: str) -> set[str]:
    return {index.get("name") for index in inspector.get_indexes(table)}


def upgrade() -> None:
    """Keep existing users signed in while adding opt-in provider state."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    user_columns = _columns(inspector, "users")
    if "email_verified_at" not in user_columns:
        op.add_column("users", sa.Column("email_verified_at", sa.DateTime(), nullable=True))
    if "google_sub" not in user_columns:
        op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))

    # Accounts created before verification existed are trusted grandfathered
    # accounts. Locking them would create an unrecoverable production outage.
    bind.execute(
        sa.text(
            "UPDATE users SET email_verified_at = COALESCE(created_at, :now) "
            "WHERE email_verified_at IS NULL"
        ),
        {"now": datetime.now(timezone.utc)},
    )

    inspector = sa.inspect(bind)
    if "ix_users_google_sub" not in _indexes(inspector, "users"):
        op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)

    if "email_verification_tokens" not in tables:
        op.create_table(
            "email_verification_tokens",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_email_verification_tokens_id", "email_verification_tokens", ["id"])
        op.create_index("ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"])
        op.create_index("ix_email_verification_tokens_token_hash", "email_verification_tokens", ["token_hash"], unique=True)
        op.create_index(
            "ix_email_verification_tokens_user_expiry",
            "email_verification_tokens",
            ["user_id", "expires_at"],
        )

    payment_columns = _columns(sa.inspect(bind), "payments")
    if "provider_event_id" not in payment_columns:
        op.add_column("payments", sa.Column("provider_event_id", sa.String(), nullable=True))
    if "paid_at" not in payment_columns:
        op.add_column("payments", sa.Column("paid_at", sa.DateTime(), nullable=True))

    inspector = sa.inspect(bind)
    payment_indexes = _indexes(inspector, "payments")
    if "ix_payments_provider_event_id" not in payment_indexes:
        op.create_index("ix_payments_provider_event_id", "payments", ["provider_event_id"], unique=True)
    # Existing nullable provider refs remain valid. PostgreSQL and SQLite both
    # allow multiple NULL pairs while rejecting duplicate real session ids.
    existing_unique = {constraint.get("name") for constraint in inspector.get_unique_constraints("payments")}
    if "uq_payments_provider_ref" not in existing_unique:
        with op.batch_alter_table("payments") as batch:
            batch.create_unique_constraint("uq_payments_provider_ref", ["provider", "provider_ref"])


def downgrade() -> None:
    """Remove provider state; verified timestamps cannot be reconstructed."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "email_verification_tokens" in set(inspector.get_table_names()):
        op.drop_index("ix_email_verification_tokens_user_expiry", table_name="email_verification_tokens")
        op.drop_index("ix_email_verification_tokens_token_hash", table_name="email_verification_tokens")
        op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
        op.drop_index("ix_email_verification_tokens_id", table_name="email_verification_tokens")
        op.drop_table("email_verification_tokens")

    with op.batch_alter_table("payments") as batch:
        batch.drop_constraint("uq_payments_provider_ref", type_="unique")
        batch.drop_index("ix_payments_provider_event_id")
        batch.drop_column("paid_at")
        batch.drop_column("provider_event_id")
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_google_sub")
        batch.drop_column("google_sub")
        batch.drop_column("email_verified_at")
