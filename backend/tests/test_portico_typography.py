"""Regression coverage for Portico's core typographic hierarchy."""
from __future__ import annotations

import unittest

from app.services.cv_templates.registry import generate_resume


class PorticoTypographyTests(unittest.TestCase):
    """Ensure the visual hierarchy survives shared record-helper changes."""

    def test_portico_bolds_section_labels_and_job_titles(self) -> None:
        elements = generate_resume(
            "portico",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": "Łączę analizę ze spokojnym podejmowaniem decyzji.",
                "experience": [{
                    "title": "Senior Strategy Consultant",
                    "company": "Northline Advisory",
                    "period": "2022 – obecnie",
                }],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        heading = next(
            element for element in elements
            if element.get("content") == "PODSUMOWANIE ZAWODOWE"
        )
        job_title = next(
            element for element in elements
            if element.get("content") == "Senior Strategy Consultant"
        )
        self.assertTrue(heading["bold"])
        self.assertTrue(job_title["bold"])

    def test_portico_uses_montserrat_body_and_inter_section_labels(self) -> None:
        elements = generate_resume(
            "portico",
            {
                "name": "Anna Kowalska",
                "title": "Strategy Consultant",
                "summary": "Krótki opis doświadczenia.",
                "experience": [{
                    "title": "Senior Consultant",
                    "company": "Northline",
                    "period": "2022 – obecnie",
                    "bullets": ["Prowadzi projekty transformacyjne."],
                }],
                "education": [],
                "skills": ["Analiza danych"],
                "languages": [],
            },
        )

        text_elements = [
            element for element in elements
            if element.get("category") in {"text", "textarea"}
        ]
        section_labels = [
            element for element in text_elements
            if element.get("flowRole") == "section-chrome"
        ]
        content_elements = [
            element for element in text_elements
            if element.get("flowRole") not in {"section-chrome", "masthead-anchor"}
        ]

        self.assertTrue(section_labels)
        self.assertTrue(content_elements)
        self.assertTrue(all(element["fontFamily"] == "Inter" for element in section_labels))
        self.assertTrue(all(element["fontFamily"] == "Montserrat" for element in content_elements))
        self.assertTrue(all(
            element.get("lineHeight") == 12
            for element in content_elements
            if element.get("category") == "textarea"
        ))


if __name__ == "__main__":
    unittest.main()
