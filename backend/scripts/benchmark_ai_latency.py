"""Capture original requests before changes; compare real inference explicitly.

Only synthetic fixtures are permitted. Importing this module never sends a
request; command-line live execution is opt-in and must not run in normal CI.
"""
from __future__ import annotations

import argparse
import json
import hashlib
import logging
import math
from pathlib import Path
from statistics import median
import sys
from time import perf_counter
from types import SimpleNamespace
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")

from scripts.ai_latency_cases import benchmark_cases

DEFAULT_BASELINE = BACKEND / "tests" / "fixtures" / "ai_latency_baseline.json"


def capture_baseline(destination: Path):
    """Freeze actual original provider requests without paying for inference."""
    from app.services import ai_assistant_service as assistant

    if destination.exists():
        raise ValueError("Refusing to overwrite a frozen baseline; choose a new path")
    rows = []
    for case in benchmark_cases():
        def capture(**kwargs):
            rows.append({"case_id": case["id"], "request": kwargs})
            return SimpleNamespace(choices=[SimpleNamespace(
                message=SimpleNamespace(content="{}"), finish_reason="stop")], usage=None)
        with patch.object(assistant, "_MODEL", "gpt-5.6-luna"), \
             patch.object(assistant, "_ASSISTANT_REASONING_EFFORT", "high"), \
             patch.object(assistant, "_PROFILE_PATCHES_ENABLED", False), \
             patch.object(assistant._client.chat.completions, "create", side_effect=capture):
            assistant.analyze_action(case["action"], case["elements"],
                                     cv_data=case["cv_data"], cv_language=case["language"])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({"version": 1, "synthetic_only": True,
                                      "requests": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"captured": len(rows), "destination": str(destination)}))


def result_digest(result):
    """Bind a human quality judgement to the exact synthetic output reviewed."""
    return hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def summarize(rows):
    """Aggregate successful latency separately from errors; p95 uses nearest rank."""
    groups = {}
    for variant in sorted({row["variant"] for row in rows}):
        group = [row for row in rows if row["variant"] == variant]
        times = sorted(row["duration_ms"] for row in group if row["outcome"] == "success")
        groups[variant] = {
            "requests": len(group), "errors": sum(row["outcome"] != "success" for row in group),
            "median_ms": median(times) if times else None,
            "p95_ms": times[math.ceil(len(times) * .95) - 1] if times else None,
            "estimated_cost_usd": round(sum(row.get("estimated_cost_usd", 0) for row in group), 6),
            "provider_calls": sum(row["provider_calls"] for row in group),
        }
    return groups


def evaluate_gate(rows, summaries, reviews, *, live):
    """Require live, complete paired observations and explicit human review.

    Mocks never qualify. Numeric guards cannot prove preservation of a role,
    responsibility, qualification or negation. Valid JSON and unchanged lexical
    evidence alone cannot establish an automated semantic quality pass.
    """
    expected = {(case["id"], repetition, variant)
                for case in benchmark_cases() for repetition in range(3)
                for variant in ("baseline", "policy", "compact")}
    actual = {(row["case_id"], row["repetition"], row["variant"]) for row in rows}
    complete = expected <= actual and len(actual) == len(rows)
    reviewed = {(row.get("case_id"), row.get("repetition"), row.get("variant"), row.get("result_sha256"))
                for row in reviews if row.get("facts_preserved") is True
                and row.get("editorial_not_worse") is True}
    def quality_pass(observations):
        return bool(observations) and all(row["outcome"] == "success" and
            result_digest(row.get("result")) == row.get("result_sha256") and (
            row["case_id"], row["repetition"], row["variant"], row.get("result_sha256")
        ) in reviewed for row in observations)

    quality = quality_pass(rows)
    base = summaries.get("baseline", {})
    stages = {}
    for variant in ("policy", "compact"):
        candidate = summaries.get(variant, {})
        speed = bool(base.get("median_ms") and candidate.get("median_ms")) and (
            candidate["median_ms"] <= base["median_ms"] * .8 and candidate["p95_ms"] <= base["p95_ms"]
            and candidate["errors"] <= base["errors"])
        stage_quality = quality_pass([row for row in rows if row["variant"] in {"baseline", variant}])
        stages[variant] = {"human_quality_pass": stage_quality, "latency_target_pass": speed,
                           "passed": bool(live and complete and stage_quality and speed)}
    speed = stages["compact"]["latency_target_pass"]
    return {"live": live, "complete": complete, "human_quality_pass": quality,
            "latency_target_pass": speed, "stages": stages,
            "passed": bool(live and complete and quality and speed)}


