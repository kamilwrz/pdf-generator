import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.crud.bio_cv_drafts import delete_bio_cv_draft, upsert_bio_cv_draft
from app.services.cv_data import CvDataValidationError, normalize_cv_data
from app.services.cv_generator import generate_resume


class CvDataNormalizationTests(unittest.TestCase):
    def test_manual_profile_keeps_structured_details_and_generator_fields(self):
        profile = normalize_cv_data({
            "name": "Anna Kowalska",
            "title": "Product Manager",
            "address": "Warszawa, Polska",
            "email": "anna@example.com",
            "experience": [{
                "employer": "Kompoza",
                "city": "Warszawa",
                "position": "Product Manager",
                "period": "2023 – obecnie",
                "description": "Prowadzenie produktu\nBadania użytkowników",
            }],
            "education": [{
                "university": "Uniwersytet Warszawski",
                "diploma": "Magister zarządzania",
                "period": "2017 – 2022",
                "description": "Specjalizacja: innowacje",
            }],
            "skills": ["Figma", "figma", "Analiza danych"],
            "languages": [{"language": "Angielski", "proficiency": "C1"}],
            "custom_sections": [{
                "title": "Certyfikaty",
                "kind": "certifications",
                "items": ["PSM I"],
                "placement": "after_experience",
            }],
        }, require_name=True)

        self.assertEqual(profile["location"], "Warszawa, Polska")
        self.assertEqual(profile["experience"][0]["company"], "Kompoza")
        self.assertEqual(profile["experience"][0]["bullets"], ["Prowadzenie produktu", "Badania użytkowników"])
        self.assertEqual(profile["education"][0]["detail"], "Uniwersytet Warszawski · Specjalizacja: innowacje")
        self.assertEqual(profile["skills"], ["Figma", "Analiza danych"])
        self.assertEqual(profile["extra_sections"][0]["title"], "CERTYFIKATY")
        self.assertEqual(profile["extra_sections"][1]["items"], ["Angielski — C1"])

    def test_legacy_extraction_derives_editable_languages_and_custom_sections(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "location": "Kraków",
            "extra_sections": [
                {"title": "JĘZYKI", "kind": "languages", "items": ["Angielski — B2"]},
                {"title": "PROJEKTY", "kind": "other", "placement": "after_experience", "items": ["Platforma X"]},
            ],
        })

        self.assertEqual(profile["address"], "Kraków")
        self.assertEqual(profile["languages"], [{"name": "Angielski", "level": "B2"}])
        self.assertEqual(profile["custom_sections"][0]["title"], "PROJEKTY")
        self.assertEqual(profile["extra_sections"][0]["title"], "PROJEKTY")

    def test_generation_requires_name_but_draft_data_can_stay_partial(self):
        self.assertEqual(normalize_cv_data({})["name"], "")
        with self.assertRaises(CvDataValidationError):
            normalize_cv_data({}, require_name=True)

    def test_city_and_education_details_reach_a_generated_template(self):
        profile = normalize_cv_data({
            "name": "Anna Kowalska",
            "title": "Product Manager",
            "experience": [{
                "company": "Kompoza",
                "city": "Warszawa",
                "title": "Product Manager",
                "period": "2023 – obecnie",
                "bullets": [],
            }],
            "education": [{
                "school": "Uniwersytet Warszawski",
                "degree": "Magister zarządzania",
                "period": "2017 – 2022",
                "description": "Specjalizacja: innowacje",
            }],
        }, require_name=True)

        content = "\n".join(
            str(element.get("content", ""))
            for element in generate_resume("ledger", profile)
        )
        self.assertIn("Kompoza   ·   Warszawa   ·   2023 – obecnie", content)
        self.assertIn("Uniwersytet Warszawski · Specjalizacja: innowacje", content)


class BioCvDraftCrudTests(unittest.TestCase):
    @patch("app.crud.bio_cv_drafts.get_bio_cv_draft", return_value=None)
    def test_upsert_creates_a_private_draft_when_none_exists(self, get_draft):
        db = MagicMock()

        draft = upsert_bio_cv_draft(db, owner_id=42, cv_data={"name": "Anna"})

        get_draft.assert_called_once_with(db, 42)
        db.add.assert_called_once_with(draft)
        db.commit.assert_called_once()
        self.assertEqual(draft.owner_id, 42)
        self.assertEqual(draft.cv_data, {"name": "Anna"})

    @patch("app.crud.bio_cv_drafts.get_bio_cv_draft")
    def test_upsert_updates_only_the_requested_users_draft(self, get_draft):
        db = MagicMock()
        existing = SimpleNamespace(owner_id=42, cv_data={"name": "Before"}, updated_at=None)
        get_draft.return_value = existing

        result = upsert_bio_cv_draft(db, owner_id=42, cv_data={"name": "After"})

        self.assertIs(result, existing)
        self.assertEqual(existing.cv_data, {"name": "After"})
        db.add.assert_not_called()
        db.commit.assert_called_once()

    @patch("app.crud.bio_cv_drafts.get_bio_cv_draft")
    def test_delete_does_not_touch_another_users_missing_draft(self, get_draft):
        db = MagicMock()
        get_draft.return_value = None

        self.assertFalse(delete_bio_cv_draft(db, owner_id=99))
        db.delete.assert_not_called()
        db.commit.assert_not_called()
