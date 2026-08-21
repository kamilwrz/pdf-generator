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


if __name__ == "__main__":
    unittest.main()
