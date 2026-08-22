"""Unit tests for the shared single-column languages grid helpers."""
from __future__ import annotations

import unittest

from app.services.cv_generator_primitives import Builder
from app.services.cv_templates.registry import generate_resume
from app.services.cv_templates.shared.text import (
    LANGUAGE_SEP_SIDEBAR,
    LANGUAGE_SEP_SINGLE,
    _language_entries,
    _language_level_runs,
    _language_line,
    _place_languages_grid,
    _sidebar_language_content,
)


class LanguagesGridTests(unittest.TestCase):
    def test_language_line_separators(self):
        self.assertEqual(
            _language_line("Polski", "C2", sep=LANGUAGE_SEP_SINGLE),
            "Polski — C2",
        )
        self.assertEqual(
            _language_line("Polski", "C2", sep=LANGUAGE_SEP_SIDEBAR),
            "Polski - C2",
        )
        self.assertEqual(_language_line("Polski", "", sep=LANGUAGE_SEP_SINGLE), "Polski")

    def test_level_runs_cover_only_the_cefr_suffix(self):
        content = _language_line("Niemiecki", "C1")
        runs = _language_level_runs(content, "Niemiecki", "C1", color="#9E2532")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["start"], len("Niemiecki — "))
        self.assertEqual(runs[0]["end"], len(content))
        self.assertTrue(runs[0]["italic"])
        self.assertEqual(runs[0]["color"], "#9E2532")

    def test_place_languages_grid_emits_equal_columns_and_skips_empty_slots(self):
        entries = _language_entries({
            "languages": [
                {"name": "Polski", "level": "C2"},
                {"name": "Niemiecki", "level": "C1"},
            ],
        })
        left, width, columns = 54.0, 487.0, 4
        builder = Builder(80)
        _place_languages_grid(
            builder,
            entries,
            left,
            width,
            columns=columns,
            font="Times-Roman",
            fs=10,
            lh=14,
            body_color="#222222",
            level_color="#9E2532",
            gutter=8.0,
        )
        cells = [
            element for element in builder.build()
            if element.get("category") == "textarea"
        ]
        self.assertEqual(len(cells), 2)
        col_w = width / columns
        cell_w = col_w - 8.0
        self.assertAlmostEqual(cells[0]["left"], left)
        self.assertAlmostEqual(cells[1]["left"], left + col_w)
        self.assertAlmostEqual(cells[0]["width"], cell_w)
        self.assertAlmostEqual(cells[1]["width"], cell_w)
        self.assertEqual(cells[0]["flowRole"], "grid-member")
        self.assertEqual(cells[0]["content"], "Polski — C2")
        self.assertEqual(cells[0]["runs"][0]["start"], len("Polski — "))
        self.assertEqual(cells[0]["runs"][0]["color"], "#9E2532")

    def test_sidebar_language_content_uses_hyphen_and_no_bullets(self):
        content = _sidebar_language_content({
            "languages": [
                {"name": "Polski", "level": "ojczysty"},
                {"name": "Angielski", "level": "C1"},
            ],
        })
        self.assertEqual(content, "Polski - ojczysty\nAngielski - C1")
        self.assertNotIn("•", content)
        self.assertNotIn("—", content)

    def _languages_grid_row_width(self, template_id: str, cv: dict) -> int:
        """Distinct `left` values in the first languages grid row — the
        number of columns the template actually rendered."""
        elements = generate_resume(template_id, cv)
        grid_cells = [
            element for element in elements
            if element.get("flowRole") == "grid-member" and element["category"] == "textarea"
        ]
        self.assertTrue(grid_cells, f"{template_id}: expected languages to spill into a grid")
        first_row_top = min(element["top"] for element in grid_cells)
        first_row_lefts = {
            round(element["left"], 1) for element in grid_cells
            if abs(element["top"] - first_row_top) < 0.5
        }
        return len(first_row_lefts)

    def test_sidebar_templates_use_a_3_column_languages_grid_not_4(self) -> None:
        """Sterling/Vestige/Tessera/Slate's main column (~300-335 pt) is
        narrower than a single-column template's (~460-500 pt); a 4-column
        grid leaves too little width per cell for a "Name — Level" line,
        wrapping or cutting it off. Sidebar templates must use 3 columns —
        `_extra_sections`'s `languages_columns` parameter (see
        `shared/extras.py`)."""
        cv = {
            "name": "Alexandra Nowak", "title": "Strategy Consultant",
            "summary": (
                "Łączę analizę, strategię i jasne decyzje w złożonych "
                "projektach transformacyjnych dla dużych organizacji "
                "korporacyjnych na rynkach międzynarodowych."
            ),
            "experience": [
                {"title": "Consultant", "company": "Northline", "period": "2022 – obecnie",
                 "bullets": ["Prowadzę projekty.", "Analizuję dane.", "Współpracuję z zarządem."]},
                {"title": "Analyst", "company": "Meridian", "period": "2019 – 2022",
                 "bullets": ["Wspieram zespoły.", "Przygotowuję raporty."]},
                {"title": "Junior Analyst", "company": "Civic", "period": "2016 – 2019",
                 "bullets": ["Zbieram dane."]},
            ],
            "education": [{
                "degree": "Magister ekonomii", "school": "Szkoła Główna Handlowa",
                "period": "2013 – 2018",
                "description": "Praca dyplomowa o strategiach wzrostu przedsiębiorstw rodzinnych.",
            }],
            "skills": [
                "Strategia", "Transformacja", "Analiza biznesowa", "Facylitacja",
                "Zarządzanie zespołem", "Negocjacje", "Przywództwo", "Zarządzanie zmianą",
                "Komunikacja", "Planowanie",
            ],
            "languages": [
                {"name": "Polski", "level": "ojczysty"},
                {"name": "Angielski", "level": "C1"},
                {"name": "Niemiecki", "level": "B2"},
                {"name": "Francuski", "level": "B1"},
            ],
            "extra_sections": [
                {"title": "Certyfikaty", "kind": "certifications", "items": ["PMP", "Prince2", "Six Sigma", "Agile"]},
                {"title": "Zainteresowania", "kind": "interests", "items": ["Szachy", "Bieganie", "Podróże", "Fotografia"]},
            ],
        }
        for template_id in ("sterling", "vestige"):
            with self.subTest(template=template_id):
                self.assertEqual(self._languages_grid_row_width(template_id, cv), 3)


if __name__ == "__main__":
    unittest.main()
