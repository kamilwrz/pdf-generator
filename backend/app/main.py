"""
FastAPI application entry point for CV Studio.

Responsibilities:
- Configure process logging so service loggers reach stdout (Render aggregation).
- Start accepting HTTP before DB bootstrap finishes (cold-start friendly /health).
- Mount static asset directories, API routers, and optional SPA fallback from frontend/dist.
- Translate AI assistant failures into a stable Polish 500 response for the UI.
"""

import logging
from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routes import auth, pdf, images, ai, events, billing
from app.api.routes import ai_assistant
from app.core.config import origins, IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR, TEMPLATE_ASSETS_DIR
from app.core.security import assert_secret_key_configured
from app.models.database import SessionLocal
from app.models.models import init_db
from app.services.ai_assistant_service import AIServiceError
from app.services.legacy_document_cleanup import run_legacy_document_cleanup

from pathlib import Path
from fastapi.responses import FileResponse

# Without this, logger.info()/logger.error() calls anywhere in the app
# (ai_assistant, events, etc.) are silently dropped — the root logger has no
# handler by default, so nothing reaches stdout/Render's log aggregation.
# force=True because something importing this module first (pytest's own
# logging plugin, uvicorn, etc.) may have already attached a handler at a
# level above INFO — basicConfig() is a no-op in that case unless forced.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", force=True)

logger = logging.getLogger("ai_assistant")


def _run_startup_work() -> None:
    """Create/migrate tables and remove retired document types after listen starts.

    Side effects: may write schema changes and delete legacy PDF rows.
    Failures are logged but do not crash the process — the API stays up so
    Render health checks and the frontend wake probe can succeed even when
    Postgres is still reconnecting.
    """
    try:
        init_db()
        db = SessionLocal()
        try:
            deleted = run_legacy_document_cleanup(db)
            if deleted:
                logger.warning("Removed %s retired deck/article documents.", deleted)
        finally:
            db.close()
    except Exception:
        logger.exception("Startup database init failed; API is up but DB may be unavailable.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run DB bootstrap in a background thread so /health is not blocked.

    Render free dynos sleep; the frontend wakes them with /health. If lifespan
    waited on Postgres retries, that probe would hang and login would appear
    broken even though the dyno process had already started.
    """
    # Reject missing/placeholder JWT secrets before serving traffic. Unit tests
    # that start TestClient must set SECRET_KEY or ALLOW_INSECURE_SECRET=true.
    assert_secret_key_configured()
    init_task = asyncio.create_task(asyncio.to_thread(_run_startup_work))
    try:
        yield
    finally:
        if not init_task.done():
            init_task.cancel()
            try:
                await init_task
            except asyncio.CancelledError:
                pass


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


@app.get("/health")
def health():
    """Cheap liveness probe used by the frontend to wake a sleeping Render dyno."""
    return {"status": "ok"}


@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    """Map OpenAI/provider failures to a safe Polish message.

    Internal details stay in server logs. Prefer ``exc.user_message`` when the
    failure is actionable for the user (e.g. layout reasoning budget exhausted);
    otherwise keep the generic temporarily-unavailable copy.
    """
    logger.error(
        "AI assistant service error: action=%s elements_count=%s error_type=%s detail=%s",
        exc.action, exc.elements_count,
        type(exc.original).__name__ if exc.original else "unknown",
        str(exc),
    )
    detail = (
        exc.user_message
        if isinstance(getattr(exc, "user_message", None), str) and exc.user_message.strip()
        else "Asystent AI jest chwilowo niedostępny, spróbuj ponownie."
    )
    return JSONResponse(
        status_code=500,
        content={"detail": detail},
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
