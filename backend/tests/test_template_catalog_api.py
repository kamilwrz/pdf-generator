"""Public template catalog exposes metadata, never authored element packs."""
from __future__ import annotations

import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.cv_templates.registry import (
    TEMPLATE_CATALOG,
    TEMPLATE_LAYOUTS,
    _GENERATORS,
    public_template_catalog,
)
from app.services.entitlements import FREE_STARTER_TEMPLATE_IDS


REPO_ROOT = Path(__file__).resolve().parents[2]


class TemplateCatalogApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_catalog_is_public_and_contains_only_allowlisted_fields(self):
        response = self.client.get("/templates/catalog")

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.headers["Cache-Control"], "public, max-age=300")
        items = response.json()["items"]
        self.assertEqual({item["id"] for item in items}, set(_GENERATORS))
        expected_fields = {
            "id", "name", "description", "tier", "layouts", "accent", "preview_path",
        }
        for item in items:
            self.assertEqual(set(item), expected_fields)
            self.assertNotIn("elements", item)
            self.assertNotIn("generator", item)
            self.assertTrue(
                (REPO_ROOT / "frontend" / "public" / item["preview_path"].lstrip("/")).is_file(),
                msg=f"Missing preview for {item['id']}",
            )

    def test_catalog_tiers_and_layouts_match_enforced_backend_contract(self):
        metadata_by_id = {metadata.id: metadata for metadata in TEMPLATE_CATALOG}

        self.assertEqual(set(metadata_by_id), set(_GENERATORS))
        self.assertEqual(
            {item.id for item in TEMPLATE_CATALOG if item.tier == "free"},
            set(FREE_STARTER_TEMPLATE_IDS),
        )
        self.assertEqual(
            {item.id: frozenset(item.layouts) for item in TEMPLATE_CATALOG},
            TEMPLATE_LAYOUTS,
        )

    def test_public_catalog_returns_fresh_dictionaries(self):
        first = public_template_catalog()
        first[0]["name"] = "mutated"

        second = public_template_catalog()
        self.assertNotEqual(second[0]["name"], "mutated")


if __name__ == "__main__":
    unittest.main()
