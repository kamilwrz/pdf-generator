"""Prompt integration regressions; mocked outputs do not measure model quality.

The policy must reach every writing surface without changing each surface's
response, language, scope, or metering contract. Assertions inspect the actual
provider boundary instead of testing only imported policy constants.
"""
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from app.services import ai_assistant_service as assistant
from app.services import cv_editorial_policy as policy
from app.services.cv_data import normalize_cv_data
from app.services.scoped_ai import ScopedContent, review_scoped_content, validate_scoped_result


USAGE = {"cost_pln_estimate": 0.03, "model": "gpt-5.6-terra"}
RAW = "pomagałem zespołowi testować 4 scenariusze w Python"
EDITED = "Wspierałem zespół w testowaniu 4 scenariuszy w Python."


def text_element(element_id="summary", content=RAW, **overrides):
    return {"element_id": element_id, "category": "textarea", "content": content,
            "left": 40, "top": 100, "width": 400, "height": 60, "page": 1,
            "fontSize": 11, "color": "#2B2B2B", **overrides}


def capture_action(action, *, canonical=False, elements=None, **options):
    """Run the real dispatcher and return its provider call and public result."""
    source = normalize_cv_data({"name": "Anna Rojek", "summary": RAW})
    updated = {**source, "summary": EDITED}
    provider_response = {
        "message": "Poprawiono opis.", "tips": [],
        "corrections": [{"element_id": "summary", "content": EDITED,
                         "left": 999, "fontSize": 99}],
        "updated_cv_data": updated,
    }
    supplied_elements = elements if elements is not None else [text_element()]
    before = deepcopy((supplied_elements, source))
    with patch.object(assistant, "_gpt", return_value=(provider_response, USAGE)) as provider:
        result = assistant.analyze_action(
            action=action, elements=supplied_elements,
            **({"cv_data": source} if canonical else {}), **options,
        )
    provider.assert_called_once()
    assert (supplied_elements, source) == before
    return provider.call_args, result, updated


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
@pytest.mark.parametrize("action", ["language", "improve"])
def test_style_actions_share_one_policy_and_keep_review_and_metering_contracts(canonical, action):
    call, result, updated = capture_action(action, canonical=canonical)
    prompt = "\n".join(call.args)
    assert prompt.count(policy.STYLE_REVIEW_POLICY) == 1
    assert prompt.count(policy.STYLE_INSTRUCTION) == 1
    assert prompt.count(policy.FACT_PRESERVATION) == 1
    assert prompt.count(policy.STYLE_EXAMPLES) == 1
    assert (policy.IMPROVE_INSTRUCTION in prompt) is (action == "improve")
    assert call.kwargs["action"] == action
    assert result["usage"] == USAGE
    # A wording response cannot turn into a layout/style mutation even when
    # the provider supplies fields that belong to the separate chat action.
    assert result["corrections"] == [{"element_id": "summary", "content": EDITED}]
    if canonical:
        assert result["updated_cv_data"] == updated
        assert "updated_cv_data" in prompt
        assert json.dumps(updated["name"], ensure_ascii=False) in prompt
    else:
        assert "updated_cv_data" not in result


@pytest.mark.parametrize("action", ["language", "improve", "shorten"])
def test_legacy_writing_actions_include_editable_targets_after_the_fortieth(action):
    elements = [text_element(f"paragraph-{index}", f"Opis zadania numer {index}.")
                for index in range(50)]
    call, _, _ = capture_action(action, elements=elements)
    # Plain CV text cannot identify a patch target: its element_id must also
    # reach the provider, including the end of a multi-page document.
    assert '"element_id": "paragraph-49"' in call.args[1]
    assert "Opis zadania numer 49." in call.args[1]


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
@pytest.mark.parametrize("action", ["language", "improve"])
def test_style_prompts_do_not_reintroduce_invented_evidence_instructions(canonical, action):
    call, _, _ = capture_action(action, canonical=canonical)
    prompt = "\n".join(call.args)
    for obsolete_instruction in (
        "dodaj zastępczą metrykę",
        "KWANTYFIKUJ WSZYSTKO",
        "Jeśli oryginał nie zawiera liczby, dodaj sensowny symbol zastępczy",
        "rzeczywistymi nazwami, jeśli można je wywnioskować",
        "Unikaj: Pomagałem/Pomagam, Wspierałem/Wspieram",
    ):
        assert obsolete_instruction not in prompt


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
def test_global_shortening_uses_quality_rubric_without_forbidding_condensation(canonical):
    call, result, _ = capture_action("shorten", canonical=canonical)
    prompt = "\n".join(call.args)
    assert prompt.count(policy.STYLE_INSTRUCTION) == 1
    assert policy.FACT_PRESERVATION not in prompt
    assert policy.STYLE_EXAMPLES not in prompt
    assert policy.IMPROVE_INSTRUCTION not in prompt
    assert call.kwargs["action"] == "shorten"
    assert result["usage"] == USAGE


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
@pytest.mark.parametrize("action", ["language", "improve"])
def test_style_provider_receives_both_read_only_element_flags(canonical, action):
    elements = [text_element(), text_element("locked-body", "Tekst zablokowany.", locked=True),
                text_element("fixed-heading", "DOŚWIADCZENIE", fixedToPage=True)]
    call, _, _ = capture_action(action, canonical=canonical, elements=elements)
    # Protected text may still establish context, but the model must receive
    # its protection state to apply the action's read-only target instructions.
    assert '"element_id": "locked-body"' in call.args[1]
    assert '"element_id": "fixed-heading"' in call.args[1]
    assert call.args[1].count('"locked": true') == 1
    assert call.args[1].count('"fixedToPage": true') == 1


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
@pytest.mark.parametrize("action", ["grammar", "translate"])
def test_narrow_grammar_and_translation_do_not_become_style_rewrites(canonical, action):
    call, result, _ = capture_action(action, canonical=canonical, target_language="en")
    prompt = "\n".join(call.args)
    assert policy.STYLE_INSTRUCTION not in prompt
    assert policy.STYLE_REVIEW_POLICY not in prompt
    assert policy.IMPROVE_INSTRUCTION not in prompt
    assert call.kwargs["action"] == action
    assert result["usage"] == USAGE
    if action == "translate":
        assert result["cv_language"] == "en"


