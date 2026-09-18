"""Exact profile/canvas reconstruction and conservative pre-inference fallback."""
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services import ai_assistant_service as assistant
from app.services.cv_data import normalize_cv_data
from app.services.cv_profile_patches import build_profile_catalog, preserves_field_evidence


BEFORE = "Przygotowywałem 4 raporty w Python, ale nie zarządzałem zespołem."
AFTER = "Przygotowywałem 4 raporty w Pythonie, ale nie zarządzałem zespołem."


def fixture():
    profile = normalize_cv_data({"name": "Alex Example", "summary": BEFORE,
        "experience": [{"title": "Analyst", "company": "Example", "period": "2020–2023",
                        "bullets": ["Wspierałem testy SQL.", "Tworzyłem 3 raporty."]}]})
    elements = [{"element_id": "summary", "category": "textarea", "content": BEFORE},
                {"element_id": "bullets", "category": "textarea", "bulletList": True,
                 "content": "  • Wspierałem testy SQL.\r\n• Tworzyłem 3 raporty.  "}]
    return profile, elements


def envelope(changes):
    return {"message": "Poprawiono opis.", "tips": [], "changes": changes}


def test_reconstructs_exact_canvas_markers_and_profile_without_mutating_input():
    profile, elements = fixture()
    original = deepcopy((profile, elements))
    catalog = build_profile_catalog(profile, elements)
    result = catalog.apply(envelope([{"field_id": "f0", "value": AFTER},
                                    {"field_id": "f2", "value": "Przygotowywałem 3 raporty."}]), action="grammar")
    assert result["updated_cv_data"]["summary"] == AFTER
    assert result["updated_cv_data"]["experience"][0]["bullets"] == ["Wspierałem testy SQL.", "Przygotowywałem 3 raporty."]
    assert result["corrections"] == [
        {"element_id": "summary", "content": AFTER},
        {"element_id": "bullets", "content": "  • Wspierałem testy SQL.\r\n• Przygotowywałem 3 raporty.  "}]
    assert (profile, elements) == original


def test_duplicates_require_explicit_valid_bindings():
    profile, elements = fixture()
    profile["experience"][0]["bullets"][0] = BEFORE
    elements = [elements[0], {"element_id": "other", "category": "textarea", "content": BEFORE}]
    assert build_profile_catalog(profile, elements) is None
    elements[0]["cvDataBindings"] = [{"path": ["summary"]}]
    elements[1]["cvDataBindings"] = [{"path": ["experience", 0, "bullets", 0]}]
    catalog = build_profile_catalog(profile, elements)
    result = catalog.apply(envelope([{"field_id": "f1", "value": AFTER}]), action="grammar")
    assert result["updated_cv_data"]["summary"] == BEFORE
    assert result["corrections"] == [{"element_id": "other", "content": AFTER}]


@pytest.mark.parametrize("change", [
    {"field_id": "unknown", "value": AFTER}, {"field_id": "f0", "value": ""},
    {"field_id": "f0", "value": 3}, {"field_id": "f0", "value": AFTER, "path": ["name"]},
    {"field_id": "f0", "value": AFTER.replace("4", "5")},
    {"field_id": "f0", "value": AFTER.replace("Pythonie", "Java")},
    {"field_id": "f0", "value": AFTER.replace("nie ", "")},
    {"field_id": "f0", "value": AFTER + " [wynik]"},
    {"field_id": "f0", "value": AFTER + "\nNowy akapit."},
])
def test_rejects_entire_invalid_response(change):
    profile, elements = fixture()
    catalog = build_profile_catalog(profile, elements)
    with pytest.raises(ValueError):
        catalog.apply(envelope([change]), action="grammar")
    assert profile["summary"] == BEFORE


def test_repeated_ids_noop_and_shortening_contract():
    catalog = build_profile_catalog(*fixture())
    change = {"field_id": "f0", "value": AFTER}
    with pytest.raises(ValueError, match="repeated"):
        catalog.apply(envelope([change, change]), action="grammar")
    with pytest.raises(ValueError, match="increased"):
        catalog.apply(envelope([change]), action="shorten")
    result = catalog.apply(envelope([]), action="grammar")
    assert result["corrections"] == [] and result["updated_cv_data"] == catalog.profile
    assert result["updated_cv_data"] is not catalog.profile


