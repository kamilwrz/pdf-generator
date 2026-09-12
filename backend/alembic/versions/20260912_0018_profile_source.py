"""Remember explicit career-profile sources without changing existing evidence.

Null preserves legacy profiles until their owner chooses a source. Downgrade
forgets the binding but retains the most recently synchronised facts and notes.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260912_0018"
down_revision = "20260910_0017"
branch_labels = None
depends_on = None


def upgrade():
    """Support both migrations and development metadata bootstraps."""
    columns = sa.inspect(op.get_bind()).get_columns("career_profiles")
    if "source_binding" not in {column["name"] for column in columns}:
        op.add_column("career_profiles", sa.Column("source_binding", sa.JSON(), nullable=True))


def downgrade():
    """Remove only the source link; saved documents and facts survive."""
    op.drop_column("career_profiles", "source_binding")
