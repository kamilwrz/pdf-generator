"""
Runtime configuration for CV Studio backend.

Values come from environment variables with local-development defaults.
This module is imported early by `main.py` and many services, so it must stay
side-effect light (no DB/network) aside from reading `os.environ`.
"""

from pathlib import Path
import os, tempfile


def _int_env(name: str, default: int) -> int:
    """Read a positive integer from the environment, falling back on garbage.

    Config must stay import-safe: a malformed override should not crash the
    process at import time, so an unparseable or non-positive value returns the
    default instead of raising.
    """
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default

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

# Pre-Stripe: allow choosing a paid plan without payment. Defaults to False so
# production cannot self-activate Standard/Premium by accident. Local/dev
# `.env` should set ALLOW_UNPAID_PLAN_SELECTION=true until Stripe Checkout lands.
ALLOW_UNPAID_PLAN_SELECTION = os.getenv("ALLOW_UNPAID_PLAN_SELECTION", "false").lower() == "true"

# Ops-only secret for POST /billing/admin/reset-ai-credits. Must not reuse
# SECRET_KEY — set a dedicated random value when the admin endpoint is needed.
ADMIN_RESET_SECRET = (os.getenv("ADMIN_RESET_SECRET") or "").strip()

# Image upload hard limits (see api/routes/images.py). The size cap bounds the
# memory a single request can consume — the endpoint reads at most this many
# bytes — and the per-user count caps the profile-photo library used in CVs
# (five slots in the editor gallery). Per-plan quotas can layer on top later
# without changing this boundary.
MAX_UPLOAD_BYTES = _int_env("MAX_UPLOAD_BYTES", 8 * 1024 * 1024)  # 8 MB
MAX_IMAGES_PER_USER = _int_env("MAX_IMAGES_PER_USER", 5)
