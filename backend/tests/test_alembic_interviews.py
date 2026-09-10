"""The additive career migration works over an existing user table."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_interview_migration_preserves_users_and_can_be_repeated(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    path = Path(__file__).parents[1] / 'alembic/versions/20260910_0017_career_interviews.py'
    spec = importlib.util.spec_from_file_location('interview_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE users (id INTEGER PRIMARY KEY)'))
        connection.execute(sa.text('INSERT INTO users VALUES (1)'))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade(); migration.upgrade()
        assert {'career_profiles', 'interview_sessions'} <= set(sa.inspect(connection).get_table_names())
        assert connection.execute(sa.text('SELECT id FROM users')).scalar() == 1
        migration.downgrade()
        assert 'career_profiles' not in sa.inspect(connection).get_table_names()
        assert connection.execute(sa.text('SELECT id FROM users')).scalar() == 1
    engine.dispose()
