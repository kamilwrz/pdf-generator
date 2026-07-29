import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routes import auth, pdf, images, ai, events, billing
from app.api.routes import ai_assistant
from app.core.config import origins, IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR, TEMPLATE_ASSETS_DIR
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

app = FastAPI()


@app.get("/health")
def health():
    """Cheap liveness probe used by the frontend to wake a sleeping Render dyno."""
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    """Connect to DB after the process is up; retry flaky Render SSL handshakes."""
    init_db()
    db = SessionLocal()
    try:
        deleted = run_legacy_document_cleanup(db)
        if deleted:
            logger.warning("Removed %s retired deck/article documents.", deleted)
    finally:
        db.close()


@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    logger.error(
        "AI assistant service error: action=%s elements_count=%s error_type=%s detail=%s",
        exc.action, exc.elements_count,
        type(exc.original).__name__ if exc.original else "unknown",
        str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Asystent AI jest chwilowo niedostępny, spróbuj ponownie."},
    )

# Ensure upload directories exist (e.g. on fresh deploy / Render)
IMAGES_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEMPLATE_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# Path to frontend build (adjust if your structure is different)
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
print(DIST_DIR)

app.mount("/uploads", StaticFiles(directory=str(IMAGES_UPLOAD_DIR)), name="uploads")
app.mount("/template-assets", StaticFiles(directory=str(TEMPLATE_ASSETS_DIR)), name="template_assets")
app.mount("/static/generated", StaticFiles(directory=str(PDF_UPLOAD_DIR)), name="static")

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
        """Serve index.html for all non-API, non-static paths so client-side routing works."""
        index_path = DIST_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        raise HTTPException(status_code=404, detail="Nie znaleziono")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)



    
   