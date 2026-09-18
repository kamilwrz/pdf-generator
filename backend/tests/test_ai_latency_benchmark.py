"""Offline runs and fabricated timing alone cannot authorize a rollout."""
from copy import deepcopy
import json
from unittest.mock import patch

from scripts.ai_latency_cases import benchmark_cases
from scripts.benchmark_ai_latency import evaluate_gate, review_template, run_benchmark, summarize, DEFAULT_BASELINE
from scripts import benchmark_ai_latency as benchmark


def test_fixture_matrix_has_all_languages_lengths_and_ambiguity():
    cases = benchmark_cases()
    assert len(cases) == 24
    assert {case["language"] for case in cases} == {"pl", "en", "de", "fr", "es", "uk", "it", "nl"}
    assert len({case["id"] for case in cases}) == 24
    baseline = json.loads(DEFAULT_BASELINE.read_text(encoding="utf-8"))
    assert {row["case_id"] for row in baseline["requests"]} == {case["id"] for case in cases}
    assert all(row["request"]["reasoning_effort"] == "high" for row in baseline["requests"])


def test_dry_run_is_interleaved_and_never_passes_live_gate(tmp_path):
    report = run_benchmark(baseline_path=DEFAULT_BASELINE, output=tmp_path / "report.json",
                          variants=["baseline", "policy", "compact"], repetitions=3, limit=2, live=False)
    assert [row["variant"] for row in report["rows"][:3]] == ["baseline", "policy", "compact"]
    assert [row["variant"] for row in report["rows"][6:9]] == ["policy", "compact", "baseline"]
    assert all(row["provider_calls"] == 1 and row["outcome"] == "success" for row in report["rows"])
    assert report["gate"]["passed"] is False
    assert report["gate"]["live"] is False
    reviews = review_template(report)
    assert all(row["facts_preserved"] is None for row in reviews)


def test_gate_requires_complete_live_reviewed_results_and_rejects_tampering():
    from scripts.benchmark_ai_latency import result_digest
    rows = [{"case_id": case["id"], "repetition": repetition, "variant": variant,
             "outcome": "success", "duration_ms": 100 if variant == "baseline" else 50,
             "provider_calls": 1, "result": {}, "result_sha256": result_digest({})}
            for case in benchmark_cases() for repetition in range(3)
            for variant in ("baseline", "policy", "compact")]
    reviews = [{**row, "facts_preserved": True, "editorial_not_worse": True}
               for row in review_template({"rows": rows})]
    assert evaluate_gate(rows, summarize(rows), reviews, live=True)["passed"]
    assert not evaluate_gate(rows, summarize(rows), reviews, live=False)["passed"]
    assert not evaluate_gate(rows[:-1], summarize(rows[:-1]), reviews, live=True)["passed"]
    changed = deepcopy(rows)
    changed[0]["result"] = {"unreviewed": "change"}
    assert not evaluate_gate(changed, summarize(changed), reviews, live=True)["passed"]
    changed = deepcopy(rows)
    changed[0]["outcome"] = "error"
    assert not evaluate_gate(changed, summarize(changed), reviews, live=True)["passed"]


def test_errors_are_not_counted_as_fast_successes():
    summary = summarize([
        {"variant": "baseline", "duration_ms": 1, "outcome": "error", "provider_calls": 1},
        {"variant": "baseline", "duration_ms": 100, "outcome": "success", "provider_calls": 1},
    ])["baseline"]
    assert summary["errors"] == 1
    assert summary["median_ms"] == summary["p95_ms"] == 100


def test_offline_review_reuses_paid_results_without_running_the_benchmark(tmp_path):
    source, output, reviews = (tmp_path / name for name in ("source.json", "report.json", "review.json"))
    source.write_text(json.dumps({"mode": "live", "rows": [{
        "case_id": "pl-short", "action": "grammar", "variant": "baseline", "repetition": 0,
        "outcome": "success", "duration_ms": 123, "provider_calls": 1,
        "result": {}, "result_sha256": benchmark.result_digest({}),
    }]}), encoding="utf-8")
    with patch.object(benchmark, "run_benchmark") as inference, patch.object(benchmark.sys, "argv", [
        "benchmark", "--evaluate-report", str(source), "--review-template", str(reviews), "--output", str(output),
    ]):
        benchmark.main()
    inference.assert_not_called()
    assert json.loads(output.read_text())["by_action"]["grammar"]["baseline"]["median_ms"] == 123
    assert json.loads(reviews.read_text())[0]["facts_preserved"] is None
