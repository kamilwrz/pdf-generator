"""Regression coverage for grounded CV diagnostics and read-only API replays."""

from copy import deepcopy
from unittest.mock import patch

import pytest

from app.core.localisation import ui_language
from app.services import ai_assistant_service as service
from app.services.cv_audit import (
    CV_AUDIT_RESPONSE_SCHEMA, audit_read_only_result, build_cv_audit_result,
)


ELEMENTS = [
    {"element_id": "role", "category": "text", "content": "Analyst — Example Company"},
    {"element_id": "body", "category": "textarea", "content": "I has built reports.\nI worked with SQL."},
    {"element_id": "education", "category": "textarea", "content": "University, BSc, 2020–2023"},
]


def finding(**overrides):
    return {
        "title": "Verb agreement", "location": "Experience — Example Company",
        "description": "The subject I needs have, not has.", "kind": "error", "severity": "medium",
        "recommendation": "Change I has built to I have built.",
        "evidence": [{"element_id": "body", "quote": "I has built reports."}],
        "question": None, "action": "grammar", **overrides,
    }


def payload(*findings, category_id="grammar", status="needs_attention"):
    return {"summary": "Fix verb agreement, then clarify outcomes.", "strengths": [], "categories": [
        {"id": category_id, "status": status, "summary": "Review the verb agreement in the experience description.", "findings": list(findings)},
    ]}


def category(result, category_id):
    return next(item for item in result["audit"]["categories"] if item["id"] == category_id)


def test_counts_come_from_unique_accepted_findings_and_all_categories_are_visible():
    error = finding()
    improvement = finding(title="Unclear contribution", kind="improvement", recommendation="Name the reports you built.", action="improve")
    raw = payload(error, deepcopy(error), improvement)
    raw.update(total_findings=99, rating=10, corrections=[{"element_id": "body", "content": "invented"}])
    raw["categories"][0]["issue_count"] = 100
    result = build_cv_audit_result(raw, elements=ELEMENTS)
    audit = result["audit"]
    assert len(audit["categories"]) == 14
    assert (audit["total_findings"], audit["error_count"], audit["improvement_count"]) == (2, 1, 1)
    assert category(result, "grammar")["issue_count"] == 2
    assert category(result, "contact")["status"] == "not_assessed"
    assert category(result, "ats")["status"] == "not_assessed"
    assert category(result, "ats")["recommended_action"] == "ats_score"
    assert category(result, "job_fit")["recommended_action"] == "match_job"
    assert result["rating"] is None
    assert result["corrections"] == []
    assert result["updated_cv_data"] is None


@pytest.mark.parametrize("evidence", [
    [{"element_id": "invented", "quote": "I has built reports."}],
    [{"element_id": "body", "quote": "Increased revenue by 50%"}],
    [{"element_id": "body", "quote": ""}],
    [], None,
])
def test_unsupported_quotes_cannot_become_facts_or_a_false_clean_category(evidence):
    result = build_cv_audit_result(payload(finding(evidence=evidence), status="clear"), elements=ELEMENTS)
    assert result["audit"]["total_findings"] == 0
    assert category(result, "grammar")["status"] == "not_assessed"
    assert len(result["audit"]["limitations"]) == 3


def test_whitespace_only_variations_are_valid_but_case_changes_are_not_quotations():
    valid = finding(evidence=[{"element_id": "body", "quote": "I has built reports. I worked with SQL."}])
    invalid = finding(title="Another claim", evidence=[{"element_id": "body", "quote": "I HAS built reports."}])
    result = build_cv_audit_result(payload(valid, invalid), elements=ELEMENTS)
    assert result["audit"]["total_findings"] == 1
    assert category(result, "grammar")["findings"][0]["evidence"] == valid["evidence"]


def test_missing_information_requires_a_question_and_cannot_trigger_invented_rewriting():
    missing = finding(kind="missing", evidence=[], question="What decisions did these reports support?", action="improve")
    unusable = finding(kind="verification", title="Employment dates", evidence=[], question=None)
    result = build_cv_audit_result(payload(missing, unusable, category_id="achievements"), elements=ELEMENTS)
    assert result["audit"]["missing_count"] == 1
    assert result["audit"]["verification_count"] == 0
    assert category(result, "achievements")["findings"][0]["action"] == "interview"
    assert category(result, "achievements")["recommended_action"] == "interview"
    assert category(result, "summary")["recommended_action"] is None


def test_two_information_gaps_at_distinct_roles_remain_distinct_findings():
    first = finding(kind="missing", evidence=[], question="What was the result?", location="Experience — First company")
    second = finding(kind="missing", evidence=[], question="What was the result?", location="Experience — Second company")
    result = build_cv_audit_result(payload(first, second, category_id="achievements"), elements=ELEMENTS)
    assert result["audit"]["missing_count"] == 2


