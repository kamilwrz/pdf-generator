"""Diversify discovery questions without changing evidence, budgets or model usage.

Angles describe the intent of a question that was asked, never a confirmed fact
or a resolved knowledge gap. The deterministic fallback has no knowledge of a
profession beyond the authored record kind, so its questions avoid invented
tools, achievements, failures, audiences and individual responsibility.
"""
from collections import Counter
from difflib import SequenceMatcher
import re
import unicodedata

from app.core.localisation import ui_language


ANGLES = (
    "overview", "problem", "approach", "decision", "constraint", "quality",
    "collaboration", "learning", "outcome", "contribution", "application", "proficiency",
)
RECENT_WINDOW = 6

# Each lens asks for one piece of information. In particular, a result, a
# numeric measure and personal ownership are not required in every answer.
# Tuple order is Polish, English; placeholders are authored labels, not prompts.
_RECORD_QUESTIONS = {
    "experience": {
        "overview": ("Które zadanie najlepiej przybliża charakter pracy w „{label}”?", "Which task best illustrates the nature of the work in ‘{label}’?"),
        "approach": ("Jak wyglądał przebieg typowego zadania w „{label}”?", "What did a typical task in ‘{label}’ involve, from start to finish?"),
        "quality": ("Po czym rozpoznawano, że zadanie w „{label}” jest wykonane poprawnie?", "How was a task in ‘{label}’ judged to be done correctly?"),
        "problem": ("Jakiej potrzebie służyła praca opisana we wpisie „{label}”?", "What need did the work described in ‘{label}’ address?"),
        "constraint": ("Co wyznaczało sposób wykonywania zadań w „{label}”?", "What shaped the way tasks were carried out in ‘{label}’?"),
        "learning": ("Jaka wiedza okazała się przydatna przy zadaniach w „{label}”?", "What knowledge proved useful for the tasks in ‘{label}’?"),
        "collaboration": ("Jaką rolę odgrywał kontakt z innymi osobami w pracy opisanej jako „{label}”?", "What part did contact with other people play in the work described as ‘{label}’?"),
        "decision": ("Który element pracy w „{label}” wymagał najwięcej namysłu?", "Which aspect of the work in ‘{label}’ required the most thought?"),
        "outcome": ("Jaki efekt pracy we wpisie „{label}” możesz potwierdzić?", "What outcome of the work in ‘{label}’ can you substantiate?"),
    },
    "custom_sections": {
        "problem": ("Jaki był cel przedsięwzięcia opisanego jako „{label}”?", "What was the purpose of the activity described as ‘{label}’?"),
        "approach": ("Od czego zaczęła się praca nad „{label}”?", "How did work on ‘{label}’ begin?"),
        "quality": ("Po czym można ocenić poprawność wykonania „{label}”?", "How can the quality of the work on ‘{label}’ be assessed?"),
        "learning": ("Czego nauczyła Cię praca nad „{label}”?", "What did working on ‘{label}’ teach you?"),
        "decision": ("Który element „{label}” wymagał najwięcej namysłu?", "Which aspect of ‘{label}’ required the most thought?"),
        "constraint": ("Co wyznaczało zakres przedsięwzięcia „{label}”?", "What determined the scope of ‘{label}’?"),
        "overview": ("Jak można opisać przebieg przedsięwzięcia „{label}”?", "How would you describe the course of the activity ‘{label}’?"),
        "collaboration": ("Jaką rolę odgrywał kontakt z innymi osobami podczas pracy nad „{label}”?", "What part did contact with other people play while working on ‘{label}’?"),
        "outcome": ("Co powstało w ramach „{label}”?", "What was produced as part of ‘{label}’?"),
    },
    "education": {
        "learning": ("Który temat nauki w „{label}” warto szerzej opisać w CV?", "Which area of study in ‘{label}’ deserves more detail in your CV?"),
        "application": ("Czy masz przykład wykorzystania wiedzy zdobytej w „{label}”?", "Do you have an example of using knowledge gained in ‘{label}’?"),
        "approach": ("Jaki sposób nauki był pomocny w „{label}”?", "What approach to learning was helpful in ‘{label}’?"),
        "quality": ("W jaki sposób sprawdzano wiedzę lub umiejętności w „{label}”?", "How were knowledge or skills assessed in ‘{label}’?"),
        "decision": ("Co wpłynęło na wybór nauki w „{label}”?", "What influenced your choice to study in ‘{label}’?"),
        "overview": ("Jak wyglądało typowe zadanie podczas nauki w „{label}”?", "What was a typical assignment while studying in ‘{label}’?"),
        "constraint": ("Co wyznaczało sposób pracy nad zadaniami w „{label}”?", "What shaped the way you approached assignments in ‘{label}’?"),
        "collaboration": ("Jaką rolę odgrywał kontakt z innymi osobami podczas nauki w „{label}”?", "What part did contact with other people play while studying in ‘{label}’?"),
    },
    "notes": {
        "overview": ("Co warto doprecyzować w informacji „{label}”, aby była zrozumiała dla czytelnika CV?", "What would clarify the information ‘{label}’ for someone reading your CV?"),
        "application": ("Czy informacja „{label}” wiąże się z konkretnym zadaniem, które warto opisać?", "Is the information ‘{label}’ connected with a specific task worth describing?"),
        "problem": ("Jaki cel wiąże się z informacją „{label}”?", "What purpose is connected with the information ‘{label}’?"),
        "approach": ("Czy informacja „{label}” wiąże się ze sposobem pracy, który warto przybliżyć?", "Is the information ‘{label}’ connected with a way of working worth explaining?"),
        "learning": ("Jaką wiedzę warto opisać w związku z „{label}”?", "What knowledge is worth describing in connection with ‘{label}’?"),
        "quality": ("Czy masz przykład, który pomoże czytelnikowi ocenić informację „{label}”?", "Do you have an example that would help a reader assess the information ‘{label}’?"),
        "constraint": ("Jakie okoliczności są istotne dla zrozumienia informacji „{label}”?", "What circumstances matter for understanding the information ‘{label}’?"),
        "decision": ("Co sprawia, że informacja „{label}” jest istotna dla Twojego celu zawodowego?", "What makes the information ‘{label}’ relevant to your career goal?"),
    },
    "skills": {
        "application": ("W jakim zadaniu wykorzystujesz umiejętności z wpisu „{label}”?", "In what task do you use the skills listed in ‘{label}’?"),
        "proficiency": ("Jaki rodzaj zadań najlepiej pokazuje Twój poziom umiejętności „{label}”?", "What kind of task best illustrates your level in ‘{label}’?"),
        "learning": ("Jak zdobywałeś lub zdobywałaś umiejętności z wpisu „{label}”?", "How did you develop the skills listed in ‘{label}’?"),
        "quality": ("Jak sprawdzasz poprawność zadania wykorzystującego „{label}”?", "How do you check the correctness of a task that uses ‘{label}’?"),
        "approach": ("Od czego zaczynasz zadanie wymagające umiejętności „{label}”?", "How do you begin a task that calls for ‘{label}’?"),
        "overview": ("Który obszar umiejętności „{label}” znasz najlepiej?", "Which area of ‘{label}’ do you know best?"),
        "problem": ("Do jakiego rodzaju problemów stosujesz „{label}”?", "What kind of problems do you apply ‘{label}’ to?"),
    },
    "languages": {
        "proficiency": ("Jak opiszesz swój obecny poziom języka „{label}”?", "How would you describe your current level in ‘{label}’?"),
        "application": ("W jakich sytuacjach potrafisz posługiwać się językiem „{label}”?", "In what situations can you use ‘{label}’?"),
    },
    "requirement": {
        "application": ("Czy masz przykład zadania związanego z wymaganiem „{label}”?", "Do you have an example of a task related to the requirement ‘{label}’?"),
        "approach": ("Jak wyglądało zadanie, w którym było potrzebne „{label}”?", "What did a task that called for ‘{label}’ involve?"),
        "learning": ("Jak zdobywałeś lub zdobywałaś wiedzę związaną z „{label}”?", "How did you gain knowledge related to ‘{label}’?"),
        "proficiency": ("Który obszar wymagania „{label}” znasz najlepiej?", "Which area of the requirement ‘{label}’ do you know best?"),
        "quality": ("Jak sprawdzano poprawność zadań związanych z „{label}”?", "How was the correctness of tasks related to ‘{label}’ checked?"),
        "constraint": ("Jakie okoliczności warto uwzględnić przy opisie Twojej styczności z „{label}”?", "What context matters when describing your exposure to ‘{label}’?"),
        "overview": ("Czy masz doświadczenie związane z wymaganiem „{label}”?", "Do you have experience related to the requirement ‘{label}’?"),
    },
}

