"""Add document revisions, idempotency, title keys, and template provenance.

Revision ID: 20260901_0012
Revises: 20260901_0011
"""
from __future__ import annotations

import hashlib
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0012"
down_revision: Union[str, Sequence[str], None] = "20260901_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TITLE_KEY_MAX_LENGTH = 140


def _title_key(value: str | None) -> str:
    """Mirror the application's bounded canonical-title algorithm."""
    canonical = unicodedata.normalize("NFKC", value or "").strip().casefold()
    if len(canonical) <= TITLE_KEY_MAX_LENGTH:
        return canonical
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    prefix_length = TITLE_KEY_MAX_LENGTH - len(digest) - 1
    return f"{canonical[:prefix_length]}~{digest}"


def _deduplicate_key(base: str, pdf_id: int, used: set[str]) -> str:
    """Return a stable bounded suffix for colliding legacy display titles."""
    if base not in used:
        return base
    attempt = 0
    while True:
        suffix = f"~{pdf_id}" if attempt == 0 else f"~{pdf_id}-{attempt}"
        candidate = f"{base[:TITLE_KEY_MAX_LENGTH - len(suffix)]}{suffix}"
        if candidate not in used:
            return candidate
        attempt += 1


def upgrade() -> None:
    """Backfill concurrency metadata without renaming legacy documents.

    Existing duplicate display titles receive stable internal suffixes. Those
    suffixes are intentionally not derived again during ordinary ORM updates.
    ``title_key`` remains nullable during the two-release N-1 window because an
    older worker cannot populate it. The unique constraint still protects all
    documents written by the current application, which always supply a key.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pdfs" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("pdfs")}
    additions = (
        ("title_key", sa.Column("title_key", sa.String(length=140), nullable=True)),
        ("revision", sa.Column("revision", sa.Integer(), server_default=sa.text("1"), nullable=False)),
        ("origin_template_id", sa.Column("origin_template_id", sa.String(), nullable=True)),
        ("create_idempotency_key", sa.Column("create_idempotency_key", sa.String(length=128), nullable=True)),
        ("create_request_hash", sa.Column("create_request_hash", sa.String(length=64), nullable=True)),
    )
    for name, column in additions:
        if name not in columns:
            op.add_column("pdfs", column)

    rows = bind.execute(
        sa.text(
            "SELECT id, owner_id, title, title_key, template_id "
            "FROM pdfs ORDER BY owner_id, id"
        )
    ).mappings().all()
    used_by_owner: dict[int | None, set[str]] = {}
    for row in rows:
        owner_id = int(row["owner_id"]) if row["owner_id"] is not None else None
        owner_keys = used_by_owner.setdefault(owner_id, set())
        base = _title_key(row["title"]) or f"document-{row['id']}"
        # A rerun after an interrupted batch operation must retain any already
        # assigned suffix instead of collapsing it back onto the canonical key.
        existing = str(row["title_key"] or "").strip()
        candidate = existing if existing and len(existing) <= TITLE_KEY_MAX_LENGTH else base
        candidate = _deduplicate_key(candidate, int(row["id"]), owner_keys)
        owner_keys.add(candidate)
        bind.execute(
            sa.text(
                "UPDATE pdfs SET title_key = :title_key, revision = COALESCE(revision, 1), "
                "origin_template_id = COALESCE(origin_template_id, template_id) WHERE id = :pdf_id"
            ),
            {"title_key": candidate, "pdf_id": row["id"]},
        )

    inspector = sa.inspect(bind)
    unique_names = {
        constraint.get("name")
        for constraint in inspector.get_unique_constraints("pdfs")
    }
    missing_title_constraint = "uq_pdf_owner_title_key" not in unique_names
    missing_idempotency_constraint = (
        "uq_pdf_owner_create_idempotency" not in unique_names
    )
    # A fresh ``create_all`` database already contains the current constraints.
    # Avoid even entering a SQLite batch rebuild when there is nothing to add.
    if missing_title_constraint or missing_idempotency_constraint:
        with op.batch_alter_table("pdfs") as batch:
            if missing_title_constraint:
                batch.create_unique_constraint(
                    "uq_pdf_owner_title_key", ["owner_id", "title_key"]
                )
            if missing_idempotency_constraint:
                batch.create_unique_constraint(
                    "uq_pdf_owner_create_idempotency",
                    ["owner_id", "create_idempotency_key"],
                )


def downgrade() -> None:
    """Remove optimistic-write metadata while retaining document content."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pdfs" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("pdfs")}
    unique_names = {
        constraint.get("name")
        for constraint in inspector.get_unique_constraints("pdfs")
    }
    with op.batch_alter_table("pdfs") as batch:
        if "uq_pdf_owner_create_idempotency" in unique_names:
            batch.drop_constraint("uq_pdf_owner_create_idempotency", type_="unique")
        if "uq_pdf_owner_title_key" in unique_names:
            batch.drop_constraint("uq_pdf_owner_title_key", type_="unique")
        for name in (
            "create_request_hash",
            "create_idempotency_key",
            "origin_template_id",
            "revision",
            "title_key",
        ):
            if name in columns:
                batch.drop_column(name)