def test_clear_status_requires_assessed_text_and_no_unsupported_findings():
    raw = payload(status="clear")
    assert category(build_cv_audit_result(raw, elements=ELEMENTS), "grammar")["status"] == "clear"
    assert category(build_cv_audit_result(raw, elements=[]), "grammar")["status"] == "not_assessed"
    raw["categories"][0]["status"] = "needs_attention"
    assert category(build_cv_audit_result(raw, elements=ELEMENTS), "grammar")["status"] == "not_assessed"


def test_grounded_strengths_survive_but_provider_ats_claims_and_unknown_categories_do_not():
    raw = payload()
    raw["strengths"] = [
        {"text": "SQL is named explicitly.", "evidence": [{"element_id": "body", "quote": "SQL"}]},
        {"text": "Certified expert.", "evidence": [{"element_id": "body", "quote": "Certified"}]},
    ]
    raw["categories"].extend([
        {"id": "ats", "status": "clear", "summary": "Guaranteed ATS success.", "findings": [finding()]},
        {"id": "age", "status": "needs_attention", "summary": "Too old.", "findings": [finding()]},
    ])
    result = build_cv_audit_result(raw, elements=ELEMENTS)
    assert result["audit"]["strengths"] == ["SQL is named explicitly."]
    assert category(result, "ats")["issue_count"] == 0
    assert "Guaranteed" not in category(result, "ats")["summary"]
    assert all(item["id"] != "age" for item in result["audit"]["categories"])


def test_category_cap_is_transparent_and_does_not_inflate_counts():
    result = build_cv_audit_result(payload(*(finding(title=f"Issue {index}") for index in range(10))), elements=ELEMENTS)
    assert result["audit"]["total_findings"] == 6
    assert len(result["audit"]["limitations"]) == 3


def test_response_and_source_are_not_mutated_by_normalization():
    raw, source = payload(finding()), deepcopy(ELEMENTS)
    original_raw, original_source = deepcopy(raw), deepcopy(source)
    build_cv_audit_result(raw, elements=source)
    assert raw == original_raw
    assert source == original_source


def test_interface_locale_controls_labels_fallbacks_and_limitations():
    token = ui_language.set("en")
    try:
        result = build_cv_audit_result({"categories": []}, elements=ELEMENTS)
    finally:
        ui_language.reset(token)
    assert category(result, "grammar")["label"] == "Grammar and spelling"
    assert category(result, "ats")["summary"].startswith("This audit")
    assert result["audit"]["limitations"][0].startswith("This audit")


def test_legacy_replayed_ratings_cannot_contain_applicable_operations():
    cached = {"message": "Old rating", "corrections": [{"content": "changed"}],
              "updated_cv_data": {"summary": "changed"}, "scoped_corrections": [{"value": "changed"}],
              "layout_groups": [{}], "structure_groups": [{}], "deletion_groups": [{}], "clone_groups": [{}],
              "achievement_templates": [{}]}
    safe = audit_read_only_result(cached)
    assert safe["updated_cv_data"] is None
    assert all(safe[key] == [] for key in cached if key not in {"message", "updated_cv_data"})
    assert cached["corrections"]


def test_handler_sends_structured_untrusted_sources_and_preserves_usage():
    raw = payload(finding())
    usage = {"cost_pln_estimate": 0.12}
    with patch.object(service, "_gpt", return_value=(raw, usage)) as provider:
        result = service._rate_cv("unused merged text", ELEMENTS)
    args, kwargs = provider.call_args
    assert "UNTRUSTED_CURRENT_CV" in args[1]
    assert "read-only" in args[0]
    assert kwargs["response_schema"] == CV_AUDIT_RESPONSE_SCHEMA
    assert result["usage"] == usage
    assert result["audit"]["total_findings"] == 1


def test_malformed_completed_provider_response_preserves_billable_usage():
    usage = {"cost_pln_estimate": 0.12}
    with patch.object(service, "_gpt", return_value=({"categories": "invalid"}, usage)):
        with pytest.raises(service.AIServiceError) as raised:
            service.analyze_action("rating", ELEMENTS)
    assert raised.value.reservation_outcome == "settle_usage"
    assert raised.value.usage == usage


def test_prompt_diagnoses_without_fabrication_hiring_scores_or_universal_cv_rules():
    with patch.object(service, "_gpt", return_value=({"categories": []}, {})) as provider:
        service.analyze_action("rating", ELEMENTS)
    policy = provider.call_args.args[0]
    for rule in ("Never invent percentages", "not mandatory in every bullet", "one-page rule",
                 "never penalize a junior", "Do not label a stylistic preference", "protected attributes",
                 "ATS and job-fit are separate unassessed checks", "location", "precise question"):
        assert rule in policy
