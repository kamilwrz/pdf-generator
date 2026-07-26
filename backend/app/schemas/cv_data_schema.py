"""Pydantic contracts for guided CV profile persistence."""

from typing import Any

from pydantic import BaseModel, Field


class BioCvDraftRequest(BaseModel):
    cv_data: dict[str, Any] = Field(default_factory=dict)


class BioCvDraftResponse(BaseModel):
    cv_data: dict[str, Any] = Field(default_factory=dict)
    updated_at: str | None = None
