"""Intent diversity, neutral local recovery and bounded repetition regressions."""
from collections import Counter
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from app.core.localisation import ui_language
from app.schemas.interview_schema import Question
from app.services import interview_service as service
from app.services.interview_discovery import next_entry, scoped_question
from app.services.interview_questions import (
    ANGLES, RECENT_WINDOW, fallback_question, is_distinct_question, question_guidance,
)
from test_interviews import environment, create, confirm, version


def record(index=0, kind="custom_sections", label=None, **kwargs):
    """Supply authored identity only so generated questions cannot assume a domain."""
    return {"id": f"/{kind}/{index}", "kind": kind, "label": label or f"Entry {index}",
            "facts": [], "question_count": 1 if kind in {"skills", "languages"} else 2, **kwargs}


def question(entry, text, angle=None, **kwargs):
    return {"entry_id": entry["id"], "text": text, "angle": angle, "topic": "topic",
            "context": entry["label"], "reason": "", "follow_up_to": None, **kwargs}


def answer(question, index=0, text="", status="answered"):
    return {"question": {**question, "id": f"q{index}"}, "answer": text, "status": status}


@pytest.mark.parametrize("language", ["pl", "en"])
@pytest.mark.parametrize("kind", ["experience", "custom_sections", "education", "notes"])
def test_local_conversation_varies_lenses_across_records_and_is_stable_after_resume(language, kind):
    entries = [record(i, kind) for i in range(5)]
    untouched = deepcopy(entries)
    answers = []
    language_token = ui_language.set(language)
    try:
        while selected := next_entry(entries, answers):
            before = deepcopy(answers)
            proposal = scoped_question(None, selected, entries, answers, service.is_fresh_question)
            # JSON roundtrips model a fresh process loading persisted answers.
            assert proposal == fallback_question(selected, entries, json.loads(json.dumps(answers)))
            assert answers == before and entries == untouched
            assert proposal["text"].count("?") == 1
            assert proposal["context"] in proposal["text"]
            assert proposal["angle"] in ANGLES
            Question.model_validate(proposal)
            answers.append(answer(proposal, len(answers), "Potwierdzona informacja."))
        angles = [item["question"]["angle"] for item in answers]
        assert len(answers) == 10
        assert len(set(angles)) >= 6
        assert all(left != right for left, right in zip(angles, angles[1:]))
        for entry in entries:
            own = [item["question"]["angle"] for item in answers if item["question"]["entry_id"] == entry["id"]]
            assert len(own) == len(set(own)) == 2
        joined = " ".join(item["question"]["text"].lower() for item in answers)
        assert not any(word in joined for word in ("samodziel", "osobiście", "independent", "personally", "%", "kpi"))
        assert ("which" in joined or "what" in joined) if language == "en" else "jak" in joined
    finally:
        ui_language.reset(language_token)


@pytest.mark.parametrize("language", ["pl", "en"])
def test_entire_mocked_provider_fallback_interview_keeps_diverse_saved_questions(environment, language):
    client, _, _, _ = environment
    client.headers.update({"Accept-Language": language})
    cv = {"name": "Anna Nowak", "experience": [{"title": f"Role {index}"} for index in range(4)],
          "skills": ["Writing"], "languages": [{"name": "English", "level": "B2"}],
          "custom_sections": [{"title": "Activities", "items": [{"title": "Atlas"}]}]}
    session = confirm(client, create(client, mode="enrich", include_profile=False, cv_data=cv))
    seen = []

    def empty_model(system, body, **kwargs):
        payload = json.loads(body)
        assert "question_guidance" in payload
        seen.append(payload["question_scope"]["id"])
        return {"questions": [], "requirements": []}, {"cost_pln_estimate": .01}

    with patch.object(service, "_gpt", side_effect=empty_model) as provider:
        for _ in range(20):
            response = client.post(f"/ai/interviews/{session['id']}/next", json=version(session, session["profile_revision"]))
            assert response.status_code == 200, response.text
            session = response.json()
            if session["discovery_complete"]:
                break
            proposed = session["question"]
            assert proposed["entry_id"] == seen[-1]
            response = client.post(f"/ai/interviews/{session['id']}/answers", json={
                **version(session, session["profile_revision"]), "question_id": proposed["id"],
                "answer": "Confirmed information." if language == "en" else "Potwierdzona informacja.", "status": "answered",
            })
            assert response.status_code == 200, response.text
            session = client.get(f"/ai/interviews/{session['id']}").json()
        assert session["phase"] == "review" and session["discovery_complete"]
        questions = [item["question"] for item in session["answers"]]
        assert provider.call_count == len(questions) == 11
        assert len({item["angle"] for item in questions}) >= 6
        assert all(count <= 2 for count in Counter(item["entry_id"] for item in questions).values())