def review_template(report):
    """Create unapproved, output-bound review entries without any API request."""
    return [{"case_id": row["case_id"], "repetition": row["repetition"], "variant": row["variant"],
             "result_sha256": row.get("result_sha256"), "facts_preserved": None,
             "editorial_not_worse": None, "notes": ""} for row in report["rows"]]


def run_benchmark(*, baseline_path, output, variants, repetitions, limit, live, review_path=None):
    """Run interleaved synthetic requests; live mode bills OpenAI, never app credits.

    Frozen requests preserve original prompts/high effort after the application
    changes. A policy-only arm isolates reasoning from compact output. Reports
    are saved after every call, retaining paid observations after interruption.
    Authentication/model/network failures stop immediately, without another paid
    attempt or a long loop of predictable failures.
    """
    from app.services import ai_assistant_service as assistant
    from app.services.ai_telemetry import usage_counters
    from app.services.cv_data import normalize_cv_data
    from app.services.cv_profile_patches import preserves_field_evidence

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    if not baseline.get("synthetic_only"):
        raise ValueError("Only the synthetic baseline is accepted")
    requests = {row["case_id"]: row["request"] for row in baseline["requests"]}
    cases = benchmark_cases()[:limit] if limit else benchmark_cases()
    reviews = json.loads(review_path.read_text(encoding="utf-8")) if review_path else []
    create = assistant._client.chat.completions.create
    rows = []
    output.parent.mkdir(parents=True, exist_ok=True)
    for repetition in range(repetitions):
        for case in cases:
            # Rotate the first arm to reduce systematic cache/warm-up advantage.
            order = variants[repetition % len(variants):] + variants[:repetition % len(variants)]
            for variant in order:
                captured = {"provider_calls": 0}

                def provider(**kwargs):
                    request = deepcopy_request(requests[case["id"]]) if variant != "compact" else kwargs
                    if variant == "policy":
                        request["reasoning_effort"] = assistant._reasoning_effort_for_action(case["action"])
                    captured["provider_calls"] += 1
                    captured["reasoning_effort"] = request.get("reasoning_effort")
                    captured["output_contract"] = request["response_format"].get("json_schema", {}).get("name", "full_profile")
                    started = perf_counter()
                    try:
                        if live:
                            response = create(**request)
                        else:
                            payload = {"message": "Synthetic dry run", "tips": [], "changes": []} if (
                                captured["output_contract"] == "cv_profile_changes_v1"
                            ) else {"message": "Synthetic dry run", "tips": [], "corrections": [],
                                    "updated_cv_data": case["cv_data"]}
                            response = SimpleNamespace(choices=[SimpleNamespace(
                                message=SimpleNamespace(content=json.dumps(payload)), finish_reason="stop")], usage=None)
                        captured.update(usage_counters(response))
                        return response
                    finally:
                        captured["provider_ms"] = round((perf_counter() - started) * 1000, 3)

                started, result, error, stop = perf_counter(), None, None, False
                try:
                    with patch.object(assistant, "_MODEL", "gpt-5.6-luna"), \
                         patch.object(assistant, "_ASSISTANT_REASONING_EFFORT", "high" if variant == "baseline" else ""), \
                         patch.object(assistant, "_PROFILE_PATCHES_ENABLED", variant == "compact"), \
                         patch.object(assistant._client.chat.completions, "create", side_effect=provider):
                        result = assistant.analyze_action(case["action"], case["elements"],
                                                         cv_data=case["cv_data"], cv_language=case["language"])
                    updated = result.get("updated_cv_data")
                    if not isinstance(updated, dict) or normalize_cv_data(updated) != updated:
                        raise ValueError("Invalid normalized profile")
                    original_text = json.dumps(case["cv_data"], ensure_ascii=False)
                    if not preserves_field_evidence(original_text, json.dumps(updated, ensure_ascii=False)):
                        raise ValueError("Changed synthetic evidence")
                    if captured["provider_calls"] != 1:
                        raise ValueError("Expected exactly one provider call")
                except Exception as exc:
                    error = type(exc).__name__
                    original = getattr(exc, "original", None)
                    status = getattr(original, "status_code", None)
                    stop = status in {400, 401, 403, 404, 429} or type(original).__name__ == "APIConnectionError"
                    captured["error_status"] = status if isinstance(status, int) else None
                    captured["provider_error_type"] = type(original).__name__ if original else None
                    # Only synthetic fixtures reach this diagnostic report.
                    # Never include provider exception text or request headers.
                    validation = original if isinstance(original, ValueError) else exc
                    if isinstance(validation, ValueError):
                        captured["validation_reason"] = str(validation)
                    if getattr(exc, "usage", None):
                        captured["estimated_cost_usd"] = exc.usage.get("cost_usd", 0)
                row = {"case_id": case["id"], "action": case["action"], "repetition": repetition,
                       "variant": variant, "duration_ms": round((perf_counter() - started) * 1000, 3),
                       "outcome": "error" if error else "success", "error_type": error, **captured}
                if result is not None:
                    row.update(result=result, result_sha256=result_digest(result),
                               estimated_cost_usd=result.get("usage", {}).get("cost_usd", 0))
                rows.append(row)
                summaries = summarize(rows)
                report = {"version": 1, "mode": "live" if live else "dry_run",
                          "synthetic_only": True, "summary": summaries, "rows": rows,
                          "by_action": {action: summarize([row for row in rows if row["action"] == action])
                                        for action in sorted({row["action"] for row in rows})},
                          "gate": evaluate_gate(rows, summaries, reviews, live=live)}
                output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                # Progress contains no generated prose, raw exception or credential.
                print(json.dumps({key: row[key] for key in ("case_id", "variant", "outcome", "duration_ms")}), flush=True)
                if stop:
                    return report
    return report


