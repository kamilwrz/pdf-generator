# Security, Reliability, CI, and Operations Remediation Plan

> **Status:** Implemented locally; external release evidence is still pending
>
> **Created:** 2026-09-01
>
> **Current execution slice:** Final verification, documentation, commit, and push.
>
> **Implementation rule:** Complete the phases in order unless an active security incident requires a Phase 1 containment item to move ahead. Each production-facing phase is a separate, reversible release.

## Goal

Move CV Studio from a functional but incompletely gated release process to a production-hardened system with:

- complete and deterministic test discovery;
- mandatory test, lint, build, and dependency-integrity checks;
- containment of path traversal and unsafe operational fallbacks;
- explicit database, storage, and startup-readiness invariants;
- reproducible Render deployments with measurable rollback criteria;
- runtime React regression coverage and graceful error recovery;
- smaller frontend state boundaries and a lower initial bundle cost;
- accurate, synchronized English and Polish developer documentation.

## Baseline Evidence

The 2026-09-01 audit established this starting point:

- Backend: 556 tests and 41 subtests passed.
- Frontend runner: 787 tests passed, but its hard-coded roots omitted 11 tracked test files containing 53 additional passing tests.
- Frontend lint passed.
- Production Vite build passed, with a roughly 1,310.67 kB minified / 367.72 kB gzip JavaScript entry chunk and a Vite large-chunk warning.
- `pip check` passed.
- `/health` could report success while database startup work had failed or was still running.
- Local storage paths incorporated user-controlled username and document-title values.
- Local frontend builds silently fell back to a production API URL when `VITE_API_URL` was absent.
- Database and object/file storage changes did not share a failure-safe transaction protocol.
- The router and editor had no production Error Boundary.
- Deployment configuration was not represented by a committed Render manifest.

This baseline is evidence, not a permanent count gate. CI must compare the discovered test inventory with the current tracked source tree so new test files are included automatically.

## Global Constraints

- [ ] Do not combine a destructive database migration with the application change that first depends on it.
- [ ] Use expand–migrate–contract migrations and preserve application compatibility with the previous release for at least two successful production releases.
- [ ] Never roll back to a build with a known path-traversal or secret-authentication vulnerability; use roll-forward containment instead.
- [ ] Keep secrets out of Git, build logs, test output, and Render manifests.
- [ ] Add a regression test for every corrected P1/P2 failure mode.
- [ ] Update both complete README language versions in every later implementation phase that changes runtime behavior, architecture, configuration, deployment, or public workflow.
- [ ] Keep frontend application chrome compliant with `DESIGN.md`; PDF document-template rendering remains isolated.
- [ ] Treat generated PDF/object keys as server-owned identifiers, never as user-facing titles.
- [ ] Require all merge and deployment gates below; bypasses need an incident record, named owner, and expiry.

## Gate Model

### Pull-request gate

Every merge to `main` must eventually require all of these checks:

- [ ] Backend tests.
- [ ] Frontend recursive unit tests.
- [ ] Frontend lint with zero warnings.
- [ ] Frontend production build.
- [ ] Dependency consistency and vulnerability checks.
- [ ] Secret/static security scan.
- [x] Local documentation-link and EN/PL structure checks.
- [ ] Critical smoke E2E when affected flows change.
- [ ] No open P0/P1 finding introduced or left unresolved by the change.

### Staging deployment gate

- [ ] Deploy the exact commit/artifact that passed CI.
- [ ] Run migrations as a controlled pre-deploy step.
- [ ] Confirm `/health` liveness and `/ready` readiness semantics.
- [ ] Run critical smoke tests against staging.
- [ ] Exercise one successful PDF render and one forced storage/database failure path.
- [ ] Record the previous deploy identifier and database-backup reference.

### Production canary gate

- [ ] Observe for at least 30 minutes after deployment.
- [ ] Readiness remains 100% successful after warm-up.
- [ ] All critical smoke flows pass.
- [ ] No new 5xx signature appears.
- [ ] Error rate does not rise by more than 0.5 percentage points from baseline.
- [ ] P95 latency of a critical endpoint does not rise by more than 25% from baseline.
- [ ] No DB–storage consistency alert fires.

## Phase 0 — Authoritative CI Foundation

**Status:** Implemented and verified locally; awaiting consecutive remote CI evidence

**Purpose:** Make subsequent remediation measurable and prevent the existing false-green frontend test result.

### Work items

