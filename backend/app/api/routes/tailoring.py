"""Persist Free intake before Pro, then reuse the existing interview pipeline.

Intake is the user's selected CV, job advert and language. A TailoringFlow
saves those choices before an InterviewSession is started. Keeping these
records separate lets the user resume setup without starting paid model work.
"""
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy.exc import IntegrityError

from app.core.security import get_current_user
from app.core.localisation import message
from app.dependencies import get_db
from app.models.models import TailoringFlow, InterviewSession, Pdf
from app.crud.cv_import_snapshots import get_owned_snapshot
from app.schemas.interview_schema import Contract, InterviewCreate, ConfirmWrite
from app.services.interviews import service
from app.services.interviews.sources import available_interview_sources, has_interview_source
from app.services.tailoring.history import flow_session_id, tailoring_summaries
from app.api.routes.interviews import create_interview, confirm_interview

router = APIRouter(prefix="/tailoring", tags=["tailoring"])


class Intake(Contract):
    """Only user choices are writable; session, owner and billing stay server-owned."""
    revision: int = Field(ge=0)
    source_kind: Literal["document", "import"] | None = None
    source_id: int | None = Field(default=None, ge=1)
    offer_kind: Literal["text", "url"] = "text"
    job_description: str = Field(default="", max_length=20000)
    job_offer_url: str = Field(default="", max_length=2048)
    language: Literal["pl", "en", "de", "fr", "es", "uk", "it", "nl"] = "pl"
    step: Literal["source", "offer"] = "source"


class Start(Contract):
    """Identify the saved intake version the user explicitly chose to start."""
    revision: int = Field(ge=1)


def fail(code, status=409):
    raise HTTPException(status, detail={"code": code, "message": message(code)})


def owned(db, user, flow_id):
    """Return the caller's draft or the same 404 for absent/foreign IDs.

    Filtering by owner in the query prevents a guessed UUID from granting
    access to another account's CV and job-offer choices.
    """
    row = db.query(TailoringFlow).filter_by(id=str(flow_id), owner_id=user.id).first()
    if row is None:
        fail("tailoring_not_found", 404)
    return row


def source_data(db, user, state):
    """Resolve live source ownership, including soft-deleted import rejection."""
    if not state.get("source_id") or not state.get("source_kind"):
        return None
    if state["source_kind"] == "document":
        row = db.query(Pdf).filter_by(id=state["source_id"], owner_id=user.id).first()
    else:
        row = get_owned_snapshot(db, owner_id=user.id, snapshot_id=state["source_id"])
        if row and row.status != "succeeded":
            row = None
    data = row.cv_data if row else None
    return data if has_interview_source(data) else None


def session_for(db, user, row):
    """Read this intake's deterministically named interview, or None."""
    # The deterministic key also recovers a crash after interview creation but
    # before its response. No second session or paid request is needed.
    session_id = flow_session_id(user.id, row.id)
    return db.query(InterviewSession).filter_by(id=session_id, owner_id=user.id).first()


def payload(db, user, row):
    """Build the public resume state from the owned intake and live source.

    The source digest is an internal change-detection value and is excluded.
    This performs database reads only; it does not start or charge AI work.
    """
    session = session_for(db, user, row) if row.state.get("locked") else None
    state = {key: value for key, value in row.state.items() if key not in {"source_digest"}}
    return {"id": row.id, "revision": row.revision, **state,
            "session_id": session.id if session else None,
            "document_id": session.state.get("document_id") if session else None,
            "source_cv_data": source_data(db, user, row.state), "updated_at": row.updated_at}


@router.get("")
def list_flows(user=Depends(get_current_user), db=Depends(get_db)):
    """Describe the latest 50 owned intake drafts, including interview activity."""
    rows = db.query(TailoringFlow).filter_by(owner_id=user.id).order_by(
        TailoringFlow.updated_at.desc(), TailoringFlow.created_at.desc(), TailoringFlow.id.desc(),
    ).limit(50).all()
    return {"items": tailoring_summaries(db, user.id, rows)}


@router.get("/sources")
def sources(user=Depends(get_current_user), db=Depends(get_db)):
    """Expose eligible metadata without loading the account career profile."""
    return available_interview_sources(db, user.id)


@router.get("/{flow_id}")
def get_flow(flow_id: UUID, user=Depends(get_current_user), db=Depends(get_db)):
    """Resume intake or its saved session without charging credits."""
    return payload(db, user, owned(db, user, flow_id))


