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

    def test_layers_thick_contrasting_beziers_with_white_type(self):
        paths = [element for element in self.elements if element["category"] == "path"]
        self.assertEqual(len(paths), 4)
        self.assertEqual(len({element["top"] for element in paths}), 4)

        backdrop = next(
            element for element in paths
            if element.get("id") == "aurelia-name-backdrop"
        )
        nameplate = next(
            element for element in paths
            if element.get("id") == "aurelia-nameplate"
        )
        titleplate = next(
            element for element in paths
            if element.get("id") == "aurelia-titleplate"
        )
        ink = next(
            element for element in self.elements
            if element.get("id") == "aurelia-name-ink"
        )
        name = next(
            element for element in self.elements
            if element.get("content") == CV_DATA["name"]
        )
        title = next(
            element for element in self.elements
            if element.get("content") == CV_DATA["title"]
        )
        self.assertEqual(backdrop["backgroundColor"], "#D6D6D3")
        self.assertEqual(backdrop["borderWidth"], 22)
        self.assertEqual(backdrop["zIndex"], 1)
        self.assertEqual(nameplate["backgroundColor"], "#3A3A36")
        self.assertEqual(nameplate["borderWidth"], 44)
        self.assertEqual(nameplate["height"], 52)
        self.assertEqual(nameplate["zIndex"], 2)
        self.assertEqual(titleplate["backgroundColor"], "#5A5A54")
        self.assertEqual(titleplate["borderWidth"], 30)
        self.assertEqual(titleplate["height"], 36)
        self.assertEqual(titleplate["zIndex"], 2)
        self.assertEqual(ink["backgroundColor"], "#B3924F")
        self.assertEqual(ink["borderWidth"], 6)
        self.assertEqual(ink["zIndex"], 3)
        self.assertEqual(name["zIndex"], 4)
        self.assertEqual(name["color"], "#FFFFFF")
        self.assertEqual(title["color"], "#FFFFFF")
        self.assertTrue(all(element["zIndex"] < name["zIndex"] for element in paths))
        self.assertLess(self.elements.index(backdrop), self.elements.index(nameplate))
        self.assertLess(self.elements.index(nameplate), self.elements.index(titleplate))
        self.assertLess(self.elements.index(titleplate), self.elements.index(ink))
        self.assertLess(self.elements.index(ink), self.elements.index(name))
        self.assertGreater(titleplate["top"], nameplate["top"])
        self.assertGreater(nameplate["borderWidth"], titleplate["borderWidth"])

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
