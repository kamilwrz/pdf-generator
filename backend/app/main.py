from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import auth, pdf, images
from app.core.config import origins, IMAGES_UPLOAD_DIR, PDF_UPLOAD_DIR



app = FastAPI()

# Ensure upload directories exist (e.g. on fresh deploy / Render)
IMAGES_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(IMAGES_UPLOAD_DIR)), name="uploads")
app.mount("/static/generated", StaticFiles(directory=str(PDF_UPLOAD_DIR)), name="static")

app.include_router(auth.router)
app.include_router(pdf.router)
app.include_router(images.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)



    
   