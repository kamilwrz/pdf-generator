from pathlib import Path
import os, tempfile

# CORS: one per env. Local = "http://localhost:5173", AWS = your frontend URL
_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _raw.split(",") if o.strip()]

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

#LOCALHOST FOLDERS
PDF_UPLOAD_DIR = Path() / "static/generated"
IMAGES_UPLOAD_DIR = Path() / "uploads"

#FOLDER FOR TEMP IMAGE STORAGE FOR REPORTLAB
REPORTLAB_IMAGES_TEMP = os.path.join(tempfile.gettempdir(), "pdf_generator_images")

#AWS CONFIGURATION
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "")
AWS_REGION = os.getenv("AWS_REGION", "eu-north-1")
USE_S3 = bool(S3_BUCKET)

OPENAI_API_KEY = os.getenv("API_GPT_KEY", "")

