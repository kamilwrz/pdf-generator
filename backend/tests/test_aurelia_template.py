"""Aurelia template regressions for its one-column Bézier design contract."""

from __future__ import annotations

import unittest

from app.services.cv_templates.registry import generate_resume


CV_DATA = {
    "name": "Anna Kowalska",
    "title": "Director of Operations",
    "email": "anna@example.com",
    "phone": "+48 600 000 000",
    "location": "Warszawa",
    "summary": "Liderka strategiczna, która przekłada złożoność na klarowne decyzje.",
    "experience": [
        {
            "title": "Director of Operations",
            "company": "Waverly Group",
            "period": "2020 – obecnie",
            "location": "Warszawa",
            "bullets": [
                "Przebudowała model operacyjny.",
                "Wprowadziła wspólny rytm planowania.",
            ],
        }
    ],
    "education": [
        {
            "degree": "Zarządzanie i Strategia",
            "school": "SGH",
            "period": "2011 – 2016",
        }
    ],
    "skills": ["Operating models", "Change management", "Governance"],
}


class AureliaTemplateTests(unittest.TestCase):
    def setUp(self):
        self.elements = generate_resume("aurelia", CV_DATA)

    def test_uses_cubic_bezier_as_masthead_and_section_language(self):
        paths = [element for element in self.elements if element["category"] == "path"]
        self.assertGreaterEqual(len(paths), 6)
        self.assertTrue(
            all(any(segment.get("type") == "C" for segment in element["curves"]) for element in paths)
        )

        orbit = next(
            element for element in paths
            if element.get("id") == "aurelia-golden-orbit"
        )
        self.assertEqual(orbit["flowRole"], "masthead")
        self.assertEqual(orbit["backgroundColor"], "#B3924F")
        self.assertEqual(len([s for s in orbit["curves"] if s["type"] == "C"]), 2)

        section_threads = [
            element for element in paths
            if element.get("flowRole") == "section-chrome"
        ]
        self.assertGreaterEqual(len(section_threads), 4)

    def test_stays_single_column_with_modest_body_type(self):
        content = [
            element for element in self.elements
            if element.get("flowRole") == "content"
            and element["category"] in {"text", "textarea"}
        ]
        self.assertTrue(content)
        self.assertTrue(all(float(element["left"]) >= 116 for element in content))
        self.assertTrue(
            all(
                float(element.get("fontSize", 0)) <= 10.8
                for element in content
            )
        )
        self.assertFalse(
            any(
                element["category"] == "rectangle"
                and float(element.get("width", 0)) > 120
                for element in self.elements
            )
        )

    def test_includes_filled_polygon_jewel_and_fixed_page_chrome(self):
        jewel = next(
            element for element in self.elements
            if element.get("id") == "aurelia-orbit-jewel"
        )
        self.assertEqual(jewel["category"], "polygon")
        self.assertEqual(jewel["shape"], "diamond")
        self.assertTrue(jewel["filled"])
        self.assertEqual(len(jewel["points"]), 4)

        fixed = [element for element in self.elements if element.get("fixedToPage")]
        self.assertTrue(fixed)
        self.assertTrue(any(element["category"] == "path" for element in fixed))


if __name__ == "__main__":
    unittest.main()