@pytest.mark.parametrize("path", [["name"], ["missing"], ["experience", -1, "bullets", 0], ["summary", "child"], [True]])
def test_binding_must_name_a_matching_existing_leaf(path):
    profile, elements = fixture()
    elements[0]["cvDataBindings"] = [{"path": path}]
    assert build_profile_catalog(profile, elements) is None


def test_locked_mirror_cannot_be_updated_through_another_element():
    profile, elements = fixture()
    elements.append({**elements[0], "element_id": "locked", "locked": True})
    assert build_profile_catalog(profile, elements) is None
    elements[0]["locked"] = True
    catalog = build_profile_catalog(profile, elements)
    assert ("summary",) not in catalog.fields.values()


def test_readonly_aliases_do_not_make_editable_prose_ambiguous():
    profile, elements = fixture()
    profile["address"] = profile["location"] = "Warszawa"
    elements.append({"element_id": "address", "category": "text", "content": "Warszawa"})
    catalog = build_profile_catalog(profile, elements)
    assert catalog is not None
    assert not any(path in {("address",), ("location",), ("name",)} for path in catalog.fields.values())
    result = catalog.apply(envelope([{"field_id": "f0", "value": AFTER}]), action="grammar")
    assert result["updated_cv_data"]["address"] == "Warszawa"
    assert [item["element_id"] for item in result["corrections"]] == ["summary"]


def test_explicit_readonly_mismatch_still_requires_legacy_inference():
    profile, elements = fixture()
    elements.append({"element_id": "name", "category": "text", "content": "Different name",
                     "cvDataBindings": [{"path": ["name"]}]})
    assert build_profile_catalog(profile, elements) is None


def test_incomplete_mapping_falls_back_before_one_inference():
    profile, elements = fixture()
    elements.append({"element_id": "freeform", "category": "textarea", "content": "Unmapped text"})
    with patch.object(assistant, "_PROFILE_PATCHES_ENABLED", True), \
         patch.object(assistant, "_gpt", return_value=({"message": "No changes", "updated_cv_data": profile}, {})) as provider:
        result = assistant.analyze_action("grammar", elements, cv_data=profile)
    assert result["updated_cv_data"] == profile
    assert provider.call_count == 1
    assert "response_schema" not in provider.call_args.kwargs


def test_invalid_compact_output_settles_usage_without_retry():
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(
        envelope([{"field_id": "unknown", "value": AFTER}]))), finish_reason="stop")],
        usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20, total_tokens=120))
    profile, elements = fixture()
    with patch.object(assistant, "_PROFILE_PATCHES_ENABLED", True), \
         patch.object(assistant._client.chat.completions, "create", return_value=response) as provider:
        with pytest.raises(assistant.AIServiceError) as caught:
            assistant.analyze_action("grammar", elements, cv_data=profile)
    assert provider.call_count == 1
    assert provider.call_args.kwargs["response_format"]["json_schema"]["name"] == "cv_profile_changes_v1"
    assert caught.value.reservation_outcome == "settle_usage"
    assert caught.value.usage["completion_tokens"] == 20


def test_translation_and_disabled_flag_keep_full_profile_format():
    profile, elements = fixture()
    for enabled, action in ((False, "grammar"), (True, "translate")):
        with patch.object(assistant, "_PROFILE_PATCHES_ENABLED", enabled), \
             patch.object(assistant, "_gpt", return_value=({"message": "Done", "updated_cv_data": profile}, {})) as provider:
            assistant.analyze_action(action, elements, cv_data=profile, target_language="en")
        assert "response_schema" not in provider.call_args.kwargs


def test_python_declension_does_not_allow_other_technologies():
    assert preserves_field_evidence(BEFORE, AFTER)
    assert not preserves_field_evidence(BEFORE, AFTER.replace("Pythonie", "Java"))
