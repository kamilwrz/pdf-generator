"""Schedule bounded discovery by CV record, independently of model topic names.

The current evidence defines the queue; saved answers define its progress. No
separate counter can drift on retries, and extending a session never resets an
entry. This module only reads evidence/history and returns question metadata.
"""
from app.core.localisation import ui_language
from app.services.interview_job_analysis import requirement_facts

import hashlib
import re


MAX_ANSWERS = 50
LABELS = {
    "experience": "Doświadczenie zawodowe", "education": "Edukacja",
    "custom_sections": "Projekt lub dodatkowy wpis", "skills": "Umiejętności",
    "languages": "Języki", "notes": "Dodatkowe informacje",
}


def _key(text):
    return " ".join(re.findall(r"\w+", str(text or "").casefold()))


def _record_path(path):
    # Group scalar fields and bullets under their authored record. Custom
    # sections contain multiple projects, so their item index is significant.
    parts = path.strip("/").split("/")
    if len(parts) < 2 or not parts[1].isdigit():
        return None
    if parts[0] in {"experience", "education", "skills", "languages"}:
        return "/" + "/".join(parts[:2])
    if parts[0] == "custom_sections" and len(parts) >= 4 and parts[2] == "items" and parts[3].isdigit():
        return "/" + "/".join(parts[:4])
    return None


def discovery_entries(profile, answers):
    """Return ordered record scopes from confirmed facts without changing them.

    Roles, education and individual custom-section items receive two ordinary
    questions plus at most one follow-up. Skills receive one application
    question per group; languages with a confirmed level need no question.
    Unstructured notes stay one scope per explicit context, never guessed roles.
    Answer-derived facts from this policy cannot create new scopes indefinitely.
    """
    labels = {"experience": "Work experience", "education": "Education", "custom_sections": "Project or additional entry", "skills": "Skills", "languages": "Languages", "notes": "Additional information"} if ui_language.get() == "en" else LABELS
    # Facts created from current scoped discovery or verification answers
    # already belong to that answer's progress. Excluding their IDs prevents
    # either round from creating a fresh unstructured scope for itself. Legacy
    # unscoped answers remain available for conservative context association.
    answered_ids = {
        f"answer-{answer['question']['id']}" for answer in answers
        if answer.get("question", {}).get("id")
        and (answer["question"].get("entry_id") or answer["question"].get("clarification"))
    }
    groups = {}
    for fact in profile["facts"]:
        if fact.get("kind") == "gap" or fact["id"] in answered_ids:
            continue
        path = fact.get("path", "")
        record = _record_path(path)
        if record:
            kind = path.split("/")[1]
            group_id = record
        elif not path:
            kind = "notes"
            context_key = _key(fact.get("context")) or fact["id"]
            group_id = "note:" + hashlib.sha256(context_key.encode()).hexdigest()[:24]
        else:
            continue
        group = groups.setdefault(group_id, {"id": group_id, "kind": kind, "facts": []})
        group["facts"].append(fact)

    entries = []
    for group in groups.values():
        kind, facts = group["kind"], group["facts"]
        if kind == "languages" and any(f.get("path", "").endswith("/level") and f["text"].strip() for f in facts):
            continue
        identities = [f["text"] for field in ("title", "company", "degree", "school", "name", "category", "period", "date")
                      for f in facts if f.get("path") == f"{group['id']}/{field}"]
        label = " · ".join(identities)
        if not label:
            label = facts[0].get("context") or (facts[0]["text"] if len(facts[0]["text"]) <= 150 else labels[kind])
        entries.append({**group, "label": label[:350], "question_count": 1 if kind in {"skills", "languages"} else 2})

    # Account profiles can contain answers from earlier interviews next to the
    # same source record. Share their scheduling scope when context identifies
    # one record; do not ask another two questions under a duplicate note entry.
    # This is a queue association only and never rewrites or merges evidence.
    records = [entry for entry in entries if entry["kind"] != "notes"]
    for note in list(entries):
        if note["kind"] != "notes":
            continue
        target_id = question_entry({"context": note["label"]}, records)
        target = next((record for record in records if record["id"] == target_id), None)
        if target:
            target["facts"] = [*target["facts"], *note["facts"]]
            entries.remove(note)

    # An empty CV still gets a finite conversation about career history. These
    # broad scopes do not claim that an unknown job, project or language exists.
    present = {group["kind"] for group in groups.values()}
    for kind in ("experience", "custom_sections", "skills", "languages"):
        if kind not in present:
            entries.append({"id": f"general:{kind}", "kind": kind, "label": labels[kind], "facts": [], "question_count": 1})
    return entries


