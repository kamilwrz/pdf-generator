"""Bounded public interview contracts and strict provider output schemas."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    """Reject unexpected fields rather than accepting hidden client instructions."""
    model_config = ConfigDict(extra="forbid")


class CareerFact(Contract):
    """A user-confirmed assertion or limitation, with its original source.

    ``question`` keeps the exact interview prompt beside answer-derived facts.
    It is presentation metadata rather than evidence, but retaining it prevents
    an answer from becoming ambiguous when it is reviewed outside the session.
    """
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=4000)
    context: str = Field(default="", max_length=500)
    question: str = Field(default="", max_length=1000)
    kind: Literal["fact", "gap", "framing"] = "fact"
    path: str = Field(default="", max_length=200)
    source: str = Field(default="manual", max_length=150)


class ProfileWrite(Contract):
    revision: int = Field(ge=0)
    facts: list[CareerFact] = Field(max_length=500)


class InterviewCreate(Contract):
    mode: Literal["create", "enrich", "tailor"]
    # Account ownership does not establish that a CV describes the account holder.
    include_profile: bool = False
    source_document_id: int | None = Field(default=None, ge=1)
    source_import_id: int | None = Field(default=None, ge=1)
    cv_data: dict = Field(default_factory=dict)
    template_id: str | None = Field(default=None, max_length=100)
    spacing_px: dict | None = None
    job_offer_url: str = Field(default="", max_length=2048)
    job_description: str = Field(default="", max_length=20000)
    candidate_notes: str = Field(default="", max_length=5000)
    language: Literal["pl", "en", "de", "fr", "es", "uk", "it", "nl"] = "pl"


class SessionWrite(Contract):
    evidence_scope: Literal["profile", "session"] | None = None
    revision: int = Field(ge=1)
    profile_revision: int = Field(ge=0)


class AnswerWrite(SessionWrite):
    question_id: str = Field(max_length=100)
    answer: str = Field(default="", max_length=4000)
    status: Literal["answered", "no_experience", "unknown", "skipped"]


class ConfirmWrite(SessionWrite):
    facts: list[CareerFact] = Field(max_length=500)


class GenerateWrite(SessionWrite):
    template_id: str = Field(min_length=1, max_length=100)


class SourceRefresh(SessionWrite):
    """Optional live editor snapshot; absent data reloads the owned saved CV."""
    cv_data: dict | None = None
    template_id: str | None = Field(default=None, max_length=100)
    spacing_px: dict | None = None


class Question(Contract):
    # The server selects a record scope; old saved questions may omit this ID.
    entry_id: str | None = Field(default=None, min_length=1, max_length=200)
    topic: str = Field(max_length=150)
    text: str = Field(max_length=1000)
    reason: str = Field(max_length=1000)
    context: str = Field(max_length=500)
    # Missing on historical questions; new provider responses explicitly use null.
    follow_up_to: str | None = Field(default=None, min_length=1, max_length=100)


class Requirement(Contract):
    text: str = Field(max_length=1000)
    status: Literal["matched", "partial", "unknown", "gap"]
    evidence_refs: list[str] = Field(max_length=10)


class Discovery(Contract):
    """Propose one question for the server-selected record; empty uses a local fallback."""
    questions: list[Question] = Field(max_length=1)
    requirements: list[Requirement] = Field(max_length=20)


class DraftField(Contract):
    path: str = Field(max_length=200)
    value: str = Field(max_length=4000)
    evidence_refs: list[str] = Field(min_length=1, max_length=20)


class Draft(Contract):
    """Each generated scalar cites evidence; the server owns document layout."""
    fields: list[DraftField] = Field(max_length=250)
    remaining_gaps: list[str] = Field(max_length=20)


class EditorialPatch(Contract):
    """One complete prose replacement; evidence and record identity are server-owned."""
    path: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=4000)


class EditorialReview(Contract):
    """Every editable field must be returned once, including unchanged prose."""
    fields: list[EditorialPatch] = Field(max_length=250)


class Clarification(Contract):
    """A neutral Polish question about an unsupported proposal, never evidence."""
    path: str = Field(max_length=200)
    question: str = Field(min_length=1, max_length=1000)


class Verification(Contract):
    """Independent semantic review of claims against their cited source facts."""
    duplicate_paths: list[str] = Field(default_factory=list, max_length=250)
    unsupported_paths: list[str] = Field(max_length=250)
    reasons: list[str] = Field(max_length=250)
    clarifications: list[Clarification] = Field(default_factory=list, max_length=250)


def provider_schema(model):
    """Return an OpenAI strict JSON schema from a fully required output model."""
    schema = model.model_json_schema()
    # Historical JSON may omit additive fields. Strict provider schemas require
    # them even inside $defs (nullable follow_up_to is not an optional key).
    def require_properties(node):
        if isinstance(node, dict):
            if "properties" in node:
                node["required"] = list(node["properties"])
            for child in node.values():
                require_properties(child)
        elif isinstance(node, list):
            for child in node:
                require_properties(child)
    require_properties(schema)
    return {"name": model.__name__.lower(), "strict": True, "schema": schema}
