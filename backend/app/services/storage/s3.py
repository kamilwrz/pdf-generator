"""AWS S3 helpers for PDF and image object storage.

Enabled when `S3_BUCKET` is set. Uploads deliberately omit an ACL: S3 objects
are private by default, and Bucket owner enforced buckets reject most ACL
headers. The returned HTTPS value is a server-side storage locator, not a
browser download URL. Production buckets must keep Block Public Access enabled
and must not have a public bucket policy. PDF export reads bytes through the API
(`download_bytes`), so the bucket does not need CORS rules for the React origin.
"""

import os
import boto3
from app.core.config import S3_BUCKET, AWS_REGION


def get_client():
    """Return a region-scoped boto3 S3 client."""
    return boto3.client("s3", region_name=AWS_REGION)


def upload_bytes(key: str, body: bytes, content_type: str = "application/octet-stream") -> str:
    """Put a private-by-default object and return its server-side locator.

    No ACL header is sent. Besides preserving S3's private default, omission is
    required for compatibility with Bucket owner enforced Object Ownership.
    Bucket-level Block Public Access remains an operational requirement because
    this helper cannot neutralise a public bucket policy.
    """
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
