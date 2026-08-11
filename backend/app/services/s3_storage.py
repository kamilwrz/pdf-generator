"""AWS S3 helpers for PDF and image object storage.

Enabled when `S3_BUCKET` is set. Public HTTPS URLs are returned after upload
so ReportLab resolvers can locate objects. PDF export downloads bytes through
the API (`download_bytes`) rather than browser-side presigned GETs, so the
bucket does not need CORS rules for the React origin.
"""

import os
import boto3
from app.core.config import S3_BUCKET, AWS_REGION


def get_client():
    """Return a region-scoped boto3 S3 client."""
    return boto3.client("s3", region_name=AWS_REGION)


def upload_bytes(key: str, body: bytes, content_type: str = "application/octet-stream") -> str:
    """Put an object and return its HTTPS URL."""
    get_client().put_object(Bucket=S3_BUCKET, Key=key, Body=body, ContentType=content_type)
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"


def download_bytes(key: str) -> bytes:
    """Download an object body into memory."""
    resp = get_client().get_object(Bucket=S3_BUCKET, Key=key)
    return resp["Body"].read()


def delete_object(key: str) -> None:
    """Delete an object by key (idempotent from the caller's perspective)."""
    get_client().delete_object(Bucket=S3_BUCKET, Key=key)


def key_from_file_path(file_path: str) -> str:
    """Extract S3 key from our S3 URL; otherwise return as-is for local paths."""
    if not file_path or not isinstance(file_path, str):
        return file_path or ""
    if file_path.startswith("https://") and ".amazonaws.com/" in file_path:
        # https://bucket.s3.region.amazonaws.com/key or .../key?...
        after = file_path.split(".amazonaws.com/", 1)[-1]
        return after.split("?")[0]  # drop query string
    return file_path


def image_src_to_path_for_reportlab(src: str, imgs_dir: str) -> str:
    """Given image src (S3 URL or local path), return a path ReportLab can use.

    For S3: download to a temp file under imgs_dir and return that path.
    Local paths are returned unchanged.
    """
    if not src:
        return src
    if src.startswith("https://") and ".amazonaws.com/" in src:
        key = key_from_file_path(src)
        data = download_bytes(key)
        os.makedirs(imgs_dir, exist_ok=True)
        # Use key basename for temp file to avoid nested path issues.
        name = os.path.basename(key) or "image"
        path = os.path.join(imgs_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        return path
    return src


def generate_presigned_download_url(key: str, expires_in: int = 300) -> str:
    """Return a temporary GET URL. Default lifetime is five minutes."""
    client = get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
