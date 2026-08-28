"""Regression coverage for canonical profile translation."""
from __future__ import annotations

from unittest.mock import patch

from app.services.ai_assistant_service import (
    _rewrite_profile_content,
    _translate_cv,
    analyze_action,
)
from app.services.cv_data import normalize_cv_data


def test_translate_returns_normalized_profile_for_future_template_fills():
    """A full translation must update the profile, not only rendered patches."""
    source_profile = {
        "name": "Anna Rojek",
        "summary": "Polskie podsumowanie.",
        "experience": [{"position": "Specjalista", "description": "Polski opis."}],
    }
    model_result = {
        "message": "Przetłumaczono CV.",
        "tips": [],
        "corrections": [{"element_id": "summary", "content": "English summary."}],
        "translated_cv_data": {
            "name": "Anna Rojek",
            "summary": "English summary.",
            "experience": [{"position": "Specialist", "description": "English description."}],
        },
    }

    with patch(
        "app.services.ai_assistant_service._gpt",
        return_value=(model_result, {"cost_pln_estimate": 0.01}),
    ):
        result = _translate_cv(
            [{"element_id": "summary", "category": "textarea", "content": "Polskie podsumowanie."}],
            "en",
            source_profile,
        )

    assert result["translated_cv_data"]["summary"] == "English summary."
    # `normalize_cv_data` canonicalizes legacy `position` and `description`
    # fields to `title` and a list of `bullets` before template generation.
    assert result["translated_cv_data"]["experience"][0]["title"] == "Specialist"
    assert result["translated_cv_data"]["experience"][0]["bullets"] == ["English description."]


def test_content_actions_return_a_canonical_profile_for_template_switching():
    """Grammar and style fixes must not depend on reverse-mapping canvas text."""
    model_result = {
        "message": "Poprawiono opis.",
        "tips": [],
        "corrections": [{"element_id": "summary", "content": "Improved summary."}],
        "updated_cv_data": {
            "name": "Anna Rojek",
            "summary": "Improved summary.",
            "experience": [],
        },
    }
    with patch(
        "app.services.ai_assistant_service._gpt",
        return_value=(model_result, {"cost_pln_estimate": 0.01}),
    ):
        result = _rewrite_profile_content(
            "language",
            [{"element_id": "summary", "category": "textarea", "content": "Original summary."}],
            {"name": "Anna Rojek", "summary": "Original summary.", "experience": []},
            language_code="en",
        )

    assert result["updated_cv_data"]["summary"] == "Improved summary."


def test_translation_keeps_localized_grouped_section_headings():
    """Translated Skills and Languages chrome must survive the canonicalizer."""
    source_profile = {
        "name": "Jacob Andrew Rauch",
        "labels": {"skills": "UMIEJĘTNOŚCI"},
        "skills": [
            {"category": "Umiejętności miękkie", "items": ["Komunikacja"]},
            {"category": "Badania i IT", "items": ["Sztuczna inteligencja"]},
        ],
        "languages": [{"name": "Polski", "level": "ojczysty"}],
        "extra_sections": [{
            "title": "JĘZYKI",
            "kind": "languages",
            "placement": "after_skills",
            "items": ["Polski — ojczysty"],
        }],
    }
    translated_profile = {
        "name": "Jacob Andrew Rauch",
        "labels": {"skills": "SKILLS"},
        "skills": [
            {"category": "Soft Skills", "items": ["Communication"]},
            {"category": "Research and IT", "items": ["Artificial intelligence"]},
        ],
        "languages": [{"name": "Polish", "level": "native"}],
        "extra_sections": [{
            "title": "LANGUAGES",
            "kind": "languages",
            "placement": "after_skills",
            "items": ["Polish — native"],
        }],
    }
    model_result = {
        "message": "Przetłumaczono CV.",
        "tips": [],
        "corrections": [
            {"element_id": "skills-heading", "content": "SKILLS"},
            {"element_id": "languages-heading", "content": "LANGUAGES"},
        ],
        "updated_cv_data": translated_profile,
    }

    with patch(
        "app.services.ai_assistant_service._gpt",
        return_value=(model_result, {"cost_pln_estimate": 0.01}),
    ):
        result = _rewrite_profile_content(
            "translate",
            [],
            source_profile,
            language_code="en",
            target_language="en",
        )

    # `/ai/fill_template` performs another normalization before generation.
    updated = normalize_cv_data(result["updated_cv_data"])
    assert updated["labels"]["skills"] == "SKILLS"
    assert next(
        section["title"]
        for section in updated["extra_sections"]
        if section["kind"] == "languages"
    ) == "LANGUAGES"


def test_translation_dispatch_uses_profile_aware_result_when_cv_data_exists():
    """Translation must not fall back to the element-only legacy response."""
    expected = {
        "message": "Przetłumaczono CV.",
        "tips": [],
        "corrections": [],
        "updated_cv_data": {"name": "Anna Rojek", "summary": "English summary."},
        "cv_language": "pl",
    }
    with patch(
        "app.services.ai_assistant_service._rewrite_profile_content",
        return_value=expected,
    ) as rewrite:
        result = analyze_action(
            "translate",
            [{"element_id": "summary", "category": "textarea", "content": "Polskie podsumowanie."}],
            target_language="en",
            cv_data={"name": "Anna Rojek", "summary": "Polskie podsumowanie."},
        )

    assert result["updated_cv_data"]["summary"] == "English summary."
    assert result["cv_language"] == "en"
    rewrite.assert_called_once()
