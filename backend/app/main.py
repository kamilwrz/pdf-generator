"""
FastAPI application entry point for CV Studio.

Responsibilities:
- Configure process logging so service loggers reach stdout (Render aggregation).
- Keep liveness available while readiness protects database-backed routes.
- Mount static asset directories, API routers, and optional SPA fallback from frontend/dist.
- Translate AI assistant failures into a stable Polish 500 response for the UI.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.api.routes import auth, pdf, images, ai, events, billing, templates
from app.api.routes import ai_assistant
from app.core.config import (
    IMAGES_UPLOAD_DIR,
    PDF_UPLOAD_DIR,
    TEMPLATE_ASSETS_DIR,
    assert_private_storage_configured,
    assert_trusted_proxy_configured,
    origins,
)
from app.core.security import assert_secret_key_configured
from app.schemas.pdf_schema import MAX_PDF_REQUEST_BYTES
from app.services.ai_assistant_service import AIServiceError
from app.services.deployment_bootstrap import run_predeploy
from app.services.readiness import is_database_route, readiness_gate

# Without this, logger.info()/logger.error() calls anywhere in the app
# (ai_assistant, events, etc.) are silently dropped — the root logger has no
# handler by default, so nothing reaches stdout/Render's log aggregation.
# force=True because something importing this module first (pytest's own
# logging plugin, uvicorn, etc.) may have already attached a handler at a
# level above INFO — basicConfig() is a no-op in that case unless forced.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", force=True)

logger = logging.getLogger("ai_assistant")


def _recover_render_database_bootstrap() -> None:
    """Repair a legacy Render service that skipped the pre-deploy command.

    Blueprint-managed services normally finish migrations and deterministic
    catalog seeding before a worker starts. Older dashboard-managed services
    do not automatically inherit ``render.yaml`` settings, so a code deploy can
    otherwise leave every database-backed route behind the readiness gate.

    The initial read-only probe keeps the normal path mutation-free. Bootstrap
    runs only when the deployed schema or seed catalog is stale, and failures
    remain visible in logs while liveness stays available for diagnosis.
    """

    if readiness_gate.probe().ready:
        return

    logger.warning(
        "Render readiness failed at worker start; running idempotent deployment bootstrap."
    )
    try:
        run_predeploy()
    except Exception:
        logger.exception(
            "Render startup bootstrap failed; database-backed routes remain unavailable."
        )
    finally:
        readiness_gate.probe()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate configuration and recover skipped Render pre-deploy work.

    Blueprint deployments migrate and seed through the controlled pre-deploy
    command. A legacy Render service gets the same idempotent bootstrap in a
    background thread only when its initial readiness probe fails.
    """
    # Reject missing/placeholder JWT secrets before serving traffic. Unit tests
    # that start TestClient must set SECRET_KEY or ALLOW_INSECURE_SECRET=true.
    assert_secret_key_configured()
    assert_private_storage_configured()
    assert_trusted_proxy_configured()
    readiness_gate.reset()

    # Render dashboard-managed services do not automatically adopt commands
    # added later to render.yaml. Recover those legacy services without making
    # local/test startup mutate a developer database. The work stays in a
    # thread so /health can answer while a cold database is being migrated.
    bootstrap_task = None
    if os.getenv("RENDER", "").strip().lower() in {"1", "true", "yes"}:
        bootstrap_task = asyncio.create_task(
            asyncio.to_thread(_recover_render_database_bootstrap)
        )
    try:
        yield
    finally:
        if bootstrap_task is not None:
            await bootstrap_task


app = FastAPI(lifespan=lifespan)

# CORS must wrap the app early so cross-origin login/health always get ACAO
# headers, including error responses from auth and AI routes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # So the editor can read the attachment filename from download_pdf responses.
    expose_headers=["Content-Disposition"],
)


def _ai_request_too_large_response() -> JSONResponse:
    """Return the stable public error shared by transport and schema limits."""

    return JSONResponse(
        status_code=413,
        content={
            "detail": {
                "code": "ai_request_too_large",
                "message": "Żądanie AI przekracza limit 1 MiB.",
            }
        },
    )


@app.middleware("http")
async def enforce_ai_assistant_transport_limit(request: Request, call_next):
    """Reject oversized assistant bodies before FastAPI parses nested JSON.

    Field validators bound the normalized payload, but a chunked request can
    contain arbitrarily large insignificant whitespace. Reading at most the
    route limit plus one byte closes that transport-level gap and prevents the
    JSON parser from receiving an oversized body.
    """

    if request.method == "POST" and request.url.path == "/ai/assistant":
        limit = ai_assistant.MAX_ASSISTANT_REQUEST_BYTES
        declared_length = request.headers.get("content-length")
        if declared_length and declared_length.isdigit() and int(declared_length) > limit:
            return _ai_request_too_large_response()

        buffered = bytearray()
        async for chunk in request.stream():
            buffered.extend(chunk)
            if len(buffered) > limit:
                return _ai_request_too_large_response()
        # Starlette's middleware request wrapper replays this cached body to
        # the downstream JSON parser; no SQLAlchemy session crosses threads.
        request._body = bytes(buffered)

    return await call_next(request)


def _pdf_request_too_large_response() -> JSONResponse:
    """Return the stable public error for oversized PDF route bodies."""

    return JSONResponse(
        status_code=413,
        content={
            "detail": {
                "code": "pdf_request_too_large",
                "message": "Żądanie PDF przekracza limit 4 MiB.",
            }
        },
    )


