"""Executable policy tests for the CodeQL SARIF merge gate."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / ".github" / "scripts" / "enforce_sarif_severity.py"
SPEC = importlib.util.spec_from_file_location("enforce_sarif_severity", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
POLICY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POLICY)


def _sarif(score: str | None) -> dict:
    properties = {} if score is None else {"security-severity": score}
    return {
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"rules": [{"id": "py/example", "properties": properties}]}},
            "results": [{"ruleId": "py/example"}],
        }],
    }


class CodeQlSecurityPolicyTests(unittest.TestCase):
    def _run_policy(self, document: dict) -> int:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.sarif"
            path.write_text(json.dumps(document), encoding="utf-8")
            return POLICY.enforce(path)

    def test_high_finding_blocks_ci(self):
        self.assertEqual(self._run_policy(_sarif("7.0")), 1)

    def test_critical_finding_blocks_ci(self):
        self.assertEqual(self._run_policy(_sarif("9.8")), 1)

    def test_medium_and_quality_only_findings_do_not_block(self):
        self.assertEqual(self._run_policy(_sarif("6.9")), 0)
        self.assertEqual(self._run_policy(_sarif(None)), 0)

    def test_missing_or_invalid_sarif_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(POLICY.enforce(root), 2)
            invalid = root / "invalid.sarif"
            invalid.write_text("not-json", encoding="utf-8")
            self.assertEqual(POLICY.enforce(root), 2)

    def test_workflows_keep_all_security_scans_blocking(self):
        ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        codeql = (REPO_ROOT / ".github" / "workflows" / "codeql.yml").read_text(
            encoding="utf-8",
        )

        self.assertIn("python -m pip_audit --requirement requirements.txt --strict", ci)
        self.assertIn("npm audit --omit=dev --audit-level=high", ci)
        self.assertIn("check_documentation.py", ci)
        self.assertIn("gitleaks/gitleaks-action@v3", ci)
        self.assertIn("github/codeql-action/init@v4", codeql)
        self.assertIn("queries: security-extended", codeql)
        self.assertIn("enforce_sarif_severity.py", codeql)
        self.assertNotIn("continue-on-error", ci + codeql)


if __name__ == "__main__":
    unittest.main()
