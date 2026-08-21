"""Regression coverage for the monochrome Regent template."""
from __future__ import annotations

import unittest

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


class RegentTemplateTests(unittest.TestCase):
    """Verify the hierarchy that defines Regent remains present after refactors."""

    def test_regent_registers_as_a_single_column_icon_template(self) -> None:
        self.assertEqual(TEMPLATE_LAYOUTS["regent"], frozenset({"single", "icons"}))

    def test_regent_keeps_the_practical_editorial_summary_and_contact_icons(self) -> None:
        elements = generate_resume(
            "regent",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "linkedin": "linkedin.com/in/alexandra-nowak",
                "location": "Warszawa",
                "summary": "Łączę strategię, analizę i jasne decyzje.",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        summary = next(element for element in elements if element.get("content") == "Łączę strategię, analizę i jasne decyzje.")
        self.assertEqual(summary["fontSize"], 9.5)
        self.assertEqual(summary["lineHeight"], 14)
        self.assertEqual(summary["fontFamily"], "CormorantGaramond")
        self.assertEqual(summary["color"], "#151515")

        icons = [element for element in elements if element["category"] == "image"]
        self.assertEqual(len(icons), 4)
        self.assertTrue(all("/template-assets/iconic/regent/" in element["src"] for element in icons))

        headings = [
            element
            for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
        ]
        self.assertEqual([element["content"] for element in headings], ["PODSUMOWANIE ZAWODOWE"])

    def test_regent_keeps_a_realistic_multisentence_summary_on_the_first_page(self) -> None:
        """Prevent a display-size regression that left page one almost empty."""
        summary_text = (
            "Starszy Analityk AML/KYC z blisko 4-letnim doświadczeniem w PwC Polska "
            "i Citibank Europe. Specjalizuję się w Transaction Monitoring, KYC, "
            "CDD/EDD, screeningu oraz raportowaniu SAR dla niemieckiej FIU. "
            "Absolwent prawa niemieckiego i europejskiego z praktyczną znajomością "
            "SQL i Pythona."
        )
        elements = generate_resume(
            "regent",
            {
                "name": "Kamil Wrzóchalski",
                "title": "AML Analyst",
                "summary": summary_text,
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        summary = next(element for element in elements if element.get("content") == summary_text)
        self.assertEqual(summary["page"], 1)
        self.assertLess(summary["height"], 842 - summary["top"])


if __name__ == "__main__":
    unittest.main()
