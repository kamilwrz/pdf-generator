"""Add private, resumable job-tailoring intake drafts.

Rollback discards intake drafts only; interviews and generated PDFs survive.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260916_0019"
down_revision = "20260912_0018"
branch_labels = None
depends_on = None


def upgrade():
    """Support both an existing database and metadata-created fresh installs."""
    if "tailoring_flows" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "tailoring_flows",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("state", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_tailoring_flows_owner_id", "tailoring_flows", ["owner_id"])


def downgrade():
    """Remove drafts without modifying ordinary documents or interviews."""
    op.drop_table("tailoring_flows")