@pytest.mark.parametrize("first,rephrased,angle", [
    ("Jaki był Twój osobisty wkład w Atlas?", "Co wykonałeś samodzielnie w Atlas?", "contribution"),
    ("Co robiłaś osobiście w Atlas?", "Za co byłaś odpowiedzialna w Atlas?", "contribution"),
    ("What was your contribution to Atlas?", "What were you personally responsible for in Atlas?", "contribution"),
    ("Jaki efekt miała praca nad Atlas?", "Jakie rezultaty przyniosła praca nad Atlas?", "outcome"),
    ("What result did Atlas achieve?", "What was the outcome of Atlas?", "outcome"),
])
def test_legacy_paraphrases_cannot_reopen_same_record_by_renaming_topic(first, rephrased, angle):
    entry = record(label="Atlas")
    historical = question(entry, first)
    historical.pop("entry_id")
    history = [answer(historical)]
    candidate = question(entry, rephrased, topic="completely-new-topic")
    assert angle in question_guidance(entry, [entry], history)["covered_angles"]
    assert not is_distinct_question(candidate, entry, [entry], history)
    # A false provider angle cannot hide recognizable repeated wording.
    assert not is_distinct_question({**candidate, "angle": "learning"}, entry, [entry], history)


@pytest.mark.parametrize("language,first,second", [
    ("pl", "Co robiłeś samodzielnie w Atlas?", "Co wykonałeś osobiście w Orion?"),
    ("en", "What was your personal contribution to Atlas?", "What were you personally responsible for in Orion?"),
])
def test_generic_ownership_paraphrase_is_not_fresh_just_because_record_changed(language, first, second):
    entries = [record(0, label="Atlas"), record(1, label="Orion")]
    history = [answer(question(entries[0], first))]
    assert not is_distinct_question(question(entries[1], second), entries[1], entries, history)


@pytest.mark.parametrize("angle", ["quality", "approach", "learning"])
def test_same_angle_ordinary_question_is_rejected_even_when_words_differ(angle):
    entry = record(label="Atlas")
    history = [answer(question(entry, "First question?", angle))]
    candidate = question(entry, "A different question with completely different wording?", angle)
    assert not is_distinct_question(candidate, entry, [entry], history)


def test_label_removal_catches_same_question_for_another_employer():
    entries = [record(0, "experience", "Archivist · Birch"), record(1, "experience", "Coordinator · Cedar")]
    history = [answer(question(entries[0], "How was a task in ‘Archivist · Birch’ judged to be done correctly?", "quality"))]
    duplicate = question(entries[1], "How was a task in ‘Coordinator · Cedar’ judged to be done correctly?", "quality")
    assert not is_distinct_question(duplicate, entries[1], entries, history)


@pytest.mark.parametrize("first,reply,followup,angle", [
    ("Co sprawdzałeś w Atlas?", "Porównywałem raport z rejestrem zamówień.", "Jak porównywałeś raport z rejestrem zamówień w Atlas?", "quality"),
    ("What results did Atlas achieve?", "A survey showed readers understood the guide.", "How did the survey measure readers' understanding in Atlas?", "outcome"),
    ("Jaki był Twój wkład w Atlas?", "Opracowałem harmonogram warsztatów.", "Co obejmowało Twoje opracowanie harmonogramu warsztatów w Atlas?", "contribution"),
])
def test_focused_follow_up_can_revisit_lens_using_a_concrete_answer_detail(first, reply, followup, angle):
    entry = record(label="Atlas")
    history = [answer(question(entry, first, angle), text=reply)]
    candidate = question(entry, followup, angle, follow_up_to="q0")
    assert is_distinct_question(candidate, entry, [entry], history)
    assert scoped_question(candidate, next_entry([entry], history), [entry], history, service.is_fresh_question)["follow_up_to"] == "q0"


