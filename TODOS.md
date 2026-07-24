# TODOs

## Real-Postgres integration test for the Alembic migration
**What:** A CI integration test that runs the app's actual query paths (not just
schema DDL) against a real Postgres instance — docker-compose Postgres in CI, or a
disposable Neon branch.

**Why:** M0's Alembic regression test only proves `alembic upgrade head` succeeds
against a pre-Alembic-shaped DB (schema creation). It says nothing about whether the
app's actual queries behave the same on Postgres as they did on SQLite — Postgres and
SQLite differ on case-sensitivity, JSON column handling, and type coercion. A query
that worked fine against SQLite in dev could silently misbehave against Postgres in
prod with zero test coverage catching it.

**Pros:** Closes a real gap the DDL-only test can't. Catches an entire class of
migration bug (query-level, not schema-level) before it reaches production.

**Cons:** Requires either a docker-compose Postgres service in CI or provisioning a
disposable Neon test branch per run — more infrastructure setup than a solo founder
should take on inside M0, which is already scoped to DB durability + observability.

**Context:** Surfaced during the M0 (/plan-eng-review) outside-voice pass on
2026-07-20. Existing tests (`backend/tests/*.py`) properly mock DB access, so none of
them exercise real Postgres today. Start here: pick docker-compose (simpler, free,
runs anywhere) over a Neon test branch (requires Neon API access) unless CI is already
planned to run against Neon directly.

**Depends on / blocked by:** M0's Alembic baseline must land first (nothing to test
against otherwise). No hard blocker beyond that.
