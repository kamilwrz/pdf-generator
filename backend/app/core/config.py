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

# OpenAI remains the provider for the conversational assistant. CV extraction
# has its own provider configuration below so Free imports do not require an
# OpenAI key and can be metered independently from assistant credits.
OPENAI_API_KEY = os.getenv("API_GPT_KEY", "")

# PDF CV extraction defaults to Cloudflare Workers AI. The OpenAI-compatible
# endpoint lets the existing SDK talk to Cloudflare without another dependency.
# Credentials stay server-side and are validated lazily when an import starts,
# which keeps application startup and non-AI routes available after a bad deploy.
CV_EXTRACT_PROVIDER = (os.getenv("CV_EXTRACT_PROVIDER", "cloudflare").strip().lower() or "cloudflare")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
CLOUDFLARE_TEXT_MODEL = (
    os.getenv("CLOUDFLARE_TEXT_MODEL", "@cf/google/gemma-4-26b-a4b-it").strip()
    or "@cf/google/gemma-4-26b-a4b-it"
)
# Gemma provides the primary semantic extraction quality. Llama remains a
# deterministic JSON-mode retry when Gemma returns no visible answer or invalid
# JSON, so one provider-side failure does not consume another monthly import.
CLOUDFLARE_TEXT_FALLBACK_MODEL = (
    os.getenv("CLOUDFLARE_TEXT_FALLBACK_MODEL", "@cf/meta/llama-3.1-8b-instruct-fast").strip()
    or "@cf/meta/llama-3.1-8b-instruct-fast"
)
CLOUDFLARE_TEXT_REASONING_EFFORT = (
    os.getenv("CLOUDFLARE_TEXT_REASONING_EFFORT", "low").strip().lower()
    or "low"
)
if CLOUDFLARE_TEXT_REASONING_EFFORT not in {"low", "medium", "high"}:
    CLOUDFLARE_TEXT_REASONING_EFFORT = "low"
CLOUDFLARE_VISION_MODEL = (
    os.getenv("CLOUDFLARE_VISION_MODEL", "@cf/qwen/qwen3.8-27b").strip()
    or "@cf/qwen/qwen3.8-27b"
)
CV_EXTRACT_OPENAI_MODEL = os.getenv("CV_EXTRACT_OPENAI_MODEL", "gpt-4o").strip() or "gpt-4o"
CV_EXTRACT_MAX_PAGES = _int_env("CV_EXTRACT_MAX_PAGES", 12)
CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE = _int_env("CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE", 80)
# Preserve the old shared override for existing deployments. When it is absent,
# native-text Gemma gets extra reasoning/final-JSON headroom while expensive
# vision requests retain the previous 8k ceiling.
CV_EXTRACT_MAX_COMPLETION_TOKENS = _int_env("CV_EXTRACT_MAX_COMPLETION_TOKENS", 8000)
_CV_EXTRACT_LEGACY_BUDGET_CONFIGURED = os.getenv("CV_EXTRACT_MAX_COMPLETION_TOKENS") is not None
CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS = _int_env(
    "CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS",
    CV_EXTRACT_MAX_COMPLETION_TOKENS if _CV_EXTRACT_LEGACY_BUDGET_CONFIGURED else 16000,
)
CV_EXTRACT_VISION_MAX_COMPLETION_TOKENS = _int_env(
    "CV_EXTRACT_VISION_MAX_COMPLETION_TOKENS",
    CV_EXTRACT_MAX_COMPLETION_TOKENS,
)

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
MAX_IMAGES_PER_USER = _int_env("MAX_IMAGES_PER_USER", 4)
