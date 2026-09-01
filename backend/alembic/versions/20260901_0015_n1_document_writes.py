"""Protect document metadata written by N-1 application workers.

Revision ID: 20260901_0015
Revises: 20260901_0014

The rolling-deploy compatibility window permits an older worker that does not
know ``revision`` or ``title_key`` to keep serving requests. Database triggers
turn those legacy writes into the same optimistic-concurrency contract used by
the current application. A current worker that explicitly advances a revision
is left unchanged, so one logical save never becomes a double increment.
"""
from __future__ import annotations

import hashlib
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260901_0015"
down_revision: Union[str, Sequence[str], None] = "20260901_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TITLE_KEY_MAX_LENGTH = 140
SQLITE_INSERT_TRIGGER = "trg_pdfs_n1_insert_contract"
SQLITE_UPDATE_TRIGGER = "trg_pdfs_n1_update_contract"
POSTGRES_TRIGGER = "trg_pdfs_n1_write_contract"
POSTGRES_TRIGGER_FUNCTION = "cvstudio_apply_n1_pdf_contract"
POSTGRES_KEY_FUNCTION = "cvstudio_n1_pdf_title_key"


def _title_key(value: str | None) -> str:
    """Mirror the current application's bounded canonical-title algorithm."""

    canonical = unicodedata.normalize("NFKC", value or "").strip().casefold()
    if len(canonical) <= TITLE_KEY_MAX_LENGTH:
        return canonical
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    prefix_length = TITLE_KEY_MAX_LENGTH - len(digest) - 1
    return f"{canonical[:prefix_length]}~{digest}"


def _deduplicate_key(base: str, pdf_id: int, used: set[str]) -> str:
    """Produce the same stable collision suffix policy as revision 0012."""

    if base not in used:
        return base
    attempt = 0
    while True:
        suffix = f"~{pdf_id}" if attempt == 0 else f"~{pdf_id}-{attempt}"
        candidate = f"{base[:TITLE_KEY_MAX_LENGTH - len(suffix)]}{suffix}"
        if candidate not in used:
            return candidate
        attempt += 1


def _ensure_revision_server_default(bind) -> None:
    """Keep raw N-1 inserts valid on both migrated and create-all catalogs."""

    revision_column = next(
        (
            column
            for column in sa.inspect(bind).get_columns("pdfs")
            if column["name"] == "revision"
        ),
        None,
    )
    if revision_column is None:
        return
    default = str(revision_column.get("default") or "").strip("'() ")
    if default == "1":
        return
    if bind.dialect.name == "sqlite":
        # Revision 0012 already installs this default on every upgraded SQLite
        # database, and the current ORM metadata installs it for create-all.
        # Rebuilding a referenced SQLite table merely to repair a hand-crafted
        # out-of-contract schema would require disabling foreign keys outside
        # Alembic's transaction and is intentionally rejected instead.
        raise RuntimeError("pdfs.revision must retain its revision-0012 default")
    with op.batch_alter_table("pdfs") as batch:
        batch.alter_column(
            "revision",
            existing_type=sa.Integer(),
            existing_nullable=False,
            server_default=sa.text("1"),
        )


def _backfill_missing_title_keys(bind) -> None:
    """Repair rows committed by N-1 between revisions 0012 and 0015."""

    rows = bind.execute(
        sa.text(
            "SELECT id, owner_id, title, title_key, revision "
            "FROM pdfs ORDER BY owner_id, id"
        )
    ).mappings().all()
    used_by_owner: dict[int | None, set[str]] = {}
    missing_ids: set[int] = set()
    assignments: dict[int, str] = {}
    for row in rows:
        owner_id = int(row["owner_id"]) if row["owner_id"] is not None else None
        owner_keys = used_by_owner.setdefault(owner_id, set())
        pdf_id = int(row["id"])
        existing = str(row["title_key"] or "").strip()
        if existing:
            candidate = existing[:TITLE_KEY_MAX_LENGTH]
        else:
            base = _title_key(row["title"]) or f"document-{pdf_id}"
            candidate = _deduplicate_key(base, pdf_id, owner_keys)
            missing_ids.add(pdf_id)
        # Be defensive against a partially applied older backfill whose key
        # collides after truncation. No display title is changed.
        candidate = _deduplicate_key(candidate, pdf_id, owner_keys)
        owner_keys.add(candidate)
        assignments[pdf_id] = candidate

    for pdf_id, candidate in assignments.items():
        if pdf_id not in missing_ids:
            continue
        # Advancing the revision invalidates a snapshot loaded before the
        # migration repaired its previously-null concurrency metadata.
        bind.execute(
            sa.text(
                "UPDATE pdfs SET title_key = :title_key, "
                "revision = COALESCE(revision, 1) + 1 WHERE id = :pdf_id"
            ),
            {"title_key": candidate, "pdf_id": pdf_id},
        )


