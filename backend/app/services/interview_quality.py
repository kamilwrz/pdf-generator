"""Evidence-aware discovery planning without editing the candidate's answers.

Provider assessments are scheduling metadata, never facts. They are obtained
inside the existing next-question call, validated, and persisted with that turn.
The first round reserves eight main questions and ten answers including probes;
only an explicit extension may enlarge it. Verification has its own counter.
"""
import re

from app.core.localisation import ui_language


INCOMPLETE = {"partial", "off_topic", "contradictory"}
FIRST_ROUND = 10
MAIN_QUESTIONS = 8
QUALITY_TASK = """
Najpierw oceń ostatnią zwykłą odpowiedź jako answer_assessment (question_id):
concrete — odpowiada na pytanie konkretnie, partial — tylko częściowo,
off_topic — omija poszukiwany szczegół, contradictory — przeczy potwierdzonym
informacjom, unknown — użytkownik nie wie lub nie pamięta. Bez odpowiedzi: null.
Oceniaj informację, nie długość, gramatykę ani formalność. Krótkie 'telefonicznie'
może w pełni odpowiedzieć o kanał kontaktu. 'Z właściwymi instytucjami' nie podaje
nazwy instytucji. missing_detail nazywa jedną niewiadomą, nie sugerowaną odpowiedź.
Sprzeczność wymaga neutralnego rozstrzygnięcia; nie wybieraj wersji za użytkownika.

question_candidates jest uporządkowaną kolejką dozwolonych zakresów. Możesz zwrócić
completed_scopes tylko dla wpisów już wystarczająco opisanych w potwierdzonych
faktach i odpowiedziach: podaj ich evidence_refs i konkretny powód zakończenia.
Samo zadanie pytania nie zamyka luki. Ogólny opis studiów lub 'Office' nie jest
dowodem konkretnego zastosowania. Nie powtarzaj zastosowania narzędzia opisanego
już w doświadczeniu. Nie zamykaj zakresu z nadal niepełną lub sprzeczną odpowiedzią.
Przy rozstrzygniętym braku albo 'nie pamiętam' uszanuj zakończenie wątku.

Po ocenie wybierz pierwszy niezakończony zakres z question_candidates. Jeśli
ostatnia odpowiedź jest partial/off_topic/contradictory i można dopytać, zamiast
kolejnego pytania głównego wyjaśnij ten brak: follow_up_to wskazuje jej pytanie,
topic pozostaje ten sam. Nie dopytuj po dopytaniu. Dopytanie zużywa wspólny budżet.
Jeżeli wszystkie zakresy są wyczerpane, zwróć questions=[]. Nie wypełniaj limitu
pytaniami o nieważne szczegóły. Nie sugeruj instytucji, dat, narzędzi ani osiągnięć.
"""


def discovery_history(state):
    """Return ordinary saved answers; verification never consumes main slots."""
    return [a for a in state["answers"] if not a["question"].get("clarification")]


def literal_answer_status(answer, status):
    """Recognise explicit standalone answer meanings while preserving raw text.

    Longer answers can contain usable facts next to uncertainty; do not classify
    them by substring or infer lack of experience from a negation.
    """
    text = " ".join(re.findall(r"\w+", answer.casefold()))
    if status == "answered" and text in {
        "nie wiem", "nie pamiętam", "nie pamietam", "nie przypominam sobie",
        "i don t know", "i do not know", "i don t remember", "i do not remember",
    }:
        return "unknown"
    if status == "answered" and text in {
        "nie mam doświadczenia", "nie mam takiego doświadczenia", "nie mam doswiadczenia",
        "nie mam takiego doswiadczenia", "i have no experience", "i don t have that experience",
    }:
        return "no_experience"
    if status == "answered" and text in {"nie dotyczy", "not applicable"}:
        return "skipped"
    return status


def _scope_digest(entry, refs, catalog):
    from app.services.interview_service import digest
    # Reference values and the record snapshot bind completion to current facts.
    # Editing/deleting evidence invalidates it, but unrelated answers do not.
    return digest({"record": entry["facts"], "cited": [catalog.get(ref) for ref in refs]})


