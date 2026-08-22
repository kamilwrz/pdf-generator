"""Regression coverage for the navy/steel-blue Meridian template."""
from __future__ import annotations

import unittest

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


class MeridianTemplateTests(unittest.TestCase):
    """Verify the hierarchy that defines Meridian remains present after refactors."""

    def test_meridian_registers_as_a_single_column_icon_template(self) -> None:
        self.assertEqual(TEMPLATE_LAYOUTS["meridian"], frozenset({"single", "icons"}))

    def test_meridian_keeps_the_compact_summary_and_contact_icons(self) -> None:
        elements = generate_resume(
            "meridian",
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
        # Meridian's body scale sits a full step below Regent's (9.5/14) per
        # the "even smaller paragraphs than Regent" design requirement.
        self.assertEqual(summary["fontSize"], 8.6)
        self.assertEqual(summary["lineHeight"], 12.0)
        self.assertEqual(summary["fontFamily"], "CormorantGaramond")
        self.assertEqual(summary["color"], "#1B2A41")

        icons = [element for element in elements if element["category"] == "image"]
        self.assertEqual(len(icons), 4)
        # Meridian reuses Regent's neutral icon glyphs rather than shipping a
        # new asset set for the navy/steel-blue palette.
        self.assertTrue(all("/template-assets/iconic/regent/" in element["src"] for element in icons))

        headings = [
            element
            for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
        ]
        self.assertEqual([element["content"] for element in headings], ["PODSUMOWANIE ZAWODOWE"])

    def test_meridian_section_rule_carries_an_accent_blue_tick(self) -> None:
        """The short accent tick under each section rule is Meridian's signature mark."""
        elements = generate_resume(
            "meridian",
            {
                "name": "Alexandra Nowak",
                "summary": "Łączę strategię, analizę i jasne decyzje.",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        ticks = [
            element for element in elements
            if element.get("flowRole") == "section-chrome"
            and element["category"] == "line"
            and element.get("backgroundColor") == "#3D5A80"
        ]
        self.assertEqual(len(ticks), 1)
        self.assertEqual(ticks[0]["width"], 18.0)

    def test_meridian_keeps_a_realistic_multisentence_summary_on_the_first_page(self) -> None:
        """Prevent a display-size regression that left page one almost empty."""
        summary_text = (
            "Starszy Analityk AML/KYC z blisko 4-letnim doświadczeniem w PwC Polska "
            "i Citibank Europe. Specjalizuję się w Transaction Monitoring, KYC, "
            "CDD/EDD, screeningu oraz raportowaniu SAR dla niemieckiej FIU. "
            "Absolwent prawa niemieckiego i europejskiego z praktyczną znajomością "
            "SQL i Pythona."
        )
        elements = generate_resume(
            "meridian",
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