def test_same_lens_follow_up_must_add_detail_instead_of_rephrasing_ownership():
    entry = record(label="Atlas")
    history = [answer(question(entry, "Co robiłeś samodzielnie w Atlas?", "contribution"), text="Opracowałem harmonogram warsztatów.")]
    candidate = question(entry, "Jaki był Twój osobisty wkład w Atlas?", "contribution", follow_up_to="q0")
    assert not is_distinct_question(candidate, entry, [entry], history)


def test_specific_questions_can_share_recent_angle_across_records():
    entries = [record(0, label="Atlas"), record(1, label="Orion")]
    history = [answer(question(entries[0], "How did you check survey response completeness in Atlas?", "quality"))]
    candidate = question(entries[1], "What inspection criteria applied to repaired furniture in Orion?", "quality")
    assert is_distinct_question(candidate, entries[1], entries, history)


def test_recent_diversity_does_not_permanently_ban_a_template():
    entries = [record(i, label=f"Record {i}") for i in range(RECENT_WINDOW + 2)]
    historical = question(entries[0], "What was the purpose of ‘Record 0’?", "problem")
    history = [answer(historical)]
    history += [answer(question(entries[i + 1], f"Different focused query {i}?", "learning"), i + 1) for i in range(RECENT_WINDOW)]
    candidate = question(entries[-1], f"What was the purpose of ‘Record {len(entries) - 1}’?", "problem")
    assert is_distinct_question(candidate, entries[-1], entries, history)
    assert "problem" not in question_guidance(entries[-1], entries, history)["recent_angles"]


def test_exact_historical_wording_remains_rejected_outside_recent_window():
    entries = [record(i) for i in range(RECENT_WINDOW + 2)]
    historical = question(entries[0], "Which task best illustrates your work?", "overview")
    history = [answer(historical)]
    history += [answer(question(entries[i + 1], f"Different focused query {i}?", "learning"), i + 1) for i in range(RECENT_WINDOW)]
    candidate = question(entries[-1], "Which task best illustrates your work?", "overview")
    assert not is_distinct_question(candidate, entries[-1], entries, history)


@pytest.mark.parametrize("text", ["Jak sprawdzałeś poprawność wyników w Atlas?", "How did you check the results in Atlas?"])
def test_checking_correctness_does_not_infer_an_outcome_question(text):
    entry = record(label="Atlas")
    history = [answer(question(entry, "What result did Atlas achieve?", "outcome"))]
    candidate = question(entry, text, "quality")
    assert is_distinct_question(candidate, entry, [entry], history)


@pytest.mark.parametrize("status", ["answered", "skipped", "unknown", "no_experience"])
def test_guidance_tracks_asked_intent_without_claiming_answer_evidence(status):
    entry = record(label="Atlas")
    history = [answer(question(entry, "What was the outcome of Atlas?"), text="I do not remember.", status=status)]
    before = deepcopy((entry, history))
    guidance = question_guidance(entry, [entry], history)
    assert guidance["covered_angles"] == ["outcome"]
    assert "not evidence" in guidance["history_meaning"]
    assert (entry, history) == before


def test_clarification_history_does_not_consume_lenses_or_trigger_repetition():
    entry = record(label="Atlas")
    candidate = question(entry, "What result did Atlas achieve?", "outcome")
    history = [answer({**candidate, "clarification": True})]
    guidance = question_guidance(entry, [entry], history)
    assert guidance["covered_angles"] == guidance["recent_angles"] == []
    assert is_distinct_question(candidate, entry, [entry], history)