def question_entry(question, entries, answers=()):
    """Resolve saved scope IDs, or conservatively attribute a legacy question.

    Historical topic names are not stable identifiers. Only an unambiguous
    context/identity match, fact reference or original follow-up parent binds
    legacy history. This affects scheduling only, never evidence or CV fields.
    """
    ids = {entry["id"] for entry in entries}
    if question.get("entry_id"):
        return question["entry_id"] if question["entry_id"] in ids else None
    parent_id = question.get("follow_up_to")
    if parent_id:
        parent = next((a["question"] for a in answers if a["question"].get("id") == parent_id), None)
        if parent and not parent.get("follow_up_to"):
            return question_entry(parent, entries)
    context = _key(question.get("context", ""))
    text = _key(question.get("text", ""))
    scores = {}
    for entry in entries:
        refs = {f["id"] for f in entry["facts"]}
        if refs & set(question.get("target_fact_ids", [])) or f"answer-{question.get('id')}" in refs:
            scores[entry["id"]] = 100
        # A shared section label ("Projekty") must not obscure a specific
        # project name. Prefer record identities and require a unique best fit.
        labels = {_key(f.get("context", "")): 1 for f in entry["facts"]}
        labels.update({_key(f["text"]): 3 for f in entry["facts"] if f.get("path", "").endswith(("/title", "/company", "/school"))})
        labels[_key(entry["label"])] = 4
        for label, weight in labels.items():
            if label and (label == context or (len(label) >= 3 and any(f" {label} " in f" {value} " for value in (context, text)))):
                scores[entry["id"]] = scores.get(entry["id"], 0) + weight
    best = max(scores.values(), default=0)
    matches = [entry_id for entry_id, score in scores.items() if score == best]
    return matches[0] if len(matches) == 1 else None


def entry_answers(entry, entries, answers):
    """Count persisted discovery answers, excluding the separate verification round."""
    return [a for a in answers if not a["question"].get("clarification")
            and question_entry(a["question"], entries, answers) == entry["id"]]


def _entry_capacity(entry):
    """Return the maximum discovery questions allowed for one queue entry."""
    if entry["kind"] == "requirement":
        return 2
    return 3 if entry["question_count"] == 2 else 1


def next_entry(entries, answers):
    """Choose the first unfinished entry; all answer statuses consume capacity.

    Skipping, not remembering and no experience close this entry immediately.
    Two ordinary questions finish a record or job requirement. Only CV records
    allow a third focused follow-up; topic renaming cannot reopen either kind.
    """
    for entry in entries:
        history = entry_answers(entry, entries, answers)
        ordinary = sum(not a["question"].get("follow_up_to") for a in history)
        maximum = _entry_capacity(entry)
        if any(a["status"] != "answered" for a in history) or len(history) >= maximum or ordinary >= entry["question_count"]:
            continue
        return {**entry, "asked": len(history), "ordinary_asked": ordinary,
                "allow_follow_up": bool(history) and maximum == 3 and len(history) == 1}
    return None


def _planned_question_count(entries, answers):
    """Calculate the live maximum plan from CV scopes and persisted answers.

    Optional focused follow-ups are included until the ordinary second question
    closes their record. A skip, unknown answer or confirmed lack of experience
    closes its scope and reduces the remaining plan. Verification clarifications
    are excluded because they have a separate user-visible counter and budget.
    """
    discovery_answers = [answer for answer in answers if not answer["question"].get("clarification")]
    remaining = 0
    for entry in entries:
        history = entry_answers(entry, entries, discovery_answers)
        if next_entry([entry], history):
            remaining += _entry_capacity(entry) - len(history)
    clarification_count = len(answers) - len(discovery_answers)
    # Discovery and verification share the persisted 50-answer ceiling even
    # though their UI counters are separate. Reserve already consumed
    # clarification slots so the ordinary plan never promises an unreachable
    # final question.
    discovery_ceiling = max(0, MAX_ANSWERS - clarification_count)
    return min(discovery_ceiling, len(discovery_answers) + remaining)