@router.put("/{flow_id}")
def save_flow(flow_id: UUID, request: Intake, user=Depends(get_current_user), db=Depends(get_db)):
    """Compare-and-swap drafts; a client UUID makes the initial save retryable."""
    state = request.model_dump(exclude={"revision"})
    if bool(request.source_id) != bool(request.source_kind):
        fail("tailoring_source_required", 422)
    data = source_data(db, user, state)
    if request.source_id and data is None:
        fail("tailoring_source_required", 422)
    state["source_digest"] = service.digest(data) if data else None
    row = db.query(TailoringFlow).filter_by(id=str(flow_id)).first()
    if row is not None:
        if row.owner_id != user.id:
            fail("tailoring_not_found", 404)
        # Editing the advert must not silently approve a CV changed elsewhere.
        # Only returning to source review or selecting a new source refreshes it.
        if request.step != "source" and (row.state.get("source_kind"), row.state.get("source_id")) == (request.source_kind, request.source_id):
            state["source_digest"] = row.state.get("source_digest")
        if row.state == state:
            return payload(db, user, row)
        if row.state.get("locked") or row.revision != request.revision:
            fail("tailoring_conflict")
        count = db.query(TailoringFlow).filter_by(id=row.id, owner_id=user.id, revision=request.revision).update(
            {"state": state, "revision": request.revision + 1, "updated_at": datetime.utcnow()}, synchronize_session=False)
        if count != 1:
            db.rollback()
            fail("tailoring_conflict")
    else:
        if request.revision != 0:
            fail("tailoring_not_found", 404)
        row = TailoringFlow(id=str(flow_id), owner_id=user.id, revision=1, state=state)
        db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row = owned(db, user, flow_id)
        if row.state != state:
            fail("tailoring_conflict")
    db.refresh(row)
    return payload(db, user, row)


@router.post("/{flow_id}/start")
def start_flow(flow_id: UUID, request: Start, http_request: Request,
               user=Depends(get_current_user), db=Depends(get_db)):
    """Freeze explicit intake before creating one Pro interview, with no AI call.

    A durable lock prevents another tab changing the payload while an external
    offer URL is resolved. Retries reuse the frozen input and interview key.
    Factual review and every paid operation retain the existing interview gates.
    """
    row = owned(db, user, flow_id)
    existing = session_for(db, user, row)
    if existing and existing.state.get("confirmed"):
        return payload(db, user, row)
    from app.services.billing.entitlements import assert_can_use_ai_action
    assert_can_use_ai_action(db, user, "interview")
    state = dict(row.state)
    data = source_data(db, user, state)
    if not data:
        fail("tailoring_source_required", 422)
    if service.digest(data) != state.get("source_digest"):
        fail("tailoring_source_changed")
    offer = state["job_description"] if state["offer_kind"] == "text" else state["job_offer_url"]
    if not offer.strip():
        fail("tailoring_offer_required", 422)
    if not state.get("locked"):
        if row.revision != request.revision:
            fail("tailoring_conflict")
        state["locked"] = True
        count = db.query(TailoringFlow).filter_by(id=row.id, revision=request.revision).update(
            {"state": state, "revision": request.revision + 1, "updated_at": datetime.utcnow()}, synchronize_session=False)
        if count != 1:
            db.rollback()
            fail("tailoring_conflict")
        db.commit()
        db.refresh(row)
    try:
        session = create_interview(InterviewCreate(
            # Leave template_id unset so create_interview falls back to the
            # selected source's own template. A document source then keeps its
            # existing design; a PDF import has no known template and offers
            # the full gallery, matching the /preview "tailoring preserves the
            # source CV template" rule instead of silently overriding it.
            mode="tailor", include_profile=False, language=state["language"],
            **{f"source_{state['source_kind']}_id": state["source_id"]},
            job_description=state["job_description"] if state["offer_kind"] == "text" else "",
            job_offer_url=state["job_offer_url"] if state["offer_kind"] == "url" else "",
        ), http_request, f"tailor-{row.id}", user, db)
        # Starting explicitly confirms the source already displayed in step one.
        # AI-authored changes still require the ordinary later review boundaries.
        if not session["confirmed"]:
            confirm_interview(session["id"], ConfirmWrite(
                revision=session["revision"], profile_revision=session["profile_revision"],
                evidence_scope="session", facts=session["proposed_facts"],
            ), user, db)
    except HTTPException:
        # A definitive validation/access failure permits correcting the intake.
        # Unknown outcomes remain locked for an explicit idempotent retry.
        db.rollback()
        if not session_for(db, user, row):
            db.query(TailoringFlow).filter_by(id=row.id).update(
                {"state": {k: v for k, v in state.items() if k != "locked"}, "revision": row.revision + 1}, synchronize_session=False)
            db.commit()
        raise
    return payload(db, user, row)


@router.delete("/{flow_id}")
def delete_flow(flow_id: UUID, user=Depends(get_current_user), db=Depends(get_db)):
    """Delete intake only; linked interviews and generated CVs remain accessible."""
    db.delete(owned(db, user, flow_id))
    db.commit()
    return {"deleted": True}
