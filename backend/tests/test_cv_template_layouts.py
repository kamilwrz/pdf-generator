import unittest
from pathlib import Path

from starlette.requests import Request

from app.api.routes.ai import _rebase_template_asset_urls
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
            "ledger", "nimbus", "rift",
            "vector", "kernel", "relay", "lattice",
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
            "vector": "vector-it-network.png",
            "kernel": "kernel-it-architecture.png",
            "relay": "relay-it-signal.png",
            "lattice": "lattice-it-cloud.png",
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

    def test_sidebar_templates_repeat_narrow_artwork_on_every_page(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        assets = {
            "quarry": "quarry-sidebar-v2.png",
            "moss": "moss-sidebar.png",
            "garnet": "garnet-sidebar.png",
            "harbor": "harbor-sidebar-v3.png",
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
                    sidebar_images = [
                        element for element in elements
                        if element["category"] == "image"
                        and element.get("page", 1) == page
                        and element["src"].endswith(f"/template-assets/{asset_name}")
                    ]
                    self.assertEqual(len(sidebar_images), 1)
                    self.assertEqual(sidebar_images[0]["left"], 0)
                    self.assertEqual(sidebar_images[0]["width"], 184)
                    self.assertEqual(sidebar_images[0]["height"], 842)
                    self.assertTrue(sidebar_images[0]["fixedToPage"])
                    self.assertTrue(Path(image_src_to_local_path(sidebar_images[0]["src"])).is_file())

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
            "Strategia\nBadania",
            "Polski — C2\nAngielski — C1",
            "PMP\nICAgile",
            "Fotografia\nŻeglarstwo",
            "MBA\nSGH\n2020",
        }

        for template_id in ("quarry", "moss", "garnet", "harbor"):
            with self.subTest(template_id=template_id):
                elements = generate_resume(template_id, cv)
                sidebar_text = [
                    element for element in elements
                    if element["category"] in {"text", "textarea"} and element["left"] == 24
                ]
                sidebar_bodies = {
                    element["content"]
                    for element in sidebar_text
                    if element["category"] == "textarea"
                }
                main_copy = "\n".join(
                    element["content"]
                    for element in elements
                    if element["category"] == "textarea" and element["left"] == 220
                )

                self.assertTrue(sidebar_titles <= {
                    element["content"] for element in sidebar_text if element["category"] == "text"
                })
                self.assertTrue(complete_sidebar_bodies <= sidebar_bodies)
                self.assertTrue(all(
                    element["page"] == 1
                    and element["width"] == 136
                    and element["top"] + element["height"] <= 758
                    for element in sidebar_text
                    if element["category"] == "textarea"
                ))
                for body in complete_sidebar_bodies:
                    self.assertNotIn(body, main_copy)
                self.assertIn("• Platforma obsługi klienta", main_copy)

    def test_obsidian_places_skills_languages_education_in_sidebar(self):
        # Tall skills used to exceed _SIDEBAR_MAX_SECTION_HEIGHT and fall into
        # the main column while languages/education still occupied the sidebar.
        skills = [
            "Analiza AML/KYC",
            "Transaction Monitoring",
            "CDD / EDD",
            "Analiza transakcji",
            "Badania klientów",
            "Microsoft Office",
            "Compliance",
            "Risk Assessment",
            "Due Diligence",
            "Raportowanie",
            "Analiza danych",
            "Przepisy AML",
        ]
        cv = {
            **LONG_CV,
            "skills": skills,
            "education": [{
                "degree": "MBA",
                "school": "SGH",
                "city": "Warszawa",
                "period": "2020",
                "description": "Zarządzanie strategiczne.",
            }],
            "extra_sections": [{
                "title": "JĘZYKI",
                "kind": "languages",
                "placement": "after_skills",
                "items": ["Polski — C2", "Angielski — C1"],
            }],
        }
        elements = generate_resume("obsidian", cv)
        sidebar_text = [
            element for element in elements
            if element["category"] in {"text", "textarea"} and element["left"] == 24
        ]
        sidebar_titles = {
            element["content"] for element in sidebar_text if element["category"] == "text"
        }
        sidebar_bodies = [
            element for element in sidebar_text if element["category"] == "textarea"
        ]
        main_titles = {
            element["content"]
            for element in elements
            if element["category"] == "text" and element["left"] == 222
        }
        main_copy = "\n".join(
            element["content"]
            for element in elements
            if element["category"] == "textarea" and element["left"] == 222
        )

        self.assertTrue({"UMIEJĘTNOŚCI", "JĘZYKI", "WYKSZTAŁCENIE"} <= sidebar_titles)
        self.assertNotIn("OBSZARY", sidebar_titles)
        self.assertNotIn("UMIEJĘTNOŚCI", main_titles)

        skills_body = next(
            element for element in sidebar_bodies
            if "• Analiza AML/KYC" in element["content"]
        )
        self.assertTrue(skills_body.get("bulletList"))
        self.assertIn("• Przepisy AML", skills_body["content"])

        languages_body = next(
            element for element in sidebar_bodies
            if "• Polski — C2" in element["content"]
        )
        self.assertTrue(languages_body.get("bulletList"))
        self.assertIn("• Angielski — C1", languages_body["content"])

        self.assertTrue(any(
            element["content"] == "MBA — 2020" and element.get("bold")
            for element in sidebar_bodies
        ))
        self.assertTrue(any(
            element["content"] == "SGH, Warszawa" for element in sidebar_bodies
        ))
        self.assertTrue(any(
            element["content"] == "Zarządzanie strategiczne."
            for element in sidebar_bodies
        ))

        self.assertNotIn("• Analiza AML/KYC", main_copy)
        self.assertNotIn("MBA — 2020", main_copy)
        self.assertNotIn("• Polski — C2", main_copy)
        self.assertTrue(all(
            element["page"] == 1
            and element["width"] == 136
            and element["top"] + element["height"] <= 758
            for element in sidebar_bodies
        ))

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

        elements = generate_resume("harbor", cv)
        sidebar_text = [
            element for element in elements
            if element["category"] in {"text", "textarea"} and element["left"] == 24
        ]
        main_textareas = [
            element for element in elements
            if element["category"] == "textarea" and element["left"] == 220
        ]
        main_copy = "\n".join(element["content"] for element in main_textareas)

        self.assertNotIn("UMIEJĘTNOŚCI", {element["content"] for element in sidebar_text})
        self.assertNotIn("OBSZARY", {element["content"] for element in sidebar_text})
        self.assertNotIn("JĘZYKI", {element["content"] for element in sidebar_text})
        self.assertNotIn("WYKSZTAŁCENIE", {element["content"] for element in sidebar_text})
        self.assertIn(skills[0], main_copy)
        self.assertIn(skills[-1], main_copy)
        self.assertIn(f"• {languages[0]}", main_copy)
        self.assertIn(f"• {languages[-1]}", main_copy)
        self.assertIn(education[0]["degree"], main_copy)
        self.assertIn(education[-1]["degree"], main_copy)

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
        elements = generate_resume("moss", {
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
        self.assertLessEqual(fourth_bullets["top"] + fourth_bullets["height"], 758)

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
        elements = generate_resume("moss", {
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
            if element["category"] == "textarea" and element["left"] == 220
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
            self.assertEqual({title["left"], metadata["left"], bullets["left"]}, {220})
            self.assertEqual({title["width"], metadata["width"], bullets["width"]}, {326})
            # Equal stack gap inside a record; equal record gap between jobs.
            self.assertAlmostEqual(metadata["top"] - (title["top"] + title["height"]), 4)
            self.assertAlmostEqual(bullets["top"] - (metadata["top"] + metadata["height"]), 4)

        self.assertAlmostEqual(
            second_title["top"] - (first_bullets["top"] + first_bullets["height"]),
            14,
        )

        header_texts = [
            element for element in elements
            if element["category"] == "text"
            and element.get("content") in {"ANNA KOWALSKA", "AML ANALYST"}
        ]
        self.assertTrue(header_texts)
        self.assertEqual({element["left"] for element in header_texts}, {220})

    def test_education_is_structured_in_main_column_and_sidebar(self):
        education = [{
            "degree": "Magister prawa",
            "school": "Uniwersytet Warszawski",
            "city": "Warszawa",
            "period": "2017 – 2022",
            "description": "Specjalizacja: prawo europejskie",
        }]
        main = generate_resume("merit", {
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
        self.assertIn("Uniwersytet Warszawski   ·   Warszawa   ·   2017 – 2022", main_copy)
        self.assertIn("Specjalizacja: prawo europejskie", main_copy)

        sidebar = generate_resume("moss", {
            "name": "Anna Kowalska",
            "title": "Prawnik",
            "education": education,
            "experience": [],
            "skills": ["Analiza"],
            "extra_sections": [],
        })
        sidebar_block = next(
            element["content"]
            for element in sidebar
            if element["category"] == "textarea"
            and element.get("left") == 24
            and "Magister prawa" in element["content"]
        )
        self.assertIn("Uniwersytet Warszawski  ·  Warszawa", sidebar_block)
        self.assertIn("2017 – 2022", sidebar_block)
        self.assertIn("Specjalizacja: prawo europejskie", sidebar_block)

    def test_classic_templates_are_image_free_single_column_documents(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
        }
        templates = ("scribe", "regent", "aldine", "merit")
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
            self.assertLessEqual(element["top"] + element["height"], 746)

        first_degree = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == education[0]["degree"]
        )
        first_meta = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == "EU Viadrina   ·   Frankfurt (Oder)   ·   03/2015"
        )
        first_body = next(
            element for element in elements
            if element["category"] == "textarea"
            and element["content"] == education[0]["description"]
        )
        self.assertEqual(first_degree["page"], first_meta["page"])
        self.assertEqual(first_degree["page"], first_body["page"])
        self.assertLess(first_degree["top"], first_meta["top"])
        self.assertLess(first_meta["top"], first_body["top"])

    def test_rift_repeats_fixed_background_on_every_content_page(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("rift", multi_page_cv)
        pages = {element.get("page", 1) for element in elements}
        content_pages = {
            element.get("page", 1)
            for element in elements
            if element["category"] in {"text", "textarea"} and not element.get("fixedToPage")
        }

        self.assertGreater(max(pages), 1)
        self.assertEqual(pages, content_pages)
        for page in pages:
            backgrounds = [
                element
                for element in elements
                if element["category"] == "image"
                and element.get("page", 1) == page
                and element["src"].endswith("/template-assets/rift-cv-background.png")
            ]
            self.assertEqual(len(backgrounds), 1)
            self.assertTrue(backgrounds[0]["fixedToPage"])

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
        self.assertTrue(any(
            element["category"] == "rectangle"
            and element["page"] == education_heading["page"]
            and element["left"] == 45
            and abs(element["top"] - (education_heading["top"] + 20)) < 0.01
            for element in elements
        ))
        self.assertTrue(any(
            element["category"] == "line"
            and element["page"] == education_heading["page"]
            and element["left"] == 52
            and abs(element["top"] - (education_heading["top"] + 5)) < 0.01
            and element["height"] <= 40
            for element in elements
        ))

    def test_signal_keeps_education_heading_with_body_on_page_break(self):
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 2,
        }
        elements = generate_resume("signal", cv)
        heading = next(
            element
            for element in elements
            if element["category"] == "text" and "WYKSZTAŁCENIE" in str(element.get("content", ""))
        )
        body = next(
            element
            for element in elements
            if element["category"] == "textarea"
            and "Magister" in str(element.get("content", ""))
        )
        self.assertEqual(heading["page"], body["page"])
        self.assertLess(heading["top"], body["top"])
        self.assertGreaterEqual(heading["top"], 56)

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
            and "·" in str(element.get("content", ""))
            and element["page"] == heading["page"]
            and element["top"] > heading["top"]
        )
        self.assertEqual(heading["page"], body["page"])
        self.assertLess(heading["top"], body["top"])
        self.assertLessEqual(body["top"] + body["height"], 746)

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
            self.assertLessEqual(element["top"] + element["height"], 746)

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

    def test_banking_templates_are_distinct_multpage_canvas_layouts(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        expected_categories = {
            "text", "textarea", "line", "rectangle", "circle", "ellipse",
        }
        expected_papers = {
            "vault": "#F3F3ED",
            "clearing": "#FBFCFE",
            "herald": "#FCF8F0",
            "signal": "#101C26",
        }

        for template_id, paper in expected_papers.items():
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
                self.assertNotIn(template_id.upper(), rendered_copy)
                self.assertGreater(max(pages), 1)
                self.assertTrue(all(
                    element.get("autoHeight") is True
                    and 0 <= element["left"] <= 595
                    and 0 <= element["top"] <= 842
                    and element["left"] + element["width"] <= 595
                    and element["top"] + element["height"] <= 842
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
                        and element["backgroundColor"] == paper
                        and element.get("fixedToPage") is True
                        for element in elements
                    ))

    def test_onyx_page_frames_are_fixed_decorations(self):
        """Full-page bronze frames must not participate in textarea reflow."""
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("onyx", multi_page_cv)
        pages = {element.get("page", 1) for element in elements}
        self.assertGreater(max(pages), 1)

        frame_rects = [
            element
            for element in elements
            if element["category"] == "rectangle"
            and element.get("width", 0) >= 500
            and element.get("height", 0) >= 700
        ]
        self.assertGreaterEqual(len(frame_rects), 2)
        for frame in frame_rects:
            self.assertTrue(
                frame.get("fixedToPage") is True,
                f"onyx frame on page {frame.get('page', 1)} must be fixedToPage",
            )

        for page in pages:
            self.assertTrue(any(
                element["category"] == "line"
                and element.get("page", 1) == page
                and element.get("fixedToPage") is True
                and element["width"] == 595
                and element["height"] == 842
                and element["backgroundColor"] == "#0E0E10"
                for element in elements
            ))

    def test_active_templates_keep_textareas_inside_page_bounds(self):
        for template_id in ("ledger", "vector", "scribe", "quarry", "obsidian", "onyx"):
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

    def test_iconic_templates_pair_contact_and_section_icons(self):
        contact_keys = ("email", "phone", "location")
        for template_id, theme in (
            ("nova", "nova"),
            ("ridge", "ridge"),
            ("loom", "loom"),
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
                if template_id == "loom":
                    self.assertTrue(any("loom-light" in src for src in icon_srcs))
                else:
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

                self.assertGreater(max(element.get("page", 1) for element in elements), 1)
                if template_id == "loom":
                    # Skills live in the sidebar only — no second skills heading in main flow.
                    skill_icons = [
                        src for src in icon_srcs
                        if src.endswith("/skills.png")
                    ]
                    self.assertTrue(any("loom-light" in src for src in skill_icons))
                    # Contact rows are single-line text + geometrically centred icons.
                    contact_icons = [
                        element for element in elements
                        if element["category"] == "image"
                        and any(element["src"].endswith(f"/{key}.png") for key in contact_keys)
                        and "loom-light" in element["src"]
                    ]
                    self.assertEqual(len(contact_icons), 3)
                    for icon in contact_icons:
                        self.assertEqual(icon.get("alignWithText"), False)
                        self.assertEqual(icon["width"], 9)
                        self.assertEqual(icon["height"], 9)
                    email_textareas = [
                        element for element in elements
                        if element["category"] == "textarea"
                        and "@" in str(element.get("content") or "")
                        and element["left"] < 100
                    ]
                    self.assertEqual(
                        email_textareas,
                        [],
                        "Loom contact email must be text, not an auto-height textarea",
                    )
                    # Sidebar section chrome shares one text column (x=40) and
                    # geometric icon alignment so skills/interests/languages stay even.
                    side_heads = [
                        element for element in elements
                        if element["category"] == "text"
                        and element.get("left") == 40
                        and str(element.get("content", "")).upper() in {
                            "UMIEJĘTNOŚCI", "JĘZYKI", "ZAINTERESOWANIA",
                        }
                    ]
                    self.assertGreaterEqual(len(side_heads), 2)
                    side_icons = [
                        element for element in elements
                        if element["category"] == "image"
                        and "loom-light" in element["src"]
                        and any(
                            element["src"].endswith(f"/{key}.png")
                            for key in ("skills", "languages", "interests")
                        )
                    ]
                    self.assertGreaterEqual(len(side_icons), 2)
                    for icon in side_icons:
                        self.assertEqual(icon.get("alignWithText"), False)
                        self.assertEqual(icon["left"], 24)
                    side_bodies = [
                        element for element in elements
                        if element["category"] == "textarea"
                        and element.get("left") == 40
                        and element.get("bulletList")
                    ]
                    self.assertGreaterEqual(len(side_bodies), 2)
                    for body in side_bodies:
                        self.assertEqual(body["width"], 120)

    def test_iconic_experience_record_gap_matches_projects(self):
        """Experience jobs must keep SPACE_RECORD (14) like project records."""
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
        for template_id in ("volt", "nova", "ridge", "loom"):
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