- [x] Create this versioned remediation plan.
- [x] Replace the hard-coded frontend test roots with recursive discovery under `frontend/src`.
- [x] Sort the test inventory deterministically.
- [x] Reject an empty or duplicate discovery result.
- [x] Add `--list` mode so CI and developers can inspect the exact inventory without running tests.
- [x] Pass non-list command-line arguments through to Node's test runner.
- [x] Add frontend dependency audit, discovery listing, lint, and build to CI.
- [x] Add backend `pip check` to CI without adding a package.
- [x] Restrict workflow token permissions to read-only repository contents.
- [x] Run discovery listing and compare it with an independent repository inventory.
- [x] Run the complete frontend unit suite.
- [x] Run frontend lint with zero warnings.
- [x] Run a production frontend build.
- [x] Run locally available dependency checks and record the npm/registry limitation separately.

### Acceptance criteria

- Every tracked `frontend/src/**/*.test.js` file is listed exactly once.
- Adding a test anywhere below `frontend/src` requires no runner configuration change.
- `npm test -- --list` exits zero and prints the discovered count.
- `npm test` includes the 11 files omitted by the previous runner.
- `npm run lint -- --max-warnings 0` exits zero.
- `npm run build` exits zero.
- CI runs `python -m pip check` and `npm audit --omit=dev --audit-level=high` without adding dependencies.
- Target CI P95 duration is at most 10 minutes with backend and frontend jobs running in parallel.

### Rollback

- Keep the recursive discovery change even if an unrelated previously hidden test fails; fix or explicitly quarantine that test with an owner and expiry.
- New CI checks may report without blocking for at most one week while existing findings are triaged. Recursive discovery must become required immediately after the current suite is green.
- Do not restore the hard-coded directory list.

### Phase 0 verification record — 2026-09-01

- `--list`: 132 Node test files; independent recursive inventory: 132 files; delta: 0. One separate `*.runtime.test.jsx` file is owned exclusively by Vitest.
- Frontend Node suite: 881 passed, 0 failed. Vitest runtime suite: 5 passed, 0 failed.
- ESLint: exit code 0 with `--max-warnings 0` after adding the final hook dependency.
- Vite production build: 723 modules, successful. Enforced gzip measurements are 114.84 KiB landing, 348.20 KiB synchronous editor, and 223.11 KiB largest feature chunk.
- Backend: 700 tests and 81 subtests passed; PostgreSQL-only contracts skip locally when `POSTGRES_TEST_DATABASE_URL` is absent and remain required by the dedicated PostgreSQL 16 CI job.
- Dependency integrity: `pip check` reports no broken requirements; strict `pip-audit` and production-only `npm audit` both report zero known vulnerabilities.
- Playwright smoke: 8 passed across desktop Chromium and Pixel 5 profiles, including the real-editor skills-category regression, persistence/download/dirty-guard flow, idempotent create, and the real Error Boundary.

## Phase 1 — Immediate Security Containment

**Status:** Implemented and covered by regression tests

**Purpose:** Close the directly exploitable or operationally unsafe P1 paths before broader refactoring.

### Work items

- [x] Add strict validation for usernames and document display titles.
- [x] Replace title-derived local/S3 object paths with opaque server-generated storage keys.
- [x] Resolve every local path and verify it remains below the configured storage root.
- [x] Cover POSIX traversal, Windows traversal, absolute paths, encoded traversal, separator variants, and rename/delete paths.
- [x] Make a missing `VITE_API_URL` fail fast in production builds and use a local proxy in development.
- [x] Separate production and local CORS defaults; localhost requires development mode.
- [x] Require `ADMIN_RESET_SECRET`; remove fallback to `SECRET_KEY`.
- [x] Accept only an exact numeric user ID for administrative reset.
- [x] Add an audit event for every administrative reset attempt and result without logging the secret.

### Acceptance criteria

- Property/table-driven traversal tests prove all resolved file paths stay below the storage root.
- User-controlled labels never become filesystem or object-store locators.
- A fresh local checkout cannot contact production without an explicit opt-in value.
- A production build without its API URL fails during build/startup.
- Administrative reset fails closed when its dedicated secret is absent or incorrect.
- No substring user match remains.

### Rollout and rollback

- Configure explicit API/CORS/admin-secret values in staging and production before removing fallbacks.
- Introduce storage-key versioning with dual-read of legacy keys and write-only use of the new format.
- If new key resolution fails, disable the affected write endpoint and roll forward; do not re-enable unsafe path construction.

## Phase 2 — Startup Readiness and Event-Loop Isolation

**Status:** Implemented and covered by readiness and request-limit tests