def deepcopy_request(request):
    """Keep frozen request objects isolated from SDK or budget mutations."""
    return json.loads(json.dumps(request))


def main():
    """Default to offline validation; --live explicitly authorizes billed calls."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-baseline", type=Path)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--output", type=Path, default=BACKEND.parent / "tmp" / "ai-latency-report.json")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--variants", nargs="+", choices=("baseline", "policy", "compact"),
                        default=["baseline", "policy", "compact"])
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--reviews", type=Path)
    parser.add_argument("--evaluate-report", type=Path)
    parser.add_argument("--review-template", type=Path)
    args = parser.parse_args()
    if args.review_template and not args.evaluate_report:
        parser.error("--review-template requires --evaluate-report")
    if args.capture_baseline:
        capture_baseline(args.capture_baseline)
        return
    if args.evaluate_report:
        if args.live:
            parser.error("Report evaluation is offline; do not combine it with --live")
        report = json.loads(args.evaluate_report.read_text(encoding="utf-8"))
        if args.review_template:
            if args.review_template.exists():
                parser.error("Refusing to overwrite quality judgements")
            args.review_template.parent.mkdir(parents=True, exist_ok=True)
            args.review_template.write_text(json.dumps(review_template(report), indent=2), encoding="utf-8")
        reviews = json.loads(args.reviews.read_text(encoding="utf-8")) if args.reviews else []
        report["summary"] = summarize(report["rows"])
        report["by_action"] = {action: summarize([row for row in report["rows"] if row["action"] == action])
                               for action in sorted({row["action"] for row in report["rows"]})}
        report["gate"] = evaluate_gate(report["rows"], report["summary"], reviews, live=report["mode"] == "live")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report["gate"]))
        return
    if args.repetitions < 1 or (args.limit is not None and args.limit < 1):
        parser.error("Repetitions and limit must be positive")
    if args.live:
        from app.core.config import OPENAI_API_KEY
        if not OPENAI_API_KEY:
            parser.error("API_GPT_KEY is required for live measurements")
    logging.disable(logging.CRITICAL)
    report = run_benchmark(baseline_path=args.baseline, output=args.output,
                           variants=args.variants, repetitions=args.repetitions, limit=args.limit,
                           live=args.live, review_path=args.reviews)
    print(json.dumps({"summary": report["summary"], "gate": report["gate"]}))
    if any(row["outcome"] == "error" for row in report["rows"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
