"""Alembic environment — uses the app's SQLAlchemy engine and metadata."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.models.database import DATABASE_URL
from app.models.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Prefer the runtime DATABASE_URL (env / config) over the alembic.ini placeholder.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Metadata is SQLAlchemy's collection of table definitions. Alembic can compare
# it with an existing database when generating a migration. Existing revisions
# still define the actual sequence of upgrade/downgrade operations.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Configure SQL-script generation without opening a database connection.

    Individual revisions that inspect live tables may still require online
    mode; this configuration alone cannot make such revisions work offline.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply the requested revisions through a real database connection.

    Alembic tracks completed revisions so later upgrades continue from the
    stored revision. Migration errors propagate to the deployment command.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
