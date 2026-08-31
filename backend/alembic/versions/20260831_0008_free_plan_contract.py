"""Apply the complete, watermark-free Free-plan quota contract.

Revision ID: 20260831_0008
Revises: 20260829_0007

The `pdfs.watermarked` compatibility flag is deliberately not rewritten here.
A true value means the stored local/S3 file still contains the legacy overlay;
the download route uses that marker to rebuild the actual bytes once and only
then clears it. Updating the flag without rewriting storage would serve stale
watermarked files as if they were clean.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260831_0008"
down_revision: Union[str, Sequence[str], None] = "20260829_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _plans_table() -> sa.TableClause:
    """Return the minimal catalog projection needed by this data migration."""
    return sa.table(
        "plans",
        sa.column("slug", sa.String()),
        sa.column("max_projects", sa.Integer()),
        sa.column("max_exports_per_month", sa.Integer()),
        sa.column("max_ai_actions_per_month", sa.Integer()),
        sa.column("max_cv_imports_per_month", sa.Integer()),
        sa.column("ai_assistant", sa.Boolean()),
        sa.column("extract_cv", sa.Boolean()),
        sa.column("template_tier", sa.String()),
        sa.column("is_active", sa.Boolean()),
    )


def upgrade() -> None:
    """Update an existing Free catalog row to the new production limits."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "plans" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("plans")}
    required = {
        "slug",
        "max_projects",
        "max_exports_per_month",
        "max_ai_actions_per_month",
        "max_cv_imports_per_month",
        "ai_assistant",
        "extract_cv",
        "template_tier",
        "is_active",
    }
    if not required.issubset(columns):
        return

    plans = _plans_table()
    op.execute(
        plans.update()
        .where(plans.c.slug == "free")
        .values(
            max_projects=1,
            max_exports_per_month=3,
            max_ai_actions_per_month=0,
            max_cv_imports_per_month=1,
            ai_assistant=False,
            extract_cv=True,
            template_tier="starter",
            is_active=True,
        )
    )


def downgrade() -> None:
    """Restore the previous three-import allowance; other limits are unchanged."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "plans" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("plans")}
    if not {"slug", "max_cv_imports_per_month"}.issubset(columns):
        return

    plans = _plans_table()
    op.execute(
        plans.update()
        .where(plans.c.slug == "free")
        .values(max_cv_imports_per_month=3)
    )