# General scopes are invitations to supply missing history, not assertions that
# an unknown job, project, skill or language exists. An explicit requirement gap
# needs optional transferable context instead of the same denied experience.
_GENERAL_QUESTIONS = {
    "experience": ("overview", ("„{label}”: jakie role zawodowe, praktyki lub formy wolontariatu chcesz uwzględnić w CV?", "‘{label}’: what work roles, placements or volunteering would you like to include in your CV?")),
    "custom_sections": ("overview", ("„{label}”: jakie projekty własne lub edukacyjne chcesz uwzględnić w CV?", "‘{label}’: what personal or educational projects would you like to include in your CV?")),
    "skills": ("overview", ("„{label}”: jakie umiejętności chcesz uwzględnić w CV?", "‘{label}’: what skills would you like to include in your CV?")),
    "languages": ("proficiency", ("„{label}”: jak opiszesz poziom znajomości języków, które chcesz umieścić w CV?", "‘{label}’: how would you describe your proficiency in the languages you want to list in your CV?")),
}
_GAP_QUESTIONS = {
    "application": ("Czy masz doświadczenie z pokrewnymi zadaniami, które warto rozważyć przy wymaganiu „{label}”?", "Do you have experience with related tasks worth considering for the requirement ‘{label}’?"),
    "learning": ("Czy w Twojej edukacji jest temat pokrewny wymaganiu „{label}”, który warto opisać?", "Is there a topic in your education related to the requirement ‘{label}’ that is worth describing?"),
    "overview": ("Czy chcesz dodać inne potwierdzone informacje istotne dla wymagania „{label}”?", "Would you like to add any other confirmed information relevant to the requirement ‘{label}’?"),
}
_UNKNOWN_REQUIREMENT_QUESTIONS = {
    "application": _RECORD_QUESTIONS["requirement"]["application"],
    "learning": ("Czy zdobywałeś lub zdobywałaś wiedzę związaną z wymaganiem „{label}”?", "Have you studied anything related to the requirement ‘{label}’?"),
    "proficiency": ("Jak oceniasz swoją znajomość obszaru „{label}”?", "How would you assess your familiarity with ‘{label}’?"),
}