def _sqlite_key_expression(row: str) -> str:
    """Return a bounded SQL expression for an N-1 title's base key."""

    return (
        "CASE WHEN trim(COALESCE(" + row + ".title, '')) = '' "
        "THEN 'document-' || " + row + ".id "
        "ELSE substr(lower(trim(" + row + ".title)), 1, 140) END"
    )


def _sqlite_resolved_key_expression(row: str) -> str:
    """Return a deterministic per-owner key, suffixing legacy collisions."""

    base = _sqlite_key_expression(row)
    suffix = f"'~' || {row}.id"
    return (
        "CASE WHEN EXISTS ("
        "SELECT 1 FROM pdfs AS occupied "
        f"WHERE occupied.id <> {row}.id "
        f"AND occupied.owner_id IS {row}.owner_id "
        f"AND occupied.title_key = ({base})"
        ") THEN "
        f"substr(({base}), 1, 140 - length({suffix})) || {suffix} "
        f"ELSE ({base}) END"
    )


def _install_sqlite_triggers() -> None:
    """Install non-recursive AFTER triggers supported by every target SQLite."""

    insert_key = _sqlite_resolved_key_expression("NEW")
    update_key = _sqlite_resolved_key_expression("NEW")
    op.execute(f"DROP TRIGGER IF EXISTS {SQLITE_INSERT_TRIGGER}")
    op.execute(f"DROP TRIGGER IF EXISTS {SQLITE_UPDATE_TRIGGER}")
    op.execute(
        f"""
        CREATE TRIGGER {SQLITE_INSERT_TRIGGER}
        AFTER INSERT ON pdfs
        FOR EACH ROW
        WHEN NEW.title_key IS NULL OR trim(NEW.title_key) = ''
        BEGIN
            UPDATE pdfs
            SET title_key = {insert_key},
                revision = COALESCE(NEW.revision, 1) + 1
            WHERE id = NEW.id;
        END
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER {SQLITE_UPDATE_TRIGGER}
        AFTER UPDATE ON pdfs
        FOR EACH ROW
        WHEN NEW.revision IS OLD.revision
          OR NEW.title_key IS NULL
          OR trim(NEW.title_key) = ''
          OR (
              NEW.title IS NOT OLD.title
              AND NEW.title_key IS OLD.title_key
          )
        BEGIN
            UPDATE pdfs
            SET title_key = CASE
                    WHEN NEW.title_key IS NULL
                      OR trim(NEW.title_key) = ''
                      OR (
                          NEW.title IS NOT OLD.title
                          AND NEW.title_key IS OLD.title_key
                      )
                    THEN {update_key}
                    ELSE NEW.title_key
                END,
                revision = CASE
                    WHEN NEW.revision IS OLD.revision
                    THEN COALESCE(OLD.revision, 1) + 1
                    ELSE NEW.revision
                END
            WHERE id = NEW.id;
        END
        """
    )


