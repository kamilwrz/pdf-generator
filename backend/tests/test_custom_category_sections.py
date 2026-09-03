"""Category/body contracts must survive every template, independent of heading."""
import unittest

from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.registry import TEMPLATE_CATALOG, generate_resume


class CustomCategorySectionsTests(unittest.TestCase):
    def test_round_trip_keeps_structure_for_every_template_and_heading(self):
        records = [
            {"title": "Projekt 1", "body": "SKILLS\nReact, Node", "bulletList": False},
            {"title": "Projekt 1", "body": "Powtórzona kategoria", "bulletList": True},
            {"title": "", "body": "Bez kategorii", "bulletList": False},
            {"title": "Bez treści", "body": "", "bulletList": False},
            {"title": "", "body": "", "bulletList": False},
            {"title": "", "body": "", "bulletList": True},
        ]
        for title in ("Projekty", "Umiejętności", "Języki", "Moja sekcja"):
            profile = normalize_cv_data({
                "name": "Anna Nowak", "skills": ["Python"],
                "custom_sections": [{
                    "title": title, "kind": "other", "layout": "cc-sub",
                    "placement": "after_skills", "items": records,
                }],
            })
            for template in TEMPLATE_CATALOG:
                with self.subTest(title=title, template=template.id):
                    profile = normalize_cv_data(profile)
                    self.assertEqual(profile["custom_sections"][0]["items"], records)
                    self.assertEqual(profile["skills"], ["Python"])
                    elements = generate_resume(template.id, profile)
                    headings = [e for e in elements if e.get("editorSectionLayout") == "cc-sub"]
                    self.assertEqual(len(headings), 1)
                    self.assertEqual(headings[0]["content"], title.upper())
                    fields = [e for e in elements if e.get("editorRecordLayout") == "cc-sub"]
                    self.assertEqual([e["content"] for e in fields], [
                        "Projekt 1", "SKILLS\nReact, Node", "Projekt 1",
                        "Powtórzona kategoria", "", "Bez kategorii", "Bez treści", "",
                        "", "", "", "",
                    ])
                    for index, field in enumerate(fields):
                        self.assertEqual(field["editorRecordField"], "title" if index % 2 == 0 else "body")
                        if not field["content"]:
                            self.assertTrue(field["starterPlaceholder"])
                            self.assertEqual(field["placeholder"],
                                             "Kategoria umiejętności" if index % 2 == 0 else "Umiejętność")
                        if index % 2:
                            self.assertEqual(field["flowGroup"], fields[index - 1]["flowGroup"])
                    self.assertTrue(fields[0]["bold"])
                    self.assertFalse(fields[1]["bold"])
                    self.assertFalse(fields[1].get("bulletList"))
                    self.assertTrue(fields[3]["bulletList"])
                    self.assertEqual(fields[0]["flowGroup"], fields[1]["flowGroup"])
                    self.assertNotEqual(fields[1]["flowGroup"], fields[2]["flowGroup"])
                    self.assertLess(fields[0]["top"], fields[1]["top"])

    def test_empty_category_section_survives_repeated_normalization_and_every_template(self):
        section = {"title": "Umiejętności (Kategorie)", "kind": "other", "layout": "cc-sub",
                   "items": [{"title": "", "body": "", "bulletList": False}]}
        profile = {"name": "Anna", "custom_sections": [section]}
        for template in TEMPLATE_CATALOG:
            with self.subTest(template=template.id):
                profile = normalize_cv_data(profile)
                self.assertEqual(profile["custom_sections"][0]["items"], section["items"])
                self.assertEqual(profile["skills"], [])
                elements = generate_resume(template.id, profile)
                fields = [e for e in elements if e.get("editorRecordLayout") == "cc-sub"]
                self.assertEqual([e["content"] for e in fields], ["", ""])
                self.assertEqual(len({e["flowGroup"] for e in fields}), 1)
                self.assertLess(fields[0]["top"], fields[1]["top"])

    def test_legacy_extra_sections_keep_explicit_category_layout(self):
        section = {"title": "Języki", "kind": "languages", "layout": "cc-sub",
                   "items": [{"title": "Projekt 1", "body": "SKILLS", "bulletList": False}]}
        normalized = normalize_cv_data({"name": "Anna", "extra_sections": [section]})
        self.assertEqual(normalized["custom_sections"][0]["items"], section["items"])
        self.assertEqual(normalized["custom_sections"][0]["layout"], "cc-sub")
        self.assertEqual(normalized["languages"], [])


if __name__ == "__main__":
    unittest.main()
