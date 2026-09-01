"""
Runtime configuration for CV Studio backend.

Values come from environment variables with local-development defaults.
This module is imported early by `main.py` and many services, so it must stay
side-effect light (no DB/network) aside from reading `os.environ`.
"""

from pathlib import Path
import ipaddress
import os, tempfile
from typing import Mapping
from urllib.parse import urlparse


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


def _bool_env(name: str, default: bool) -> bool:
    """Read a conventional boolean environment value without failing startup.

    Empty or unrecognised values fall back to the documented default so a
    deployment typo cannot silently enable an expensive AI execution mode.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default

def resolve_cors_origins(env: Mapping[str, str] = os.environ) -> list[str]:
    """Return an explicit credentialed CORS allowlist for this environment.

    Production is detected through ``APP_ENV=production`` or Render's native
    marker. It must provide CORS_ORIGINS; localhost is only a development
    default. Wildcards and origins containing paths are rejected because this
    API authorizes browser requests with bearer credentials.
    """
    is_production = (
        env.get("APP_ENV", "").strip().lower() == "production"
        or env.get("RENDER", "").strip().lower() in {"1", "true", "yes"}
    )
    raw = env.get("CORS_ORIGINS", "").strip()
    if not raw:
        if is_production:
            raise RuntimeError("CORS_ORIGINS must be set explicitly in production.")
        raw = "http://localhost:5173"

    resolved: list[str] = []
    for candidate in (item.strip().rstrip("/") for item in raw.split(",")):
        if not candidate:
            continue
        parsed = urlparse(candidate)
        if candidate == "*" or parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise RuntimeError(f"Invalid CORS origin: {candidate!r}")
        if parsed.path or parsed.params or parsed.query or parsed.fragment:
            raise RuntimeError(f"CORS origins must not contain paths: {candidate!r}")
        if is_production and parsed.scheme != "https":
            raise RuntimeError("Production CORS_ORIGINS must use HTTPS.")
        if candidate not in resolved:
            resolved.append(candidate)
    if not resolved:
        raise RuntimeError("CORS_ORIGINS must contain at least one origin.")
    return resolved


def assert_private_storage_configured(env: Mapping[str, str] = os.environ) -> None:
    """Fail closed when a production process would use ephemeral storage.

    Local filesystem storage remains convenient for development and tests. A
    Render/production process, however, must use the private S3 backend because
    its root filesystem disappears on restart and would leave durable database
    rows pointing at missing personal files.
    """

    is_production = (
        env.get("APP_ENV", "").strip().lower() == "production"
        or env.get("RENDER", "").strip().lower() in {"1", "true", "yes"}
    )
    if not is_production:
        return
    required = (
        "S3_BUCKET_NAME",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_REGION",
    )
    missing = [name for name in required if not env.get(name, "").strip()]
    if missing:
        raise RuntimeError(
            "Production private storage is incomplete; configure: "
            + ", ".join(missing)
        )


def assert_trusted_proxy_configured(env: Mapping[str, str] = os.environ) -> None:
    """Require an explicit, bounded peer allowlist for proxy-derived IPs.

    Authentication throttles may trust ``X-Forwarded-For`` only when the
    immediate socket peer is a known reverse proxy. Failing startup on an
    absent, malformed, or catch-all CIDR prevents a deployment typo from
    turning an attacker-controlled header into an unlimited throttle bypass.
    """

    trust_headers = env.get("TRUST_PROXY_HEADERS", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not trust_headers:
        return
    raw_networks = [
        value.strip()
        for value in env.get("TRUSTED_PROXY_CIDRS", "").split(",")
        if value.strip()
    ]
    if not raw_networks:
        raise RuntimeError(
            "TRUSTED_PROXY_CIDRS must list the exact reverse-proxy peer networks "
            "when TRUST_PROXY_HEADERS is enabled."
        )
    for raw_network in raw_networks:
        try:
            network = ipaddress.ip_network(raw_network, strict=False)
        except ValueError as exc:
            raise RuntimeError(
                f"Invalid trusted proxy CIDR: {raw_network!r}"
            ) from exc
        if network.prefixlen == 0:
            raise RuntimeError("TRUSTED_PROXY_CIDRS must not trust every address.")


# Browser origins allowed to call the API with credentials.
origins = resolve_cors_origins()

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

# External AI calls must finish before the ten-minute database reservation
# lease can expire. The SDK retry loops are disabled at each call site, and the
# configured per-request timeout is capped with a full minute of settlement
# headroom so a second request cannot start while the first provider call is
# still expected to return.
AI_PROVIDER_TIMEOUT_SECONDS = min(
    _int_env("AI_PROVIDER_TIMEOUT_SECONDS", 480),
    540,
)

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
# CV extraction is schema conversion rather than open-ended problem solving.
# Cloudflare's Gemma guide explicitly supports disabling thinking; doing so
# avoids generating thousands of hidden tokens before the final JSON. Operators
# can opt back in for controlled quality experiments without changing code.
CLOUDFLARE_TEXT_ENABLE_THINKING = _bool_env(
    "CLOUDFLARE_TEXT_ENABLE_THINKING",
    False,
)
CLOUDFLARE_VISION_MODEL = (
    os.getenv("CLOUDFLARE_VISION_MODEL", "@cf/qwen/qwen3.8-27b").strip()
    or "@cf/qwen/qwen3.8-27b"
)
CV_EXTRACT_OPENAI_MODEL = os.getenv("CV_EXTRACT_OPENAI_MODEL", "gpt-4o").strip() or "gpt-4o"
CV_EXTRACT_MAX_PAGES = _int_env("CV_EXTRACT_MAX_PAGES", 12)
CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE = _int_env("CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE", 80)
# Preserve the old shared override for existing deployments. When it is absent,
# native-text Gemma gets enough final-JSON headroom for long CVs while JSON-only
# fallback and vision requests retain the previous 8k ceiling. Thinking is a
# separate opt-in and does not consume this large budget in the normal path.
CV_EXTRACT_MAX_COMPLETION_TOKENS = _int_env("CV_EXTRACT_MAX_COMPLETION_TOKENS", 8000)
_CV_EXTRACT_LEGACY_BUDGET_CONFIGURED = os.getenv("CV_EXTRACT_MAX_COMPLETION_TOKENS") is not None
CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS = _int_env(
    "CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS",
    CV_EXTRACT_MAX_COMPLETION_TOKENS if _CV_EXTRACT_LEGACY_BUDGET_CONFIGURED else 32000,
)
# JSON-mode fallback models emit only the final object and do not need the
# reasoning headroom reserved for Gemma. Keeping a separate cap also avoids
# sending unsupported 32k output requests to smaller rollback models.
CV_EXTRACT_JSON_MAX_COMPLETION_TOKENS = _int_env(
    "CV_EXTRACT_JSON_MAX_COMPLETION_TOKENS",
    CV_EXTRACT_MAX_COMPLETION_TOKENS,
)
CV_EXTRACT_VISION_MAX_COMPLETION_TOKENS = _int_env(
    "CV_EXTRACT_VISION_MAX_COMPLETION_TOKENS",
    CV_EXTRACT_MAX_COMPLETION_TOKENS,
)

# Pre-Stripe: allow choosing a paid plan without payment. Defaults to False so
# production cannot self-activate Pro by accident. Local/dev
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
