"""Authenticated career profile CRUD and resumable interview operations."""
from copy import deepcopy
from datetime import datetime
import json
import logging
from uuid import uuid4, uuid5, NAMESPACE_URL

from fastapi import APIRouter, Depends, Header, Request, Query, HTTPException
from sqlalchemy.exc import IntegrityError

from app.core.security import get_current_user
from app.dependencies import get_db
from app.crud.cv_import_snapshots import get_owned_snapshot
from app.models.models import InterviewSession, Pdf
from app.schemas.interview_schema import (
    ProfileWrite, InterviewCreate, SessionWrite, AnswerWrite, ConfirmWrite, GenerateWrite, SourceRefresh, Draft, Verification,
)
from app.schemas.pdf_schema import PDFCreateRequest
from app.services.interview_clarification import clarification_queue, start_clarifications, finish_clarification_answer
from app.services.interview_recovery import assemble_reviewed_draft, previous_rejected_result
from app.services import interview_service as service
from app.services.cv_data import normalize_cv_data, CvDataValidationError
from app.services.ai_service import generate_resume
from app.services.cv_generator_primitives import use_spacing
from app.services.cv_templates.registry import TEMPLATE_LAYOUTS
from app.services.document_service import create_pdf_document
from app.services.entitlements import assert_can_use_ai_action, assert_template_allowed, assert_can_create_project
from app.services.job_offer_service import resolve_job_offer, JobOfferError
from app.utils.document_integrity import canonical_title_key

router = APIRouter(tags=["interviews"])
logger = logging.getLogger(__name__)


@router.get("/career-profile")
def get_profile(user=Depends(get_current_user), db=Depends(get_db)):
    """Read confirmed facts without requiring a paid plan or spending credits."""
    return service.profile_payload(db, user.id)


