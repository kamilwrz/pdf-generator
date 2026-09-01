"""Public, non-sensitive metadata for the CV template picker."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.services.cv_templates.registry import public_template_catalog

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateCatalogItem(BaseModel):
    """Allowlisted metadata that is safe to expose without authentication."""

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str
    description: str
    tier: Literal["free", "pro"]
    layouts: list[Literal["single", "sidebar", "icons"]]
    accent: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    preview_path: str = Field(pattern=r"^/template-mockups/[a-z0-9_]+\.png$")


class TemplateCatalogResponse(BaseModel):
    """Versioned public catalog response."""

    items: list[TemplateCatalogItem]


@router.get("/catalog", response_model=TemplateCatalogResponse)
def get_template_catalog(response: Response) -> dict:
    """Return picker metadata without generators or authored element packs."""

    response.headers["Cache-Control"] = "public, max-age=300"
    return {"items": public_template_catalog()}