**Purpose:** Ensure a healthy instance is actually ready and prevent synchronous work from starving unrelated requests.

### Work items

- [x] Keep `/health` as a dependency-free process liveness and wake endpoint.
- [x] Add `/ready` backed by database, migration-head, and catalog-seed checks.
- [x] Keep readiness false until database connectivity, migrations, and required bootstrap work succeed.
- [x] Return 503 and a non-sensitive machine-readable status when readiness fails.
- [x] Fail the controlled pre-deploy bootstrap after bounded retries instead of swallowing initialization errors.
- [x] Move synchronous SQLAlchemy, ReportLab, S3, and filesystem endpoints to normal `def` handlers executed in FastAPI's thread pool.
- [x] Add readiness, AI concurrency, storage-failure, and request-size regression tests.

### Acceptance criteria

- Tests observe `/ready` returning 503 during failed initialization and 200 only after successful initialization.
- `/health` remains available while downstream readiness is false.
- With three concurrent PDF exports, health P95 is at most 500 ms and no health request times out on the agreed staging instance size.
- A failed initialization cannot produce a successful Render readiness check.

### Rollback

- Deploy the new endpoints before changing the platform health-check target.
- Keep `/health` as a compatibility alias for one release, but do not use it as the deployment gate.
- Restore the previous health-check target only if it remains conservative; never target an unconditional-success endpoint.

## Phase 3 — Database and Storage Consistency

**Status:** Implemented with storage V2, immutable publication, compensation, and cleanup jobs

**Purpose:** Make create, update, and delete operations recoverable across database, local filesystem, renderer, and S3 failures.

### Work items

- [x] Represent cross-store lifecycle through immutable publication, committed storage pointers, revision compare-and-swap, and durable cleanup-job state instead of adding a redundant document status column.
- [x] Render into memory or a temporary file before publishing a final local path.
- [x] Use atomic `os.replace` for local publication.
- [x] Use versioned S3 keys so a failed DB commit cannot overwrite the currently referenced object.
- [x] Add compensating cleanup for failed create/update operations.
- [x] Add a retryable outbox/cleanup record for delete failures.
- [x] Add bounded cleanup attempts, retry timestamps, resource type, terminal `dead_letter` state, and sanitized failure metadata.
- [x] Add fault-injection tests for renderer, upload, rename, delete, and DB commit failures.

### Acceptance criteria

- No ready/visible DB document points to a missing object after any injected failure.
- A failed update leaves the previously committed document readable.
- Every orphan has a durable cleanup task and observable retry state.
- Delete is idempotent and eventually removes both metadata and storage.
- Cleanup retries are bounded, back off, and expose a terminal alert state.

### Rollback

- Use expand–migrate–contract schema changes.
- Preserve legacy key reads and lifecycle-null compatibility for two releases.
- Back up the production database before backfill.
- Roll back application code only while the previous release can read the expanded schema.

## Phase 4 — Declarative Render Deployment

**Status:** Implemented; live staging validation is an external release gate

`render.yaml` now declares the database, backend, static frontend, explicit environment contract, controlled pre-deploy bootstrap, and `/ready` platform probe. Secret values remain outside Git. The exact production plan/region and a live Blueprint validation must be confirmed in Render before promotion.

### Prerequisites

- [x] Phase 2 `/ready` behavior is implemented and tested.
- [ ] Export the authoritative current Render service/database settings for review.
- [ ] Decide service names, region, plans, auto-deploy policy, and preview-environment policy.
- [ ] Classify every environment variable as required secret, required non-secret, optional, or generated reference.

### Work items

- [x] Add a committed `render.yaml`/Render Blueprint.
- [x] Encode backend and frontend build/start/publish commands exactly once.
- [x] Target `/ready`, not the liveness endpoint.
- [x] Run Alembic as a controlled pre-deploy operation.
- [x] Reference secrets without storing their values in Git.
- [ ] Add staging-to-production promotion of the identical commit/artifact.
- [ ] Document previous-deploy restoration and database recovery.

### Acceptance criteria

- Blueprint validation succeeds against the current Render schema.
- A clean staging environment can be created from repository plus secret values.
- Platform configuration has no unexplained drift from the manifest.
- Migration failure blocks promotion.
- The previous successful application release can be restored in at most 10 minutes.

## Phase 5 — Frontend Runtime Recovery and E2E Coverage

**Status:** Implemented locally; remote flake-rate evidence remains pending

**Purpose:** Catch state/effect regressions that source-string and pure-function tests cannot exercise.

### Work items

