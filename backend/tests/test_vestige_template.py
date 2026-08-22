"""Regression coverage for the narrow-sidebar Vestige template."""
from __future__ import annotations

import unittest

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


class VestigeTemplateTests(unittest.TestCase):
    """Keep Vestige's column ownership and neutral visual system stable."""

    def test_vestige_registers_as_a_sidebar_icon_template(self) -> None:
        self.assertEqual(TEMPLATE_LAYOUTS["vestige"], frozenset({"sidebar", "icons"}))

    def test_vestige_places_identity_in_main_and_contact_in_sidebar(self) -> None:
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "linkedin": "linkedin.com/in/alexandra-nowak",
                "location": "Warszawa",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia", "Analiza"],
                "languages": [{"name": "Polski", "level": "ojczysty"}],
            },
        )

        rail = next(
            element
            for element in elements
            if element.get("fixedToPage") and element.get("left") == 0 and element.get("height") == 842
            and element.get("width") == 174
        )
        self.assertEqual(rail["backgroundColor"], "#F4F4F2")

        name = next(element for element in elements if element.get("content") == "Alexandra Nowak")
        self.assertEqual((name["left"], name["width"], name["align"]), (210.0, 335.0, "left"))

        icons = [element for element in elements if element["category"] == "image"]
        self.assertEqual(len(icons), 4)
        self.assertTrue(all(element["left"] == 27.0 for element in icons))
        self.assertTrue(all("/template-assets/iconic/vestige/" in element["src"] for element in icons))

        main_rules = [
            element for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "line"
        ]
        self.assertTrue(main_rules)
        self.assertTrue(all((element["left"], element["width"]) == (210.0, 335.0) for element in main_rules))

    def test_vestige_uses_its_own_heading_type_scale(self) -> None:
        """Main headings render at 13px, sidebar headings at 8.4px — distinct
        from Sterling's 14 / 9.4 so the narrow rail reads as its own design."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        main_headings = [
            element for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
        ]
        sidebar_headings = [
            element for element in elements
            if element.get("flowRole") == "sidebar-chrome" and element["category"] == "text"
        ]
        self.assertTrue(main_headings)
        self.assertTrue(sidebar_headings)
        self.assertTrue(all(element["fontSize"] == 13.0 for element in main_headings))
        self.assertTrue(all(element["fontSize"] == 8.4 for element in sidebar_headings))

    def test_vestige_contact_band_supports_add_remove_channel(self) -> None:
        """Vestige must emit a real "stacked"-mode contact-band descriptor
        (not Sterling's dropped centered-mode anchor) so the contact channel
        manager can add/remove a channel — see the module docstring for why
        Sterling's own anchor is unsafe to reuse verbatim."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )
        anchor = next(
            element for element in elements
            if element.get("flowRole") == "masthead-anchor" and element.get("contactBand")
        )
        descriptor = anchor["contactBand"]
        self.assertEqual(descriptor["mode"], "stacked")
        self.assertEqual(descriptor["id"], "vestige-contact")
        self.assertEqual(descriptor["anchor"]["startX"], 27.0)
        self.assertEqual(descriptor["anchor"]["startY"], 46.0)
        self.assertEqual(descriptor["order"], ["phone", "email"])

    def test_vestige_emits_masthead_identity_for_name_case_and_title_visibility(self) -> None:
        """Show/hide job title and the name upper/lowercase toggle both depend
        on a `mastheadIdentity` descriptor — Sterling (which Vestige forwards)
        never builds one, so Vestige must tag it directly."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )
        anchor = next(
            element for element in elements
            if element.get("flowRole") == "masthead-anchor" and element.get("mastheadIdentity")
        )
        descriptor = anchor["mastheadIdentity"]
        self.assertEqual(descriptor["id"], "vestige-masthead")
        self.assertTrue(descriptor["title"]["present"])
        self.assertGreater(descriptor["title"]["blockPt"], 0)
        # The contact rail is a parallel sidebar column, not tied to the
        # title's Y — it must not be coupled to the hide/show shift.
        self.assertIsNone(descriptor["contactBandId"])

        name = next(
            element for element in elements
            if element.get("content") == "Alexandra Nowak" and element.get("mastheadRole") == "name"
        )
        self.assertEqual(name["mastheadBandId"], "vestige-masthead")

    def test_vestige_languages_grid_cells_do_not_collide(self) -> None:
        """A languages grid routed into the main column must keep each cell at
        its own translated X — the previous blanket main-column reposition
        collapsed every `grid-member` cell in a row onto one identical box.

        The sidebar's other candidates (education/skills/certifications/
        interests) are filled out here so the planner's budget genuinely
        spills languages into the main column instead of fitting everything
        into the rail — the exact scenario that reproduced the overlap.
        """
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": (
                    "Łączę analizę, strategię i jasne decyzje w złożonych "
                    "projektach transformacyjnych dla dużych organizacji "
                    "korporacyjnych na rynkach międzynarodowych."
                ),
                "experience": [
                    {"title": "Consultant", "company": "Northline", "period": "2022 – obecnie",
                     "bullets": ["Prowadzę projekty.", "Analizuję dane.", "Współpracuję z zarządem."]},
                    {"title": "Analyst", "company": "Meridian", "period": "2019 – 2022",
                     "bullets": ["Wspieram zespoły.", "Przygotowuję raporty."]},
                    {"title": "Junior Analyst", "company": "Civic", "period": "2016 – 2019",
                     "bullets": ["Zbieram dane."]},
                ],
                "education": [{
                    "degree": "Magister ekonomii", "school": "Szkoła Główna Handlowa",
                    "period": "2013 – 2018",
                    "description": "Praca dyplomowa o strategiach wzrostu przedsiębiorstw rodzinnych.",
                }],
                "skills": [
                    "Strategia", "Transformacja", "Analiza biznesowa", "Facylitacja",
                    "Zarządzanie zespołem", "Negocjacje", "Przywództwo", "Zarządzanie zmianą",
                    "Komunikacja", "Planowanie",
                ],
                "languages": [
                    {"name": "Polski", "level": "ojczysty"},
                    {"name": "Angielski", "level": "C1"},
                    {"name": "Niemiecki", "level": "B2"},
                    {"name": "Francuski", "level": "B1"},
                ],
                "extra_sections": [
                    {"title": "Certyfikaty", "kind": "certifications", "items": ["PMP", "Prince2", "Six Sigma", "Agile"]},
                    {"title": "Zainteresowania", "kind": "interests", "items": ["Szachy", "Bieganie", "Podróże", "Fotografia"]},
                ],
            },
        )
        grid_cells = [
            element for element in elements
            if element.get("flowRole") == "grid-member" and element["category"] == "textarea"
        ]
        self.assertTrue(grid_cells)
        lefts = [element["left"] for element in grid_cells]
        self.assertEqual(len(lefts), len(set(lefts)), f"grid-member cells collided: {lefts!r}")


if __name__ == "__main__":
    unittest.main()