def adaptive_entries(state, profile, entries):
    """Decorate scopes with validated completion and the remaining main budget.

    This changes only the scheduling view. Saved answers and confirmed evidence
    remain untouched, including resumed sessions longer than the new first round.
    """
    from app.services.interview_discovery import entry_answers
    history = discovery_history(state)
    catalog = {fact["id"]: fact for fact in profile["facts"]}
    main_count = sum(not a["question"].get("follow_up_to") for a in history)
    state.setdefault("discovery_limit", max(FIRST_ROUND, len(history)))
    state.setdefault("discovery_main_limit", max(MAIN_QUESTIONS, main_count))
    reviews = {review["entry_id"]: review for review in state.get("scope_reviews", [])}
    decorated = []
    for entry in entries:
        local = entry_answers(entry, entries, history)
        last = local[-1] if local else None
        assessment = (last or {}).get("assessment", {})
        reviewed = reviews.get(entry["id"])
        complete = bool(reviewed and reviewed["evidence_digest"] == _scope_digest(entry, reviewed["evidence_refs"], catalog))
        # A follow-up can clarify the last original answer only once per scope.
        # An absent assessment leaves room for review on the next requested call.
        probe = bool(last and not last["question"].get("follow_up_to")
                     and not any(a["question"].get("follow_up_to") for a in local)
                     and last["status"] == "answered"
                     and assessment.get("status") not in {"concrete", "unknown", "unassessed"})
        closed = complete or any(a.get("answer_meaning", a["status"]) != "answered"
                                 or a.get("assessment", {}).get("status") == "unknown" for a in local)
        decorated.append({**entry, "adaptive": True, "closed": closed,
                          "main_available": main_count < state["discovery_main_limit"],
                          "probe_available": probe,
                          "follow_up_required": probe and assessment.get("status") in INCOMPLETE,
                          "last_answer": last})
    # Source flattening sorts keys alphabetically. Scheduling must not inherit
    # that incidental order. Keep authored order within each section.
    priority = {"experience": 0, "custom_sections": 1, "skills": 2, "notes": 3, "education": 4, "languages": 5}
    return sorted(decorated, key=lambda entry: (not bool(entry["facts"]), priority[entry["kind"]]))


def apply_discovery_review(state, profile, entries, output):
    """Validate the provider's assessment references before changing the queue.

    Unknown IDs, gap-only support, duplicate reviews and incomplete scopes cannot
    close records. No model judgement enters the evidence store or mutates text.
    """
    from app.services.interview_discovery import entry_answers
    history = discovery_history(state)
    assessment = output.get("answer_assessment")
    if assessment and history:
        last = history[-1]
        if (assessment["question_id"] == last["question"]["id"]
                and last.get("answer_meaning", last["status"]) == "answered"
                and (assessment["status"] not in INCOMPLETE or assessment["missing_detail"].strip())):
            last["assessment"] = assessment
    legacy_probe = any(q.get("follow_up_to") == history[-1]["question"]["id"]
                       for q in output.get("questions", [])) if history else False
    if history and history[-1]["status"] == "answered" and not legacy_probe:
        # Historical cached outputs have no assessment. They cannot justify a
        # probe or a claim of completeness; use remaining ordinary slots only.
        history[-1].setdefault("assessment", {"status": "unassessed"})
    catalog = {fact["id"]: fact for fact in profile["facts"]}
    existing = {review["entry_id"]: review for review in state.get("scope_reviews", [])}
    proposed = output.get("completed_scopes", [])
    for review in proposed:
        entry = next((e for e in entries if e["id"] == review["entry_id"]), None)
        refs = review["evidence_refs"]
        if not entry or sum(r["entry_id"] == entry["id"] for r in proposed) != 1:
            continue
        local = entry_answers(entry, entries, history)
        if local and local[-1].get("assessment", {}).get("status") in INCOMPLETE:
            continue
        own_refs = {f["id"] for f in entry["facts"]} | {f"answer-{a['question']['id']}" for a in local}
        if (not review["reason"].strip() or not refs or not own_refs.intersection(refs)
                or any(ref not in catalog or catalog[ref]["kind"] != "fact" for ref in refs)):
            continue
        existing[entry["id"]] = {**review, "evidence_digest": _scope_digest(entry, refs, catalog)}
    state["scope_reviews"] = list(existing.values())


def follow_up_question(selected):
    """Return a neutral probe tied to the original prompt, without inventing detail."""
    parent = selected["last_answer"]["question"]
    english = ui_language.get() == "en"
    text = (f"Can you give one specific detail answering this question: {parent['text']}"
            if english else f"Czy możesz podać jeden konkretny szczegół odpowiadający na pytanie: {parent['text']}")
    return {"entry_id": selected["id"], "topic": parent["topic"], "angle": parent.get("angle"),
            "text": text[:1000], "context": selected["label"][:350],
            "reason": ("This will clarify the missing detail. You can skip this follow-up." if english else
                       "To wyjaśni brakujący szczegół. Możesz pominąć to dopytanie."),
            "follow_up_to": parent["id"]}