- [x] Add route-level production `errorElement`/Error Boundary.
- [x] Add an editor-subtree Error Boundary with reload/recovery guidance.
- [x] Prevent sensitive state or stack traces from appearing in user-visible fallback copy.
- [x] Add a DOM-capable component test harness.
- [x] Add Playwright smoke flows for login, document open, skill-category deletion, save/download, and forced error recovery.
- [x] Add the reported React maximum-update-depth regression scenario.
- [ ] Measure and quarantine flakes only with an owner and expiry.

### Acceptance criteria

- A forced render/effect error shows the designed recovery UI, never React Router's developer error screen.
- All five critical flows pass on desktop and one representative mobile viewport.
- Flake rate is below 2% over 20 consecutive CI runs.
- The skill-category deletion regression is reproduced by a failing test before the fix and passes afterward.

### Rollback

- Ship Error Boundaries independently before the test-harness expansion.
- Run E2E nightly until stable, then make critical smoke required.
- Do not delete lower-level unit regressions when adding E2E coverage.

## Phase 6 — Frontend Architecture and Performance

**Status:** Focused context migration, legacy-facade removal, lazy feature boundaries, and enforced bundle budgets are complete; further module splitting and live performance telemetry remain follow-up work

**Purpose:** Reduce broad rerenders and change risk without coupling the refactor to security or reliability releases.

### Work items

- [x] Divide document data, canvas interaction, editor UI, session, and export actions into focused providers/hooks.
- [x] Migrate all direct production `PdfContext` consumers through domain interfaces.
- [x] Remove the compatibility facade after its final consumer migrates.
- [ ] Split `PdfCanvas`, `useA4Elements`, and other large orchestration modules by cohesive responsibility.
- [x] Lazy-load routes and separate editor/AI feature chunks from the landing page.
- [x] Add bundle analysis and enforce the agreed gzip budgets.
- [ ] Add targeted render-count and interaction-performance measurements for the remaining context migration.

### Acceptance criteria

- No production component directly consumes the legacy broad context.
- Render-count and P95 interaction benchmarks do not regress during each migration slice.
- Initial JavaScript falls from the measured ~368 kB gzip baseline to at most 250 kB gzip.
- No generated JavaScript chunk exceeds 500 kB minified without a reviewed exception.
- Architectural dependency tests prevent feature modules from bypassing the new boundaries.

### Rollback

- Migrate one vertical slice per PR behind a compatibility adapter.
- Keep state shape serialization compatible until all persisted documents have been verified.
- Lazy-loading changes remain independently revertible from state-management changes.

## Phase 7 — Documentation, Dependency Hygiene, and Developer Experience

**Status:** Security/dependency/documentation items from the remediation scope are implemented; unrelated documentation expansion remains future work

**Purpose:** Make setup and maintenance reproducible and remove known documentation drift.

### Work items

