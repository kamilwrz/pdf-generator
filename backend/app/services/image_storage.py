"""Private, immutable storage primitives for user-uploaded raster images.

Image display names never participate in object addressing. New objects use a
server-generated owner-scoped key, while the target resolver retains a narrow,
contained read/delete path for image rows created before this storage contract.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

from app.core.config import AWS_REGION, IMAGES_UPLOAD_DIR, S3_BUCKET


LOCAL_BACKEND = "local"
S3_BACKEND = "s3"
_ALLOWED_EXTENSIONS = frozenset({".png", ".jpg", ".gif", ".webp"})
_IMAGE_KEY_RE = re.compile(
    r"^images/(?P<owner_id>[1-9]\d*)/(?P<object_id>[0-9a-f]{32})"
    r"(?P<extension>\.png|\.jpg|\.gif|\.webp)$"
)


class UnsafeImageStorageLocator(ValueError):
    """Raised when image metadata points outside private image storage."""


@dataclass(frozen=True)
class ImageStorageTarget:
    """Validated backend/key pair suitable for durable cleanup."""

    backend: str
    key: str


def configured_backend(use_s3: bool) -> str:
    """Return the persistent backend label for the active deployment mode."""

    return S3_BACKEND if use_s3 else LOCAL_BACKEND


def make_image_key(owner_id: int, extension: str) -> str:
    """Build an immutable owner-scoped key from trusted server-side values."""

    normalized_extension = str(extension or "").lower()
    if int(owner_id) <= 0 or normalized_extension not in _ALLOWED_EXTENSIONS:
        raise ValueError("Image keys require a positive owner id and supported extension.")
    return f"images/{int(owner_id)}/{uuid4().hex}{normalized_extension}"


def validate_image_key(key: str, *, owner_id: int | None = None) -> str:
    """Validate a new immutable image key and its optional owner binding."""

    normalized = str(key or "")
    if "\\" in normalized or "\x00" in normalized:
        raise UnsafeImageStorageLocator("Invalid image storage key.")
    match = _IMAGE_KEY_RE.fullmatch(normalized)
    if match is None:
        raise UnsafeImageStorageLocator("Invalid image storage key.")
    if owner_id is not None and int(match.group("owner_id")) != int(owner_id):
        raise UnsafeImageStorageLocator("Image storage key owner does not match the row.")
    return normalized


def _safe_relative_key(key: str) -> str:
    """Accept only a normalized relative legacy key with no traversal segments."""

    normalized = unquote(str(key or "")).replace("\\", "/")
    segments = normalized.split("/")
    if (
        not normalized
        or normalized.startswith("/")
        or any(segment in {"", ".", ".."} for segment in segments)
        or any(any(ord(character) < 32 for character in segment) for segment in segments)
    ):
        raise UnsafeImageStorageLocator("Invalid legacy image storage key.")
    return "/".join(segments)


def _contained_path(root: Path, key: str) -> Path:
    """Resolve a relative image key and prove it remains below ``root``."""

    root_path = Path(root).resolve()
    candidate = (root_path / _safe_relative_key(key)).resolve()
    try:
        candidate.relative_to(root_path)
    except ValueError as exc:
        raise UnsafeImageStorageLocator(
            "Image path escapes the private storage root."
        ) from exc
    return candidate


def put_image_bytes(
    backend: str,
    key: str,
    body: bytes,
    *,
    content_type: str,
    root: Path = IMAGES_UPLOAD_DIR,
    owner_id: int | None = None,
) -> str:
    """Atomically publish a verified raster body and return its DB locator."""

    normalized = validate_image_key(key, owner_id=owner_id)
    if backend == S3_BACKEND:
        from app.services import s3_storage

        return s3_storage.upload_bytes(
            normalized,
            body,
            content_type=content_type,
        )
    if backend != LOCAL_BACKEND:
        raise UnsafeImageStorageLocator("Unsupported image storage backend.")

    destination = _contained_path(root, normalized)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
    return str(destination)


def target_for_image(image_row, *, root: Path = IMAGES_UPLOAD_DIR) -> ImageStorageTarget:
    """Resolve a current or legacy image locator into a safe cleanup target."""

    locator = str(getattr(image_row, "file_path", None) or "")
    if not locator:
        raise FileNotFoundError("Image has no storage locator.")
    raw_path = Path(locator)
    parsed = urlparse(locator)
    # On Windows, ``urlparse('C:\\...')`` reports ``c`` as a URL scheme.
    # A real absolute filesystem path must take the contained local branch.
    if not raw_path.is_absolute() and (parsed.scheme or parsed.netloc):
        expected_host = f"{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com".lower()
        if parsed.scheme != "https" or not S3_BUCKET or parsed.hostname != expected_host:
            raise UnsafeImageStorageLocator("Image S3 locator has an unexpected origin.")
        key = _safe_relative_key(parsed.path.lstrip("/"))
        if not (key.startswith("images/") or key.startswith("uploads/")):
            raise UnsafeImageStorageLocator("Image S3 key is outside an allowed prefix.")
        if key.startswith("images/"):
            validate_image_key(key, owner_id=getattr(image_row, "owner_id", None))
        return ImageStorageTarget(S3_BACKEND, key)

    root_path = Path(root).resolve()
    candidate = raw_path.resolve()
    try:
        relative = candidate.relative_to(root_path)
    except ValueError as exc:
        raise UnsafeImageStorageLocator(
            "Legacy image path escapes the private storage root."
        ) from exc
    key = _safe_relative_key(relative.as_posix())
    if key.startswith("images/"):
        validate_image_key(key, owner_id=getattr(image_row, "owner_id", None))
    return ImageStorageTarget(LOCAL_BACKEND, key)


def local_path_for_target(
    target: ImageStorageTarget,
    *,
    root: Path = IMAGES_UPLOAD_DIR,
) -> Path:
    """Return a contained local path for a validated local image target."""

    if target.backend != LOCAL_BACKEND:
        raise UnsafeImageStorageLocator("Image target is not local.")
    return _contained_path(root, target.key)


def delete_image_object(
    backend: str,
    key: str,
    *,
    root: Path = IMAGES_UPLOAD_DIR,
) -> None:
    """Idempotently delete one validated current or legacy image object."""

    normalized = _safe_relative_key(key)
    if backend == S3_BACKEND:
        if not (normalized.startswith("images/") or normalized.startswith("uploads/")):
            raise UnsafeImageStorageLocator("Image cleanup key is outside an allowed prefix.")
        if normalized.startswith("images/"):
            validate_image_key(normalized)
        from app.services import s3_storage

        s3_storage.delete_object(normalized)
        return
    if backend != LOCAL_BACKEND:
        raise UnsafeImageStorageLocator("Unsupported image cleanup backend.")
    _contained_path(root, normalized).unlink(missing_ok=True)
