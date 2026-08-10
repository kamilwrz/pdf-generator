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

    def test_layers_three_cubic_beziers_behind_the_display_name(self):
        paths = [element for element in self.elements if element["category"] == "path"]
        self.assertEqual(len(paths), 3)
        self.assertEqual(len({element["top"] for element in paths}), 3)

        backdrop = next(
            element for element in paths
            if element.get("id") == "aurelia-name-backdrop"
        )
        nameplate = next(
            element for element in paths
            if element.get("id") == "aurelia-nameplate"
        )
        ink = next(
            element for element in self.elements
            if element.get("id") == "aurelia-name-ink"
        )
        name = next(
            element for element in self.elements
            if element.get("content") == CV_DATA["name"]
        )
        self.assertEqual(backdrop["backgroundColor"], "#D6D6D3")
        self.assertEqual(backdrop["borderWidth"], 18)
        self.assertEqual(backdrop["zIndex"], 1)
        self.assertEqual(nameplate["backgroundColor"], "#B3924F")
        self.assertEqual(nameplate["borderWidth"], 28)
        self.assertEqual(nameplate["zIndex"], 2)
        self.assertEqual(ink["backgroundColor"], "#8B713A")
        self.assertEqual(ink["borderWidth"], 4.5)
        self.assertEqual(ink["zIndex"], 3)
        self.assertEqual(name["zIndex"], 4)
        self.assertTrue(all(element["zIndex"] < name["zIndex"] for element in paths))

        section_bars = [
            element for element in self.elements
            if element.get("flowRole") == "section-chrome"
            and element["category"] == "line"
            and element["backgroundColor"] == "#B3924F"
            and element["height"] == 4
        ]
        self.assertGreaterEqual(len(section_bars), 4)
        section_rules = [
            element for element in self.elements
            if element.get("flowRole") == "section-chrome"
            and element["category"] == "line"
            and element["backgroundColor"] == "#DCD8CE"
        ]
        self.assertEqual(len(section_rules), 4)
        self.assertTrue(
            all(element["left"] + element["width"] == 515 for element in section_rules)
        )
        self.assertGreater(len({element["width"] for element in section_rules}), 1)

    def test_nameplate_and_backdrop_respond_to_name_length(self):
        short = generate_resume("aurelia", {**CV_DATA, "name": "Ewa Li"})
        long = generate_resume(
            "aurelia",
            {**CV_DATA, "name": "Aleksandra Wrzosek-Kowalska"},
        )

        def artwork(elements):
            return {
                element["id"]: element
                for element in elements
                if str(element.get("id", "")).startswith("aurelia-name")
            }

        short_artwork = artwork(short)
        long_artwork = artwork(long)
        self.assertGreater(
            long_artwork["aurelia-nameplate"]["width"],
            short_artwork["aurelia-nameplate"]["width"],
        )
        self.assertGreater(
            long_artwork["aurelia-name-backdrop"]["left"],
            short_artwork["aurelia-name-backdrop"]["left"],
        )
        for elements in (short_artwork, long_artwork):
            self.assertEqual(
                {element["zIndex"] for element in elements.values()},
                {1, 2, 3},
            )

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

    def test_avoids_extra_shapes_and_keeps_fixed_page_chrome(self):
        self.assertFalse(any(element["category"] == "polygon" for element in self.elements))
        fixed = [element for element in self.elements if element.get("fixedToPage")]
        self.assertTrue(fixed)
        self.assertFalse(any(element["category"] == "path" for element in fixed))
        self.assertTrue(
            any(
                element["category"] == "line"
                and element["backgroundColor"] == "#B3924F"
                and element["height"] == 4
                for element in fixed
            )
        )


if __name__ == "__main__":
    unittest.main()
