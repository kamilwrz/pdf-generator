"""Regression coverage for the appearance-enabled Meridian template."""
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
        self.assertEqual(summary["lineHeight"], 11.0)
        self.assertEqual(summary["fontFamily"], "Montserrat")
        self.assertEqual(summary["color"], "#1B2A41")

        icons = [element for element in elements if element["category"] == "image"]
        self.assertEqual(len(icons), 4)
        self.assertTrue(all("/template-assets/iconic/meridian/" in element["src"] for element in icons))

        background = next(
            element for element in elements
            if element.get("fixedToPage")
            and element.get("left") == 0
            and element.get("top") == 0
        )
        self.assertEqual(background["backgroundColor"], "#FFFFFF")
        self.assertEqual(background["appearanceTemplateId"], "meridian")
        self.assertEqual(
            background["appearanceSettings"],
            {"palette": "navy", "textSize": "M"},
        )

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

    def test_meridian_experience_pins_period_above_city_on_a_non_flowing_rail(self) -> None:
        """Period/city stack vertically on a fixed overlay rail, never sharing a line
        with the left title/company column and never colliding under live reflow
        (the same `record-overlay` + `autoHeight: False` technique Axis's date
        gutter already uses in production).

        Each rail line is pinned to the *exact* top of the left-column line it
        annotates (period next to title, city next to company) — not a
        guessed offset — so the frontend's `recordOverlayAnchor` can find a
        real same-`flowGroup` textarea to re-anchor it to after reordering or
        a spacing change."""
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
        company = next(e for e in elements if e.get("content") == "Northline Advisory")
        period = next(e for e in elements if e.get("content") == "2021 – obecnie")
        city = next(e for e in elements if e.get("content") == "Warszawa")

        self.assertTrue(title["bold"])
        self.assertFalse(company["bold"])
        # Title and company stack in the left column (company strictly below title).
        self.assertLess(title["top"], company["top"])

        # Period/city are pinned overlay lines, not part of the linear left flow.
        self.assertEqual(period["flowRole"], "record-overlay")
        self.assertEqual(city["flowRole"], "record-overlay")
        self.assertFalse(period["autoHeight"])
        self.assertFalse(city["autoHeight"])
        self.assertEqual(period["align"], "right")
        self.assertEqual(city["align"], "right")

        # Period is pinned to title's exact top; city is pinned to company's
        # exact top — a real anchor for each rail line, not a guessed offset.
        self.assertEqual(period["top"], title["top"])
        self.assertEqual(city["top"], company["top"])
        self.assertLess(period["top"], city["top"])

        # Rail sits to the right of the left content column.
        self.assertGreater(period["left"], title["left"] + title["width"])

    def test_meridian_education_lists_school_before_the_bold_degree(self) -> None:
        """Row order matches the screenshot convention: school/city, then degree/period,
        with city/period pinned to a non-flowing rail like the experience record."""
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

        self.assertEqual(city["flowRole"], "record-overlay")
        self.assertEqual(period["flowRole"], "record-overlay")
        self.assertFalse(city["autoHeight"])
        self.assertFalse(period["autoHeight"])
        self.assertEqual(city["align"], "right")
        self.assertEqual(period["align"], "right")
        self.assertEqual(city["top"], school["top"])
        self.assertEqual(period["top"], degree["top"])
        self.assertLess(city["top"], period["top"])

    def test_meridian_rail_anchors_to_bullets_when_company_is_missing(self) -> None:
        """If company is absent, city falls back to bullets' exact top rather than a
        guessed offset — every emitted rail line must anchor to a real content line
        so the frontend's `recordOverlayAnchor` can re-pin it after reflow."""
        elements = generate_resume(
            "meridian",
            {
                "name": "Alexandra Nowak",
                "experience": [
                    {
                        "title": "Founder",
                        "city": "Warszawa",
                        "period": "2021 – obecnie",
                        "bullets": ["Prowadzi jednoosobową działalność doradczą."],
                    },
                ],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        title = next(e for e in elements if e.get("content") == "Founder")
        bullets = next(e for e in elements if e.get("content") == "• Prowadzi jednoosobową działalność doradczą.")
        city = next(e for e in elements if e.get("content") == "Warszawa")

        self.assertEqual(city["flowRole"], "record-overlay")
        self.assertEqual(city["top"], bullets["top"])
        self.assertGreater(city["top"], title["top"])

    def test_meridian_drops_the_second_rail_line_when_there_is_no_anchor(self) -> None:
        """A title-only record (no company, no bullets) has nothing for city to
        anchor to — it must be omitted rather than pinned to a guessed offset
        that would freeze in place after reflow."""
        elements = generate_resume(
            "meridian",
            {
                "name": "Alexandra Nowak",
                "experience": [
                    {"title": "Founder", "period": "2021 – obecnie", "city": "Warszawa"},
                ],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        self.assertTrue(any(e.get("content") == "2021 – obecnie" for e in elements))
        self.assertFalse(any(e.get("content") == "Warszawa" for e in elements))

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