def _normalize(value):
    text = unicodedata.normalize("NFKD", str(value or "").casefold().replace("ł", "l"))
    return " ".join(re.findall(r"\w+", "".join(c for c in text if not unicodedata.combining(c))))


def _question_angles(question):
    """Read intent metadata; conservatively recognize old ownership/results asks.

    Explicit metadata never turns the question or its suggested answer into
    evidence. Obvious wording is checked even with metadata to prevent a renamed
    angle from hiding the same old ownership or outcome question.
    """
    angles = [question["angle"]] if question.get("angle") in ANGLES else []
    text = _normalize(question.get("text"))
    patterns = {
        "contribution": r"\b(samodziel\w*|osobisc\w*|osobist\w*|independen\w*|personally)\b|\b(?:twoj\w*|wlasn\w*) (?:wklad|udzial|odpowiedzialn\w*)\b|\byour (?:(?:own|personal) )?(?:contribution|responsibilit\w*)\b|\byour (?:own|personal) work\b|\b(?:za co|jak\w* (?:zadania|zakres)) odpowiad\w*\b|\b(?:byles|bylas|jestes) odpowiedzialn\w*\b|\byou\b.*\b(?:responsible|contribut\w*)\b",
        "outcome": r"\b(?:jaki\w*|co|jak)\b.*\b(?:efekt\w*|rezultat\w*|wynik\w*)\b|\b(?:what|which|how)\b.*\b(?:results?|outcomes?|impact)\b",
    }
    for angle, pattern in patterns.items():
        # Checking whether results are correct is a quality question, not an
        # automatic request for an achievement just because it says "results".
        if angle == "outcome" and re.search(r"\b(?:sprawdz\w*|weryfik\w*|poprawn\w*|check\w*|correct\w*|validat\w*|quality)\b", text):
            continue
        if angle not in angles and re.search(pattern, text):
            angles.append(angle)
    return angles


def _discovery_answers(answers):
    return [a for a in answers if not a.get("question", {}).get("clarification")]


def _entry_history(selected, entries, answers):
    # Import at call time because discovery uses this module for final selection.
    # Record attribution stays centralized, including conservative legacy rules.
    from app.services.interview_discovery import entry_answers
    return entry_answers(selected, entries, _discovery_answers(answers))


def _bank(selected):
    if selected["id"].startswith("general:") and selected["kind"] in _GENERAL_QUESTIONS:
        angle, question = _GENERAL_QUESTIONS[selected["kind"]]
        return {angle: question}
    if selected["kind"] == "requirement" and selected.get("status") == "gap":
        return _GAP_QUESTIONS
    if selected["kind"] == "requirement" and selected.get("status") != "partial":
        return _UNKNOWN_REQUIREMENT_QUESTIONS
    return _RECORD_QUESTIONS.get(selected["kind"], _RECORD_QUESTIONS["notes"])