@pytest.mark.parametrize("language", ["pl", "en"])
@pytest.mark.parametrize("status", ["unknown", "partial", "gap"])
def test_long_requirement_fallback_has_valid_contract_and_respects_explicit_gap(language, status):
    entry = record(kind="requirement", label="Qualification " + "a" * 985, status=status)
    language_token = ui_language.set(language)
    try:
        first = fallback_question(entry, [entry], [])
        second = fallback_question(entry, [entry], [answer(first)])
        for proposal in (first, second):
            Question.model_validate(proposal)
            assert proposal["context"] == entry["label"][:350]
            assert proposal["context"] in proposal["text"]
            assert len(proposal["text"]) <= 1000
        assert first["angle"] != second["angle"]
        if status == "gap":
            assert all("pokrewn" in item["text"] if language == "pl" else "related" in item["text"] for item in (first, second))
    finally:
        ui_language.reset(language_token)


@pytest.mark.parametrize("language", ["pl", "en"])
def test_empty_cv_invitations_and_language_skill_questions_are_single_and_neutral(language):
    language_token = ui_language.set(language)
    try:
        entries = [record(i, kind, id=f"general:{kind}") for i, kind in enumerate(("experience", "custom_sections", "skills", "languages"))]
        entries += [record(8, "skills", "Ceramics"), record(9, "languages", "French")]
        for entry in entries:
            proposal = fallback_question(entry, entries, [])
            assert proposal["context"] in proposal["text"]
            assert proposal["text"].count("?") == 1
            assert "independently" not in proposal["text"] and "samodzielnie" not in proposal["text"]
    finally:
        ui_language.reset(language_token)


@pytest.mark.parametrize("language", ["pl", "en"])
@pytest.mark.parametrize("kind", ["experience", "custom_sections", "education", "notes", "skills", "requirement"])
def test_duplicate_labels_beyond_bank_size_still_have_unique_rendered_questions(language, kind):
    entries = [record(index, kind, "Same title", status="unknown") for index in range(12)]
    answers = []
    language_token = ui_language.set(language)
    try:
        while selected := next_entry(entries, answers):
            proposal = fallback_question(selected, entries, answers)
            Question.model_validate(proposal)
            assert proposal["text"] not in {item["question"]["text"] for item in answers}
            assert proposal["text"].count("?") == 1
            answers.append(answer(proposal, len(answers)))
        assert len(answers) == sum(entry["question_count"] for entry in entries)
        for entry in entries:
            angles = [item["question"]["angle"] for item in answers if item["question"]["entry_id"] == entry["id"]]
            assert len(angles) == len(set(angles))
        assert any(item["question"]["text"].startswith("Entry " if language == "en" else "Wpis ") for item in answers)
    finally:
        ui_language.reset(language_token)


@pytest.mark.parametrize("language", ["pl", "en"])
def test_long_requirements_with_same_display_prefix_never_repeat_exact_question(language):
    entries = [record(index, "requirement", "X" * 350 + str(index), status="unknown") for index in range(8)]
    answers = []
    language_token = ui_language.set(language)
    try:
        while selected := next_entry(entries, answers):
            proposal = fallback_question(selected, entries, answers)
            Question.model_validate(proposal)
            assert proposal["context"] == "X" * 350
            assert proposal["text"] not in {item["question"]["text"] for item in answers}
            answers.append(answer(proposal, len(answers)))
        assert len(answers) == 16
    finally:
        ui_language.reset(language_token)


@pytest.mark.parametrize("language", ["pl", "en"])
def test_legacy_history_cannot_collide_with_emergency_entry_and_question_ordinals(language):
    entry = record(0, "languages", "French")
    language_token = ui_language.set(language)
    try:
        first = fallback_question(entry, [entry], [])
        history = [answer(first)]
        second = fallback_question(entry, [entry], history)
        history.append(answer(second, 1))
        # Reproduce arbitrary legacy wording, including the emergency prefix,
        # even though normal language scopes cannot request this many questions.
        for index in range(2, 6):
            candidate = fallback_question(entry, [entry], history)
            history.append(answer(candidate, index))
        texts = [item["question"]["text"] for item in history]
        assert len(texts) == len(set(texts))
        assert all(entry["label"] in text and text.count("?") == 1 for text in texts)
        assert "question" in texts[-1] if language == "en" else "pytanie" in texts[-1]
    finally:
        ui_language.reset(language_token)
