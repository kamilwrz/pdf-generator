"""Pydantic contracts for guided CV profile persistence.

`cv_data` is a flexible dict normalised by `cv_data.normalize_cv_data` before
storage; these models only define the HTTP envelope.
"""

from typing import Any

from pydantic import BaseModel, Field


class BioCvDraftRequest(BaseModel):
    """PUT body for the private bio/CV draft."""

    cv_data: dict[str, Any] = Field(default_factory=dict)


class BioCvDraftResponse(BaseModel):
    """GET/PUT response with ISO `updated_at` when a draft row exists."""

    cv_data: dict[str, Any] = Field(default_factory=dict)
    updated_at: str | None = None
