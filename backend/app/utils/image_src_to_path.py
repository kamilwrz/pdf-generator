from app.core.config import REPORTLAB_IMAGES_TEMP, IMAGES_UPLOAD_DIR
from urllib.parse import unquote, urlparse
from app.core.config import USE_S3
if USE_S3:
    from app.services import s3_storage

def image_src_to_local_path(src: str) -> str:
    """Convert image src (URL or path) to a path ReportLab can use. For S3, download to temp."""
    if not src:
        return src
    if USE_S3 and src.startswith("https://") and ".amazonaws.com/" in src:
        print(unquote(src))
        return s3_storage.image_src_to_path_for_reportlab(src, REPORTLAB_IMAGES_TEMP)
    if src.startswith(("http://", "https://")):
        parsed = urlparse(src)
        path = parsed.path.lstrip("/").replace("\\", "/")
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
    return src