def _install_postgres_trigger() -> None:
    """Install one BEFORE trigger that can mutate NEW without a second update."""

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION {POSTGRES_KEY_FUNCTION}(
            requested_title text,
            requested_owner bigint,
            requested_pdf_id bigint
        ) RETURNS varchar
        LANGUAGE plpgsql
        AS $$
        DECLARE
            base_key text;
            suffix text;
            candidate text;
        BEGIN
            base_key := lower(btrim(COALESCE(requested_title, '')));
            IF base_key = '' THEN
                base_key := 'document-' || requested_pdf_id::text;
            END IF;
            base_key := left(base_key, {TITLE_KEY_MAX_LENGTH});
            candidate := base_key;
            IF EXISTS (
                SELECT 1
                FROM pdfs AS occupied
                WHERE occupied.id <> requested_pdf_id
                  AND occupied.owner_id IS NOT DISTINCT FROM requested_owner
                  AND occupied.title_key = candidate
            ) THEN
                suffix := '~' || requested_pdf_id::text;
                candidate := left(
                    base_key,
                    {TITLE_KEY_MAX_LENGTH} - char_length(suffix)
                ) || suffix;
            END IF;
            RETURN candidate;
        END;
        $$
        """
    )
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION {POSTGRES_TRIGGER_FUNCTION}()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                IF NEW.title_key IS NULL OR btrim(NEW.title_key) = '' THEN
                    NEW.title_key := {POSTGRES_KEY_FUNCTION}(
                        NEW.title, NEW.owner_id, NEW.id
                    );
                    NEW.revision := COALESCE(NEW.revision, 1) + 1;
                END IF;
                RETURN NEW;
            END IF;

            IF NEW.title_key IS NULL
               OR btrim(NEW.title_key) = ''
               OR (
                   NEW.title IS DISTINCT FROM OLD.title
                   AND NEW.title_key IS NOT DISTINCT FROM OLD.title_key
               ) THEN
                NEW.title_key := {POSTGRES_KEY_FUNCTION}(
                    NEW.title, NEW.owner_id, NEW.id
                );
            END IF;
            IF NEW.revision IS NOT DISTINCT FROM OLD.revision THEN
                NEW.revision := COALESCE(OLD.revision, 1) + 1;
            END IF;
            RETURN NEW;
        END;
        $$
        """
    )
    op.execute(f"DROP TRIGGER IF EXISTS {POSTGRES_TRIGGER} ON pdfs")
    op.execute(
        f"""
        CREATE TRIGGER {POSTGRES_TRIGGER}
        BEFORE INSERT OR UPDATE ON pdfs
        FOR EACH ROW
        EXECUTE FUNCTION {POSTGRES_TRIGGER_FUNCTION}()
        """
    )


def upgrade() -> None:
    """Close optimistic-lock and title-key gaps during rolling deployment."""

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pdfs" not in set(inspector.get_table_names()):
        return
    columns = {column["name"] for column in inspector.get_columns("pdfs")}
    if not {"id", "title", "title_key", "owner_id", "revision"}.issubset(columns):
        return

    _ensure_revision_server_default(bind)
    _backfill_missing_title_keys(bind)
    if bind.dialect.name == "postgresql":
        _install_postgres_trigger()
    elif bind.dialect.name == "sqlite":
        _install_sqlite_triggers()
    else:
        raise RuntimeError(
            "N-1 document-write compatibility supports only SQLite and PostgreSQL."
        )


def downgrade() -> None:
    """Remove compatibility triggers without reverting repaired metadata."""

    bind = op.get_bind()
    if "pdfs" not in set(sa.inspect(bind).get_table_names()):
        return
    if bind.dialect.name == "postgresql":
        op.execute(f"DROP TRIGGER IF EXISTS {POSTGRES_TRIGGER} ON pdfs")
        op.execute(f"DROP FUNCTION IF EXISTS {POSTGRES_TRIGGER_FUNCTION}()")
        op.execute(
            f"DROP FUNCTION IF EXISTS {POSTGRES_KEY_FUNCTION}(text, bigint, bigint)"
        )
    elif bind.dialect.name == "sqlite":
        op.execute(f"DROP TRIGGER IF EXISTS {SQLITE_INSERT_TRIGGER}")
        op.execute(f"DROP TRIGGER IF EXISTS {SQLITE_UPDATE_TRIGGER}")