def question_guidance(selected, entries, answers):
    """Return JSON-ready intent preferences derived solely from saved questions.

    Same-record coverage avoids spending its ordinary second slot on the same
    lens. The latest six questions supply a soft cross-record preference, so an
    older lens is never permanently banned. No answer, fact or input is changed.
    """
    covered = list(dict.fromkeys(angle for item in _entry_history(selected, entries, answers)
                                for angle in _question_angles(item["question"])))
    recent = [angle for item in _discovery_answers(answers)[-RECENT_WINDOW:]
              for angle in _question_angles(item["question"])]
    counts = Counter(recent)
    priorities = list(_bank(selected))
    # Stable sorting preserves the record-specific order when recency ties.
    preferred = sorted((angle for angle in priorities if angle not in covered), key=lambda angle: counts[angle])
    return {
        "preferred_angles": preferred,
        "covered_angles": covered,
        "recent_angles": recent,
        "history_meaning": "Question intents already asked; not evidence, confirmed absence, or proof that the topic is resolved.",
    }


def _template(text, entries):
    """Remove authored record identities before comparing question wording."""
    normalized = " " + _normalize(text) + " "
    # Requirement labels can be longer than the UI context. Compare both forms
    # so a long repeated label cannot dominate the wording similarity score.
    labels = {_normalize(label) for entry in entries for label in (entry["label"], entry["label"][:350])}
    for entry in entries:
        labels.update(_normalize(fact.get("text")) for fact in entry.get("facts", [])
                      if fact.get("path", "").endswith(("/title", "/company", "/school", "/degree", "/name", "/category", "/period", "/date")))
    # Longest-first keeps a combined label from being only partially erased.
    for label in sorted(labels - {""}, key=len, reverse=True):
        normalized = normalized.replace(" " + label + " ", " ")
    return " ".join(normalized.split())


def _near_duplicate(left, right):
    if left == right:
        return True
    if not left or not right:
        return False
    words_left, words_right = set(left.split()), set(right.split())
    overlap = len(words_left & words_right) / len(words_left | words_right)
    return overlap >= .82 or SequenceMatcher(None, left, right).ratio() >= .88


_GENERIC_WORDS = set("""
    a an the and or of on in at by to for from with as is was were are did do does
    what which how when where would could can you your yours own personal personally
    independent independently responsible responsibility responsibilities contribution contributions
    result results outcome outcomes impact work working task tasks role project activity
    activities example examples specific specifically exactly actual actually another
    detail details describe explain demonstrate substantiate achieved achieve achievement
    z ze w we na nad o do od dla i lub albo czy co jak jaki jaka jakie jakich jakim
    jakiego jakiej czym kto ktory ktora ktore ktorych ktorym ile kiedy gdzie ten ta to
    tego tej tym te sa jest byl byla bylo byly byc sie przy przez oraz jeszcze
    ty twoj twoja twoje twojego twojej twoich tobie ciebie ci cie sam sama osobiscie
    osobisty osobista osobiste osobistego osobista samodzielnie samodzielny samodzielna
    wlasny wlasna wlasne wlasnego wklad udzial odpowiedzialnosc odpowiadales odpowiadalas
    robiles robilas zrobiles zrobilas wykonales wykonalas wykonywales wykonywalas
    praca pracy prace prac zadanie zadania zadaniu zadan projekt projektu projekcie
    rola roli wpis wpisie wpisu dzialania dzialan dzialanie przedsiewziecie przedsiewziecia
    efekt efekty efektow wynik wyniki wynikow rezultat rezultaty rezultatow
    konkretny konkretna konkretne konkretnie przyklad przyklady opisz opisac powiedziec
    pokazac pokazuje pokaz potwierdzic potwierdzisz faktycznie rzeczywiscie dodatkowo
    najwazniejszy najwazniejsze najwazniejsza osiagnales osiagnelas osiagniecia sukces
""".split())


def _detail_tokens(text):
    # Short stems tolerate common Polish inflections without pretending to be
    # a semantic classifier. This is only a conservative repetition heuristic.
    return {token[:5] if len(token) > 5 else token for token in _normalize(text).split()
            if len(token) >= 3 and token not in _GENERIC_WORDS}


