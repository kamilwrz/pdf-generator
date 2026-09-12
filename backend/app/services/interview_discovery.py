"""Schedule bounded discovery by CV record, independently of model topic names.

The current evidence defines the queue; saved answers define its progress. No
separate counter can drift on retries, and extending a session never resets an
entry. This module only reads evidence/history and returns question metadata.
"""
from app.core.localisation import ui_language

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
    answered_ids = {
        f"answer-{a['question']['id']}" for a in answers
        if a.get("question", {}).get("entry_id")
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


def next_entry(entries, answers):
    """Choose the first unfinished entry; all answer statuses consume capacity.

    Skipping, not remembering and no experience close this entry immediately.
    Two ordinary questions finish a record. One focused follow-up may consume
    its third slot, but model topic renaming cannot reopen the record.
    """
    for entry in entries:
        history = entry_answers(entry, entries, answers)
        ordinary = sum(not a["question"].get("follow_up_to") for a in history)
        maximum = 3 if entry["question_count"] == 2 else 1
        if any(a["status"] != "answered" for a in history) or len(history) >= maximum or ordinary >= entry["question_count"]:
            continue
        return {**entry, "asked": len(history), "ordinary_asked": ordinary,
                "allow_follow_up": bool(history) and maximum == 3 and len(history) == 1}
    return None


def update_discovery_budget(state, profile):
    """Size initial/resumed rounds for record coverage without resetting history.

    The JSON marker makes this additive upgrade idempotent. New confirmed
    records can increase capacity; normal answer saves cannot. The shared
    session ceiling remains 50 and an explicitly exhausted zero budget stays
    exhausted. No schema migration or provider call is needed.
    """
    entries = discovery_entries(profile, state["answers"])
    ids = sorted(entry["id"] for entry in entries)
    if state.get("discovery_entry_ids") != ids and state["question_limit"] > 0:
        remaining = 0
        for entry in entries:
            if next_entry([entry], entry_answers(entry, entries, state["answers"])):
                remaining += (3 if entry["question_count"] == 2 else 1) - len(entry_answers(entry, entries, state["answers"]))
        state["question_limit"] = min(MAX_ANSWERS, max(state["question_limit"], len(state["answers"]) + remaining))
        state["discovery_entry_ids"] = ids
    state["discovery_complete"] = next_entry(entries, state["answers"]) is None
    return entries


def scoped_question(candidate, selected, entries, answers, is_fresh):
    """Accept a valid scoped proposal or use a neutral local question, without retry.

    The server owns the entry and displayed context. A wrong/absent scope,
    repeated wording or illegal follow-up cannot terminate discovery or switch
    to an exhausted project. Local fallbacks supply no suggested factual answer.
    """
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
            if _key(candidate["text"]) not in {_key(a["question"].get("text", "")) for a in answers}:
                return {**candidate, "entry_id": selected["id"], "context": selected["label"]}
    kind, label = selected["kind"], selected["label"]
    second = selected["ordinary_asked"] > 0
    if selected["id"].startswith("general:"):
        text = {
            "experience": "Jakie masz doświadczenie zawodowe, w tym praktyki lub wolontariat? Podaj role i miejsca pracy.",
            "custom_sections": "Jakie projekty własne lub edukacyjne chcesz opisać w CV? Podaj ich nazwy i krótko cel.",
            "skills": "Które umiejętności chcesz uwzględnić w CV i do czego ich używasz?",
            "languages": "Jakie języki znasz i jak oceniasz swój poziom w każdym z nich?",
        }[kind]
    elif kind == "languages":
        text = f"Jak oceniasz swój poziom języka: {label}? Możesz podać poziom A1–C2 lub opisać, w jakich sytuacjach się nim posługujesz."
    elif kind == "skills":
        text = f"W jakim zadaniu wykorzystujesz umiejętności z wpisu „{label}” i co potrafisz wykonać samodzielnie?"
    elif second:
        text = f"Jaki efekt swojej pracy lub nauki możesz potwierdzić we wpisie „{label}”? Jeśli nie masz mierzalnego wyniku, opisz konkretny przykład."
    else:
        text = f"Co konkretnie robiłeś lub robiłaś we wpisie „{label}” i za co odpowiadałeś lub odpowiadałaś osobiście?"
    if ui_language.get() == "en":
        if selected["id"].startswith("general:"):
            text = {
                "experience": "What work experience do you have, including placements or volunteering? List your roles and workplaces.",
                "custom_sections": "Which personal or educational projects would you like to describe in your CV? Give their names and a brief purpose.",
                "skills": "Which skills would you like to include in your CV, and what do you use them for?",
                "languages": "Which languages do you speak, and how would you assess your level in each?",
            }[kind]
        elif kind == "languages":
            text = f"How would you assess your level in {label}? You can give an A1–C2 level or describe the situations in which you use it."
        elif kind == "skills":
            text = f"In what task do you use the skills from ‘{label}’, and what can you do independently?"
        elif second:
            text = f"What result of your work or studies can you substantiate for ‘{label}’? If you do not have a measurable result, give a specific example."
        else:
            text = f"What exactly did you do in ‘{label}’, and what were you personally responsible for?"
    # A legacy/model question may already use the fallback's exact wording.
    # Select a bounded alternative without spending another model request.
    seen = {_key(a["question"].get("text", "")) for a in answers}
    if _key(text) in seen:
        text = f"Co jeszcze warto dopisać do wpisu „{label}” w zakresie {'efektów' if second else 'Twoich zadań'}? Wystarczy jeden konkretny przykład."
        if ui_language.get() == "en":
            topic = "results" if second else "your tasks"
            text = f"What else should we add to ‘{label}’ about {topic}? One specific example is enough."
    if _key(text) in seen:
        position = next(i for i, entry in enumerate(entries, 1) if entry['id'] == selected['id'])
        text = f"Wpis {position}, „{label}”: jaki {'efekt' if second else 'zakres własnej pracy'} chcesz jeszcze opisać?"
        if ui_language.get() == "en":
            topic = "result" if second else "scope of your own work"
            text = f"Entry {position}, ‘{label}’: what {topic} would you still like to describe?"
    reason = "We will complete this entry, then move on to the next information." if ui_language.get() == "en" else "Uzupełnimy ten wpis, a następnie przejdziemy do kolejnych informacji."
    return {"entry_id": selected["id"], "topic": f"entry:{selected['id']}:{'result' if second else 'contribution'}"[:150],
            "text": text, "context": label, "reason": reason, "follow_up_to": None}
