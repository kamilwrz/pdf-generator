import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.requests import Request

from app.api.routes.ai import _rebase_template_asset_urls
from app.services import cv_generator
from app.services.cv_generator import generate_resume
from app.utils.image_src_to_path import image_src_to_local_path


LONG_CV = {
    "name": "Aleksandra Katarzyna Nowakowska-Wiśniewska",
    "title": "Dyrektorka Strategii Produktowej i Transformacji Operacyjnej",
    "email": "aleksandra.nowakowska-wisniewska@example.com",
    "phone": "+48 600 123 456",
    "location": "Warszawa, województwo mazowieckie",
    "summary": (
        "Doświadczona liderka produktów cyfrowych, która łączy strategię, badania "
        "i projektowanie usług, aby prowadzić złożone transformacje organizacyjne."
    ),
    "experience": [
        {
            "title": "Dyrektorka Strategii Produktowej i Transformacji Operacyjnej",
            "company": "Fundacja Rozwoju Usług Publicznych i Cyfrowych",
            "period": "2021 – obecnie",
            "bullets": [
                "Prowadziła wieloletni program transformacji obejmujący produkty, procesy i model operacyjny.",
                "Zbudowała zespół łączący badania, projektowanie, analitykę oraz rozwój oprogramowania.",
            ],
        },
        {
            "title": "Starsza Menedżerka Programów Strategicznych",
            "company": "Międzynarodowe Centrum Innowacji Społecznych",
            "period": "2017 – 2021",
            "bullets": [
                "Koordynowała programy realizowane z partnerami z sektora publicznego i prywatnego.",
                "Wprowadziła mierniki jakości usług oraz rytuały wspierające podejmowanie decyzji.",
            ],
        },
        {
            "title": "Menedżerka Produktu",
            "company": "Pracownia Projektowania Doświadczeń Użytkownika",
            "period": "2014 – 2017",
            "bullets": ["Prowadziła rozwój usług cyfrowych od badań po wdrożenie."],
        },
    ],
    "education": [
        {
            "degree": "Magister Zarządzania Innowacjami i Projektowania Usług",
            "period": "2012 – 2014",
            "detail": "Uniwersytet Ekonomiczny w Krakowie",
        }
    ],
    "skills": [
        "Strategia produktowa",
        "Projektowanie usług",
        "Badania jakościowe",
        "Zarządzanie zmianą",
        "Facylitacja",
        "Analiza procesów",
        "Rozwój organizacji",
        "Zarządzanie interesariuszami",
    ],
}


