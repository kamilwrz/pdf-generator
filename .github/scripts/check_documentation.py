"""Fail CI when committed Markdown links or README language structure drift.

The checker intentionally uses only the Python standard library so it can run
before project dependencies are installed. External URLs are not fetched here;
their availability is reviewed when documentation changes, while this gate
protects repository-local targets and the bilingual top-level structure.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


REPO_ROOT = Path(__file__).resolve().parents[2]
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
EXTERNAL_SCHEMES = ("http://", "https://", "mailto:")
PARITY_MARKERS = (
    "Storage V2",
    "Idempotency-Key",
    "/ready",
    "Playwright",
    "POSTGRES_TEST_DATABASE_URL",
    "S3",
)


def committed_markdown_files() -> list[Path]:
    """Return the deterministic set of Markdown files committed to Git."""

    result = subprocess.run(
        ["git", "ls-files", "--", "*.md"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return sorted(
        (REPO_ROOT / line.strip()).resolve()
        for line in result.stdout.splitlines()
        if line.strip()
    )


def broken_local_links(path: Path) -> list[str]:
    """Return missing repository-local link targets from one Markdown file."""

    failures: list[str] = []
    text = path.read_text(encoding="utf-8")
    for match in MARKDOWN_LINK_RE.finditer(text):
        raw_target = match.group(1).strip().strip("<>")
        if not raw_target or raw_target.startswith("#"):
            continue
        if raw_target.lower().startswith(EXTERNAL_SCHEMES):
            continue
        # A fragment identifies a heading inside the target file. Existence of
        # that file is the stable filesystem contract checked at this layer.
        target_without_fragment = raw_target.split("#", 1)[0]
        target = (path.parent / unquote(target_without_fragment)).resolve()
        try:
            target.relative_to(REPO_ROOT)
        except ValueError:
            failures.append(f"{path.relative_to(REPO_ROOT)} -> {raw_target} (outside repository)")
            continue
        if not target.exists():
            failures.append(f"{path.relative_to(REPO_ROOT)} -> {raw_target}")
    return failures


def readme_parity_failures(readme: Path) -> list[str]:
    """Check the complete EN/PL README skeleton and critical shared contracts."""

    text = readme.read_text(encoding="utf-8")
    if not text.startswith("# English\n"):
        return ["README.md must start with '# English'."]
    parts = re.split(r"(?m)^# Polski\s*$", text, maxsplit=1)
    if len(parts) != 2:
        return ["README.md must contain exactly one '# Polski' language boundary."]

    english, polish = parts
    failures: list[str] = []
    for level in range(2, 5):
        prefix = "#" * level
        english_count = len(re.findall(rf"(?m)^{prefix} ", english))
        polish_count = len(re.findall(rf"(?m)^{prefix} ", polish))
        if english_count != polish_count:
            failures.append(
                f"README H{level} parity differs: English={english_count}, Polish={polish_count}.",
            )

    for marker in PARITY_MARKERS:
        if marker not in english or marker not in polish:
            failures.append(f"README contract marker is missing from one language: {marker}")
    return failures


def main() -> int:
    """Run link and bilingual-structure checks, printing actionable failures."""

    failures: list[str] = []
    for path in committed_markdown_files():
        failures.extend(broken_local_links(path))
    failures.extend(readme_parity_failures(REPO_ROOT / "README.md"))

    if failures:
        print("Documentation validation failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("Documentation links and README EN/PL structure are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
