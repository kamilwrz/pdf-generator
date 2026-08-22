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

    def test_meridian_experience_places_dates_in_a_right_aligned_column(self) -> None:
        """Title/dates and company/location render as two-column rows, not stacked lines."""
        elements = generate_resume(
            "meridian",
            {
                "name": "Alexandra Nowak",
                "experience": [
                    {
                        "title": "Senior Strategy Consultant",
                        "company": "Northline Advisory",
                        "city": "Warszawa",
                        "period": "2021 – obecnie",
                        "bullets": ["Prowadzi projekty transformacyjne."],
                    },
                ],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        title = next(e for e in elements if e.get("content") == "Senior Strategy Consultant")
        period = next(e for e in elements if e.get("content") == "2021 – obecnie")
        company = next(e for e in elements if e.get("content") == "Northline Advisory")
        city = next(e for e in elements if e.get("content") == "Warszawa")

        self.assertTrue(title["bold"])
        self.assertEqual(title["top"], period["top"])
        self.assertEqual(period["align"], "right")
        self.assertGreater(period["left"], title["left"] + title["width"])

        self.assertEqual(company["top"], city["top"])
        self.assertEqual(city["align"], "right")
        self.assertFalse(company["bold"])

    def test_meridian_education_lists_school_before_the_bold_degree(self) -> None:
        """Row order matches the screenshot convention: school/city, then degree/period."""
        elements = generate_resume(
            "meridian",
            {
                "name": "Kamil Wrzochalski",
                "experience": [],
                "education": [
                    {
                        "degree": "Bachelor of Laws (LL.B.)",
                        "school": "EU Viadrina",
                        "city": "Frankfurt(Oder)",
                        "period": "07/2015 - 10/2026",
                    },
                ],
                "skills": [],
                "languages": [],
            },
        )

        school = next(e for e in elements if e.get("content") == "EU Viadrina")
        degree = next(e for e in elements if e.get("content") == "Bachelor of Laws (LL.B.)")
        city = next(e for e in elements if e.get("content") == "Frankfurt(Oder)")
        period = next(e for e in elements if e.get("content") == "07/2015 - 10/2026")

        self.assertFalse(school["bold"])
        self.assertTrue(degree["bold"])
        self.assertLess(school["top"], degree["top"])
        self.assertEqual(school["top"], city["top"])
        self.assertEqual(degree["top"], period["top"])
        self.assertEqual(city["align"], "right")
        self.assertEqual(period["align"], "right")

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
