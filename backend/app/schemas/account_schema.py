"""Validation models for self-service privacy operations."""

from pydantic import BaseModel, Field


class AccountDeletionRequest(BaseModel):
    """Require an exact username before permanently deleting an account."""

    confirmation: str = Field(min_length=1, max_length=32)
