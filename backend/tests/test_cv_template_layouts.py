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
            "src": "http://localhost:8000/template-assets/regent-portrait.png",
        }], request)

        self.assertEqual(
            elements[0]["src"],
            "https://pdf-generator-07cb.onrender.com/template-assets/regent-portrait.png",
        )

    def test_template_images_resolve_to_versioned_local_assets(self):
        for template_id in (
            "tessera", "slate",
        ):
            with self.subTest(template_id=template_id):
                image = next(
                    element
                    for element in generate_resume(template_id, LONG_CV)
                    if element["category"] == "image"
                )
                local_path = Path(image_src_to_local_path(image["src"]))
                self.assertTrue(local_path.is_file())

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
        self.assertEqual(
            len([
                element
                for element in elements
                if element.get("photoSlot") == "ornament"
                and element.get("page", 1) == 1
            ]),
            4,
        )
        name = next(element for element in elements if element.get("mastheadRole") == "name")
        title_bar = next(
            element
            for element in elements
            if element.get("mastheadRole") == "title-decoration"
        )
        title = next(element for element in elements if element.get("mastheadRole") == "title")
        self.assertEqual((name["top"], title_bar["top"], title["top"]), (60, 92, 98))

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
        # Sidebar section bodies must remain editable; only photo chrome and
        # page rails are inert (`fixedToPage`). Contact is masthead-only.
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
        self.assertFalse(any(
            element.get("content") == "KONTAKT"
            for element in elements
            if element["category"] == "text" and element["left"] < side_width
        ))
        masthead_contact_labels = [
            element for element in elements
            if element["category"] == "text"
            and element.get("flowRole") == "masthead"
            and element["left"] >= 218
            and not element.get("bold")
            and element.get("fontSize", 0) < 10
        ]
        self.assertGreaterEqual(len(masthead_contact_labels), 2)
        contact_icons = [
            element for element in elements
            if element["category"] == "image"
            and element.get("flowRole") == "masthead"
            and any(
                element["src"].endswith(f"/{name}.png")
                for name in ("phone", "email", "location", "linkedin", "github", "website")
            )
        ]
        self.assertGreaterEqual(len(contact_icons), 2)

    def test_tessera_main_section_icon_is_centered_in_its_coral_box(self):
        """Main-column heading glyphs must sit in the geometric centre of their
        20px coral frame. The glyph is placed geometrically (`alignWithText`
        False) rather than via `_icon_beside` (which optically centres on the
        heading TEXT line and left the icon hanging near the top of the box)."""
        elements = generate_resume("tessera", LONG_CV)
        # Main-column coral outline frames: 20x20 rectangles tagged section-chrome
        # in the main column (left >= 200), one per main section heading.
        boxes = [
            element for element in elements
            if element["category"] == "rectangle"
            and element.get("flowRole") == "section-chrome"
            and element.get("width") == 20 and element.get("height") == 20
            and element["left"] >= 200
        ]
        main_icons = [
            element for element in elements
            if element["category"] == "image"
            and element.get("flowRole") == "section-chrome"
            and "/template-assets/iconic/tessera/" in element["src"]
            and element["left"] >= 200
        ]
        self.assertGreaterEqual(len(boxes), 1)
        self.assertEqual(len(main_icons), len(boxes))
        for icon in main_icons:
            # Geometric placement only — an optical (text-aligned) glyph would be
            # pulled ~half its height up out of the box on the canvas / PDF.
            self.assertFalse(
                icon.get("alignWithText", True),
                f"main section icon {icon['src']} must be geometrically placed",
            )
            box = min(
                boxes,
                key=lambda b: abs(b["top"] - icon["top"]) + abs(b["left"] - icon["left"]),
            )
            icon_cx = icon["left"] + icon["width"] / 2
            icon_cy = icon["top"] + icon["height"] / 2
            box_cx = box["left"] + box["width"] / 2
            box_cy = box["top"] + box["height"] / 2
            self.assertAlmostEqual(icon_cx, box_cx, delta=0.5)
            self.assertAlmostEqual(icon_cy, box_cy, delta=0.5)

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
        self.assertEqual(
            len([
                element
                for element in elements
                if element.get("photoSlot") == "ornament"
                and element.get("page", 1) == 1
            ]),
            5,
        )
        name = next(element for element in elements if element.get("mastheadRole") == "name")
        title_bar = next(
            element
            for element in elements
            if element.get("mastheadRole") == "title-decoration"
        )
        title = next(element for element in elements if element.get("mastheadRole") == "title")
        self.assertEqual((name["top"], title_bar["top"], title["top"]), (60, 92, 98))

        # Slate uses two icon colour variants: white glyphs for filled heading
        # badges and accent glyphs for masthead contact rows / the photo placeholder.
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

        # Sidebar section bodies must remain editable; only the photo chrome and
        # page rails are inert (fixedToPage). Contact is masthead-only.
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
        self.assertFalse(any(
            element.get("content") == "KONTAKT"
            for element in elements
            if element["category"] == "text" and element["left"] < side_width
        ))
        masthead_contact_labels = [
            element for element in elements
            if element["category"] == "text"
            and element.get("flowRole") == "masthead"
            and element["left"] >= 218
            and not element.get("bold")
            and element.get("fontSize", 0) < 10
        ]
        self.assertGreaterEqual(len(masthead_contact_labels), 2)
        contact_icons = [
            element for element in elements
            if element["category"] == "image"
            and element.get("flowRole") == "masthead"
            and any(
                element["src"].endswith(f"/{name}.png")
                for name in ("phone", "email", "location", "linkedin", "github", "website")
            )
        ]
        self.assertGreaterEqual(len(contact_icons), 2)

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
            "Polski - C2\nAngielski - C1",
            "• PMP\n• ICAgile",
            "• Fotografia\n• Żeglarstwo",
        }
        # Education is structured (separate degree / school / period elements),
        # matching single-column ``_place_education_record``.
        structured_education_parts = {"MBA", "SGH", "2020"}

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
                self.assertTrue(structured_education_parts <= sidebar_bodies)
                edu_degree = next(
                    element for element in elements
                    if element.get("content") == "MBA" and element.get("left") == 25
                )
                self.assertTrue(edu_degree.get("bold"))
                self.assertTrue(all(
                    element["page"] == 1
                    and element["width"] == 128
                    and element["top"] + element["height"] <= 770
                    for element in elements
                    if element["category"] == "textarea" and element["left"] == 25
                ))
                for body in complete_sidebar_bodies:
                    self.assertNotIn(body, main_copy)
                for part in structured_education_parts:
                    self.assertNotIn(part, main_copy)
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
        # Main column starts at 218; language grid cells sit at 218 + n·col_w.
        main_textareas = [
            element for element in elements
            if element["category"] == "textarea" and element["left"] >= 218
        ]
        main_copy = "\n".join(element["content"] for element in main_textareas)

        # Skills/languages are far taller than the first-page sidebar budget, so
        # they stay complete in the main column (never truncated in the sidebar).
        self.assertNotIn("UMIEJĘTNOŚCI", sidebar_heading_copy)
        self.assertNotIn("JĘZYKI", sidebar_heading_copy)
        self.assertIn(skills[0], main_copy)
        self.assertIn(skills[-1], main_copy)
        # Overflow languages land in the main column as a 4-column grid
        # (one textarea per language, not a bulleted block).
        self.assertIn(languages[0], main_copy)
        self.assertIn(languages[-1], main_copy)
        language_cells = [
            element for element in main_textareas
            if element.get("flowRole") == "grid-member"
            and any(lang in str(element.get("content", "")) for lang in languages)
        ]
        self.assertEqual(len(language_cells), len(languages))
        # Education may still fit wholly in the sidebar at a smaller font; if so,
        # every record must be present. Otherwise the full set is in the main column.
        if "WYKSZTAŁCENIE" in sidebar_heading_copy:
            self.assertIn(education[0]["degree"], sidebar_bodies)
            self.assertIn(education[-1]["degree"], sidebar_bodies)
            self.assertNotIn(education[0]["degree"], main_copy)
        else:
            self.assertIn(education[0]["degree"], main_copy)
            self.assertIn(education[-1]["degree"], main_copy)



    def test_single_column_emits_skills_and_languages_bodies(self):
        """Single-column Monument must keep skills/languages after wizard-style data."""
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
        for template_id in ("monument",):
            elements = generate_resume(template_id, profile)
            content = "\n".join(
                str(element.get("content", ""))
                for element in elements
                if element.get("category") in {"text", "textarea"}
            )
            self.assertIn("UMIEJĘTNOŚCI", content, template_id)
            self.assertIn("Strategia produktowa  ·  ", content, template_id)
            self.assertIn("JĘZYKI", content, template_id)
            self.assertIn("Polski — C2", content, template_id)
            language_cells = [
                element for element in elements
                if element.get("category") == "textarea"
                and element.get("flowRole") == "grid-member"
                and "Polski — C2" in str(element.get("content", ""))
            ]
            self.assertEqual(len(language_cells), 1, template_id)
            self.assertFalse(language_cells[0].get("bulletList"), template_id)
            self.assertTrue(language_cells[0].get("runs"), template_id)
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

        # Tessera uppercases the masthead name and role, but the caps are now
        # applied reversibly through the ``textTransform`` flag (Phase 3 masthead
        # identity): the stored ``content`` stays original-case so the toggle can
        # restore mixed case, while the renderer draws the identical uppercase
        # glyphs. Match the original-case content and assert the flag.
        header_texts = [
            element for element in elements
            if element["category"] == "text"
            and element.get("content") in {"Anna Kowalska", "AML Analyst"}
        ]
        self.assertTrue(header_texts)
        self.assertTrue(
            all(element.get("textTransform") == "uppercase" for element in header_texts)
        )
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
        main = generate_resume("monument", {
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
            # Main-column templates currently start between 80 pt and
            # 218 pt (Tessera). The threshold excludes sidebar copy without
            # coupling this structural test to one template's exact margin.
            if element["category"] == "textarea" and element.get("left", 0) >= 90
        ]
        self.assertIn("Magister prawa", main_copy)
        self.assertIn("Uniwersytet Warszawski", main_copy)
        self.assertIn("Warszawa   ·   2017 – 2022", main_copy)
        self.assertIn("• Specjalizacja: prawo europejskie", main_copy)

        for template_id in ("tessera", "slate"):
            with self.subTest(template_id=template_id):
                sidebar = generate_resume(template_id, {
                    "name": "Anna Kowalska",
                    "title": "Prawnik",
                    "education": education,
                    "experience": [],
                    "skills": ["Analiza"],
                    "extra_sections": [],
                    "summary": "Krotkie podsumowanie zawodowe do sidebara.",
                })
                # Sidebar education must be separate elements (degree / school /
                # meta / bullets), not one mashed plaintext textarea.
                side_bodies = [
                    element
                    for element in sidebar
                    if element["category"] == "textarea"
                    and element.get("flowLane") == "sidebar"
                ]
                side_copy = "\n".join(element["content"] for element in side_bodies)
                self.assertIn("Magister prawa", side_copy)
                self.assertIn("Uniwersytet Warszawski", side_copy)
                self.assertIn("Warszawa   ·   2017 – 2022", side_copy)
                self.assertIn("• Specjalizacja: prawo europejskie", side_copy)

                degree = next(
                    element for element in side_bodies
                    if element.get("content") == "Magister prawa"
                )
                school = next(
                    element for element in side_bodies
                    if element.get("content") == "Uniwersytet Warszawski"
                )
                meta = next(
                    element for element in side_bodies
                    if element.get("content") == "Warszawa   ·   2017 – 2022"
                )
                description = next(
                    element for element in side_bodies
                    if element.get("content") == "• Specjalizacja: prawo europejskie"
                )
                self.assertTrue(degree.get("bold"))
                self.assertFalse(school.get("bold"))
                self.assertNotEqual(degree.get("content"), school.get("content"))
                self.assertNotEqual(
                    degree["top"], description["top"],
                    "description must be its own element, not mashed into the degree box",
                )
                self.assertTrue(description.get("bulletList"))
                # One flowGroup keeps diploma + school + meta + bullets atomic.
                self.assertEqual(degree.get("flowGroup"), school.get("flowGroup"))
                self.assertEqual(degree.get("flowGroup"), meta.get("flowGroup"))
                self.assertEqual(degree.get("flowGroup"), description.get("flowGroup"))

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
            and element.get("width", 0) > 0
            and element.get("height", 0) > 0
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
        photo_frame = next(
            (
                element
                for element in elements
                if element.get("id") == "monument-masthead-frame"
            ),
            None,
        )
        self.assertIsNotNone(photo_frame)
        self.assertEqual(photo_frame.get("photoSlot"), "frame")
        self.assertEqual(photo_frame.get("photoShape"), "ornament-frame")
        self.assertTrue(photo_frame.get("fixedToPage"))
        self.assertEqual(
            (
                photo_frame.get("left"),
                photo_frame.get("top"),
                photo_frame.get("width"),
                photo_frame.get("height"),
            ),
            (425, 47, 80, 107),
        )
        portrait_glyph = next(
            element
            for element in elements
            if element.get("photoSlot") == "glyph"
        )
        self.assertIn("/template-assets/iconic/monument/portrait.png", portrait_glyph["src"])
        self.assertEqual(portrait_glyph["width"], 32)
        self.assertFalse(portrait_glyph.get("alignWithText"))
        photo_ornaments = [
            element
            for element in elements
            if element.get("photoSlot") == "ornament"
        ]
        self.assertEqual(photo_ornaments, [])
        contact_icons = [
            element
            for element in elements
            if element["category"] == "image"
            and element.get("contactBandId") == "monument-contact"
        ]
        self.assertGreaterEqual(len(contact_icons), 3)
        self.assertTrue(all(
            "/template-assets/iconic/monument/" in element["src"]
            for element in contact_icons
        ))
        self.assertFalse(any(
            "CV /" in str(element.get("content") or "")
            for element in elements
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
        elements = generate_resume("monument", {
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
        elements = generate_resume("monument", {
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


    def test_regent_keeps_skills_heading_with_body_near_page_break(self):
        """Iconic Regent must not leave UMIEJĘTNOŚCI alone above the footer."""
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
        elements = generate_resume("regent", cv)
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


    def test_header_rule_mastheads_clear_first_section_heading(self):
        """Masthead dividers leave a clear band before the first section."""
        # template_id → (rule top y, rule height, min gap, max gap)
        cases = {
            # Stacked contacts + photo make the rule Y data-dependent; resolve
            # the authored header rule dynamically (same path as rule_top=None).
            "regent": (None, 1, 30.0, 42.0),
        }
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"][:1],
        }
        for template_id, (rule_top, rule_h, min_gap, max_gap) in cases.items():
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
                    rule_bottom = rule_top + rule_h
                gap = heading["top"] - rule_bottom
                self.assertGreaterEqual(
                    gap,
                    min_gap - 0.01,
                    msg=(
                        f"{template_id}: gap {gap:.1f}px under header rule "
                        f"ending at y={rule_bottom} is below {min_gap}px"
                    ),
                )
                self.assertLessEqual(
                    gap,
                    max_gap + 0.01,
                    msg=(
                        f"{template_id}: gap {gap:.1f}px under header rule "
                        f"exceeds {max_gap}px"
                    ),
                )


    def test_sterling_balances_education_into_the_main_column(self):
        """Short experience → Education renders in the main column, not the rail.

        With a short Experience block the two-column planner keeps Education
        (main-affinity) in the main column beside a lighter sidebar, filling the
        otherwise half-empty main column.
        """
        cv = {
            "name": "Maja Zielińska",
            "title": "Studentka Marketingu",
            "email": "maja@example.com",
            "summary": "Krótkie podsumowanie zawodowe kandydatki na potrzeby testu układu.",
            "experience": [
                {
                    "title": "Praktyka studencka",
                    "company": "Dział Marketingu",
                    "period": "2023",
                    "bullets": ["Wsparcie kampanii reklamowych", "Treści na blogi firmowe"],
                },
            ],
            "education": [
                {"degree": "Magister, Marketing", "school": "Uniwersytet Miejski", "period": "2015 - 2019"},
            ],
            "skills": ["Analiza danych", "SEO", "Content marketing"],
            "languages": [{"name": "Angielski", "level": "C1"}],
        }
        elements = generate_resume("sterling", cv)
        # Education heading renders in the main column (left == MAIN_L == 245),
        # not as a sidebar kicker (left == SIDE_L == 34).
        edu_headings = [
            element for element in elements
            if element.get("category") == "text"
            and str(element.get("content", "")).upper().startswith("WYKSZTA")
        ]
        self.assertEqual(len(edu_headings), 1, "exactly one education heading")
        self.assertEqual(edu_headings[0]["left"], 245, "education is in the main column")
        # Experience is always in the main column.
        exp_heading = next(
            element for element in elements
            if element.get("category") == "text"
            and "DOŚWIADCZENIE" in str(element.get("content", "")).upper()
        )
        self.assertEqual(exp_heading["left"], 245)

    def test_sterling_places_overflow_sidebar_content_on_a_continuation_page_rail(self):
        """A CV long enough for Sterling's main column to spill onto page 2, with
        more sidebar-eligible content than page 1's rail can hold, places the
        overflow on page 2's rail instead of piling everything into the main
        column — while page 1's rail itself stays filled first.

        See docs/superpowers/specs/2026-08-12-multi-page-column-planner-design.md
        §9. The fixture deliberately over-fills the rail (a long summary, a
        large skills list, and long languages/interests/certifications blocks)
        so the ~585pt page-1 rail cannot hold everything and genuine overflow
        exists to place on page 2. The assertion checks for *some* sidebar
        kicker landing on a continuation page rather than a specific section by
        name: which section spills over depends on exact ReportLab-measured
        heights this test does not hand-compute. It also asserts page 1's rail
        is non-empty, pinning the "fill page 1 first" behaviour that a prior
        equalising cost function regressed.
        """
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "summary": (
                "Doświadczona liderka produktów cyfrowych, która łączy strategię, "
                "badania i projektowanie usług, aby prowadzić złożone transformacje "
                "organizacyjne w sektorze publicznym i prywatnym, dbając o mierzalne "
                "efekty oraz rozwój zespołów interdyscyplinarnych w wielu kontekstach."
            ),
            "skills": [f"Kompetencja zawodowa numer {index}" for index in range(1, 22)],
            "extra_sections": [
                {
                    "title": "Języki obce",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Angielski — C1", "Niemiecki — B2", "Francuski — A2", "Hiszpański — A1"],
                },
                {
                    "title": "Zainteresowania",
                    "kind": "interests",
                    "placement": "after_skills",
                    "items": [
                        "Fotografia krajobrazowa", "Bieganie długodystansowe", "Szachy klasyczne",
                        "Podróże górskie", "Gotowanie kuchni azjatyckiej", "Literatura faktu",
                        "Kolarstwo szosowe", "Muzyka klasyczna",
                    ],
                },
                {
                    "title": "Certyfikaty",
                    "kind": "certifications",
                    "placement": "after_skills",
                    "items": [f"Certyfikat branżowy numer {index} z opisową nazwą" for index in range(1, 10)],
                },
            ],
        }
        elements = generate_resume("sterling", cv)
        self.assertGreater(max(element.get("page", 1) for element in elements), 1)
        sidebar_kickers = [
            element for element in elements
            if element.get("flowLane") == "sidebar"
            and element.get("flowRole") == "sidebar-chrome"
            and element.get("category") == "text"
        ]
        # Page 1's rail must be filled first — the regression under test drained
        # it, leaving sidebar content scattered to main / later pages.
        page_1_kickers = [element for element in sidebar_kickers if element.get("page", 1) == 1]
        self.assertTrue(
            page_1_kickers,
            "page 1's sidebar rail must be filled before overflow spills to later pages",
        )
        sidebar_kickers_page_2_plus = [
            element for element in sidebar_kickers if element.get("page", 1) >= 2
        ]
        self.assertTrue(
            sidebar_kickers_page_2_plus,
            "expected at least one sidebar section kicker on a continuation page's rail",
        )
        for element in sidebar_kickers_page_2_plus:
            self.assertNotEqual(
                element["left"], 245,
                "continuation-page rail content must stay out of the main column",
            )
        # No page may carry sidebar-rail content beside an empty main column:
        # sidebar overflow that has nowhere safe to go must flow down the main
        # column instead of isolating itself on its own near-empty page.
        total_pages = max(element.get("page", 1) for element in elements)
        for page in range(1, total_pages + 1):
            main_body = [
                element for element in elements
                if element.get("category") in {"text", "textarea"}
                and element.get("flowLane") != "sidebar"
                and element.get("flowRole") != "masthead"
                and element.get("page", 1) == page
                and float(element.get("left", 0)) >= 245
            ]
            self.assertTrue(
                main_body,
                f"page {page} has an empty main column beside its sidebar rail",
            )

    def test_sterling_places_education_on_page_two_sidebar_when_page_one_rail_is_full(self):
        """Education is main-affinity, so a full page-1 rail used to leave it in
        page-2 main beside an empty continuation rail.

        Experience paginates; summary/skills/languages fill page 1's rail;
        Volunteer is a record-kind extra that stays in main. Education must
        render as a sidebar kicker on page 2 (left == SIDE_L == 34), not in
        the main column (left == MAIN_L == 245).
        """
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "summary": (
                "Doświadczona liderka produktów cyfrowych, która łączy strategię, "
                "badania i projektowanie usług, aby prowadzić złożone transformacje "
                "organizacyjne w sektorze publicznym i prywatnym, dbając o mierzalne "
                "efekty oraz rozwój zespołów interdyscyplinarnych w wielu kontekstach."
            ),
            "education": [
                {
                    "degree": "Data Science and AI",
                    "school": "ASOIU",
                    "period": "2022 – 2026",
                },
                {
                    "degree": "Process automation engineer",
                    "school": "Technical College",
                    "period": "2018 – 2022",
                },
            ],
            "skills": [f"Kompetencja zawodowa numer {index}" for index in range(1, 22)],
            "extra_sections": [
                {
                    "title": "Języki obce",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Angielski — C1", "Niemiecki — B2", "Francuski — A2", "Hiszpański — A1"],
                },
                {
                    "title": "Volunteer",
                    "kind": "volunteering",
                    "placement": "after_experience",
                    "items": [
                        {
                            "title": "ASOIU university",
                            "organization": "Student union",
                            "period": "2023",
                            "bullets": ["Organised campus events for incoming students."],
                        },
                        {
                            "title": "FI grand prix",
                            "organization": "Volunteer crew",
                            "period": "2024",
                            "bullets": ["Supported guest operations during the event weekend."],
                        },
                    ],
                },
            ],
        }
        elements = generate_resume("sterling", cv)
        self.assertGreater(max(element.get("page", 1) for element in elements), 1)
        edu_headings = [
            element for element in elements
            if element.get("category") == "text"
            and str(element.get("content", "")).upper().startswith("WYKSZTA")
        ]
        self.assertEqual(len(edu_headings), 1, "exactly one education heading")
        heading = edu_headings[0]
        self.assertGreaterEqual(
            heading.get("page", 1), 2,
            "education must sit on a continuation page when page 1's rail is full",
        )
        self.assertEqual(
            heading["left"], 34,
            "education must render in the page-2 sidebar, not the main column",
        )
        self.assertEqual(heading.get("flowLane"), "sidebar")
        self.assertEqual(heading.get("flowRole"), "sidebar-chrome")

    def test_sterling_sidebar_kicker_stays_with_its_body_across_pages(self):
        """A sidebar heading must not sit on page N while its body starts on N+1.

        The multi-page rail previously left UMIEJĘTNOŚCI in the page-1 footer
        and started the skills list at the top of page 2. Fitting now refuses
        an orphan kicker and spills the whole section onto the next rail.
        """
        cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 3,
            "summary": (
                "Doświadczona liderka produktów cyfrowych, która łączy strategię, "
                "badania i projektowanie usług, aby prowadzić złożone transformacje "
                "organizacyjne w sektorze publicznym i prywatnym, dbając o mierzalne "
                "efekty oraz rozwój zespołów interdyscyplinarnych w wielu kontekstach."
            ),
            "skills": [f"Kompetencja zawodowa numer {index}" for index in range(1, 22)],
            "extra_sections": [
                {
                    "title": "Języki obce",
                    "kind": "languages",
                    "placement": "after_skills",
                    "items": ["Angielski — C1", "Niemiecki — B2", "Francuski — A2"],
                },
            ],
        }
        elements = generate_resume("sterling", cv)
        kickers = [
            element for element in elements
            if element.get("flowLane") == "sidebar"
            and element.get("flowRole") == "sidebar-chrome"
            and element.get("category") == "text"
        ]
        self.assertTrue(kickers, "expected sidebar section kickers")
        for kicker in kickers:
            page = kicker.get("page", 1)
            kicker_top = float(kicker.get("top") or 0)
            bodies = [
                element for element in elements
                if element.get("flowLane") == "sidebar"
                and element.get("category") == "textarea"
                and element.get("page", 1) == page
                and float(element.get("top") or 0) > kicker_top
                and float(element.get("left") or 0) < 210
            ]
            self.assertTrue(
                bodies,
                f"sidebar kicker {kicker.get('content')!r} on page {page} "
                "must keep at least one body block on the same page",
            )

    def test_active_templates_keep_textareas_inside_page_bounds(self):
        for template_id in (
            "monument", "tessera", "regent",
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
                    # Flowing copy must remain measurable. A horizontal
                    # record-overlay (a date/location line pinned beside a
                    # real content line) intentionally stays a fixed one-line
                    # box instead of participating in vertical reflow.
                    self.assertTrue(
                        element["autoHeight"]
                        or element.get("flowRole") == "record-overlay"
                    )
                self.assertGreater(max(element.get("page", 1) for element in elements), 1)

    def test_iconic_templates_pair_contact_and_section_icons(self):
        contact_keys = ("email", "phone", "location")
        for template_id, theme in (
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
        for template_id in ("volt", "regent"):
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
