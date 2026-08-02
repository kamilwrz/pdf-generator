"""Keep frontend TEMPLATES, backend _GENERATORS, and Free allowlist in sync.

The product has two template registries by design (static FE previews vs
deterministic Python fill). This test is the contract that stops free-tier
and fill-template drift such as Nova being free in the UI but blocked by
``FREE_STARTER_TEMPLATE_IDS``.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from app.services.cv_generator import _GENERATORS
from app.services.entitlements import FREE_STARTER_TEMPLATE_IDS

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_REGISTRY = REPO_ROOT / "frontend" / "src" / "templates" / "index.js"

# Matches registry rows: { id: "ledger", tier: "free", ... }
_TEMPLATE_ROW = re.compile(
    r'\{\s*id:\s*"(?P<id>[a-z0-9_]+)"\s*,\s*tier:\s*"(?P<tier>free|paid)"',
    re.MULTILINE,
)


def _parse_frontend_templates() -> list[tuple[str, str]]:
    source = FRONTEND_REGISTRY.read_text(encoding="utf-8")
    rows = [(match.group("id"), match.group("tier")) for match in _TEMPLATE_ROW.finditer(source)]
    if not rows:
        raise AssertionError(f"No TEMPLATES rows parsed from {FRONTEND_REGISTRY}")
    return rows


class TemplateRegistrySyncTests(unittest.TestCase):
    def test_frontend_ids_match_backend_generators(self):
        frontend_ids = {template_id for template_id, _tier in _parse_frontend_templates()}
        backend_ids = set(_GENERATORS.keys())
        self.assertEqual(
            frontend_ids,
            backend_ids,
            msg=(
                "Frontend TEMPLATES ids and backend _GENERATORS keys drifted.\n"
                f"Only frontend: {sorted(frontend_ids - backend_ids)}\n"
                f"Only backend: {sorted(backend_ids - frontend_ids)}"
            ),
        )

    def test_free_tier_matches_starter_allowlist(self):
        free_ids = {
            template_id
            for template_id, tier in _parse_frontend_templates()
            if tier == "free"
        }
        starter_ids = set(FREE_STARTER_TEMPLATE_IDS)
        self.assertEqual(
            free_ids,
            starter_ids,
            msg=(
                "Frontend tier:\"free\" and FREE_STARTER_TEMPLATE_IDS drifted.\n"
                f"Only frontend free: {sorted(free_ids - starter_ids)}\n"
                f"Only backend starter: {sorted(starter_ids - free_ids)}"
            ),
        )

    def test_every_starter_template_has_a_generator(self):
        missing = sorted(set(FREE_STARTER_TEMPLATE_IDS) - set(_GENERATORS.keys()))
        self.assertEqual(missing, [], msg=f"Starter templates without generators: {missing}")


if __name__ == "__main__":
    unittest.main()
