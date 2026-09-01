"""Add an atomic per-owner image upload-slot counter.

Revision ID: 20260901_0014
Revises: 20260901_0013

The counter is backfilled from owned image rows. Its server default preserves
the N-1 user-insert shape; current upload code reconciles the counter upward
with the live row count before every reservation, covering images inserted by
an older worker during the rolling-deploy window.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0014"
down_revision: Union[str, Sequence[str], None] = "20260901_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Backfill the counter and quarantine invalid legacy image references."""

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return
    user_columns = {
        column["name"] for column in inspector.get_columns("users")
    }
    if "image_slots_used" not in user_columns:
        op.add_column(
            "users",
            sa.Column(
                "image_slots_used",
                sa.Integer(),
                server_default=sa.text("0"),
                nullable=False,
            ),
        )
    if "images" in tables:
        bind.execute(sa.text(
            "UPDATE users SET image_slots_used = "
            "(SELECT COUNT(*) FROM images WHERE images.owner_id = users.id)"
        ))

    # SQLite historically ran with foreign-key checks disabled, so a legacy
    # database can contain PdfElements rows pointing at deleted images. Preserve
    # every missing id in a reversible audit table before clearing only the
    # invalid FK field; the canvas row and its original ``src`` remain intact.
    if "pdf_elements" in tables and "images" in tables:
        inspector = sa.inspect(bind)
        if "image_reference_quarantine" not in set(inspector.get_table_names()):
            op.create_table(
                "image_reference_quarantine",
                sa.Column("pdf_element_id", sa.Integer(), primary_key=True),
                sa.Column("missing_image_id", sa.Integer(), nullable=False),
                sa.Column(
                    "detected_at",
                    sa.DateTime(),
                    server_default=sa.func.now(),
                    nullable=False,
                ),
            )
        bind.execute(sa.text(
            "INSERT INTO image_reference_quarantine "
            "(pdf_element_id, missing_image_id, detected_at) "
            "SELECT pe.id, pe.img_id, CURRENT_TIMESTAMP "
            "FROM pdf_elements AS pe "
            "LEFT JOIN images AS image_row ON image_row.id = pe.img_id "
            "WHERE pe.img_id IS NOT NULL AND image_row.id IS NULL "
            "AND NOT EXISTS ("
            "SELECT 1 FROM image_reference_quarantine AS quarantine "
            "WHERE quarantine.pdf_element_id = pe.id"
            ")"
        ))
        bind.execute(sa.text(
            "UPDATE pdf_elements SET img_id = NULL "
            "WHERE img_id IS NOT NULL AND NOT EXISTS ("
            "SELECT 1 FROM images WHERE images.id = pdf_elements.img_id"
            ")"
        ))


def downgrade() -> None:
    """Remove slot accounting while retaining quarantined legacy identifiers.

    The quarantine table deliberately survives downgrade. Restoring missing ids
    would violate the same foreign key and recreate the unsafe orphan state;
    dropping the table would destroy the only preserved copy of those ids.
    """

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in set(inspector.get_table_names()):
        return
    columns = {
        column["name"] for column in inspector.get_columns("users")
    }
    if "image_slots_used" in columns:
        op.drop_column("users", "image_slots_used")