- [x] Repair broken root links to bug and TODO documentation.
- [x] Replace the generic frontend README with project-specific guidance or a clear link into the canonical bilingual guide.
- [x] Align Node engine documentation with the Vite lockfile requirement and add a machine-readable runtime pin.
- [x] Pin/document the supported Python version.
- [ ] Reconcile stale claims in `docs/CODE_QUALITY_REVIEW.md`.
- [ ] Add `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- [x] Move type-only Python dependencies out of production requirements.
- [x] Remove unused authentication/hash dependencies after confirming no call site remains.
- [x] Add scheduled security scanning.
- [x] Add local-link validation and required EN/PL section-parity checks.
- [ ] Exercise the documented setup in a clean environment.

### Acceptance criteria

- All repository-local documentation links resolve.
- Required English and Polish sections are both present and substantively synchronized.
- Runtime versions in documentation, CI, and machine-readable manifests agree.
- Setup from a clean checkout reaches frontend UI and backend readiness in at most 10 minutes, excluding an explicitly measured cold package-download allowance.
- No type-only package is installed in the production backend environment.
- Security update exceptions have an owner and expiry.

## Traceability Matrix

| Audit finding | Remediation phase | Primary gate |
|---|---:|---|
| Frontend tests omitted by hard-coded roots | 0 | Recursive inventory equals tracked tests |
| Lint/build absent from CI | 0 | Required frontend quality job |
| No basic dependency gate | 0 and 7 | `pip check`, production audit, later full scanner automation |
| Path traversal through username/title | 1 | Adversarial path tests and storage-root invariant |
| Local frontend silently targets production | 1 | Environment matrix and fail-fast build test |
| Admin reset secret fallback/substring lookup | 1 | Authorization and exact-match tests |
| False-positive health endpoint | 2 | `/ready` failure-state tests |
| Sync DB/S3/PDF work blocks event loop | 2 | Concurrent export/health latency test |
| DB and storage commit inconsistencies | 3 | Fault-injection invariant suite |
| No committed Render deployment definition | 4 | Blueprint validation and staging recreation |
| No production Error Boundary | 5 | Forced-error component/E2E test |
| No runtime component/E2E protection | 5 | Five critical smoke flows |
| Broad context and large orchestration modules | 6 | Consumer migration and render benchmarks |
| Eager 368 kB gzip entry bundle | 6 | Bundle budget |
| Broken/stale bilingual documentation | 7 | Docs/link/parity checks |
| Manual dependency hygiene | 7 | Scheduled updates and vulnerability policy |

## Local Implementation Record — 2026-09-01

The repository implementation now includes the security and reliability contracts from the execution request:

- recursive Node test discovery plus a separate Vitest/React Testing Library runtime suite;
- required backend, frontend, lint, production build, bundle-budget, Playwright, dependency-audit, secret-scan, and CodeQL CI jobs;
- additive storage V2, AI reservation, authentication-hardening, and document-integrity migrations;
- immutable server-owned PDF storage keys, safe legacy dual-read, compensation, and durable cleanup jobs;
- owner-scoped image resolution and a controlled source allowlist across PDF and AI paths;
- atomic, idempotent AI credit reservations and bounded assistant requests;
- header-only JWT verification, explicit production configuration, dedicated administrative secret, Argon2id migration, canonical identities, and database-backed throttling;
- optimistic document revisions, create idempotency, document-lifecycle epochs, stale-result rejection, centralized snapshot commits, and a persisted-snapshot dirty guard;
- route/editor recovery boundaries, accessible keyboard interactions, and Playwright coverage for the skills-category regression;
- dependency-free `/health`, conservative `/ready`, controlled pre-deploy bootstrap, and a committed Render Blueprint;
- cursor-based import history without list-level CV payloads, explicit image DTOs, and sanitized provider errors;
- lazy frontend feature loading and enforced gzip budgets of 200 KiB for landing, 500 KiB for the synchronous editor, and 300 KiB for any feature chunk;
- synchronized English and Polish README sections plus classified entries in `docs/BUGZ.MD`.

The following Definition-of-Done evidence cannot be produced by a local repository change and remains an explicit release responsibility:

- configure and rotate real production secrets, including `SECRET_KEY` and `ADMIN_RESET_SECRET`;
- validate the Blueprint and additive migrations against a production-like PostgreSQL backup;
- deploy the exact CI-tested commit to staging and run the smoke/failure matrix there;
- run a 30-minute production canary against a supplied deployment URL and recorded metric baseline;
- observe 20 consecutive green required CI runs with the target flake rate;
- perform the independent repeat audit and record a score of at least 8/10.

## Release and Rollback Runbook

For every production-facing phase:

1. [ ] Record baseline error rate, P95 latency, readiness, queue/orphan counts, and current deploy ID.
2. [ ] Create and verify a restorable database backup when schema/data changes are involved.
3. [ ] Deploy the exact CI-tested commit to staging.
4. [ ] Run migrations and verify both the new and previous application versions can read the expanded schema.
5. [ ] Run readiness and critical smoke checks.
6. [ ] Promote the identical commit/artifact to production.
7. [ ] Observe the 30-minute canary window.
8. [ ] Roll back the application if a threshold is exceeded and the previous version is schema-compatible.
9. [ ] Roll forward instead when rollback would restore a security vulnerability or cannot safely reverse data/storage changes.
10. [ ] Record the outcome, metrics, residual cleanup work, and follow-up owner.

## Program Definition of Done

- [ ] Zero open P0/P1 findings.
- [ ] Every P2 finding has a passing regression or invariant test.
- [ ] Every tracked frontend test is discovered automatically and exactly once.
- [ ] Required CI checks are stable for 20 consecutive runs.
- [ ] No unaccepted Critical/High vulnerability or exposed secret remains.
- [ ] Readiness and rollback have been demonstrated on staging.
- [ ] DB–storage fault injection proves recoverability.
- [ ] Critical frontend E2E flows pass with less than 2% flake rate.
- [ ] Initial JavaScript bundle meets the agreed budget.
- [ ] English and Polish documentation and clean-checkout setup are verified.
- [ ] A repeat audit scores at least 8/10 overall and at least 8/10 for CI/CD.