@pytest.mark.parametrize("canonical", [False, True], ids=["canvas", "profile"])
@pytest.mark.parametrize("action", ["language", "improve", "shorten"])
def test_shared_quality_does_not_override_the_selected_document_language(canonical, action):
    call, result, _ = capture_action(action, canonical=canonical, cv_language="de")
    prompt = "\n".join(call.args)
    assert result["cv_language"] == "de"
    assert assistant._content_language_directive("de") in prompt


@pytest.mark.parametrize("action", ["language", "improve", "shorten"])
def test_scoped_quality_preserves_input_scope_and_separate_achievement_examples(action):
    scope = ScopedContent.model_validate({
        "kind": "entry", "section_type": "experience", "language": "pl",
        "records": [{"id": "role-1", "context": ["Tester", "2020–2023"]}],
        "fragments": [{"id": "bullet-1", "record_id": "role-1",
                       "kind": "description", "content": RAW}],
    })
    # The improvement action retains its teaching example with blanks, but
    # that example must remain separate from applicable, fact-preserving text.
    examples = [{"fragment_id": "bullet-1", "template": "Testy Python: [potwierdzony rezultat].",
                 "questions": ["Jaki rezultat został potwierdzony?"]}] if action == "improve" else []
    replacement = "Wspierałem testowanie 4 scenariuszy w Python." if action == "shorten" else EDITED
    raw = {"message": "Poprawiono opis.", "scoped_corrections": [
        {"fragment_id": "bullet-1", "before": RAW, "content": replacement}],
        "achievement_templates": examples}
    with patch.object(assistant, "_model_for_action", return_value="gpt-5.6-terra"), \
         patch.object(assistant, "_gpt", return_value=(raw, USAGE)) as provider:
        result = review_scoped_content(action, scope)
    provider.assert_called_once()
    system, data = provider.call_args.args
    assert system.count(policy.STYLE_INSTRUCTION) == 1
    assert system.count(policy.FACT_PRESERVATION) == 1
    if action != "shorten":
        assert system.count(policy.STYLE_REVIEW_POLICY) == 1
    else:
        assert "KAŻDY odrębny fakt" in system
    assert (policy.IMPROVE_INSTRUCTION in system) is (action == "improve")
    assert json.loads(data) == scope.model_dump()
    assert provider.call_args.kwargs["action"] == action
    assert result == {**raw, "usage": USAGE, "cv_language": "pl"}
    assert "corrections" not in result and "updated_cv_data" not in result


@pytest.mark.parametrize("message,correction", [
    ("Popraw styl opisu", {"content": EDITED}),
    ("Zmień kolor tekstu na #123456", {"color": "#123456"}),
])
def test_chat_gets_the_shared_wording_policy_and_retains_its_design_commands(message, correction):
    raw = {"in_scope": True, "message": "Zmieniono element.", "corrections": [
        {"element_id": "summary", **correction, "left": 900, "page": 5}]}
    with patch.object(assistant, "_gpt", return_value=(raw, USAGE)) as provider:
        result = assistant.analyze_action(
            action="chat", elements=[text_element()], message=message,
            history=[{"role": "user", "content": "Pracuję nad opisem doświadczenia."}],
        )
    assert "\n".join(provider.call_args.args).count(policy.STYLE_REVIEW_POLICY) == 1
    assert provider.call_args.kwargs["action"] == "chat"
    assert "Pracuję nad opisem doświadczenia." in provider.call_args.args[1]
    assert result["corrections"] == [{"element_id": "summary", **correction}]
    assert result["usage"] == USAGE


@pytest.mark.parametrize("before,after,accepted", [
    ("robię raporty w sql i power bi", "Przygotowuję raporty w SQL i Power BI.", True),
    ("robię raporty w SQL i PowerBI", "Przygotowuję raporty w SQL i Power BI.", True),
    ("robię raporty w SQL", "Przygotowuję raporty w SQL i Python.", False),
    ("robię raporty w SQL i Power BI", "Przygotowuję raporty w Power BI.", False),
    ("robię 4 raporty w 2024", "Przygotowuję 40 raportów w 2024.", False),
    ("robię 4 raporty w 2024", "Przygotowuję raporty w 2024.", False),
    ("Angielski C1", "Angielski C2", False),
    ("Testowałem wersję v2.", "Testowałem wersję v3.", False),
])
def test_scoped_tool_normalization_preserves_lexical_guards(before, after, accepted):
    scope = ScopedContent.model_validate({
        "kind": "entry", "section_type": "experience", "language": "pl",
        "records": [{"id": "role-1", "context": []}],
        "fragments": [{"id": "bullet-1", "record_id": "role-1",
                       "kind": "description", "content": before}],
    })
    raw = {"message": "Poprawiono opis.", "achievement_templates": [],
           "scoped_corrections": [{"fragment_id": "bullet-1", "before": before, "content": after}]}
    if accepted:
        assert validate_scoped_result(raw, scope, "language") == raw
    else:
        with pytest.raises(ValueError, match="Protected numbers or technology names changed"):
            validate_scoped_result(raw, scope, "language")
