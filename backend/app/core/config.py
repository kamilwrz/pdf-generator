"""
Runtime configuration for CV Studio backend.

Values come from environment variables with local-development defaults.
This module is imported early by `main.py` and many services, so it must stay
side-effect light (no DB/network) aside from reading `os.environ`.
"""

from pathlib import Path
import os, tempfile

# Browser origins allowed to call the API with credentials.
# Local Vite + production Render frontend are the safe defaults when unset.
_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://pdf-generator-react.onrender.com",
)
origins = [o.strip() for o in _raw.split(",") if o.strip()]

# Public base URL of this API (used when building absolute asset URLs).
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Versioned, application-owned assets used by built-in templates. These must
# not share the runtime uploads directory, which may be empty after a deploy.
TEMPLATE_ASSETS_DIR = Path(__file__).resolve().parents[2] / "template_assets"

# Local filesystem roots for generated PDFs and user uploads.
# On Render these live on ephemeral disk unless S3 is enabled.
PDF_UPLOAD_DIR = Path() / "static/generated"
IMAGES_UPLOAD_DIR = Path() / "uploads"

# ReportLab needs real local files for Image readers; remote/S3 assets are
# staged here before drawing onto a page.
REPORTLAB_IMAGES_TEMP = os.path.join(tempfile.gettempdir(), "pdf_generator_images")

# Optional S3 offload. USE_S3 is derived from bucket presence so local runs
# without AWS credentials keep using the filesystem paths above.
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "")
AWS_REGION = os.getenv("AWS_REGION", "eu-north-1")
USE_S3 = bool(S3_BUCKET)

# OpenAI key for extract/fill/assistant. Empty disables AI routes at runtime.
OPENAI_API_KEY = os.getenv("API_GPT_KEY", "")

# Pre-Stripe: allow choosing a paid plan without payment. Flip to False (or gate
# standard/premium through Stripe checkout) when billing lands — this is the one
# place that lets a user self-activate Standard/Premium for free.
ALLOW_UNPAID_PLAN_SELECTION = os.getenv("ALLOW_UNPAID_PLAN_SELECTION", "true").lower() == "true"
