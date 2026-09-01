"""Resolve canvas image `src` values to local filesystem paths for ReportLab.

Handles S3 HTTPS URLs (download to temp), absolute API URLs under
`/uploads` or `/template-assets`, and already-local paths.
"""

from app.core.config import REPORTLAB_IMAGES_TEMP, IMAGES_UPLOAD_DIR, TEMPLATE_ASSETS_DIR
from urllib.parse import unquote, urlparse
from app.core.config import USE_S3

if USE_S3:
    from app.services import s3_storage


def image_src_to_local_path(
    src: str,
    *,
    temporary_directory: str | None = None,
) -> str:
    """Convert image src (URL or path) to a path ReportLab can open.

    For S3 URLs, callers performing a render pass a request-scoped temporary
    directory which is removed in ``finally`` by ``TemporaryDirectory``. The
    process-level fallback remains only for compatibility with direct utility
    callers that do not perform a PDF request.
    """
    if not src:
        return src
    if USE_S3 and src.startswith("https://") and ".amazonaws.com/" in src:
        return s3_storage.image_src_to_path_for_reportlab(
            unquote(src),
            temporary_directory or REPORTLAB_IMAGES_TEMP,
        )
    if src.startswith(("http://", "https://")):
        parsed = urlparse(src)
        path = parsed.path.lstrip("/").replace("\\", "/")
        if path.startswith("template-assets/"):
            return str((TEMPLATE_ASSETS_DIR / path.removeprefix("template-assets/")).resolve())
        if path.startswith("uploads/"):
            path = path[8:]
        decoded = unquote(path)
        local = (IMAGES_UPLOAD_DIR / decoded).resolve()
        return str(local)
    if "/uploads/" in src:
        path_part = src.split("/uploads/")[1]
        decoded = unquote(path_part)
        local = (IMAGES_UPLOAD_DIR / decoded).resolve()
        return str(local)
    # Relative template-asset paths from starters (`/template-assets/...`).
    normalized = src.replace("\\", "/").lstrip("/")
    if normalized.startswith("template-assets/"):
        return str((TEMPLATE_ASSETS_DIR / normalized.removeprefix("template-assets/")).resolve())
    return src
