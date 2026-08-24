"""Regression coverage for canonical profile translation."""
from __future__ import annotations

from unittest.mock import patch

from app.services.ai_assistant_service import _rewrite_profile_content, _translate_cv


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
