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
                "name": "Aleksandra",
                "title": "STRATEGY & OPERATIONS MANAGER",
                "email": "aleksandra.nowak@example.com",
                "phone": "+48 000 000 000",
                "linkedin": "linkedin.com/in/aleksandra-nowak-demo",
                "location": "Warszawa, Polska",
                "summary": (
                    "Managerka strategii i operacji z ponad 7-letnim doświadczeniem w doradztwie oraz transformacji biznesowej. "
                    "Specjalizuję się w analizie procesów, projektowaniu modeli operacyjnych i prowadzeniu inicjatyw zwiększających "
                    "efektywność organizacji. Łączę analityczne podejście z umiejętnością przekładania danych na konkretne decyzje "
                    "biznesowe."
                ),
                "experience": [
                    {
                        "title": "Strategy & Operations Manager",
                        "company": "Northbridge Advisory",
                        "location": "Warszawa",
                        "period": "01/2023 – obecnie",
                        "bullets": [
                            "Prowadzę projekty transformacyjne dla klientów z sektora finansowego, technologicznego i usług profesjonalnych.",
                            "Projektuję modele operacyjne, identyfikuję obszary optymalizacji i przygotowuję rekomendacje dla kadry zarządzającej.",
                            "Koordynuję zespoły projektowe oraz odpowiadam za prezentację wyników i wdrożenie uzgodnionych działań.",
                        ],
                    },
                    {
                        "title": "Senior Business Analyst",
                        "company": "Vantage Partners",
                        "location": "Warszawa",
                        "period": "06/2020 – 12/2022",
                        "bullets": [
                            "Analizowałam procesy biznesowe i dane operacyjne, identyfikując możliwości automatyzacji oraz redukcji kosztów.",
                            "Tworzyłam modele finansowe, dashboardy KPI i materiały decyzyjne dla klientów oraz zespołów projektowych.",
                        ],
                    },
                    {
                        "title": "Business Analyst",
                        "company": "Orion Consulting Group",
                        "location": "Kraków",
                        "period": "09/2017 – 05/2020",
                        "bullets": [
                            "Wspierałam projekty strategiczne poprzez analizę rynku, benchmarking konkurencji i przygotowywanie rekomendacji.",
                            "Opracowywałam raporty zarządcze oraz prezentacje wykorzystywane podczas warsztatów z klientami.",
                        ],
                    },
                ],
                "education": [
                    {
                        "degree": "Magister zarządzania",
                        "school": "Uniwersytet Ekonomiczny w Krakowie",
                        "location": "Kraków",
                        "period": "2015 – 2017",
                        "description": "Specjalizacja: strategia przedsiębiorstwa i zarządzanie zmianą.",
                    },
                    {
                        "degree": "Licencjat ekonomii",
                        "school": "Uniwersytet Ekonomiczny w Krakowie",
                        "location": "Kraków",
                        "period": "2012 – 2015",
                        "description": "",
                    },
                ],
                "skills": [
                    "Strategia biznesowa",
                    "Business Analysis",
                    "Optymalizacja procesów",
                    "Operating Model",
                    "Analiza danych",
                    "Financial Modeling",
                    "Power BI",
                    "Excel",
                    "SQL",
                    "Stakeholder Management",
                ],
                "languages": [
                    {"name": "Polski", "level": "ojczysty"},
                    {"name": "Angielski", "level": "C1"},
                    {"name": "Niemiecki", "level": "B2"},
                ],
            },
        )

        summary = next(
            element
            for element in elements
            if element.get("content")
            == (
                "Managerka strategii i operacji z ponad 7-letnim doświadczeniem w doradztwie oraz transformacji biznesowej. "
                "Specjalizuję się w analizie procesów, projektowaniu modeli operacyjnych i prowadzeniu inicjatyw zwiększających "
                "efektywność organizacji. Łączę analityczne podejście z umiejętnością przekładania danych na konkretne decyzje "
                "biznesowe."
            )
        )
        self.assertEqual(summary["fontSize"], 9.5)
        self.assertEqual(summary["lineHeight"], 11)
        self.assertEqual(summary["fontFamily"], "Montserrat")
        self.assertEqual(summary["color"], "#151515")

        icons = [element for element in elements if element["category"] == "image"]
        self.assertEqual(len(icons), 4)
        self.assertTrue(all("/template-assets/iconic/regent/" in element["src"] for element in icons))

        headings = [
            element
            for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
        ]
        self.assertEqual(
            [element["content"] for element in headings],
            [
                "PODSUMOWANIE ZAWODOWE",
                "DOŚWIADCZENIE ZAWODOWE",
                "WYKSZTAŁCENIE",
                "UMIEJĘTNOŚCI",
                "JĘZYKI",
            ],
        )

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
