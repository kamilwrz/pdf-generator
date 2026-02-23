import os
import boto3
from app.core.config import S3_BUCKET, AWS_REGION

#CREATE A CLIENT FOR S3 STORAGE, LIKE A BRIGDE BETWEEN DIFFERENT MEHODS / REQUESTS
def get_client():
    return boto3.client("s3", region_name=AWS_REGION)

#USED FOR UPLOADING IMAGES VIA DROPZONE
def upload_bytes(key: str, body: bytes, content_type: str = "application/octet-stream"):
    get_client().put_object(Bucket=S3_BUCKET, Key=key, Body=body, ContentType=content_type)
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"

def upload_fileobj(key: str, file_obj, content_type: str):
    get_client().upload_fileobj(file_obj, S3_BUCKET, key, ExtraArgs={"ContentType": content_type})
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"

def download_bytes(key: str) -> bytes:
    resp = get_client().get_object(Bucket=S3_BUCKET, Key=key)
    return resp["Body"].read()

def delete_object(key: str):
    get_client().delete_object(Bucket=S3_BUCKET, Key=key)

def key_from_file_path(file_path: str) -> str:
    """Extract S3 key from our S3 URL; otherwise return as-is for local paths."""
    if not file_path or not isinstance(file_path, str):
        return file_path or ""
    if file_path.startswith("https://") and ".amazonaws.com/" in file_path:
        # https://bucket.s3.region.amazonaws.com/key or https://bucket.s3.region.amazonaws.com/key?...
        after = file_path.split(".amazonaws.com/", 1)[-1]
        return after.split("?")[0]  # drop query string
    return file_path

def image_src_to_path_for_reportlab(src: str, imgs_dir: str) -> str:
    """
    Given image src (S3 URL or local path), return a path ReportLab can use.
    For S3: download to a temp file under imgs_dir and return that path.
    """
    if not src:
        return src
    from urllib.parse import unquote
    if src.startswith("https://") and ".amazonaws.com/" in src:
        key = key_from_file_path(src)
        data = download_bytes(key)
        os.makedirs(imgs_dir, exist_ok=True)
        # use key basename for temp file to avoid path issues
        name = os.path.basename(key) or "image"
        path = os.path.join(imgs_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        return path
    # local path: already fine for ReportLab
    return src