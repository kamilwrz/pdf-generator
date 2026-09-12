"""Apply explicit human decisions to a verified preview without calling AI."""
from copy import deepcopy
from uuid import NAMESPACE_URL, uuid5

from app.core.localisation import message
from app.services import interview_service as service
from app.services.ai_service import generate_resume
from app.services.cv_generator_primitives import use_spacing
from app.services.interview_recovery import _dependent_scope
from app.services.interview_clarification import _context


def review_preview(db, user, row, request):
    """Reject one proposal or save its complete user-authored replacement.

    The current preview, source and evidence revisions must match. A rejection
    restores the original field (or omits an addition), including dependent
    generated content when record identity is rejected. A correction becomes a
    cited, unbound framing fact in the selected store; original CV facts remain
    unchanged. Rendering and evidence validation precede the atomic write.
    """
    profile = service.check_versions(db, row, request)
    state = deepcopy(row.state)
    preview = state.get("preview")
    if state["phase"] != "preview" or not preview or preview["profile_revision"] != profile["revision"]:
        service.fail(message('interview_prepare_an_up_to_date_preview_before_saving'))
    field = next((field for field in preview["changes"] if field["path"] == request.path), None)
    if field is None:
        service.fail(message('interview_this_question_is_no_longer_active'))
    facts = deepcopy(profile["facts"])
    if request.value is None:
        scope = _dependent_scope(request.path)
        fields = [field for field in preview["changes"]
                  if field["path"] != scope and not field["path"].startswith(scope + "/")]
        kept_refs = {ref for field in fields for ref in field["evidence_refs"]}
        removed_refs = {ref for field in preview["changes"] if field not in fields for ref in field["evidence_refs"]}
        facts = [fact for fact in facts if not (fact["id"] in removed_refs - kept_refs
                 and fact.get("source") == f"interview:{row.id}:review")]
    else:
        if not request.value.strip():
            service.fail(message('interview_enter_an_answer_or_choose_to_skip'), 422)
        fact_id = "review-" + service.digest([row.id, request.path])[:32]
        # The complete replacement is explicit user evidence, not an AI
        # suggestion. Do not silently attach it to the source CV field.
        fact = {"id": fact_id, "text": request.value.strip(), "kind": "framing", "path": "",
                "context": _context(service.base_cv(profile), request.path), "question": "", "source": f"interview:{row.id}:review"}
        facts = [f for f in facts if f["id"] != fact_id] + [fact]
        replacement = {"path": request.path, "value": fact["text"], "evidence_refs": [fact_id]}
        # Identity data require a field-bound literal source. Such changes are
        # deliberately kept in the existing source editor, not this prose form.
        if request.path.strip("/") in service.IDENTITY:
            service.fail(message('contact_and_identity_details_must_remain_consistent_with'), 422)
        fields = [replacement if f["path"] == request.path else f for f in preview["changes"]]
    checked = {**profile, "facts": service.validate_facts(facts)}
    cv_data, changes = service.assemble_draft({"fields": fields}, checked, state["language"])
    with use_spacing(state["spacing_px"]):
        elements = generate_resume(state["template_id"], cv_data)
    elements = [{**element, "element_id": str(uuid5(NAMESPACE_URL, f"{row.id}:{request.revision}:review:{index}"))}
                for index, element in enumerate(elements)]
    if facts != profile["facts"]:
        if state["evidence_scope"] == "profile":
            profile = service.put_profile(db, user.id, request.profile_revision, facts, commit=False)
        else:
            profile = {"revision": request.profile_revision + 1, "facts": checked["facts"]}
            state["session_profile"] = profile
        state["profile_revision"] = profile["revision"]
    state["preview"] = {**preview, "cv_data": cv_data, "changes": changes, "elements": elements,
                        "pages": max((int(e.get("page", 1)) for e in elements), default=1),
                        "profile_revision": profile["revision"], "recovered_previous_attempt": False}
    state["document_title"] = None
    # User corrections invalidate the old restore point. Refit their geometry
    # for free, without silently rewriting an explicitly approved replacement.
    from app.services.interview_fit import initialise_fit
    initialise_fit(state, allow_shorten=False, profile=checked)
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, row.id))
