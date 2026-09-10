"""Add private career profiles and resumable interviews without rewriting CVs.

Downgrade removes interview/profile data only; generated CV documents survive.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260910_0017"
down_revision = "20260909_0016"
branch_labels = None
depends_on = None


def upgrade():
    """Create additive tables, including compatibility with metadata bootstraps."""
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "career_profiles" not in tables:
        op.create_table(
            "career_profiles",
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("facts", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    if "interview_sessions" not in tables:
        op.create_table(
            "interview_sessions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("state", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_interview_sessions_owner_id", "interview_sessions", ["owner_id"])


def downgrade():
    """Explicit rollback discards profiles and conversations, never saved PDFs."""
    op.drop_table("interview_sessions")
    op.drop_table("career_profiles")