@router.put("/career-profile")
def write_profile(request: ProfileWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Save an explicit owner edit with optimistic concurrency."""
    return service.put_profile(db, user.id, request.revision, [f.model_dump() for f in request.facts])


@router.delete("/career-profile")
def clear_profile(revision: int = Query(ge=0), user=Depends(get_current_user), db=Depends(get_db)):
    """Clear current evidence while retaining the epoch that invalidates previews."""
    return service.put_profile(db, user.id, revision, [])


@router.post("/ai/interviews", status_code=201)
def create_interview(request: InterviewCreate, http_request: Request,
                     idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
                     user=Depends(get_current_user), db=Depends(get_db)):
    """Snapshot only an explicitly selected source; defer AI to the next step."""
    assert_can_use_ai_action(db, user, "interview")
    payload = request.model_dump()
    if len(json.dumps(payload).encode()) > 250_000:
        service.fail("Dane wejściowe są zbyt duże.", 413)
    session_id = str(uuid5(NAMESPACE_URL, f"interview:{user.id}:{idempotency_key}"))
    existing = db.query(InterviewSession).filter_by(id=session_id, owner_id=user.id).first()
    if existing:
        if existing.state["create_hash"] != service.digest(payload):
            service.fail("Klucz ponowienia dotyczy innych danych.")
        return service.session_payload(existing)
    if request.source_document_id and request.source_import_id:
        service.fail("Wybierz jedno źródło CV.", 422)
    source = None
    cv_data = request.cv_data
    template = request.template_id
    spacing = request.spacing_px
    if request.source_document_id:
        source = db.query(Pdf).filter_by(id=request.source_document_id, owner_id=user.id).first()
        if not source:
            service.fail("Nie znaleziono CV.", 404)
        # A live editor may supply a synchronized unsaved snapshot. This never
        # writes back to the source document. Its revision is still monitored.
        cv_data = cv_data or source.cv_data or {}
        template = template or source.template_id or source.origin_template_id
        spacing = spacing or source.spacing_px
    elif request.source_import_id:
        imported = get_owned_snapshot(db, owner_id=user.id, snapshot_id=request.source_import_id)
        if not imported:
            service.fail("Nie znaleziono importu.", 404)
        cv_data = imported.cv_data or {}
    try:
        normalized = normalize_cv_data(cv_data)
        offer = resolve_job_offer(request.job_offer_url, request.job_description) if request.mode == "tailor" else {}
    except (CvDataValidationError, JobOfferError) as exc:
        service.fail(getattr(exc, "user_message", str(exc)), 422)
    profile = service.profile_payload(db, user.id)
    # Imported/freeform CVs may carry obsolete template identifiers. They must
    # choose a current template instead of locking the UI to an unknown one.
    template = template if template in TEMPLATE_LAYOUTS else None
    source_name = f"document:{source.id}" if source else f"import:{request.source_import_id}" if request.source_import_id else f"interview:{session_id}"
    candidates = service.source_facts(normalized, source_name)
    existing_pairs = {(f["path"], f["text"]) for f in profile["facts"]}
    candidates = [fact for fact in candidates if (fact["path"], fact["text"]) not in existing_pairs]
    existing_ids = {fact["id"] for fact in profile["facts"]}
    for fact in candidates:
        if fact["id"] in existing_ids:
            # A selected source changed after its previous import into the
            # profile. Keep both values visible for explicit conflict review.
            fact["id"] += f"-proposal-{session_id[:8]}"
    if request.candidate_notes.strip():
        candidates.append({"id": str(uuid4()), "text": request.candidate_notes.strip(), "context": "Dodatkowe fakty", "kind": "fact", "path": "", "source": source_name})
    row = InterviewSession(id=session_id, owner_id=user.id, revision=1, state={
        "mode": request.mode, "phase": "intake", "create_hash": service.digest(payload),
        "source_document_id": request.source_document_id, "source_revision": source.revision if source else None,
        "source_cv_data": normalized, "template_id": template, "spacing_px": spacing,
        "language": request.language, "offer": offer, "profile_revision": profile["revision"],
        "proposed_facts": candidates, "answers": [], "question": None,
        "question_limit": 5 if request.mode == "tailor" else 8,
        "confirmed": False, "preview": None, "document_id": None, "requirements": [],
    })
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = service.owned_session(db, user.id, session_id)
        if existing.state["create_hash"] != service.digest(payload):
            service.fail("Klucz ponowienia dotyczy innych danych.")
        return service.session_payload(existing)
    logger.info("interview_started mode=%s", request.mode)
    return service.session_payload(row)


@router.get("/ai/interviews")
def list_interviews(offset: int = Query(default=0, ge=0), user=Depends(get_current_user), db=Depends(get_db)):
    """List a bounded page of summaries without downloading complete histories."""
    rows = db.query(InterviewSession).filter_by(owner_id=user.id).order_by(InterviewSession.updated_at.desc()).offset(offset).limit(51).all()
    return {"items": [{"id": row.id, "mode": row.state["mode"], "phase": row.state["phase"], "updated_at": row.updated_at.isoformat(), "document_id": row.state.get("document_id")} for row in rows[:50]], "next_offset": offset + 50 if len(rows) > 50 else None}


@router.get("/ai/interviews/{session_id}")
def get_interview(session_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Resume without spending credits, including after Pro expires."""
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.delete("/ai/interviews/{session_id}")
def delete_interview(session_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    """Delete conversation drafts; confirmed profile facts and PDFs survive."""
    row = service.owned_session(db, user.id, session_id)
    db.delete(row)
    db.commit()
    return {"deleted": True}


@router.post("/ai/interviews/{session_id}/answers")
def answer_interview(session_id: str, request: AnswerWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Save one answer before any further provider request; replay is harmless."""
    row = service.owned_session(db, user.id, session_id)
    for previous in row.state["answers"]:
        if previous["question"]["id"] == request.question_id:
            if previous["answer"] != request.answer or previous["status"] != request.status:
                service.fail("Ta odpowiedź została już zapisana. Popraw informację w podsumowaniu.")
            return service.session_payload(row)
    service.check_versions(db, row, request, source=False)
    state = deepcopy(row.state)
    question = state.get("question")
    if not question or question["id"] != request.question_id:
        service.fail("To pytanie nie jest już aktywne.")
    if request.status == "answered" and not request.answer.strip():
        service.fail("Wpisz odpowiedź lub wybierz pominięcie.", 422)
    state["answers"].append({"question": question, "answer": request.answer, "status": request.status})
    if request.status in {"answered", "no_experience"}:
        state["proposed_facts"].append({
            "id": f"answer-{question['id']}", "text": request.answer.strip() if request.status == "answered" else f"Brak doświadczenia: {question['text']}",
            "context": question["context"] or question["text"], "kind": "fact" if request.status == "answered" else "gap", "path": "", "source": f"interview:{row.id}",
        })
    state["question"] = None
    if not question.get("clarification") or request.status in {"answered", "no_experience"}:
        state["preview"] = None
    state["phase"] = "review" if len(state["answers"]) >= state["question_limit"] else "ready"
    if question.get("clarification"):
        finish_clarification_answer(state)
    service.update_session(db, row, request.revision, state)
    logger.info("interview_answer status=%s", request.status)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/clarify")
def clarify_interview(session_id: str, request: SessionWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Start saved clarification questions without a provider request or charge."""
    row = service.owned_session(db, user.id, session_id)
    service.check_versions(db, row, request)
    state = deepcopy(row.state)
    if state["phase"] == "completed":
        service.fail("To CV zostało już zapisane.", 422)
    start_clarifications(state)
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/skip-clarifications")
def skip_clarifications(session_id: str, request: SessionWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Explicitly defer uncertain details; never treat skipping as lack of experience."""
    row = service.owned_session(db, user.id, session_id)
    service.check_versions(db, row, request)
    state = deepcopy(row.state)
    if state["phase"] != "clarification":
        service.fail("Doprecyzowanie nie jest aktywne.")
    pending = state.get("pending_clarifications", [])
    if state.get("question"):
        pending = [state["question"], *pending]
        state["answers"].append({"question": state["question"], "answer": "", "status": "skipped"})
    state["dismissed_clarifications"] = list(dict.fromkeys([*state.get("dismissed_clarifications", []), *(q["topic"] for q in pending)]))
    state.update(question=None, pending_clarifications=[], phase="review" if state["proposed_facts"] else "preview" if state.get("preview") else "ready")
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/next")
def next_interview(session_id: str, request: SessionWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Run bounded discovery using the shared paid provider boundary."""
    return service.next_question(db, user, service.owned_session(db, user.id, session_id), request)


@router.post("/ai/interviews/{session_id}/confirm")
def confirm_interview(session_id: str, request: ConfirmWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Commit the reviewed profile and consume proposals in one transaction."""
    row = service.owned_session(db, user.id, session_id)
    # Facts can be rescued into the profile even when their source CV changed;
    # subsequent generation still requires a fresh source snapshot.
    service.check_versions(db, row, request, source=False)
    facts = [fact.model_dump() for fact in request.facts]
    profile = service.put_profile(db, user.id, request.profile_revision, facts, commit=False)
    state = deepcopy(row.state)
    state.update(confirmed=True, profile_revision=profile["revision"], proposed_facts=[], preview=None)
    if state["phase"] == "intake":
        state["phase"] = "ready"
    service.update_session(db, row, request.revision, state)
    return {"session": service.session_payload(service.owned_session(db, user.id, session_id)), "profile": profile}


@router.post("/ai/interviews/{session_id}/extend")
def extend_interview(session_id: str, request: SessionWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Opt into five additional questions; never restart completed topics."""
    row = service.owned_session(db, user.id, session_id)
    service.check_versions(db, row, request)
    state = deepcopy(row.state)
    if state["question_limit"] >= 50:
        service.fail("Zakończ ten wywiad i rozpocznij nowy z aktualnym profilem.", 422)
    state.update(question_limit=min(50, len(state["answers"]) + 5), phase="ready", preview=None)
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/source")
def refresh_interview_source(session_id: str, request: SourceRefresh, user=Depends(get_current_user), db=Depends(get_db)):
    """Refresh an explicitly selected source without losing answered questions.

    Current source values become review proposals, never silent profile writes.
    A live editor may supply its unsaved structured state; document ownership
    and saved revision are still resolved from the database.
    """
    row = service.owned_session(db, user.id, session_id)
    profile = service.check_versions(db, row, request, source=False)
    state = deepcopy(row.state)
    if state["phase"] == "completed":
        service.fail("To CV zostało już zapisane. Rozpocznij nowy wywiad.", 422)
    source_id = state.get("source_document_id")
    source = db.query(Pdf).filter_by(id=source_id, owner_id=user.id).first() if source_id else None
    if source_id and not source:
        service.fail("Źródłowe CV zostało usunięte. Wybierz inne źródło w nowym wywiadzie.", 404)
    if request.cv_data is None and source is None:
        service.fail("Brakuje aktualnego źródła CV.", 422)
    raw = request.cv_data if request.cv_data is not None else source.cv_data
    if len(json.dumps(raw).encode()) > 250_000:
        service.fail("Dane źródłowe są zbyt duże.", 413)
    try:
        normalized = normalize_cv_data(raw)
    except CvDataValidationError as exc:
        service.fail(str(exc), 422)
    origin = f"document:{source_id}" if source_id else f"interview:{row.id}"
    pairs = {(fact["path"], fact["text"]) for fact in profile["facts"]}
    proposals = []
    for fact in service.source_facts(normalized, origin):
        if (fact["path"], fact["text"]) not in pairs:
            fact["id"] += f"-refresh-{request.revision}"
            proposals.append(fact)
    # Replace superseded source proposals, preserving answers and manual notes.
    retained = [fact for fact in state["proposed_facts"] if not fact["id"].startswith("src-")]
    template = request.template_id if request.cv_data is not None else source.template_id or source.origin_template_id
    state.update(source_cv_data=normalized, source_revision=source.revision if source else None,
                 template_id=template if template in TEMPLATE_LAYOUTS else None,
                 spacing_px=request.spacing_px if request.cv_data is not None else source.spacing_px,
                 proposed_facts=retained + proposals, confirmed=False, phase="intake", question=None,
                 preview=None, generation_feedback=[], document_title=None, pending_clarifications=[], clarification_round=False)
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/preview")
def preview_interview(session_id: str, request: GenerateWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Generate reviewable content and deterministic layout, preserving source CV."""
    row = service.owned_session(db, user.id, session_id)
    profile = service.check_versions(db, row, request)
    state = deepcopy(row.state)
    if not state["confirmed"] or state["proposed_facts"]:
        service.fail("Zatwierdź lub usuń nowe informacje przed generowaniem.", 422)
    if request.template_id not in TEMPLATE_LAYOUTS:
        service.fail("Wybierz dostępny szablon CV.", 422)
    if state["mode"] == "tailor" and state["template_id"] and request.template_id != state["template_id"]:
        service.fail("Dopasowanie zachowuje szablon źródłowego CV.", 422)
    assert_template_allowed(db, user, request.template_id)
    try:
        normalize_cv_data(service.base_cv(profile), require_name=True)
    except CvDataValidationError as exc:
        service.fail(str(exc), 422)
    # Reuse settled responses from the immediately preceding rejected attempt
    # only after checking the current source and profile versions above.
    recovered = previous_rejected_result(db, row, profile["revision"])
    if recovered:
        response, verification = recovered
    else:
        response = service.paid_model(db, user, row, request, "preview", {
            "task": "Przygotuj pełną treść CV jako fields: path/value/evidence_refs. Podstawą są wyłącznie potwierdzone profile facts; offer to kryteria doboru, nie dowody. Zachowaj wszystkie odrębne fakty bazowego CV, wzmacniaj podsumowanie i punkty. Możesz dodać potwierdzone projekty i umiejętności. Nie mieszaj danych różnych ról i projektów. Ogólna znajomość technologii nie potwierdza jej użycia w konkretnym projekcie. Zachowaj dokładnie kolejność działań, kierunek przekazania raportów i granice odpowiedzialności ze źródła; nie dopisuj relacji przed/po ani odbiorców. Każda liczba musi pochodzić z przywołanych faktów. Zwróć pozostałe braki. Nie generuj geometrii. Dane kontaktowe pozostają dosłowne. Używaj języka language dla całej treści.",
            "allowed_paths": service.PATH.pattern, "profile": profile["facts"], "base_cv": service.base_cv(profile),
            "offer": state["offer"], "language": service.LANGUAGES[state["language"]],
        }, Draft)
        verification = service.paid_model(db, user, row, request, "verify", {
            "task": "Sprawdź niezależnie każdą propozycję wyłącznie względem przywołanych evidence_refs i ograniczeń kind=gap/framing. Wskaż unsupported_paths, jeśli dopisano niepotwierdzoną technologię, wynik, certyfikat, skalę, stanowisko lub własność pracy zespołu; jeśli przeniesiono fakt do innej roli; jeśli usunięto zastrzeżenie lub odrębny fakt bazowego pola. Synonimy i wierne tłumaczenie są dozwolone. Oferta nie jest dowodem. Dla każdej niejasności zwróć też clarifications: path/question. Pytanie po polsku ma neutralnie rozstrzygnąć konkretny brak lub sprzeczność, bez sugerowania kompetencji ani prezentowania hipotezy jako faktu. Np. pytaj, w którym projekcie użyto technologii lub jaka była kolejność przekazywania raportów. Nie pytaj ponownie o potwierdzony brak doświadczenia. Zwróć puste listy tylko gdy wszystkie twierdzenia są uzasadnione.",
            "profile": profile["facts"], "base_cv": service.base_cv(profile), "draft": response["output"]["fields"],
        }, Verification)
    try:
        cv_data, changes, review_notes = assemble_reviewed_draft(
            response["output"], verification["output"], profile, state["language"],
        )
        with use_spacing(state["spacing_px"]):
            elements = generate_resume(request.template_id, cv_data)
        # Template generators return specifications; the normal browser fill
        # assigns element IDs. Server-side creation must assign them itself,
        # once per stored preview, so persistence and later edits can address
        # every generated element without relying on transient array indexes.
        elements = [{**element, "element_id": str(uuid5(NAMESPACE_URL, f"{row.id}:{request.revision}:{index}"))} for index, element in enumerate(elements)]
    except (CvDataValidationError, HTTPException) as exc:
        # Consume rejected output so another attempt uses a fresh operation key.
        message = exc.detail.get("message", "Sprawdź dane CV.") if isinstance(exc, HTTPException) else str(exc)
        state.update(phase="review", preview=None, generation_feedback=[message])
        service.check_versions(db, service.owned_session(db, user.id, session_id), request)
        service.update_session(db, row, request.revision, state)
        return service.session_payload(service.owned_session(db, user.id, session_id))
    service.check_versions(db, service.owned_session(db, user.id, session_id), request)
    pages = max((int(el.get("page", 1)) for el in elements), default=1)
    state.update(phase="preview", question=None, template_id=request.template_id, profile_revision=profile["revision"], usage=response["usage"], preview={
        "cv_data": cv_data, "changes": changes, "remaining_gaps": response["output"]["remaining_gaps"],
        "elements": elements, "pages": pages, "profile_revision": profile["revision"],
        "review_notes": review_notes, "recovered_previous_attempt": bool(recovered),
    })
    state["generation_feedback"] = []
    pending = clarification_queue(row, response["output"], verification["output"], review_notes, profile)
    state["pending_clarifications"] = pending
    if pending:
        state["phase"] = "clarification"
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, session_id))


@router.post("/ai/interviews/{session_id}/document")
def save_interview_document(session_id: str, request: SessionWrite, user=Depends(get_current_user), db=Depends(get_db)):
    """Persist the reviewed preview once using the existing PDF create saga.

    A session-scoped creation key bridges a crash after PDF commit but before
    session update. It also prevents two browser tabs creating two documents.
    """
    row = service.owned_session(db, user.id, session_id)
    key = f"interview-document:{row.id}"
    existing = db.query(Pdf).filter_by(owner_id=user.id, create_idempotency_key=key).first()
    if existing:
        return {"document_id": existing.id}
    profile = service.check_versions(db, row, request)
    state = deepcopy(row.state)
    preview = state.get("preview")
    if state["phase"] != "preview" or not preview or preview["profile_revision"] != profile["revision"]:
        service.fail("Przygotuj aktualny podgląd przed zapisaniem CV.")
    assert_template_allowed(db, user, state["template_id"])
    assert_can_create_project(db, user)
    if not state.get("document_title") or db.query(Pdf).filter_by(owner_id=user.id, title_key=canonical_title_key(state["document_title"])).first():
        offer = state.get("offer") or {}
        role = (offer.get("title") or preview["cv_data"].get("title") or "CV")[:50]
        company = (offer.get("company") or "Profil")[:40]
        title = f"{role} — {company} — {datetime.utcnow().date()}"
        candidate, suffix = title, 2
        while db.query(Pdf).filter_by(owner_id=user.id, title_key=canonical_title_key(candidate)).first():
            candidate = f"{title} ({suffix})"
            suffix += 1
        state["document_title"] = candidate
        # Freeze the title before the external storage saga for stable retries.
        service.update_session(db, row, request.revision, state)
        row = service.owned_session(db, user.id, session_id)
    data = PDFCreateRequest(root=preview["elements"], pdf_title=state["document_title"],
                            pages=preview["pages"], editor_mode="template", template_id=state["template_id"],
                            spacing_px=state["spacing_px"], cv_data=preview["cv_data"])
    result = create_pdf_document(db, user=user, username=user.username, pdf_data=data, idempotency_key=key)
    state.update(phase="completed", document_id=result["pdf_id"])
    service.update_session(db, row, row.revision, state)
    logger.info("interview_completed mode=%s", state["mode"])
    return {"document_id": result["pdf_id"]}