class CvTemplateLayoutTests(unittest.TestCase):
    def test_generated_template_image_uses_public_request_origin(self):
        request = Request({
            "type": "http",
            "scheme": "http",
            "headers": [
                (b"host", b"internal-service:8000"),
                (b"x-forwarded-proto", b"https"),
                (b"x-forwarded-host", b"pdf-generator-07cb.onrender.com"),
            ],
        })
        elements = _rebase_template_asset_urls([{
            "category": "image",
            "src": "http://localhost:8000/template-assets/nimbus-finance-accent.png",
        }], request)

        self.assertEqual(
            elements[0]["src"],
            "https://pdf-generator-07cb.onrender.com/template-assets/nimbus-finance-accent.png",
        )

    def test_template_images_resolve_to_versioned_local_assets(self):
        for template_id in (
            "ledger", "nimbus", "kernel", "tessera", "slate",
        ):
            with self.subTest(template_id=template_id):
                image = next(
                    element
                    for element in generate_resume(template_id, LONG_CV)
                    if element["category"] == "image"
                )
                local_path = Path(image_src_to_local_path(image["src"]))
                self.assertTrue(local_path.is_file())

    def test_it_templates_use_all_canvas_shapes_and_repeat_artwork(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        assets = {
            "kernel": "kernel-it-architecture.png",
        }
        expected_categories = {
            "text", "textarea", "line", "rectangle", "circle", "ellipse",
            "image",
        }

        for template_id, asset_name in assets.items():
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, multi_page_cv)
                pages = {element.get("page", 1) for element in elements}
                categories = {element["category"] for element in elements}
                self.assertTrue(expected_categories <= categories)
                self.assertNotIn("connector", categories)
                self.assertGreater(max(pages), 1)
                self.assertTrue(all(
                    element.get("autoHeight") is True
                    for element in elements
                    if element["category"] == "textarea"
                ))
                for page in pages:
                    backgrounds = [
                        element for element in elements
                        if element["category"] == "image"
                        and element.get("page", 1) == page
                        and element["src"].endswith(f"/template-assets/{asset_name}")
                    ]
                    self.assertEqual(len(backgrounds), 1)
                    self.assertTrue(backgrounds[0]["fixedToPage"])

    def test_tessera_is_original_icon_sidebar_with_rectangular_photo(self):
        """Tessera must use every supported primitive and preserve complete flow."""
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        elements = generate_resume("tessera", multi_page_cv)
        categories = {element["category"] for element in elements}
        pages = {element.get("page", 1) for element in elements}

        self.assertEqual(
            categories,
            {"text", "textarea", "line", "rectangle", "circle", "ellipse", "image"},
        )
        self.assertNotIn("connector", categories)
        self.assertGreater(max(pages), 1)

        photo_frame = next(
            element
            for element in elements
            if element.get("id") == "tessera-photo-frame"
        )
        self.assertEqual(photo_frame["category"], "rectangle")
        self.assertEqual((photo_frame["width"], photo_frame["height"]), (112, 126))
        self.assertGreater(photo_frame["height"], photo_frame["width"])

        icons = [
            element
            for element in elements
            if element["category"] == "image"
            and "/template-assets/iconic/tessera/" in element["src"]
        ]
        self.assertGreaterEqual(len(icons), 8)
        self.assertTrue(any(icon["src"].endswith("/portrait.png") for icon in icons))
        self.assertTrue(all(
            Path(image_src_to_local_path(icon["src"])).is_file()
            for icon in icons
        ))

        self.assertTrue(all(
            element.get("autoHeight") is True
            and element.get("preserveInitialLayout") is True
            and element["top"] + element["height"] <= 770
            for element in elements
            if element["category"] == "textarea"
        ))
        self.assertTrue(any(
            element.get("flowRole") == "section-chrome"
            for element in elements
        ))
        self.assertTrue(all(
            element.get("fixedToPage") is True
            and element.get("locked") is True
            for element in elements
            if element.get("id") == "tessera-photo-frame"
        ))
        # Sidebar contact/section bodies must remain editable; only photo chrome
        # and page rails are inert (`fixedToPage`).
        side_width = 178
        editable_sidebar = [
            element for element in elements
            if element.get("page", 1) == 1
            and element["category"] in {"text", "textarea"}
            and element["left"] < side_width
            and not element.get("fixedToPage")
        ]
        self.assertGreaterEqual(len(editable_sidebar), 4)
        self.assertTrue(all(
            not element.get("locked")
            for element in editable_sidebar
        ))

    def test_slate_is_rectilinear_icon_sidebar_with_rectangular_photo(self):
        """Slate keeps a rectilinear (no circle/ellipse) blueprint identity."""
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        elements = generate_resume("slate", multi_page_cv)
        categories = {element["category"] for element in elements}
        pages = {element.get("page", 1) for element in elements}

        # The rectilinear vocabulary is Slate's point of difference from Tessera:
        # only filled/outlined rectangles, text, and icons — never circles or
        # ellipses.
        self.assertEqual(
            categories,
            {"text", "textarea", "line", "rectangle", "image"},
        )
        self.assertNotIn("circle", categories)
        self.assertNotIn("ellipse", categories)
        self.assertNotIn("connector", categories)
        self.assertGreater(max(pages), 1)

        photo_frame = next(
            element
            for element in elements
            if element.get("id") == "slate-photo-frame"
        )
        self.assertEqual(photo_frame["category"], "rectangle")
        self.assertEqual((photo_frame["width"], photo_frame["height"]), (112, 126))
        self.assertGreater(photo_frame["height"], photo_frame["width"])
        self.assertTrue(photo_frame.get("fixedToPage") is True)
        self.assertTrue(photo_frame.get("locked") is True)

        # Slate uses two icon colour variants: white glyphs for filled heading
        # badges and accent glyphs for bare contact rows / the photo placeholder.
        icons = [
            element
            for element in elements
            if element["category"] == "image"
            and "/template-assets/iconic/slate" in element["src"]
        ]
        self.assertGreaterEqual(len(icons), 8)
        icon_themes = {
            icon["src"].split("/iconic/")[1].split("/")[0] for icon in icons
        }
        self.assertEqual(icon_themes, {"slate", "slate-accent"})
        self.assertTrue(any(icon["src"].endswith("/portrait.png") for icon in icons))
        self.assertTrue(all(
            Path(image_src_to_local_path(icon["src"])).is_file()
            for icon in icons
        ))

        self.assertTrue(all(
            element.get("autoHeight") is True
            and element.get("preserveInitialLayout") is True
            and element["top"] + element["height"] <= 770
            for element in elements
            if element["category"] == "textarea"
        ))
        self.assertTrue(any(
            element.get("flowRole") == "section-chrome"
            for element in elements
        ))

        # Sidebar contact/section bodies must remain editable; only the photo
        # chrome and page rails are inert (fixedToPage).
        side_width = 178
        editable_sidebar = [
            element for element in elements
            if element.get("page", 1) == 1
            and element["category"] in {"text", "textarea"}
            and element["left"] < side_width
            and not element.get("fixedToPage")
        ]
        self.assertGreaterEqual(len(editable_sidebar), 4)
        self.assertTrue(all(
            not element.get("locked")
            for element in editable_sidebar
        ))

    def test_sidebar_templates_repeat_panel_on_every_page(self):
        """Left-rail sidebars must repaint their panel chrome on every page."""
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        # template_id → expected fixed panel width at left=0
        panels = {
            "tessera": 178,
            "slate": 178,
        }

        for template_id, panel_width in panels.items():
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, multi_page_cv)
                pages = {element.get("page", 1) for element in elements}
                self.assertGreater(max(pages), 1)
                self.assertTrue(all(
                    element.get("autoHeight") is True
                    for element in elements
                    if element["category"] == "textarea"
                ))
                for page in pages:
                    sidebar_panels = [
                        element for element in elements
                        if element["category"] == "line"
                        and element.get("page", 1) == page
                        and element.get("fixedToPage")
                        and element.get("left", -1) == 0
                        and element.get("width") == panel_width
                        and element.get("height") == 842
                    ]
                    self.assertEqual(len(sidebar_panels), 1)

    def test_sidebar_templates_place_complete_compact_semantic_sections(self):
        cv = {
            **LONG_CV,
            "skills": ["Strategia", "Badania"],
            "education": [{
                "degree": "MBA",
                "detail": "SGH",
                "period": "2020",
            }],
            "extra_sections": [
                {
                    "title": "JĘZYKI",
                    # Deliberately omit kind to prove title-based compatibility.
                    "placement": "after_skills",
                    "items": ["Polski — C2", "Angielski — C1"],
                },
                {
                    "title": "CERTYFIKATY",
                    "kind": "certifications",
                    "placement": "after_skills",
                    "items": ["PMP", "ICAgile"],
                },
                {
                    "title": "ZAINTERESOWANIA",
                    "kind": "interests",
                    "placement": "after_skills",
                    "items": ["Fotografia", "Żeglarstwo"],
                },
                {
                    "title": "PROJEKTY",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": ["Platforma obsługi klienta"],
                },
            ],
        }
        sidebar_titles = {
            "UMIEJĘTNOŚCI", "JĘZYKI", "CERTYFIKATY", "ZAINTERESOWANIA", "WYKSZTAŁCENIE",
        }
        complete_sidebar_bodies = {
            "• Strategia\n• Badania",
            "• Polski — C2\n• Angielski — C1",
            "• PMP\n• ICAgile",
            "• Fotografia\n• Żeglarstwo",
            "MBA\nSGH\n2020",
        }

        for template_id in ("tessera",):
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                # Tessera sidebar bodies sit at left=25; mosaic headings at 51.
                sidebar_bodies = {
                    element["content"]
                    for element in elements
                    if element["category"] == "textarea" and element["left"] == 25
                }
                sidebar_heading_copy = {
                    element["content"]
                    for element in elements
                    if element["category"] == "text"
                    and element.get("left") in {25, 51}
                    and not element.get("fixedToPage")
                }
                main_copy = "\n".join(
                    element["content"]
                    for element in elements
                    if element["category"] == "textarea" and element["left"] == 218
                )

                self.assertTrue(sidebar_titles <= sidebar_heading_copy)
                self.assertTrue(complete_sidebar_bodies <= sidebar_bodies)
                self.assertTrue(all(
                    element["page"] == 1
                    and element["width"] == 128
                    and element["top"] + element["height"] <= 770
                    for element in elements
                    if element["category"] == "textarea" and element["left"] == 25
                ))
                for body in complete_sidebar_bodies:
                    self.assertNotIn(body, main_copy)
                self.assertIn("Platforma obsługi klienta", main_copy)



    def test_sidebar_templates_keep_oversized_sections_complete_in_main_column(self):
        skills = [f"Kompetencja strategiczna i operacyjna numer {index}" for index in range(1, 25)]
        languages = [f"Język zawodowy poziom zaawansowany numer {index}" for index in range(1, 25)]
        education = [
            {
                "degree": f"Studia podyplomowe z zarządzania transformacją {index}",
                "detail": f"Akademia Rozwoju Organizacji {index}",
                "period": f"20{index:02d} – 20{index + 1:02d}",
            }
            for index in range(1, 8)
        ]
        cv = {
            **LONG_CV,
            "skills": skills,
            "education": education,
            "extra_sections": [{
                "title": "JĘZYKI",
                "kind": "languages",
                "placement": "after_skills",
                "items": languages,
            }],
        }

        elements = generate_resume("tessera", cv)
        sidebar_heading_copy = {
            element["content"]
            for element in elements
            if element["category"] == "text"
            and element.get("left") in {25, 51}
            and not element.get("fixedToPage")
        }
        sidebar_bodies = "\n".join(
            element["content"]
            for element in elements
            if element["category"] == "textarea" and element["left"] == 25
        )
        main_textareas = [
            element for element in elements
            if element["category"] == "textarea" and element["left"] == 218
        ]
        main_copy = "\n".join(element["content"] for element in main_textareas)

        # Skills/languages are far taller than the first-page sidebar budget, so
        # they stay complete in the main column (never truncated in the sidebar).
        self.assertNotIn("UMIEJĘTNOŚCI", sidebar_heading_copy)
        self.assertNotIn("JĘZYKI", sidebar_heading_copy)
        self.assertIn(skills[0], main_copy)
        self.assertIn(skills[-1], main_copy)
        self.assertIn(f"• {languages[0]}", main_copy)
        self.assertIn(f"• {languages[-1]}", main_copy)
        # Education may still fit wholly in the sidebar at a smaller font; if so,
        # every record must be present. Otherwise the full set is in the main column.
        if "WYKSZTAŁCENIE" in sidebar_heading_copy:
            self.assertIn(education[0]["degree"], sidebar_bodies)
            self.assertIn(education[-1]["degree"], sidebar_bodies)
            self.assertNotIn(education[0]["degree"], main_copy)
        else:
            self.assertIn(education[0]["degree"], main_copy)
            self.assertIn(education[-1]["degree"], main_copy)



    def test_kernel_emits_skills_and_languages_bodies(self):
        """Single-column Kernel must keep skills/languages after wizard-style data."""
        profile = {
            **LONG_CV,
            "languages": [
                {"name": "Polski", "level": "C2"},
                {"name": "Niemiecki", "level": "C1"},
            ],
            "extra_sections": [{
                "title": "JĘZYKI",
                "kind": "languages",
                "placement": "after_skills",
                "items": ["Polski — C2", "Niemiecki — C1"],
            }],
        }
        for template_id in ("kernel",):
            elements = generate_resume(template_id, profile)
            content = "\n".join(
                str(element.get("content", ""))
                for element in elements
                if element.get("category") in {"text", "textarea"}
            )
            self.assertIn("UMIEJĘTNOŚCI", content, template_id)
            self.assertIn("Strategia produktowa  ·  ", content, template_id)
            self.assertIn("JĘZYKI", content, template_id)
            self.assertIn("• Polski — C2", content, template_id)
            skills_body = next(
                element for element in elements
                if element.get("category") == "textarea"
                and "Strategia produktowa" in str(element.get("content", ""))
                and " · " in str(element.get("content", ""))
            )
            self.assertFalse(skills_body.get("bulletList"), template_id)
            self.assertEqual(skills_body.get("flowRole"), "content", template_id)

    def test_sidebar_layout_uses_remaining_page_space_for_complete_experience_entry(self):
        fourth_job = {
            "title": "Customer Service Specialist with German",
            "company": "Amazon CS Poland",
            "city": "Warszawa",
            "period": "2022 – 2024",
            "bullets": [
                "Profesjonalna obsługa klienta z zachowaniem wysokich standardów jakości.",
                "Rozwiązywanie eskalacji oraz monitoring nowych pracowników w ramach wdrożeń.",
                "Analiza jakości obsługi klienta oraz przygotowywanie raportów.",
            ],
        }
        elements = generate_resume("tessera", {
            **LONG_CV,
            "experience": [*LONG_CV["experience"], fourth_job],
        })

        fourth_title = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == fourth_job["title"]
        )
        fourth_bullets = next(
            element for element in elements
            if element["category"] == "textarea"
            and fourth_job["bullets"][0] in element["content"]
        )
        self.assertEqual(fourth_title["page"], 1)
        self.assertEqual(fourth_bullets["page"], 1)
        self.assertLessEqual(fourth_bullets["top"] + fourth_bullets["height"], 770)

    def test_sidebar_experience_entries_follow_one_alignment_and_spacing_pattern(self):
        jobs = [
            {
                "title": "Senior AML Analyst",
                "company": "Northbridge Bank",
                "city": "Warszawa",
                "period": "2021 – obecnie",
                "bullets": ["Prowadzenie analiz AML.", "Raportowanie ryzyka."],
            },
            {
                "title": "AML Analyst",
                "company": "Meridian Bank",
                "city": "Kraków",
                "period": "2018 – 2021",
                "bullets": ["Weryfikacja klientów.", "Kontrola dokumentacji."],
            },
        ]
        elements = generate_resume("tessera", {
            "name": "Anna Kowalska",
            "title": "AML Analyst",
            "experience": jobs,
            "education": [],
            "skills": [],
            "extra_sections": [],
        })
        textareas = {
            element["content"]: element
            for element in elements
            if element["category"] == "textarea" and element["left"] == 218
        }
        first_title = textareas[jobs[0]["title"]]
        first_meta = textareas["Northbridge Bank   ·   Warszawa   ·   2021 – obecnie"]
        first_bullets = textareas["• Prowadzenie analiz AML.\n• Raportowanie ryzyka."]
        second_title = textareas[jobs[1]["title"]]
        second_meta = textareas["Meridian Bank   ·   Kraków   ·   2018 – 2021"]
        second_bullets = textareas["• Weryfikacja klientów.\n• Kontrola dokumentacji."]
        records = (
            (first_title, first_meta, first_bullets),
            (second_title, second_meta, second_bullets),
        )

        for title, metadata, bullets in records:
            self.assertEqual({title["left"], metadata["left"], bullets["left"]}, {218})
            self.assertEqual({title["width"], metadata["width"], bullets["width"]}, {329})
            # Equal stack gap inside a record; equal record gap between jobs.
            self.assertAlmostEqual(metadata["top"] - (title["top"] + title["height"]), 4)
            self.assertAlmostEqual(bullets["top"] - (metadata["top"] + metadata["height"]), 4)

        self.assertAlmostEqual(
            second_title["top"] - (first_bullets["top"] + first_bullets["height"]),
            10,
        )

        # Tessera uppercases the masthead name and role.
        header_texts = [
            element for element in elements
            if element["category"] == "text"
            and element.get("content") in {"ANNA KOWALSKA", "AML ANALYST"}
        ]
        self.assertTrue(header_texts)
        # Name sits on the main column; the role line sits on the coral title tile.
        self.assertTrue(all(element["left"] >= 218 for element in header_texts))
        self.assertTrue(all(element["left"] < 230 for element in header_texts))

    def test_education_is_structured_in_main_column_and_sidebar(self):
        education = [{
            "degree": "Magister prawa",
            "school": "Uniwersytet Warszawski",
            "city": "Warszawa",
            "period": "2017 – 2022",
            "description": "Specjalizacja: prawo europejskie",
        }]
        main = generate_resume("regent", {
            "name": "Anna Kowalska",
            "title": "Prawnik",
            "education": education,
            "experience": [],
            "skills": [],
            "extra_sections": [],
        })
        main_copy = [
            element["content"]
            for element in main
            if element["category"] == "textarea" and element.get("left", 0) >= 100
        ]
        self.assertIn("Magister prawa", main_copy)
        self.assertIn("Uniwersytet Warszawski", main_copy)
        self.assertIn("Warszawa   ·   2017 – 2022", main_copy)
        self.assertIn("• Specjalizacja: prawo europejskie", main_copy)

        sidebar = generate_resume("tessera", {
            "name": "Anna Kowalska",
            "title": "Prawnik",
            "education": education,
            "experience": [],
            "skills": ["Analiza"],
            "extra_sections": [],
        })
        sidebar_copy = "\n".join(
            element["content"]
            for element in sidebar
            if element["category"] == "textarea" and element.get("left") == 25
        )
        self.assertIn("Magister prawa", sidebar_copy)
        self.assertIn("Uniwersytet Warszawski", sidebar_copy)
        self.assertIn("Warszawa   ·   2017 – 2022", sidebar_copy)
        self.assertIn("• Specjalizacja: prawo europejskie", sidebar_copy)

    def test_education_description_uses_the_experience_body_color(self):
        """Education descriptions must read like body content, not muted metadata."""
        education_description = "Opis programu studiów."
        experience_bullet = "Prowadzenie programu transformacji."
        cv = {
            "name": "Anna Kowalska",
            "title": "Prawnik",
            "experience": [{
                "title": "Analityczka",
                "company": "Przykładowa organizacja",
                "period": "2020 – obecnie",
                "bullets": [experience_bullet],
            }],
            "education": [{
                "degree": "Magister prawa",
                "school": "Uniwersytet Warszawski",
                "city": "Warszawa",
                "period": "2017 – 2022",
                "description": education_description,
            }],
            "skills": [],
            "extra_sections": [],
        }
        # These are every template id whose main-column education description
        # previously inherited the muted metadata color. Sidebar templates are
        # forced into the main column because their sidebar has a deliberately
        # separate palette.
        affected_templates = (
            "ledger", "nimbus", "cinder",
            "kernel",
            "regent", "aldine",
            "tessera", "monument",
        )

        for template_id in affected_templates:
            with self.subTest(template_id=template_id):
                if template_id == "tessera":
                    # Tessera imports the helper into its own module namespace.
                    with patch(
                        "app.services.cv_templates.templates.tessera._fit_sidebar_sections",
                        return_value=([], set()),
                    ):
                        elements = generate_resume(template_id, cv)
                else:
                    elements = generate_resume(template_id, cv)

                description = next(
                    element for element in elements
                    if element.get("content") == f"• {education_description}"
                )
                experience = next(
                    element for element in elements
                    if element.get("content") == f"• {experience_bullet}"
                )
                school = next(
                    element for element in elements
                    if element.get("content") == "Uniwersytet Warszawski"
                )
                metadata = next(
                    element for element in elements
                    if element.get("content") == "Warszawa   ·   2017 – 2022"
                )

                self.assertEqual(description["color"], experience["color"])
                self.assertTrue(description.get("bulletList"))
                # School uses ink (same family as the degree), not muted meta.
                degree = next(
                    element for element in elements
                    if element.get("content") == "Magister prawa"
                )
                self.assertEqual(school["color"], degree["color"])
                self.assertNotEqual(description["color"], metadata["color"])
                self.assertNotEqual(school["color"], metadata["color"])

    def test_classic_templates_are_image_free_single_column_documents(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        templates = ("regent", "aldine")
        expected_categories = {
            "text", "textarea", "line", "rectangle", "circle", "ellipse",
        }

        for template_id in templates:
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, multi_page_cv)
                pages = {element.get("page", 1) for element in elements}
                rendered_copy = " ".join(
                    str(element.get("content", ""))
                    for element in elements
                    if element["category"] in {"text", "textarea"}
                ).upper()

                categories = {element["category"] for element in elements}
                self.assertTrue(expected_categories <= categories)
                self.assertNotIn("connector", categories)
                self.assertNotIn("IMAGE", {element["category"] for element in elements})
                self.assertNotIn(template_id.upper(), rendered_copy)
                self.assertGreater(max(pages), 1)
                self.assertTrue(all(
                    0 <= element["left"] <= 595
                    and 0 <= element["top"] <= 842
                    and element["left"] + element["width"] <= 595
                    and element["top"] + element["height"] <= 842
                    and element.get("autoHeight") is True
                    for element in elements
                    if element["category"] == "textarea"
                ))
                for page in pages:
                    self.assertTrue(any(
                        element["category"] == "line"
                        and element.get("page", 1) == page
                        and element["left"] == 0
                        and element["top"] == 0
                        and element["width"] == 595
                        and element["height"] == 842
                        and element.get("fixedToPage") is True
                        for element in elements
                    ))

    def test_monument_is_monochrome_and_keeps_summary_at_body_size(self):
        elements = generate_resume("monument", {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "extra_sections": [{
                "title": "Projekty strategiczne",
                "kind": "projects",
                "placement": "after_experience",
                "items": [{
                    "title": "System marki dla usług publicznych",
                    "subtitle": "2025 · kierunek kreatywny",
                    "bullets": ["Ujednolicono komunikację trzydziestu usług."],
                }],
            }],
        })
        text_elements = [
            element
            for element in elements
            if element["category"] in {"text", "textarea"}
        ]
        colors = {
            element[color_key].upper()
            for element in elements
            for color_key in ("color", "backgroundColor")
            if element.get(color_key)
        }

        self.assertTrue(text_elements)
        self.assertGreater(max(element.get("page", 1) for element in elements), 1)
        # Authored Monument sizes bottom out at 9 px. Nested project subtitles
        # from the shared record helper may use body * 0.92 and sit slightly below.
        primary_text = [
            element for element in text_elements
            if element.get("content") != "2025 · kierunek kreatywny"
        ]
        self.assertGreaterEqual(min(element["fontSize"] for element in primary_text), 9)
        self.assertTrue({"line", "rectangle"} <= {element["category"] for element in elements})
        section_numbers = [
            element
            for element in elements
            if element["category"] == "text"
            and element.get("color") == "#FFFFFF"
            and element.get("fontSize") == 11
        ]
        self.assertEqual(
            [element["content"] for element in section_numbers],
            ["01", "02", "03", "04", "05"],
        )
        section_frames = [
            element
            for element in elements
            if element["category"] == "rectangle"
            and element.get("left") == 106
            and element.get("width") == 251
            and element.get("height") == 32
        ]
        self.assertEqual(len(section_frames), len(section_numbers))
        self.assertTrue(all(
            element.get("flowRole") == "section-chrome"
            for element in section_frames + section_numbers
        ))
        masthead_rails = [
            element
            for element in elements
            if element["category"] == "line"
            and element.get("left") in {51, 529}
            and element.get("height") == 111
        ]
        self.assertEqual({element.get("page", 1) for element in masthead_rails}, {1})
        self.assertTrue(all(
            element.get("repeatOnContinuation") is False
            for element in masthead_rails
        ))
        selectable = [element for element in elements if not element.get("fixedToPage")]
        self.assertTrue(all(element.get("flowRole") for element in selectable))
        self.assertTrue(all(
            element.get("preserveInitialLayout") is True
            for element in selectable
            if element["category"] == "textarea"
        ))
        self.assertTrue(all(
            len(color) == 7
            and color[1:3] == color[3:5] == color[5:7]
            for color in colors
        ))
        self.assertTrue(any(
            element["category"] == "text"
            and element.get("fontSize") == 12.5
            and element.get("content") == "DOŚWIADCZENIE ZAWODOWE"
            for element in elements
        ))
        summary = next(
            element for element in elements
            if element["category"] == "textarea"
            and element.get("content") == LONG_CV["summary"]
        )
        body = next(
            element for element in elements
            if element["category"] == "textarea" and element.get("bulletList")
        )
        # Summary must share the body size, not sit one pixel above it.
        self.assertEqual(summary["fontSize"], body["fontSize"])
        self.assertEqual(summary["fontSize"], 9)

    def test_record_extra_sections_start_on_page_one_when_first_entry_fits(self):
        """
        Projects must pack under experience when the first entry fits.

        Requiring the whole projects block before page-breaking left a large
        empty band on page 1 even though PROJEKTY would start cleanly there.
        """
        long_project_bullets = [
            "Opis projektu obejmujący koncepcję, produkcję i dystrybucję materiałów.",
            "Koordynacja zespołu zdjęciowego oraz dostawców zewnętrznych na potrzeby kampanii.",
            "Przygotowanie wariantów layoutu i krótkich form wideo pod różne kanały.",
        ]
        elements = generate_resume("words", {
            **LONG_CV,
            "experience": LONG_CV["experience"][:2],
            "education": [],
            "skills": ["Art Direction", "Visual Storytelling", "Content Design"],
            "extra_sections": [{
                "title": "Projekty",
                "kind": "projects",
                "placement": "after_experience",
                "items": [
                    {
                        "title": "Editorial Fashion Shoot",
                        "subtitle": "Kampania lookbook",
                        "bullets": long_project_bullets,
                    },
                    {
                        "title": "TikTok / Instagram Visual Series",
                        "subtitle": "Seria short-form",
                        "bullets": long_project_bullets,
                    },
                ],
            }],
        })
        projects_heading = next(
            element for element in elements
            if element.get("content") == "PROJEKTY"
            and element.get("flowRole") == "section-chrome"
        )
        first_project = next(
            element for element in elements
            if element.get("content") == "Editorial Fashion Shoot"
        )
        content_before_projects = [
            element for element in elements
            if not element.get("fixedToPage")
            and element.get("page", 1) == 1
            and element.get("top", 0) < projects_heading["top"]
            and element.get("category") in {"text", "textarea"}
        ]
        last_before = max(
            content_before_projects,
            key=lambda element: element["top"] + element.get("height", 0),
        )
        last_bottom = last_before["top"] + last_before.get("height", 0)

        self.assertEqual(projects_heading.get("page", 1), 1)
        self.assertEqual(first_project.get("page", 1), 1)
        # Heading must sit directly under experience, not after a large dead band.
        # SPACE_SECTION (21) is the intended rhythm; anything much larger means
        # the section was incorrectly deferred as one oversized block.
        gap = projects_heading["top"] - last_bottom
        self.assertLess(gap, 48)

    def test_words_uses_word_document_rhythm_without_decorative_frames(self):
        elements = generate_resume("words", {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "extra_sections": [{
                "title": "Certyfikaty",
                "kind": "certifications",
                "placement": "after_skills",
                "items": ["PRINCE2 Practitioner", "AgilePM Foundation"],
            }],
        })
        text_elements = [
            element
            for element in elements
            if element["category"] in {"text", "textarea"}
        ]
        colors = {
            element[color_key].upper()
            for element in elements
            for color_key in ("color", "backgroundColor")
            if element.get(color_key)
        }
        section_headings = [
            element
            for element in elements
            if element["category"] == "text"
            and element.get("flowRole") == "section-chrome"
        ]
        circles = [
            element for element in elements if element["category"] == "circle"
        ]

        self.assertGreater(max(element.get("page", 1) for element in elements), 1)
        self.assertGreaterEqual(min(element["fontSize"] for element in text_elements), 10)
        self.assertTrue(all(
            element.get("fontFamily") == "Times-Roman"
            for element in text_elements
        ))
        self.assertIn(
            LONG_CV["name"],
            [element.get("content") for element in text_elements],
        )
        self.assertTrue(all(
            len(color) == 7
            and color[1:3] == color[3:5] == color[5:7]
            for color in colors
        ))
        self.assertFalse(any(
            element["category"] in {"rectangle", "ellipse", "image"}
            for element in elements
        ))
        self.assertTrue(section_headings)
        self.assertTrue(all(
            element.get("fontSize") == 12 for element in section_headings
        ))
        self.assertTrue(circles)
        self.assertTrue(all(
            element.get("width", 0) <= 7 and element.get("height", 0) <= 7
            for element in circles
        ))
        selectable = [
            element for element in elements if not element.get("fixedToPage")
        ]
        self.assertTrue(all(element.get("flowRole") for element in selectable))
        self.assertTrue(all(
            element.get("preserveInitialLayout") is True
            for element in selectable
            if element["category"] == "textarea"
        ))

    def test_classic_flow_keeps_clear_of_frame_and_continuation_inset(self):
        education = [
            {
                "degree": "Bachelor of Laws (LL.B.)",
                "school": "EU Viadrina",
                "city": "Frankfurt (Oder)",
                "period": "03/2015",
                "description": "Uzyskanie tytułu Bachelor of Laws z zakresu prawa niemieckiego.",
            },
            {
                "degree": "1. Juristische Prüfung",
                "school": "Goethe-Universität",
                "city": "Frankfurt am Main",
                "period": "04/2015",
                "description": "Państwowy egzamin prawniczy.",
            },
        ]
        elements = generate_resume("aldine", {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 2,
            "education": education,
        })

        flow = [
            element for element in elements
            if element["category"] in {"text", "textarea"}
            and not element.get("fixedToPage")
        ]
        page_two = [element for element in flow if element.get("page", 1) == 2]
        self.assertTrue(page_two)
        self.assertGreaterEqual(min(element["top"] for element in page_two), 66)

        for element in flow:
            if element["category"] != "textarea":
                continue
            self.assertLessEqual(element["top"] + element["height"], 770)

        first_degree = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == education[0]["degree"]
        )
        first_school = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == "EU Viadrina"
        )
        first_meta = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == "Frankfurt (Oder)   ·   03/2015"
        )
        first_body = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == f"• {education[0]['description']}"
        )
        self.assertEqual(first_degree["page"], first_school["page"])
        self.assertEqual(first_degree["page"], first_meta["page"])
        self.assertEqual(first_degree["page"], first_body["page"])
        self.assertLess(first_degree["top"], first_school["top"])
        self.assertLess(first_school["top"], first_meta["top"])
        self.assertLess(first_meta["top"], first_body["top"])
        self.assertTrue(first_body.get("bulletList"))

    def test_ledger_contains_every_canvas_element_category(self):
        elements = generate_resume("ledger", LONG_CV)
        categories = {element["category"] for element in elements}

        self.assertTrue({"text", "textarea", "line", "rectangle", "image"} <= categories)
        self.assertNotIn("connector", categories)
        self.assertFalse(any(
            element["category"] == "rectangle"
            and element.get("id", "").startswith("metric-")
            for element in elements
        ))
        self.assertTrue(all(
            element.get("autoHeight") is True
            for element in elements
            if element["category"] == "textarea"
        ))
        self.assertTrue(any(
            element["category"] == "image"
            and element["src"].endswith("/template-assets/ledger-finance-accent.png")
            for element in elements
        ))

    def test_nimbus_uses_every_canvas_element_without_theme_copy(self):
        elements = generate_resume("nimbus", LONG_CV)
        categories = {element["category"] for element in elements}
        rendered_copy = " ".join(
            str(element.get("content", ""))
            for element in elements
            if element["category"] in {"text", "textarea"}
        ).upper()

        self.assertTrue({"text", "textarea", "line", "rectangle", "image"} <= categories)
        self.assertNotIn("connector", categories)
        self.assertNotIn("NIMBUS", rendered_copy)
        self.assertTrue(any(
            element["category"] == "image"
            and element["src"].endswith("/template-assets/nimbus-finance-accent.png")
            for element in elements
        ))

    def test_nimbus_repeats_section_rail_on_continuation_pages(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("nimbus", multi_page_cv)
        education_heading = next(
            element
            for element in elements
            if element["category"] == "text"
            and element["content"] == "WYKSZTAŁCENIE"
        )

        self.assertGreater(education_heading["page"], 1)
        self.assertEqual(education_heading.get("flowRole"), "section-chrome")
        # Chip/rail stay in the heading band (not on the first record line).
        self.assertTrue(any(
            element["category"] == "rectangle"
            and element["page"] == education_heading["page"]
            and element["left"] == 45
            and abs(element["top"] - (education_heading["top"] + 1)) < 0.01
            and element.get("flowRole") == "section-chrome"
            for element in elements
        ))
        self.assertTrue(any(
            element["category"] == "line"
            and element["page"] == education_heading["page"]
            and element["left"] == 52
            and abs(element["top"] - (education_heading["top"] + 2)) < 0.01
            and element["height"] <= 16
            and element.get("flowRole") == "section-chrome"
            for element in elements
        ))

    def test_nimbus_keeps_education_record_with_heading_near_page_break(self):
        """Education chrome + first record must not leave only the degree on page 1."""
        job = {
            "title": "AML Analyst",
            "company": "Financial Institution",
            "city": "Warsaw",
            "period": "2023 – Present",
            "bullets": [
                "Monitoring transakcji i analiza alertow AML/KYC zgodnie z procedura wewnetrzna banku.",
                "Weryfikacja klientow w procesach onboarding i periodic review z ocena ryzyka.",
                "Dokumentowanie ustalen oraz przygotowywanie rekomendacji eskalacyjnych dla compliance.",
                "Wspolpraca z compliance przy przypadkach o podwyzszonym ryzyku i alertach SAR.",
            ],
        }
        cv = {
            **LONG_CV,
            "experience": [dict(job, title=f"AML Analyst {index}") for index in range(3)],
            "education": [
                {
                    "degree": "Bachelor of Laws (LL.B.)",
                    "school": "European University Viadrina",
                    "city": "Frankfurt (Oder)",
                    "period": "2014 – 2018",
                    "description": (
                        "Uzyskanie tytułu Bachelor of Laws z zakresu prawa "
                        "niemieckiego i europejskiego."
                    ),
                },
            ],
        }
        elements = generate_resume("nimbus", cv)
        heading = next(
            element
            for element in elements
            if element["category"] == "text" and element["content"] == "WYKSZTAŁCENIE"
        )
        degree = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and "Bachelor of Laws" in str(element.get("content", ""))
        )
        school = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and "Viadrina" in str(element.get("content", ""))
        )
        description = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and "Uzyskanie" in str(element.get("content", ""))
        )
        self.assertEqual(heading["page"], degree["page"])
        self.assertEqual(degree["page"], school["page"])
        self.assertEqual(degree["page"], description["page"])
        self.assertEqual(
            {degree.get("flowGroup"), school.get("flowGroup"), description.get("flowGroup")},
            {degree.get("flowGroup")},
        )
        self.assertLess(heading["top"], degree["top"])
        # Section markers must sit above the degree so reflow cannot insert
        # chrome between flowGroup mates.
        self.assertTrue(all(
            element["top"] < degree["top"] - 0.01
            for element in elements
            if element.get("flowRole") == "section-chrome"
            and element.get("page", 1) == heading["page"]
            and element["category"] in {"line", "rectangle"}
            and abs(element["top"] - heading["top"]) < 24
        ))


    def test_nova_keeps_skills_heading_with_body_near_page_break(self):
        """Iconic Nova must not leave UMIEJĘTNOŚCI alone above the footer."""
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 2,
            "extra_sections": [
                {
                    "title": "PROJEKTY",
                    "kind": "projects",
                    "placement": "after_experience",
                    "items": [
                        "Lookbook kampanii seasonal",
                        "Seria contentowa beauty",
                        "Editorial fashion story",
                        "Reels strategy dla marki lifestyle",
                    ],
                },
                {
                    "title": "ZAINTERESOWANIA",
                    "kind": "interests",
                    "placement": "after_skills",
                    "items": ["Moda", "Fotografia", "Design"],
                },
            ],
        }
        elements = generate_resume("nova", cv)
        heading = next(
            element
            for element in elements
            if element["category"] == "text"
            and "UMIEJĘTNOŚCI" in str(element.get("content", ""))
        )
        body = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and not element.get("bulletList")
            and " · " in str(element.get("content", ""))
            and LONG_CV["skills"][0] in str(element.get("content", ""))
            and element["page"] == heading["page"]
            and element["top"] > heading["top"]
        )
        self.assertEqual(heading["page"], body["page"])
        self.assertLess(heading["top"], body["top"])
        self.assertLessEqual(body["top"] + body["height"], 770)

    def test_nimbus_flow_keeps_margins_and_record_rhythm(self):
        from app.services.cv_generator import SPACE_RECORD, SPACE_STACK

        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("nimbus", multi_page_cv)
        flow = [
            element for element in elements
            if element["category"] in {"text", "textarea"}
            and not element.get("fixedToPage")
        ]
        page_two = [element for element in flow if element.get("page", 1) >= 2]
        self.assertTrue(page_two)
        self.assertGreaterEqual(min(element["top"] for element in page_two), 66)

        for element in flow:
            if element["category"] != "textarea":
                continue
            self.assertLessEqual(element["top"] + element["height"], 770)

        titles = [
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] in {
                job["title"] for job in multi_page_cv["experience"]
            }
        ]
        self.assertGreaterEqual(len(titles), 2)
        first, second = titles[0], titles[1]
        if first["page"] == second["page"]:
            self.assertGreaterEqual(second["top"] - first["top"], SPACE_RECORD + SPACE_STACK)

    def test_cinder_is_single_column_and_repeats_page_decorations(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("cinder", multi_page_cv)
        categories = {element["category"] for element in elements}
        pages = {element.get("page", 1) for element in elements}
        rendered_copy = " ".join(
            str(element.get("content", ""))
            for element in elements
            if element["category"] in {"text", "textarea"}
        ).upper()

        self.assertTrue({"text", "textarea", "line", "rectangle"} <= categories)
        self.assertNotIn("connector", categories)
        self.assertNotIn("CINDER", rendered_copy)
        self.assertGreater(max(pages), 1)
        self.assertTrue(all(
            element["left"] >= 76 and element["width"] >= 460
            for element in elements
            if element["category"] == "textarea"
        ))
        for page in pages:
            self.assertTrue(any(
                element["category"] == "line"
                and element.get("page", 1) == page
                and element["left"] == 0
                and element["top"] == 0
                and element["width"] == 595
                and element["height"] == 5
                and element["backgroundColor"] == "#C93F3F"
                and element["fixedToPage"] is True
                for element in elements
            ))
        for heading in ("PODSUMOWANIE ZAWODOWE", "DOŚWIADCZENIE ZAWODOWE", "WYKSZTAŁCENIE", "UMIEJĘTNOŚCI"):
            heading_element = next(
                element
                for element in elements
                if element["category"] == "text" and element["content"] == heading
            )
            self.assertTrue(any(
                element["category"] == "rectangle"
                and element.get("page", 1) == heading_element.get("page", 1)
                and element["left"] == 526
                and abs(element["top"] - (heading_element["top"] + 2)) < 0.01
                for element in elements
            ))

    def test_summary_matches_experience_body_type_size(self):
        """Lead summary must use the same font as main-column experience body."""
        from app.services.cv_generator import _GENERATORS

        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"][:1],
        }
        for template_id in sorted(_GENERATORS):
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                summary = next(
                    element
                    for element in elements
                    if element.get("category") == "textarea"
                    and element.get("content") == cv["summary"]
                    and element.get("page", 1) == 1
                )
                bullets = [
                    element
                    for element in elements
                    if element.get("category") == "textarea"
                    and element.get("bulletList")
                    and element.get("page", 1) == 1
                ]
                self.assertTrue(bullets, msg=f"{template_id}: missing experience bullets")
                # Prefer bullets in the same column as the summary (sidebar lists
                # can be smaller and must not set the comparison baseline).
                same_column = [
                    bullet
                    for bullet in bullets
                    if abs(float(bullet.get("left", 0)) - float(summary.get("left", 0))) < 40
                ] or bullets
                body = same_column[0]
                self.assertEqual(
                    summary.get("fontSize"),
                    body.get("fontSize"),
                    msg=(
                        f"{template_id}: summary fontSize {summary.get('fontSize')} "
                        f"!= body {body.get('fontSize')}"
                    ),
                )
                self.assertEqual(
                    summary.get("lineHeight"),
                    body.get("lineHeight"),
                    msg=(
                        f"{template_id}: summary lineHeight {summary.get('lineHeight')} "
                        f"!= body {body.get('lineHeight')}"
                    ),
                )


    def test_banded_mastheads_clear_first_section_heading(self):
        """Body copy must start below solid header bands (Cinder/Ledger)."""
        from app.services.cv_generator_primitives import SPACE_AFTER_MASTHEAD

        cases = {
            # template_id: (band_top, band_height) of the solid masthead fill
            "cinder": (0, 170),
            "ledger": (0, 151),  # 146 navy + 5px accent
        }
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"][:1],
        }
        for template_id, (band_top, band_height) in cases.items():
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                heading = next(
                    element
                    for element in elements
                    if element.get("category") == "text"
                    and element.get("content") == "PODSUMOWANIE ZAWODOWE"
                    and element.get("page", 1) == 1
                )
                band_bottom = band_top + band_height
                self.assertGreaterEqual(
                    heading["top"],
                    band_bottom + SPACE_AFTER_MASTHEAD - 0.01,
                    msg=(
                        f"{template_id}: first section at y={heading['top']} "
                        f"needs >= {SPACE_AFTER_MASTHEAD}px under masthead "
                        f"ending at y={band_bottom}"
                    ),
                )

    def test_header_rule_mastheads_clear_first_section_heading(self):
        """Thin masthead dividers leave 25–45 px before the first section."""
        # template_id → y of the wide header divider (top of 1px rule)
        cases = {
            "nimbus": 207,
            "regent": 158,
            "aldine": 157,
            "nova": 144,
            "words": None,  # hairline is measured from the generated layout
        }
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"][:1],
        }
        for template_id, rule_top in cases.items():
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                heading = next(
                    element
                    for element in elements
                    if element.get("category") == "text"
                    and element.get("content") == "PODSUMOWANIE ZAWODOWE"
                    and element.get("page", 1) == 1
                )
                if rule_top is None:
                    divider = max(
                        (
                            float(element["top"]) + float(element.get("height", 0))
                            for element in elements
                            if element.get("category") == "line"
                            and element.get("page", 1) == 1
                            and float(element.get("width", 0)) >= 250
                            and float(element.get("height", 0)) <= 1
                            and float(element["top"]) < heading["top"]
                            and float(element["top"]) > 40
                        ),
                        default=None,
                    )
                    self.assertIsNotNone(divider, msg=f"{template_id}: missing header rule")
                    rule_bottom = divider
                else:
                    rule_bottom = rule_top + 1
                gap = heading["top"] - rule_bottom
                self.assertGreaterEqual(
                    gap,
                    25.0,
                    msg=(
                        f"{template_id}: gap {gap:.1f}px under header rule "
                        f"ending at y={rule_bottom} is below the 25px band"
                    ),
                )
                self.assertLessEqual(
                    gap,
                    45.0,
                    msg=(
                        f"{template_id}: gap {gap:.1f}px under header rule "
                        "exceeds the 45px upper band"
                    ),
                )


    def test_active_templates_keep_textareas_inside_page_bounds(self):
        for template_id in (
            "ledger", "kernel", "regent", "harbor", "tessera", "nova",
        ):
            with self.subTest(template_id=template_id):
                multi_page_cv = {
                    **LONG_CV,
                    "experience": LONG_CV["experience"] * 3,
                }
                elements = generate_resume(template_id, multi_page_cv)
                for element in elements:
                    if element["category"] != "textarea":
                        continue
                    self.assertGreaterEqual(element["left"], 0)
                    self.assertGreaterEqual(element["top"], 0)
                    self.assertLessEqual(element["left"] + element["width"], 595)
                    self.assertLessEqual(element["top"] + element["height"], 842)
                    self.assertTrue(element["autoHeight"])
                self.assertGreater(max(element.get("page", 1) for element in elements), 1)

    def test_harbor_wraps_complete_sidebar_education_without_x_overflow(self):
        description = (
            "Międzynarodowe prawo gospodarcze oraz regulacje przeciwdziałania "
            "praniu pieniędzy w instytucjach finansowych."
        )
        cv = {
            **LONG_CV,
            "education": [{
                "degree": "Bachelor of Laws (LL.B.) i dodatkowa specjalizacja",
                "school": "Europejski Uniwersytet Viadrina we Frankfurcie nad Odrą",
                "city": "Frankfurt nad Odrą",
                "period": "2016 – 2019",
                "description": description,
            }],
        }

        elements = generate_resume("harbor", cv)
        sidebar_blocks = [
            element for element in elements
            if element["category"] == "textarea"
            and float(element.get("left", 0)) >= 364
        ]

        self.assertTrue(
            any(element.get("content") == description for element in sidebar_blocks),
            msg="Harbor truncated or omitted the education description",
        )
        self.assertTrue(sidebar_blocks, msg="Harbor emitted no wrapped sidebar blocks")
        for element in sidebar_blocks:
            self.assertLessEqual(
                float(element["left"]) + float(element["width"]),
                551,
                msg=f"Harbor sidebar block overflows X: {element.get('content')!r}",
            )
            self.assertLessEqual(
                float(element["top"]) + float(element["height"]),
                770,
                msg=f"Harbor sidebar block overflows the content footer: {element.get('content')!r}",
            )
        sidebar_overlays = [
            element for element in elements
            if element.get("flowRole") == "record-overlay"
            and float(element.get("left", 0)) >= 364
        ]
        self.assertTrue(sidebar_overlays, msg="Harbor emitted no sidebar icon overlays")
        for overlay in sidebar_overlays:
            self.assertTrue(
                any(
                    block.get("flowGroup") == overlay.get("flowGroup")
                    and block.get("page", 1) == overlay.get("page", 1)
                    and abs(
                        float(overlay.get("top", 0)) - float(block.get("top", 0)) - 0.25
                    ) < 0.01
                    for block in sidebar_blocks
                ),
                msg=f"Harbor sidebar icon has no aligned text anchor: {overlay!r}",
            )

    def test_harbor_keeps_fourth_experience_record_in_available_page_one_space(self):
        fourth_job = {
            "title": "Customer Service Specialist with German",
            "company": "Amazon CS Poland",
            "city": "Warszawa",
            "period": "2022 – 2024",
            "bullets": [
                "Profesjonalna obsługa klienta z zachowaniem wysokich standardów jakości.",
                "Rozwiązywanie eskalacji oraz monitoring nowych pracowników w ramach wdrożeń.",
                "Analiza jakości obsługi klienta oraz przygotowywanie raportów.",
            ],
        }
        elements = generate_resume("harbor", {
            **LONG_CV,
            "experience": [*LONG_CV["experience"], fourth_job],
        })

        fourth_cluster = [
            element for element in elements
            if element.get("content") == fourth_job["title"]
            or fourth_job["bullets"][0] in str(element.get("content", ""))
        ]
        self.assertEqual(len(fourth_cluster), 2)
        self.assertTrue(
            all(element.get("page", 1) == 1 for element in fourth_cluster),
            msg=f"Harbor left a page-one hole: {fourth_cluster!r}",
        )
        self.assertLessEqual(
            max(float(element["top"]) + float(element.get("height", 0)) for element in fourth_cluster),
            770,
        )
        company = next(
            element for element in elements
            if element.get("category") == "textarea"
            and element.get("content") == fourth_job["company"]
        )
        meta_overlays = [
            element for element in elements
            if element.get("flowRole") == "record-overlay"
            and element.get("flowGroup") == company.get("flowGroup")
        ]
        self.assertEqual(len(meta_overlays), 4)
        for element in meta_overlays:
            expected_offset = 0.5 if element.get("category") == "image" else 1.9
            self.assertEqual(element.get("page", 1), company.get("page", 1))
            self.assertAlmostEqual(
                float(element.get("top", 0)) - float(company.get("top", 0)),
                expected_offset,
                places=2,
            )
        self.assertTrue(all(
            element.get("alignWithText") is False
            for element in meta_overlays
            if element.get("category") == "image"
        ))

    def test_iconic_templates_pair_contact_and_section_icons(self):
        contact_keys = ("email", "phone", "location")
        for template_id, theme in (
            ("nova", "nova"),
            ("volt", "volt"),
        ):
            with self.subTest(template_id=template_id):
                multi_page_cv = {
                    **LONG_CV,
                    "experience": LONG_CV["experience"] * 3,
                    "extra_sections": [
                        {
                            "title": "JĘZYKI",
                            "kind": "languages",
                            "placement": "after_skills",
                            "items": ["Polski — ojczysty", "Angielski — C1"],
                        },
                        {
                            "title": "ZAINTERESOWANIA",
                            "kind": "interests",
                            "placement": "after_skills",
                            "items": ["Fotografia"],
                        },
                    ],
                }
                elements = generate_resume(template_id, multi_page_cv)
                categories = {element["category"] for element in elements}
                self.assertIn("image", categories)
                self.assertNotIn("connector", categories)

                icon_srcs = [
                    element["src"]
                    for element in elements
                    if element["category"] == "image"
                ]
                self.assertTrue(icon_srcs)
                self.assertTrue(all(f"/template-assets/iconic/" in src for src in icon_srcs))
                self.assertTrue(all(f"/iconic/{theme}/" in src for src in icon_srcs))

                for key in contact_keys:
                    self.assertTrue(
                        any(src.endswith(f"/{key}.png") for src in icon_srcs),
                        f"{template_id} missing contact icon {key}",
                    )
                for key in ("summary", "experience", "education"):
                    self.assertTrue(
                        any(f"/iconic/" in src and src.endswith(f"/{key}.png") for src in icon_srcs),
                        f"{template_id} missing section icon {key}",
                    )

                for element in elements:
                    if element["category"] != "image":
                        continue
                    local_path = Path(image_src_to_local_path(element["src"]))
                    self.assertTrue(local_path.is_file(), local_path)

                for element in elements:
                    if element["category"] != "textarea":
                        continue
                    self.assertGreaterEqual(element["left"], 0)
                    self.assertLessEqual(element["left"] + element["width"], 595)
                    self.assertLessEqual(element["top"] + element["height"], 842)

                pages_used = max(element.get("page", 1) for element in elements)
                self.assertGreater(pages_used, 1)

    def test_iconic_experience_record_gap_matches_projects(self):
        """Experience jobs must keep SPACE_RECORD like project records."""
        from app.services.cv_generator import SPACE_RECORD

        cv = {
            "name": "Anna Walczak",
            "title": "Dyrektor",
            "email": "anna@example.com",
            "phone": "+48 600 000 000",
            "location": "Warszawa",
            "summary": "Krotkie podsumowanie.",
            "experience": [
                {
                    "title": "Creative / Content Creator",
                    "company": "Freelance",
                    "period": "2023 – obecnie",
                    "bullets": ["Punkt jeden", "Punkt dwa", "Punkt trzy"],
                },
                {
                    "title": "Social Media Intern",
                    "company": "Studio",
                    "period": "2022 – 2023",
                    "bullets": ["Punkt A", "Punkt B"],
                },
            ],
            "extra_sections": [{
                "title": "PROJEKTY",
                "kind": "projects",
                "placement": "after_experience",
                "items": [
                    {
                        "title": "Editorial Fashion Shoot",
                        "bullets": ["Koncepcja", "Koordynacja", "Produkcja"],
                    },
                    {
                        "title": "TikTok Series",
                        "bullets": ["Kreacja", "Identity"],
                    },
                ],
            }],
        }
        for template_id in ("volt", "nova"):
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                job_titles = [
                    element for element in elements
                    if element["category"] == "textarea"
                    and element.get("bold")
                    and "Creative" in str(element.get("content", ""))
                ]
                job_two = next(
                    element for element in elements
                    if element["category"] == "textarea"
                    and element.get("bold")
                    and "Social Media" in str(element.get("content", ""))
                )
                job_one_bullets = next(
                    element for element in elements
                    if element["category"] == "textarea"
                    and element.get("bulletList")
                    and "Punkt jeden" in str(element.get("content", ""))
                )
                self.assertTrue(job_titles)
                exp_gap = job_two["top"] - (
                    job_one_bullets["top"] + job_one_bullets["height"]
                )
                self.assertAlmostEqual(exp_gap, SPACE_RECORD, places=1)

                project_two = next(
                    element for element in elements
                    if element["category"] == "textarea"
                    and element.get("bold")
                    and "TikTok" in str(element.get("content", ""))
                )
                project_one_bullets = next(
                    element for element in elements
                    if element["category"] == "textarea"
                    and element.get("bulletList")
                    and "Koncepcja" in str(element.get("content", ""))
                )
                proj_gap = project_two["top"] - (
                    project_one_bullets["top"] + project_one_bullets["height"]
                )
                self.assertAlmostEqual(proj_gap, SPACE_RECORD, places=1)
                self.assertAlmostEqual(exp_gap, proj_gap, places=1)


if __name__ == "__main__":
    unittest.main()
