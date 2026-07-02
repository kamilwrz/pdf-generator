from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import auth, pdf, images, ai
from app.core.config import origins, IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR

from pathlib import Path
from fastapi.responses import FileResponse

app = FastAPI()

# Ensure upload directories exist (e.g. on fresh deploy / Render)
IMAGES_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Path to frontend build (adjust if your structure is different)
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
print(DIST_DIR)

app.mount("/uploads", StaticFiles(directory=str(IMAGES_UPLOAD_DIR)), name="uploads")
app.mount("/static/generated", StaticFiles(directory=str(PDF_UPLOAD_DIR)), name="static")

app.include_router(auth.router)
app.include_router(pdf.router)
app.include_router(images.router)
app.include_router(ai.router)

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve index.html for all non-API, non-static paths so client-side routing works."""
        index_path = DIST_DIR / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        raise HTTPException(status_code=404, detail="Not found")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)



    
   