def update_discovery_budget(state, profile):
    """Size initial/resumed rounds for record coverage without resetting history.

    Tailoring uses two slots per unresolved requirement after analysis. Other
    modes use a JSON marker to make record coverage idempotent. New confirmed
    records can increase capacity; normal answer saves cannot. The shared
    session ceiling remains 50 and an explicitly exhausted zero budget stays
    exhausted. No schema migration or provider call is needed.
    """
    if state.get('mode') == 'tailor':
        if not state.get('job_analysis_ready'):
            state['discovery_complete'] = False
            state['discovery_exhausted'] = False
            state['planned_question_count'] = None
            return []
        # Keep only evidence from the selected, confirmed store. Requirement
        # text describes the job, while these facts anchor partial-match probes
        # to the candidate without treating the offer itself as experience.
        entries = [{'id': item['id'], 'kind': 'requirement', 'label': item['text'],
                    'facts': requirement_facts(item, profile),
                    'requirement_kind': item.get('kind', 'required'), 'weight': item.get('weight', 3),
                    'missing_detail': item.get('missing_detail', ''),
                    'question_count': 2, 'status': item['status']}
                   for item in state.get('requirements', []) if item['status'] in {'partial', 'unknown', 'gap'}]
        # Two slots per requirement, never a third model follow-up. Answers remain
        # authoritative across retries, refresh and explicit extension requests.
        remaining = sum(max(0, 2 - len(entry_answers(entry, entries, state['answers'])))
                        for entry in entries if next_entry([entry], entry_answers(entry, entries, state['answers'])))
        state['question_limit'] = min(MAX_ANSWERS, len(state['answers']) + remaining)
        selected = next_entry(entries, state['answers'])
        state['discovery_exhausted'] = len(state['answers']) >= MAX_ANSWERS and selected is not None
        state['discovery_complete'] = selected is None or state['discovery_exhausted']
        state['planned_question_count'] = _planned_question_count(entries, state['answers'])
        return entries
    entries = discovery_entries(profile, state["answers"])
    ids = sorted(entry["id"] for entry in entries)
    if state.get("discovery_entry_ids") != ids and state["question_limit"] > 0:
        remaining = 0
        for entry in entries:
            if next_entry([entry], entry_answers(entry, entries, state["answers"])):
                remaining += (3 if entry["question_count"] == 2 else 1) - len(entry_answers(entry, entries, state["answers"]))
        state["question_limit"] = min(MAX_ANSWERS, max(state["question_limit"], len(state["answers"]) + remaining))
        state["discovery_entry_ids"] = ids
    selected = next_entry(entries, state["answers"])
    state["discovery_exhausted"] = len(state["answers"]) >= MAX_ANSWERS and selected is not None
    state["discovery_complete"] = selected is None or state["discovery_exhausted"]
    state["planned_question_count"] = _planned_question_count(entries, state["answers"])
    clarification_count = sum(bool(answer["question"].get("clarification")) for answer in state["answers"])
    if clarification_count:
        # The stored budget covers both rounds. Reserve clarification answers
        # in addition to the ordinary plan so they cannot silently displace a
        # reachable discovery question below the shared ceiling.
        required_limit = clarification_count + state["planned_question_count"]
        state["question_limit"] = min(MAX_ANSWERS, max(state["question_limit"], required_limit))
    return entries


def scoped_question(candidate, selected, entries, answers, is_fresh):
    """Accept a valid scoped proposal or use a neutral local question, without retry.

    The server owns the entry and displayed context. A wrong/absent scope,
    repeated wording/intent or illegal follow-up cannot terminate discovery or
    switch to an exhausted project. Local fallbacks vary substantive angles
    using the same history as provider guidance, without suggested factual answers.
    """
    from app.services.interview_questions import fallback_question, is_distinct_question

    history = entry_answers(selected, entries, answers)
    if candidate:
        resolved = question_entry(candidate, entries, answers)
        follows = candidate.get("follow_up_to")
        parent_here = any(a["question"].get("id") == follows for a in history)
        valid_follow_up = not follows or (selected["allow_follow_up"] and parent_here)
        named_entry = question_entry({**candidate, "entry_id": None, "follow_up_to": None}, entries)
        # Topic freshness is local to the record; two different employers may
        # legitimately have the same topic name, such as responsibilities.
        if resolved == selected["id"] and named_entry in {None, selected["id"]} and valid_follow_up and is_fresh(candidate, history):
            # Exact wording must also be fresh across the whole conversation.
            if is_distinct_question(candidate, selected, entries, answers):
                return {**candidate, "entry_id": selected["id"], "context": selected["label"][:350]}
    return fallback_question(selected, entries, answers)