@app.middleware("http")
async def enforce_pdf_transport_limit(request: Request, call_next):
    """Bound every PDF request body before JSON decoding or route work.

    Most PDF bodies contain a full canvas, while the remaining by-id routes
    carry only a scalar. Applying one limit to all body-bearing ``/pdf/*``
    methods prevents an attacker from shifting parser exhaustion to a cheaper
    endpoint. ``Content-Length`` is only an early rejection; streamed/chunked
    bodies are counted independently and therefore cannot bypass the limit.
    """

    if (
        request.url.path.startswith("/pdf/")
        and request.method in {"POST", "PUT", "PATCH", "DELETE"}
    ):
        declared_length = request.headers.get("content-length")
        if (
            declared_length
            and declared_length.isdigit()
            and int(declared_length) > MAX_PDF_REQUEST_BYTES
        ):
            return _pdf_request_too_large_response()

        buffered = bytearray()
        async for chunk in request.stream():
            buffered.extend(chunk)
            if len(buffered) > MAX_PDF_REQUEST_BYTES:
                return _pdf_request_too_large_response()
        request._body = bytes(buffered)

    return await call_next(request)


@app.middleware("http")
async def reject_database_traffic_until_ready(request: Request, call_next):
    """Return a stable 503 before a DB-backed route reaches its handler.

    The probe runs in Starlette's worker pool because SQLAlchemy and Alembic are
    synchronous. Liveness, readiness, documentation, template assets, and the
    optional SPA remain available while the database is unavailable.
    """

    if is_database_route(request.url.path):
        # Render polls `/ready` continuously. Reuse its successful result on
        # normal traffic; when the latest probe is false, let the next request
        # retry once so recovery does not have to wait for the platform poll.
        result = readiness_gate.last_result
        if not result.ready:
            result = await run_in_threadpool(readiness_gate.probe)
        if not result.ready:
            return JSONResponse(
                status_code=503,
                headers={"Retry-After": "5"},
                content={
                    "detail": {
                        "code": "service_not_ready",
                        "message": "Usługa chwilowo nie jest gotowa. Spróbuj ponownie.",
                    }
                },
            )
    return await call_next(request)


@app.get("/health")
def health():
    """Cheap liveness probe used by the frontend to wake a sleeping Render dyno."""
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Report readiness only after DB, migrations, and seed checks pass."""

    result = readiness_gate.probe()
    if not result.ready:
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "5"},
            content={
                "detail": {
                    "code": "service_not_ready",
                    "message": "Usługa chwilowo nie jest gotowa. Spróbuj ponownie.",
                }
            },
        )
    return {"status": "ready"}


@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    """Map OpenAI/provider failures to a safe Polish message.

    Internal details stay in server logs. Prefer ``exc.user_message`` when the
    failure is actionable for the user (e.g. layout reasoning budget exhausted);
    otherwise keep the generic temporarily-unavailable copy.
    """
    logger.error(
        "AI assistant service error: action=%s elements_count=%s error_type=%s outcome=%s",
        exc.action,
        exc.elements_count,
        type(exc.original).__name__ if exc.original else "unknown",
        getattr(exc, "reservation_outcome", "unknown"),
    )
    detail = (
        exc.user_message
        if isinstance(getattr(exc, "user_message", None), str) and exc.user_message.strip()
        else "Asystent AI jest chwilowo niedostępny, spróbuj ponownie."
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "ai_provider_unavailable",
                "message": detail,
            }
        },
    )

# Ensure upload directories exist (e.g. on fresh deploy / Render ephemeral disk).
IMAGES_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATE_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# Optional same-origin SPA hosting when frontend/dist is present next to backend.
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# User uploads and generated PDFs are private. Their bytes are served only
# through ownership-checked API routes (`/images/{id}/content` and
# `/pdf/download_pdf`). Built-in template assets are application-owned and stay
# public because the editor canvas and ReportLab both need stable asset URLs.
app.mount("/template-assets", StaticFiles(directory=str(TEMPLATE_ASSETS_DIR)), name="template_assets")


@app.api_route(
    "/static/generated",
    methods=["GET", "HEAD"],
    include_in_schema=False,
)
@app.api_route(
    "/static/generated/{requested_path:path}",
    methods=["GET", "HEAD"],
    include_in_schema=False,
)
async def block_generated_pdf_static_access(requested_path: str = ""):
    """Keep retired direct PDF URLs private instead of falling into the SPA.

    The explicit tombstone matters when `frontend/dist` is present: without it,
    the SPA catch-all would return `index.html` with HTTP 200 for an old
    `/static/generated/...` URL. Stored PDF bytes are available exclusively via
    the authenticated, ownership-checked, export-metered download route.
    """
    raise HTTPException(status_code=404, detail="Nie znaleziono")

app.include_router(auth.router)
app.include_router(pdf.router)
app.include_router(images.router)
app.include_router(ai.router)
app.include_router(ai_assistant.router)
app.include_router(events.router)
app.include_router(billing.router)
app.include_router(templates.router)

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve index.html for client-side routes when the API is co-hosting the SPA.

        API routers are registered first, so this catch-all only receives paths
        that did not match /auth, /pdf, /ai, static mounts, etc.
        """
        if full_path == "health":
            return {"status": "ok"}
        index_path = DIST_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        raise HTTPException(status_code=404, detail="Nie znaleziono")
