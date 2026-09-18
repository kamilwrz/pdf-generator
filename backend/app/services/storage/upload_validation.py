"""
Upload security helpers for user-provided image files.

This module is the trust boundary for the image upload endpoint. A multipart
upload hands the server three attacker-controlled values that must never be
used directly:

- the client-declared content type (``UploadFile.content_type``),
- the original filename (``UploadFile.filename``),
- the file bytes themselves.

The endpoint therefore ignores the declared content type, identifies the real
image format from the file's leading bytes (magic-number sniffing), and derives
both the stored object name and its extension from that verified format — never
from user input. This closes two concrete holes:

- Path traversal: a crafted filename such as ``..\\..\\evil`` can no longer
  reach a filesystem path or S3 key, because stored names are server-generated.
- Stored XSS: an HTML or SVG payload uploaded as ``photo.png`` is rejected,
  because its bytes do not match a supported raster signature. SVG is excluded
  on purpose — it executes script when served inline and has no reliable binary
  signature.
"""

from __future__ import annotations

import uuid

# Raster signatures for the formats the editor can actually render. The tuple
# value is (normalized MIME type, canonical filename extension). The declared
# content type from the client is never consulted; only these signatures are.
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_JPEG_SIGNATURE = b"\xff\xd8\xff"
_GIF_SIGNATURES = (b"GIF87a", b"GIF89a")

# WEBP is 'RIFF' <4-byte little-endian size> 'WEBP'. Twelve bytes are enough to
# identify every supported format, so callers only need to read this many bytes
# to classify an upload.
IMAGE_SNIFF_BYTES = 12


def sniff_image_type(head: bytes) -> tuple[str, str] | None:
    """Return ``(mime, extension)`` for a supported raster image, else ``None``.

    The classification depends only on the file's own leading bytes, so a file
    that merely claims to be an image (via extension or declared MIME) is
    rejected unless its real content matches a known raster signature.

    @param head - The first bytes of the upload (at least ``IMAGE_SNIFF_BYTES``
        when available; shorter inputs are handled and simply fail to match).
    @returns The normalized MIME type and canonical extension, or ``None`` when
        the bytes do not match any supported format.
    """
    if head.startswith(_PNG_SIGNATURE):
        return "image/png", ".png"
    if head.startswith(_JPEG_SIGNATURE):
        return "image/jpeg", ".jpg"
    if head.startswith(_GIF_SIGNATURES):
        return "image/gif", ".gif"
    # WEBP carries its format tag at offset 8, after the RIFF chunk header.
    if len(head) >= 12 and head[0:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def safe_object_name(extension: str) -> str:
    """Generate a collision-free, traversal-proof stored file name.

    The name is built entirely from a server-generated UUID plus the verified
    extension, so no attacker-controlled characters ever reach a filesystem
    path or S3 key. The original filename is preserved separately in the
    database (for display) and is never used to locate the stored object.

    @param extension - A leading-dot extension returned by ``sniff_image_type``
        (for example ``".png"``).
    @returns A unique, safe file name such as ``"3f2c…8a.png"``.
    """
    return f"{uuid.uuid4().hex}{extension}"


def is_safe_path_segment(segment: str) -> bool:
    """Return ``True`` when ``segment`` is a single, traversal-safe path part.

    Rejects empty values, the current/parent directory markers, embedded path
    separators, and null bytes. The upload endpoint uses this to keep a
    username — which is taken from a JWT and is not format-validated at
    registration — from escaping its per-user upload directory or S3 key prefix.

    @param segment - A path component such as a username.
    @returns Whether the value is safe to use as one path segment.
    """
    if not segment or segment in (".", ".."):
        return False
    return "/" not in segment and "\\" not in segment and "\x00" not in segment