def _focused_follow_up(candidate, previous, selected, history, entries):
    """Require a new, grounded detail before repeating a lens in a follow-up.

    Grounding here means shared vocabulary with an authored fact or saved answer;
    it never verifies the question's premise or promotes that text into evidence.
    The discovery scheduler separately checks parent identity and slot limits.
    """
    current = _detail_tokens(_template(candidate["text"], entries))
    already_asked = set().union(*(_detail_tokens(_template(q.get("text", ""), entries)) for q in previous))
    source_text = " ".join([fact.get("text", "") for fact in selected.get("facts", [])]
                           + [item.get("answer", "") for item in history if item.get("status") == "answered"])
    grounded = _detail_tokens(_template(source_text, entries))
    return bool((current - already_asked) & grounded)


def is_distinct_question(candidate, selected, entries, answers):
    """Reject obvious repeated intentions or wording without a provider retry.

    Ordinary questions use a new angle for the record. A permitted follow-up may
    revisit an angle when it adds a grounded detail. Across records only the last
    six questions affect template rejection; specific questions sharing an angle
    remain valid. This bounded lexical policy is not a semantic guarantee.
    """
    if not str(candidate.get("text", "")).strip():
        return False
    all_answers = _discovery_answers(answers)
    if any(_normalize(candidate["text"]) == _normalize(item["question"].get("text", "")) for item in all_answers):
        return False
    history = _entry_history(selected, entries, answers)
    questions = [item["question"] for item in history]
    angles = set(_question_angles(candidate))
    related = [question for question in questions if angles & set(_question_angles(question))]
    if related and (not candidate.get("follow_up_to") or not _focused_follow_up(candidate, related, selected, history, entries)):
        return False
    text = _template(candidate["text"], entries)
    recent = [item["question"] for item in all_answers[-RECENT_WINDOW:]]
    if any(_near_duplicate(text, _template(question.get("text", ""), entries)) for question in [*questions, *recent]):
        return False
    # Ownership/result paraphrases were common in historical sessions. Renaming
    # either a topic or its record must not make a generic repeat look specific.
    common = angles & {"contribution", "outcome"}
    if common and not _detail_tokens(text):
        for question in recent:
            if common & set(_question_angles(question)) and not _detail_tokens(_template(question.get("text", ""), entries)):
                return False
    return True


def fallback_question(selected, entries, answers):
    """Build one neutral, localized Question using the existing record capacity.

    Saved questions determine a stable preference order, including after resume.
    This function does not update status, counters or evidence and never makes
    a model call. Label/context limits apply to long job requirements as well.
    """
    label = str(selected.get("label", ""))[:350]
    bank = _bank(selected)
    guidance = question_guidance(selected, entries, answers)
    preferred = guidance["preferred_angles"]
    order = [*preferred, *(angle for angle in bank if angle not in preferred)]
    english = ui_language.get() == "en"
    reason = ("This detail will help describe the entry in your CV." if english
              else "Ten szczegół pomoże opisać wpis w CV.")
    choices = [{"entry_id": selected["id"], "topic": f"entry:{selected['id']}:{angle}"[:150],
                "angle": angle, "text": bank[angle][int(english)].format(label=label),
                "context": label, "reason": reason, "follow_up_to": None} for angle in order]
    distinct = next((choice for choice in choices if is_distinct_question(choice, selected, entries, answers)), None)
    if distinct:
        return distinct

    # Different source records can legitimately have identical labels. Once
    # their finite bank has been used, a stable entry number distinguishes the
    # scope while preserving an unasked local lens. Only cross-record template
    # diversity is relaxed here; record capacity remains the scheduler's job.
    history = _entry_history(selected, entries, answers)
    local_choice = next((choice for choice in choices if is_distinct_question(choice, selected, entries, history)), choices[0])
    position = next((index for index, entry in enumerate(entries, 1) if entry["id"] == selected["id"]), 1)
    prefix = f"Entry {position}" if english else f"Wpis {position}"
    seen = {_normalize(item["question"].get("text", "")) for item in _discovery_answers(answers)}
    # Legacy history can already contain the numbered wording. At most one
    # candidate is consumed per saved question, so len(seen) + 1 distinct
    # renderings guarantee fresh exact text without random wording or retries.
    for offset in range(len(seen) + 1):
        qualifier = "" if offset == 0 else (f", question {offset}" if english else f", pytanie {offset}")
        text = f"{prefix}{qualifier}: {local_choice['text']}"
        if _normalize(text) not in seen:
            return {**local_choice, "text": text}
    raise AssertionError("A bounded question ordinal must produce unused wording")
