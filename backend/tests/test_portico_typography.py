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


if __name__ == "__main__":
    unittest.main()
