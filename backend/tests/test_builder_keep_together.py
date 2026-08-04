"""Records must stay whole across page breaks (no orphan titles above the footer)."""
from __future__ import annotations

import unittest

from app.services.cv_generator import (
    CONTENT_BOTTOM,
    SPACE_STACK,
    Builder,
    generate_resume,
)
from app.services.cv_generator_primitives import PAGE_TOP


class BuilderKeepTogetherTests(unittest.TestCase):
    def test_keep_together_moves_whole_record_to_next_page(self):
        # Only ~36 px remain on page 1 — too little for title + body.
        b = Builder(CONTENT_BOTTOM - 36)
        title = "1. Juristische Prüfung"
        body = (
            "Erste juristische Prüfung mit Schwerpunkt Europarecht und "
            "Zivilprozessrecht — vollständiger Eintrag darf nicht getrennt werden."
        )
        title_h = b.measure_block(title, 360, 10.4, 13, "Helvetica", bold=True, min_h=13)
        body_h = b.measure_block(body, 360, 8.7, 11.5, "Helvetica", min_h=11.5)
        record_h = title_h + SPACE_STACK + body_h

        with b.keep_together(record_h):
            b.block(title, 160, 360, 10.4, 13, "#FFFFFF", "Helvetica", bold=True, min_h=13)
            b.gap(SPACE_STACK)
            b.block(body, 160, 360, 8.7, 11.5, "#DCEBFA", "Helvetica", min_h=11.5)

        pages = {element["page"] for element in b.els}
        self.assertEqual(pages, {2})
        self.assertGreaterEqual(b.els[0]["top"], PAGE_TOP)
        self.assertLessEqual(b.els[-1]["top"] + b.els[-1]["height"], CONTENT_BOTTOM)
        groups = {element.get("flowGroup") for element in b.els}
        self.assertEqual(len(groups), 1)
        self.assertTrue(all(element.get("flowGroup") for element in b.els))

    def test_kernel_education_records_are_not_split_across_pages(self):
        cv = {
            "name": "Anna Kowalska",
            "title": "AML Analyst",
            "email": "anna@example.com",
            "phone": "+48 600 000 000",
            "location": "Warszawa",
            "summary": "Specjalistka AML z doświadczeniem w bankowości.",
            "experience": [
                {
                    "title": f"Senior AML Analyst {index}",
                    "company": "Bank Example",
                    "period": "2020 – obecnie",
                    "bullets": [
                        "Analiza alertów transakcyjnych i raportowanie SAR.",
                        "Współpraca z zespołami compliance i operacjami.",
                        "Szkolenie juniorów z procesów KYC i monitoringu.",
                    ],
                }
                for index in range(4)
            ],
            "education": [
                {
                    "degree": "Bachelor of Laws (LL.B.)",
                    "school": "EU Viadrina",
                    "period": "2014 – 2018",
                    "description": "Prawo europejskie i prawo cywilne.",
                },
                {
                    "degree": "1. Juristische Prüfung",
                    "school": "Justizprüfungsamt",
                    "period": "2019",
                    "description": (
                        "Erste juristische Prüfung. Vollständiger Block edukacji "
                        "musi pozostać na jednej stronie razem z opisem."
                    ),
                },
            ],
            "skills": ["AML", "KYC", "German", "Python"],
        }
        elements = generate_resume("kernel", cv)
        textual = [
            element
            for element in elements
            if element.get("category") in {"text", "textarea"}
            and not element.get("fixedToPage")
        ]

        # Group consecutive education-record pieces by page for the second entry.
        marker = "1. Juristische Prüfung"
        starts = [
            index
            for index, element in enumerate(textual)
            if marker in str(element.get("content") or "")
        ]
        self.assertTrue(starts, "expected the second education degree in the layout")
        start = starts[0]
        page = textual[start]["page"]
        # Degree + school/meta + description that follow on the same page.
        related = []
        for element in textual[start: start + 3]:
            if element["page"] != page:
                break
            related.append(element)
        self.assertGreaterEqual(len(related), 2)
        self.assertTrue(all(element["page"] == page for element in related))


if __name__ == "__main__":
    unittest.main()
