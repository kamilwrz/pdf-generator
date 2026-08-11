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
                "city": "Warszawa",
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
        self.assertEqual(profile["education"][0]["city"], "Warszawa")
        self.assertEqual(
            profile["education"][0]["detail"],
            "Uniwersytet Warszawski · Warszawa · Specjalizacja: innowacje",
        )
        self.assertEqual(profile["skills"], ["Figma", "Analiza danych"])
        self.assertEqual(profile["extra_sections"][0]["title"], "CERTYFIKATY")
        self.assertEqual(profile["extra_sections"][1]["items"], ["Angielski — C1"])

    def test_skills_alias_section_keeps_user_title_and_uses_skills_slot(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "extra_sections": [{
                "title": "Obsługa komputera",
                "kind": "other",
                "placement": "after_skills",
                "items": ["Excel", "Word", "PowerPoint"],
            }],
        })

        self.assertEqual(profile["skills"], ["Excel", "Word", "PowerPoint"])
        self.assertEqual(profile["labels"]["skills"], "OBSŁUGA KOMPUTERA")
        self.assertTrue(all(
            section.get("title") != "OBSŁUGA KOMPUTERA"
            for section in profile["extra_sections"]
        ))

        elements = generate_resume("tessera", profile)
        # Tessera mosaic headings sit at left=51; sidebar bodies at left=25.
        sidebar_titles = {
            element["content"]
            for element in elements
            if element["category"] == "text" and element["left"] in {25, 51}
        }
        self.assertIn("OBSŁUGA KOMPUTERA", sidebar_titles)
        self.assertNotIn("OBSZARY", sidebar_titles)
        self.assertNotIn("UMIEJĘTNOŚCI", sidebar_titles)
        self.assertTrue(any(
            element["category"] == "textarea"
            and element["left"] == 25
            and element.get("bulletList")
            and "• Excel" in element["content"]
            for element in elements
        ))

    def test_soft_hard_tools_nest_under_skills(self):
        """
        CVs like CV19 list soft skills, hard skills, and tools under separate
        headings. Those become named skill groups under one UMIEJĘTNOŚCI chrome
        so chips stay separated by category (not one flat tools dump).
        """
        profile = normalize_cv_data({
            "name": "Kinga Olszewska",
            "skills": [],
            "labels": {"skills": "UMIEJĘTNOŚCI"},
            "extra_sections": [
                {
                    "title": "ZNANE NARZĘDZIA",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": ["Senuto", "Surfer", "Ahrefs", "GSC", "GA4"],
                },
                {
                    "title": "UMIEJĘTNOŚCI MIĘKKIE",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": [
                        "Bardzo dobra organizacja pracy",
                        "Pracowitość",
                        "Odpowiedzialność",
                    ],
                },
                {
                    "title": "UMIEJĘTNOŚCI TWARDE",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": ["MS Office", "CMS Wordpress", "Znajomość zasad SEO"],
                },
                {
                    "title": "KURSY I CERTYFIKATY",
                    "kind": "certifications",
                    "placement": "after_skills",
                    "items": ["SEO 2022 - Pozycjonowanie od podstaw | Udemy"],
                },
            ],
        })

        self.assertEqual(profile["labels"]["skills"], "UMIEJĘTNOŚCI")
        categories = {
            group["category"]: group["items"]
            for group in profile["skills"]
            if isinstance(group, dict)
        }
        self.assertIn("ZNANE NARZĘDZIA", categories)
        self.assertIn("UMIEJĘTNOŚCI MIĘKKIE", categories)
        self.assertIn("UMIEJĘTNOŚCI TWARDE", categories)
        self.assertEqual(
            categories["UMIEJĘTNOŚCI MIĘKKIE"][0],
            "Bardzo dobra organizacja pracy",
        )
        self.assertNotIn(
            "Bardzo dobra organizacja pracy",
            categories["ZNANE NARZĘDZIA"],
        )
        titles = [section["title"] for section in profile["extra_sections"]]
        self.assertIn("KURSY I CERTYFIKATY", titles)
        self.assertNotIn("ZNANE NARZĘDZIA", titles)
        self.assertNotIn("UMIEJĘTNOŚCI MIĘKKIE", titles)
        self.assertNotIn("UMIEJĘTNOŚCI TWARDE", titles)

        content = "\n".join(
            str(element.get("content", ""))
            for element in generate_resume("nimbus", profile)
        )
        self.assertIn("UMIEJĘTNOŚCI", content)
        self.assertIn("ZNANE NARZĘDZIA", content)
        self.assertIn("UMIEJĘTNOŚCI MIĘKKIE", content)
        self.assertIn("UMIEJĘTNOŚCI TWARDE", content)
        self.assertIn("Bardzo dobra organizacja pracy", content)
        self.assertIn("CMS Wordpress", content)

    def test_lone_tools_section_still_fills_skills_slot(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "extra_sections": [{
                "title": "Znane narzędzia",
                "kind": "other",
                "placement": "after_skills",
                "items": ["Senuto", "GA4"],
            }],
        })
        self.assertEqual(profile["skills"], ["Senuto", "GA4"])
        self.assertEqual(profile["labels"]["skills"], "ZNANE NARZĘDZIA")
        self.assertTrue(all(
            section.get("title") != "ZNANE NARZĘDZIA"
            for section in profile["extra_sections"]
        ))

    def test_skill_category_lines_become_nested_groups(self):
        """
        CV16-style skills: one UMIEJĘTNOŚCI heading with Category: chip rows.
        Each category becomes a named skill group under the parent skills slot
        (bold label + chips); languages nest into the languages field.
        Training blocks remain separate certifications extras.
        """
        profile = normalize_cv_data({
            "name": "Anton Tseytlin",
            # after_experience extras only render when experience exists.
            "experience": [{
                "title": "Specjalista ds. Wsparcia Technicznego",
                "company": "PHT",
                "period": "2024 – obecnie",
                "bullets": ["Wsparcie systemów"],
            }],
            "skills": [
                "Bezpieczeństwo: analiza SIEM/logów, Wireshark, Nmap, Metasploit",
                "Przemysł / OT: programowanie PLC, systemy wbudowane (Raspberry Pi)",
                "Programowanie i systemy: Python, SQL, Git, Linux",
                "Języki: polski — biegły (C1/C2) • angielski — B2 pisemny/techniczny",
            ],
            "extra_sections": [{
                "title": "SZKOLENIA Z CYBERBEZPIECZEŃSTWA",
                "kind": "certifications",
                "placement": "after_experience",
                "items": [
                    "TryHackMe — ścieżka SOC Analyst Level 1",
                    "Cisco Networking Academy (Junior Cybersecurity Analyst)",
                ],
            }],
        })

        self.assertEqual(profile["labels"]["skills"], "UMIEJĘTNOŚCI")
        categories = {
            group["category"]: group["items"]
            for group in profile["skills"]
            if isinstance(group, dict)
        }
        self.assertIn("Bezpieczeństwo", categories)
        self.assertIn("Przemysł / OT", categories)
        self.assertIn("Programowanie i systemy", categories)
        self.assertIn("Wireshark", categories["Bezpieczeństwo"])
        self.assertIn("Nmap", categories["Bezpieczeństwo"])
        self.assertNotIn(
            "Python",
            categories["Bezpieczeństwo"],
            "Programming chips must stay under their own category group",
        )
        self.assertIn("Python", categories["Programowanie i systemy"])

        titles = [section["title"] for section in profile["extra_sections"]]
        self.assertIn("SZKOLENIA Z CYBERBEZPIECZEŃSTWA", titles)
        self.assertNotIn("BEZPIECZEŃSTWO", titles)
        self.assertNotIn("PRZEMYSŁ / OT", titles)
        self.assertNotIn("PROGRAMOWANIE I SYSTEMY", titles)

        self.assertEqual(
            [(entry["name"], entry["level"]) for entry in profile["languages"]],
            [
                ("polski", "biegły (C1/C2)"),
                ("angielski", "B2 pisemny/techniczny"),
            ],
        )

        content = "\n".join(
            str(element.get("content", ""))
            for element in generate_resume("nimbus", profile)
        )
        self.assertIn("UMIEJĘTNOŚCI", content)
        self.assertIn("Bezpieczeństwo", content)
        self.assertIn("Przemysł / OT", content)
        self.assertIn("Programowanie i systemy", content)
        self.assertIn("SZKOLENIA Z CYBERBEZPIECZEŃSTWA", content)
        self.assertIn("Wireshark", content)
        self.assertIn("Python", content)
        self.assertIn("TryHackMe", content)

    def test_single_colon_skill_line_is_not_promoted(self):
        # A lone "Label: value" note must not become a fake taxonomy.
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "skills": ["Uwaga: wymagane prawo jazdy kat. B", "Python", "SQL"],
        })
        self.assertEqual(
            profile["skills"],
            ["Uwaga: wymagane prawo jazdy kat. B", "Python", "SQL"],
        )
        self.assertFalse(any(
            section.get("title") == "UWAGA"
            for section in profile["extra_sections"]
        ))

    def test_lone_skills_category_wrapper_flattens(self):
        """
        Extract often wraps a flat English SKILLS sidebar as one named group.
        That must become plain chips under UMIEJĘTNOŚCI — never a bold
        "SKILLS" subcategory under the parent chrome.
        """
        profile = normalize_cv_data({
            "name": "Tomasz Kozubal",
            "labels": {"skills": "UMIEJĘTNOŚCI"},
            "skills": [{
                "category": "SKILLS",
                "items": [
                    "Python (Pandas, Numpy)",
                    "SQL",
                    "FastAPI",
                ],
            }],
        })
        self.assertEqual(profile["labels"]["skills"], "UMIEJĘTNOŚCI")
        self.assertEqual(
            profile["skills"],
            ["Python (Pandas, Numpy)", "SQL", "FastAPI"],
        )
        self.assertTrue(all(isinstance(item, str) for item in profile["skills"]))

        content = "\n".join(
            str(element.get("content", ""))
            for element in generate_resume("aldine", profile)
        )
        self.assertIn("UMIEJĘTNOŚCI", content)
        self.assertNotIn("SKILLS", content)
        self.assertIn("Python (Pandas, Numpy)", content)

    def test_lone_named_skill_category_flattens(self):
        # A single real-looking category is not a taxonomy — render as flat text.
        profile = normalize_cv_data({
            "name": "Anna Nowak",
            "skills": [{
                "category": "Languages & Frameworks",
                "items": ["Python", "FastAPI"],
            }],
        })
        self.assertEqual(profile["skills"], ["Python", "FastAPI"])

    def test_explicit_skills_label_is_not_overwritten_by_alias_section(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "skills": ["Python"],
            "labels": {"skills": "STACK"},
            "custom_sections": [{
                "title": "Technologie",
                "kind": "other",
                "items": ["Docker"],
                "placement": "after_skills",
            }],
        })
        self.assertEqual(profile["labels"]["skills"], "STACK")
        self.assertEqual(profile["skills"], ["Python", "Docker"])

    def test_default_umiejetnosci_label_yields_to_alias_section_title(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "skills": ["Excel"],
            "labels": {"skills": "UMIEJĘTNOŚCI"},
            "extra_sections": [{
                "title": "Obsługa komputera",
                "kind": "other",
                "placement": "after_skills",
                "items": ["Word"],
            }],
        })
        self.assertEqual(profile["labels"]["skills"], "OBSŁUGA KOMPUTERA")
        self.assertEqual(profile["skills"], ["Excel", "Word"])

    def test_extract_style_skills_label_reaches_tessera_sidebar(self):
        profile = normalize_cv_data({
            "name": "Anna Rojek",
            "skills": ["biegła znajomość pakietu Excel, PowerPoint"],
            "labels": {"skills": "OBSŁUGA KOMPUTERA"},
            "extra_sections": [{
                "title": "JĘZYKI",
                "kind": "languages",
                "items": ["angielski — dobry"],
            }],
        })
        self.assertEqual(profile["labels"]["skills"], "OBSŁUGA KOMPUTERA")
        elements = generate_resume("tessera", profile)
        sidebar_titles = {
            element["content"]
            for element in elements
            if element["category"] == "text" and element["left"] in {25, 51}
        }
        self.assertIn("OBSŁUGA KOMPUTERA", sidebar_titles)
        self.assertNotIn("UMIEJĘTNOŚCI", sidebar_titles)

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
        self.assertEqual(profile["extra_sections"][0]["kind"], "projects")
        self.assertEqual(
            profile["extra_sections"][0]["items"],
            [{"title": "Platforma X", "bullets": []}],
        )

    def test_flat_projects_list_regroups_into_title_and_bullets(self):
        profile = normalize_cv_data({
            "name": "Ewa Nowak",
            # after_experience extras only render when experience exists.
            "experience": [{
                "title": "Content Creator",
                "company": "Studio",
                "period": "2023 – obecnie",
                "bullets": ["Kampanie social"],
            }],
            "extra_sections": [{
                "title": "PROJEKTY",
                "kind": "other",
                "placement": "after_experience",
                "items": [
                    "Editorial Fashion Shoot — Personal Project",
                    "Koncepcja kreatywna i moodboard",
                    "Koordynacja stylizacji oraz estetyki sesji",
                    "Produkcja contentu social media",
                    "TikTok / Instagram Visual Series",
                    "Kreacja short-form content fashion & lifestyle",
                    "Budowanie spójnego visual identity",
                ],
            }],
        })

        projects = profile["extra_sections"][0]
        self.assertEqual(projects["kind"], "projects")
        self.assertEqual(len(projects["items"]), 2)
        self.assertEqual(projects["items"][0]["title"], "Editorial Fashion Shoot — Personal Project")
        self.assertEqual(
            projects["items"][0]["bullets"],
            [
                "Koncepcja kreatywna i moodboard",
                "Koordynacja stylizacji oraz estetyki sesji",
                "Produkcja contentu social media",
            ],
        )
        self.assertEqual(projects["items"][1]["title"], "TikTok / Instagram Visual Series")
        self.assertEqual(
            projects["items"][1]["bullets"],
            [
                "Kreacja short-form content fashion & lifestyle",
                "Budowanie spójnego visual identity",
            ],
        )

        elements = generate_resume("nova", profile)
        title_el = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and element.get("bold")
            and "Editorial Fashion Shoot" in str(element.get("content", ""))
        )
        bullets_el = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and element.get("bulletList")
            and "Koncepcja kreatywna" in str(element.get("content", ""))
        )
        self.assertEqual(title_el["page"], bullets_el["page"])
        self.assertLess(title_el["top"], bullets_el["top"])

    def test_structured_project_records_pass_through(self):
        profile = normalize_cv_data({
            "name": "Ewa Nowak",
            "custom_sections": [{
                "title": "Projekty",
                "kind": "projects",
                "placement": "after_experience",
                "items": [{
                    "title": "Lookbook",
                    "subtitle": "2024",
                    "bullets": ["Kierunek artystyczny", "Produkcja"],
                }],
            }],
        })
        self.assertEqual(
            profile["extra_sections"][0]["items"],
            [{"title": "Lookbook", "bullets": ["Kierunek artystyczny", "Produkcja"], "subtitle": "2024"}],
        )

    def test_explicit_empty_custom_sections_do_not_restore_stale_extra_sections(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "custom_sections": [],
            "languages": [],
            "extra_sections": [
                {
                    "title": "PROJEKTY",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": ["Stary wpis"],
                },
                {
                    "title": "JĘZYKI",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Angielski — C1"],
                },
            ],
        })

        self.assertEqual(profile["custom_sections"], [])
        self.assertEqual(profile["languages"], [])
        self.assertEqual(profile["extra_sections"], [])

    def test_empty_languages_still_recover_from_extra_sections_unless_customs_cleared(self):
        """
        Clients often send `languages: []` while languages still live only in
        legacy `extra_sections` (PDF extract shape). Recover those languages so
        IT templates (Kernel) do not drop JĘZYKI after a template change.
        """
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "skills": ["Analiza AML", "•", "Transaction Monitoring"],
            "languages": [],
            "extra_sections": [
                {
                    "title": "JĘZYKI",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Polski — C2", "Niemiecki — C1"],
                },
            ],
        })

        self.assertEqual(
            [(entry["name"], entry["level"]) for entry in profile["languages"]],
            [("Polski", "C2"), ("Niemiecki", "C1")],
        )
        self.assertEqual(profile["skills"], ["Analiza AML", "Transaction Monitoring"])
        self.assertTrue(
            any(section.get("kind") == "languages" for section in profile["extra_sections"])
        )

        content = "\n".join(
            str(element.get("content", ""))
            for element in generate_resume("kernel", profile)
        )
        # Kernel renders skills as an inline · list, languages as a 4-col grid.
        self.assertIn("Analiza AML", content)
        self.assertIn("Polski — C2", content)
        self.assertIn("JĘZYKI", content)

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
                "city": "Warszawa",
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
        self.assertIn("Uniwersytet Warszawski", content)
        self.assertIn("Warszawa   ·   2017 – 2022", content)
        self.assertIn("• Specjalizacja: innowacje", content)
        self.assertIn("Magister zarządzania", content)

    def test_legacy_education_detail_recovers_description(self):
        profile = normalize_cv_data({
            "name": "Anna Kowalska",
            "education": [{
                "school": "Uniwersytet Warszawski",
                "city": "Warszawa",
                "degree": "Magister zarządzania",
                "period": "2017 – 2022",
                "detail": "Uniwersytet Warszawski · Warszawa · Specjalizacja: innowacje",
            }],
        })
        self.assertEqual(profile["education"][0]["description"], "Specjalizacja: innowacje")

    def test_legacy_extract_shape_keeps_mashed_detail_as_meta(self):
        profile = normalize_cv_data({
            "name": "Jan Nowak",
            "education": [{
                "degree": "Informatyka",
                "period": "2018 – 2021",
                "detail": "Politechnika Warszawska · Warszawa",
            }],
        })
        self.assertEqual(profile["education"][0]["description"], "")
        self.assertEqual(
            profile["education"][0]["detail"],
            "Politechnika Warszawska · Warszawa",
        )


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
