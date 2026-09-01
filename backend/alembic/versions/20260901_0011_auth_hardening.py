"""Add canonical identities, Argon2 bridge, and auth throttling.

Revision ID: 20260901_0011
Revises: 20260901_0010
"""
from __future__ import annotations

import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0011"
down_revision: Union[str, Sequence[str], None] = "20260901_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _canonical(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().casefold()


def upgrade() -> None:
    """Backfill canonical keys and add unique indexes compatibly with N-1.

    The columns intentionally remain nullable for two releases. Workers from
    the preceding release do not know these fields and must remain able to
    register users while a rolling deployment is in progress. PostgreSQL and
    SQLite unique indexes still enforce uniqueness for all non-null keys.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "username_canonical" not in user_columns:
        op.add_column("users", sa.Column("username_canonical", sa.String(length=32), nullable=True))
    if "email_canonical" not in user_columns:
        op.add_column("users", sa.Column("email_canonical", sa.String(length=320), nullable=True))
    if "argon2_password_hash" not in user_columns:
        # Nullable keeps INSERTs from N-1 workers valid. Current registrations
        # write both this preferred hash and the existing bcrypt rollback slot.
        op.add_column("users", sa.Column("argon2_password_hash", sa.String(), nullable=True))

    rows = bind.execute(sa.text("SELECT id, username, email FROM users ORDER BY id")).mappings().all()
    seen_usernames: dict[str, int] = {}
    seen_emails: dict[str, int] = {}
    for row in rows:
        username_key = _canonical(row["username"])
        email_key = _canonical(row["email"])
        if not username_key or not email_key:
            raise RuntimeError("Existing users must have non-empty username and email values.")
        if username_key in seen_usernames or email_key in seen_emails:
            raise RuntimeError(
                "Canonical username/email collision detected; resolve duplicate accounts before migration."
            )
        seen_usernames[username_key] = row["id"]
        seen_emails[email_key] = row["id"]
        bind.execute(
            sa.text(
                "UPDATE users SET username_canonical = :username_key, "
                "email_canonical = :email_key WHERE id = :user_id"
            ),
            {"username_key": username_key, "email_key": email_key, "user_id": row["id"]},
        )

    # ``init_db`` deliberately supports a brand-new database by calling
    # ``metadata.create_all`` before Alembic stamps it. In that path the current
    # model has already created these indexes, so inspect their names rather
    # than attempting a duplicate CREATE INDEX.
    inspector = sa.inspect(bind)
    index_names = {
        index.get("name") for index in inspector.get_indexes("users")
    }
    missing_username_index = "ix_users_username_canonical" not in index_names
    missing_email_index = "ix_users_email_canonical" not in index_names
    if missing_username_index or missing_email_index:
        with op.batch_alter_table("users") as batch:
            if missing_username_index:
                batch.create_index(
                    "ix_users_username_canonical",
                    ["username_canonical"],
                    unique=True,
                )
            if missing_email_index:
                batch.create_index(
                    "ix_users_email_canonical",
                    ["email_canonical"],
                    unique=True,
                )

    if "auth_rate_limits" not in set(inspector.get_table_names()):
        op.create_table(
            "auth_rate_limits",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("scope", sa.String(length=32), nullable=False),
            sa.Column("key_hash", sa.String(length=64), nullable=False),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("window_end", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "scope",
                "key_hash",
                "window_start",
                name="uq_auth_rate_limit_window",
            ),
        )
        op.create_index("ix_auth_rate_limits_id", "auth_rate_limits", ["id"])
        op.create_index(
            "ix_auth_rate_limits_window_end",
            "auth_rate_limits",
            ["window_end"],
        )


def downgrade() -> None:
    """Remove throttling and canonical indexes without changing display data."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "auth_rate_limits" in set(inspector.get_table_names()):
        op.drop_index("ix_auth_rate_limits_window_end", table_name="auth_rate_limits")
        op.drop_index("ix_auth_rate_limits_id", table_name="auth_rate_limits")
        op.drop_table("auth_rate_limits")
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    user_indexes = {index.get("name") for index in inspector.get_indexes("users")}
    with op.batch_alter_table("users") as batch:
        if "argon2_password_hash" in user_columns:
            batch.drop_column("argon2_password_hash")
        if "email_canonical" in user_columns:
            if "ix_users_email_canonical" in user_indexes:
                batch.drop_index("ix_users_email_canonical")
            batch.drop_column("email_canonical")
        if "username_canonical" in user_columns:
            if "ix_users_username_canonical" in user_indexes:
                batch.drop_index("ix_users_username_canonical")
            batch.drop_column("username_canonical")
