"""Fail CI when SARIF contains High or Critical security findings."""
from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any, Iterable

HIGH_SECURITY_SEVERITY = 7.0


def _security_severity(value: Any) -> float | None:
    """Parse CodeQL's numeric security-severity property when present."""

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def high_findings(document: dict[str, Any]) -> list[tuple[str, float]]:
    """Return ``(rule_id, score)`` for SARIF results at CVSS 7.0 or above."""

    findings: list[tuple[str, float]] = []
    for run in document.get("runs") or []:
        driver = ((run.get("tool") or {}).get("driver") or {})
        rules = driver.get("rules") or []
        rules_by_id = {str(rule.get("id")): rule for rule in rules if rule.get("id")}

        for result in run.get("results") or []:
            rule_id = str(result.get("ruleId") or "unknown")
            rule = rules_by_id.get(rule_id, {})
            result_properties = result.get("properties") or {}
            rule_properties = rule.get("properties") or {}
            score = _security_severity(
                result_properties.get(
                    "security-severity",
                    rule_properties.get("security-severity"),
                )
            )
            if score is not None and score >= HIGH_SECURITY_SEVERITY:
                findings.append((rule_id, score))
    return findings


def sarif_files(root: Path) -> Iterable[Path]:
    """Yield every SARIF document produced by one CodeQL matrix job."""

    if root.is_file():
        yield root
        return
    yield from sorted(root.rglob("*.sarif"))


def enforce(root: Path) -> int:
    """Print a bounded summary and return a process exit code."""

    paths = list(sarif_files(root))
    if not paths:
        print(f"No SARIF files found under {root}", file=sys.stderr)
        return 2

    blocked: list[tuple[Path, str, float]] = []
    for path in paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            print(
                f"Cannot parse SARIF file {path}: {type(exc).__name__}",
                file=sys.stderr,
            )
            return 2
        blocked.extend((path, rule_id, score) for rule_id, score in high_findings(document))

    if not blocked:
        print("CodeQL gate passed: no High or Critical security findings.")
        return 0

    print(
        f"CodeQL gate failed: {len(blocked)} High/Critical finding(s).",
        file=sys.stderr,
    )
    for path, rule_id, score in blocked[:25]:
        print(f"- {path.name}: {rule_id} (security-severity {score:g})", file=sys.stderr)
    if len(blocked) > 25:
        print(f"- ... and {len(blocked) - 25} more", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 1:
        print("Usage: enforce_sarif_severity.py <sarif-file-or-directory>", file=sys.stderr)
        return 2
    return enforce(Path(args[0]))


if __name__ == "__main__":
    raise SystemExit(main())
