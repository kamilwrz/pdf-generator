"""Regression coverage for the narrow-sidebar Vestige template."""
from __future__ import annotations

import unittest

from app.services.cv_templates.registry import TEMPLATE_LAYOUTS, generate_resume


class VestigeTemplateTests(unittest.TestCase):
    """Keep Vestige's column ownership and neutral visual system stable."""

    def test_vestige_registers_as_a_sidebar_icon_template(self) -> None:
        self.assertEqual(TEMPLATE_LAYOUTS["vestige"], frozenset({"sidebar", "icons"}))

    def test_vestige_places_identity_in_main_and_contact_in_sidebar(self) -> None:
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "linkedin": "linkedin.com/in/alexandra-nowak",
                "location": "Warszawa",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia", "Analiza"],
                "languages": [{"name": "Polski", "level": "ojczysty"}],
            },
        )

        rail = next(
            element
            for element in elements
            if element.get("fixedToPage") and element.get("left") == 0 and element.get("height") == 842
            and element.get("width") == 174
        )
        self.assertEqual(rail["backgroundColor"], "#F4F4F2")

        name = next(element for element in elements if element.get("content") == "Alexandra Nowak")
        self.assertEqual((name["left"], name["width"], name["align"]), (210.0, 335.0, "left"))

        # Contact-rail icons only — excludes the masthead photo-slot glyph,
        # which is also a category "image" element but sits at the photo
        # slot's own left, not the sidebar's.
        icons = [
            element for element in elements
            if element["category"] == "image" and not element.get("photoSlot")
        ]
        self.assertEqual(len(icons), 4)
        self.assertTrue(all(element["left"] == 27.0 for element in icons))
        self.assertTrue(all("/template-assets/iconic/vestige/" in element["src"] for element in icons))

        contact_heading = next(
            element for element in elements
            if element.get("content") == "DANE KONTAKTOWE"
        )
        contact_rule = next(
            element for element in elements
            if element.get("flowRole") == "masthead"
            and element.get("category") == "line"
            and element.get("left") == contact_heading["left"]
            and element.get("width") == 16.0
        )
        self.assertLess(contact_heading["top"], min(element["top"] for element in icons))
        self.assertLess(contact_rule["top"], min(element["top"] for element in icons))
        self.assertFalse(contact_heading.get("contactChannel"))
        self.assertFalse(contact_rule.get("contactChannel"))

        main_rules = [
            element for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "line"
        ]
        self.assertTrue(main_rules)
        self.assertTrue(all((element["left"], element["width"]) == (210.0, 335.0) for element in main_rules))

        sidebar_rules = [
            element for element in elements
            if element.get("flowRole") == "sidebar-chrome" and element["category"] == "line"
        ]
        self.assertTrue(sidebar_rules)
        self.assertTrue(all(element["height"] == 1.0 for element in sidebar_rules))
        self.assertEqual(contact_rule["height"], 1.0)
        self.assertTrue(all(element["height"] == 1 for element in main_rules))

    def test_vestige_uses_its_own_heading_type_scale(self) -> None:
        """Main headings render at 13px, sidebar headings at 8.4px — distinct
        from Sterling's 14 / 9.4 so the narrow rail reads as its own design."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        main_headings = [
            element for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
        ]
        sidebar_headings = [
            element for element in elements
            if element.get("flowRole") == "sidebar-chrome" and element["category"] == "text"
        ]
        self.assertTrue(main_headings)
        self.assertTrue(sidebar_headings)
        self.assertTrue(all(element["fontSize"] == 13.0 for element in main_headings))
        self.assertTrue(all(element["fontSize"] == 8.4 for element in sidebar_headings))

    def test_vestige_first_sidebar_section_aligns_with_first_main_section(self) -> None:
        """The sidebar's first heading (above the rebuilt contact rail) must
        start at the same Y as the main column's first heading, not below it
        at an arbitrary fixed offset — Sterling already aligns both columns'
        first heading at one shared cursor position."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        main_headings = [
            element for element in elements
            if element.get("flowRole") == "section-chrome" and element["category"] == "text"
            and element.get("page", 1) == 1
        ]
        sidebar_headings = [
            element for element in elements
            if element.get("flowRole") == "sidebar-chrome" and element["category"] == "text"
            and element.get("page", 1) == 1
        ]
        self.assertTrue(main_headings)
        self.assertTrue(sidebar_headings)
        self.assertAlmostEqual(
            min(element["top"] for element in main_headings),
            min(element["top"] for element in sidebar_headings),
        )

    def test_vestige_masthead_divider_tracks_the_real_name_and_title_height(self) -> None:
        """The masthead-closing divider used to sit at a fixed top=132,
        unrelated to the name/title stack's real height — Sterling's own
        `height` for these boxes was measured at Sterling's smaller font size
        (30/34 and 11.5/15), not Vestige's own (34/38 and 9.5/13), so the
        stored `height` understated their real size and the divider's fixed
        position drifted arbitrarily far from their true bottom edge as
        content varied. That variable gap fed a client-side bug
        (`resolveFlowStart` in sectionStructure.js) which discarded a
        too-large "authored gap" as corruption and silently relocated the main
        column on every repack (density change, reorder, ...). The divider
        must now sit a small, fixed distance below the name/title stack's
        real (recomputed) bottom, regardless of content length."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        name = next(
            element for element in elements
            if element.get("mastheadRole") == "name" and element["category"] == "textarea"
        )
        title = next(
            (element for element in elements if element.get("mastheadRole") == "title"),
            None,
        )
        divider = next(
            element for element in elements
            if element.get("flowRole") == "masthead" and element["category"] == "line"
            and element.get("page", 1) == 1
        )
        # Each box's stored `height` must match its OWN `lineHeight` for a
        # single line — Sterling's stale height (measured at ITS font size)
        # was smaller than Vestige's own `lineHeight` for both boxes.
        self.assertEqual(name["height"], name["lineHeight"])
        if title is not None:
            self.assertEqual(title["height"], title["lineHeight"])
        stack_bottom = max(
            float(box["top"]) + float(box["height"])
            for box in (name, title) if box is not None
        )
        self.assertAlmostEqual(divider["top"], stack_bottom + 12.0)

    def test_vestige_contact_band_supports_add_remove_channel(self) -> None:
        """Vestige must emit a real "stacked"-mode contact-band descriptor
        (not Sterling's dropped centered-mode anchor) so the contact channel
        manager can add/remove a channel — see the module docstring for why
        Sterling's own anchor is unsafe to reuse verbatim."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )
        anchor = next(
            element for element in elements
            if element.get("flowRole") == "masthead-anchor" and element.get("contactBand")
        )
        descriptor = anchor["contactBand"]
        self.assertEqual(descriptor["mode"], "stacked")
        self.assertEqual(descriptor["id"], "vestige-contact")
        self.assertEqual(descriptor["anchor"]["startX"], 27.0)
        self.assertEqual(descriptor["anchor"]["startY"], 46.0)
        self.assertEqual(descriptor["order"], ["phone", "email"])

    def test_vestige_keeps_static_contact_heading_without_contact_channels(self) -> None:
        """The sidebar label is template chrome, not an optional channel."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )

        heading = next(
            element for element in elements
            if element.get("content") == "DANE KONTAKTOWE"
        )
        self.assertEqual(heading["flowRole"], "masthead")
        self.assertFalse(heading.get("contactBandId"))

    def test_vestige_emits_masthead_identity_for_name_case_and_title_visibility(self) -> None:
        """Show/hide job title and the name upper/lowercase toggle both depend
        on a `mastheadIdentity` descriptor — Sterling (which Vestige forwards)
        never builds one, so Vestige must tag it directly."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )
        anchor = next(
            element for element in elements
            if element.get("flowRole") == "masthead-anchor" and element.get("mastheadIdentity")
        )
        descriptor = anchor["mastheadIdentity"]
        self.assertEqual(descriptor["id"], "vestige-masthead")
        self.assertTrue(descriptor["title"]["present"])
        # `blockPt` must be exactly 0: the frontend's hide/show-title reflow
        # (`mastheadIdentityOps.js`) always shifts everything at/below the
        # TITLE'S OWN top by `blockPt`, regardless of what `band_top` this
        # generator passes in. Vestige's contact rail rows straddle the
        # title's Y (some above, some below), and the sidebar sits below it
        # too, so any nonzero blockPt splits the contact cluster apart and
        # drags the sidebar along with it — the exact "hiding the title
        # breaks the contact layout" bug this pins against.
        self.assertEqual(descriptor["title"]["blockPt"], 0)
        # The contact rail is a parallel sidebar column, not tied to the
        # title's Y — it must not be coupled to the hide/show shift.
        self.assertIsNone(descriptor["contactBandId"])

        name = next(
            element for element in elements
            if element.get("content") == "Alexandra Nowak" and element.get("mastheadRole") == "name"
        )
        self.assertEqual(name["mastheadBandId"], "vestige-masthead")

    def test_vestige_languages_grid_cells_do_not_collide(self) -> None:
        """A languages grid routed into the main column must keep each cell at
        its own translated X — the previous blanket main-column reposition
        collapsed every `grid-member` cell in a row onto one identical box.

        The sidebar's other candidates (education/skills/certifications/
        interests) are filled out here so the planner's budget genuinely
        spills languages into the main column instead of fitting everything
        into the rail — the exact scenario that reproduced the overlap.
        """
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
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
            },
        )
        grid_cells = [
            element for element in elements
            if element.get("flowRole") == "grid-member" and element["category"] == "textarea"
        ]
        self.assertTrue(grid_cells)
        # Vestige's 3-column grid (see the sidebar-templates line-length fix)
        # legitimately wraps a 4th language onto a new row, reusing column 1's
        # `left` — a real collision is two cells at the SAME `left` sharing
        # the SAME row (`top`), not the same column across different rows.
        by_row: dict[float, list[float]] = {}
        for element in grid_cells:
            by_row.setdefault(element["top"], []).append(element["left"])
        for top, lefts in by_row.items():
            self.assertEqual(
                len(lefts), len(set(lefts)),
                f"grid-member cells collided within row top={top!r}: {lefts!r}",
            )

    def test_vestige_sidebar_elements_do_not_overlap_after_narrowing(self) -> None:
        """Narrowing the sidebar column rewraps body copy onto more lines than
        Sterling planned for at its original, wider column — recomputing each
        box's `height` for the new width without also shifting every element
        below it down left a taller-than-planned box overlapping the next
        section's heading. A long summary (proportionally the biggest wrap-
        count change under narrowing) reproduces it; every consecutive pair of
        same-page sidebar elements, sorted by `top`, must not overlap.
        """
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "email": "alexandra@example.com",
                "phone": "+48 600 000 000",
                "summary": (
                    "Przekształcam złożone strategie w decyzje, które porządkują "
                    "organizacje, budują mierzalny wzrost i utrzymują zaufanie "
                    "interesariuszy w trakcie wielowymiarowych transformacji "
                    "operacyjnych oraz cyfrowych, prowadząc zespoły przez okresy "
                    "niepewności rynkowej i regulacyjnej z naciskiem na jakość "
                    "wykonania oraz komunikację z zarządem i radą nadzorczą w "
                    "spółkach o złożonej strukturze właścicielskiej."
                ),
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie"}],
                "education": [{"degree": "Magister ekonomii", "school": "SGH", "period": "2013 – 2018"}],
                "skills": ["Strategia", "Transformacja", "Analiza biznesowa"],
                "languages": [{"name": "Polski", "level": "ojczysty"}],
            },
        )
        sidebar_elements = [
            element for element in elements
            if (element.get("flowLane") == "sidebar" or element.get("flowRole") == "sidebar-chrome")
            and element.get("page", 1) == 1
            and "top" in element
        ]
        sidebar_elements.sort(key=lambda element: element["top"])
        for earlier, later in zip(sidebar_elements, sidebar_elements[1:]):
            earlier_bottom = earlier["top"] + float(earlier.get("height", 0))
            self.assertLessEqual(
                earlier_bottom, later["top"] + 0.01,
                f"sidebar overlap: {earlier!r} bottom {earlier_bottom} > next top {later['top']!r}",
            )

    def test_vestige_main_column_body_uses_12px_line_height(self) -> None:
        """Main-column body copy (summary, bullets, record meta rows) renders
        at a uniform 12 px line height, distinct from Sterling's per-field
        values (13.8 body, 14.0 record titles, 11.8 meta rails)."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [{"title": "Consultant", "company": "Northline", "period": "2022 – obecnie",
                                "bullets": ["Prowadzę projekty."]}],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        main_bodies = [
            element for element in elements
            if element.get("category") == "textarea"
            and element.get("flowLane") != "sidebar"
            and element.get("flowRole") not in {"masthead", "masthead-anchor"}
            and element.get("left") == 210.0
        ]
        self.assertTrue(main_bodies)
        self.assertTrue(all(element["lineHeight"] == 12.0 for element in main_bodies))

    def test_vestige_emits_a_clickable_masthead_photo_slot(self) -> None:
        """Vestige exposes an empty-state photo well/frame/glyph triplet so a
        user can click it to open the gallery — mirroring Regent's pattern
        (`photoSlot` tags the client recognises generically, not template-
        specific ids; see `frontend/src/utils/profilePhoto.js`)."""
        elements = generate_resume(
            "vestige",
            {
                "name": "Alexandra Nowak",
                "title": "Strategy Consultant",
                "summary": "Łączę analizę, strategię i jasne decyzje.",
                "experience": [],
                "education": [],
                "skills": [],
                "languages": [],
            },
        )
        well = next(element for element in elements if element.get("photoSlot") == "ornament")
        frame = next(element for element in elements if element.get("photoSlot") == "frame")
        glyph = next(element for element in elements if element.get("photoSlot") == "glyph")

        self.assertEqual(frame["id"], "vestige-photo-frame")
        self.assertEqual(frame["category"], "rectangle")
        self.assertEqual(well["category"], "rectangle")
        self.assertTrue(well["filled"])
        self.assertEqual(frame["photoShape"], "rect")
        # Well, frame, and glyph must share the same box so the click target,
        # the visible outline, and the placeholder icon all line up.
        for element in (well, frame):
            self.assertEqual((element["left"], element["top"], element["width"], element["height"]),
                              (505.0, 25.0, 60.0, 74.4))
        self.assertEqual(glyph["category"], "image")
        self.assertIn("/template-assets/iconic/vestige/portrait.png", glyph["src"])
        self.assertFalse(glyph["alignWithText"])

    def test_vestige_main_column_record_gaps_are_uniform(self) -> None:
        """Recomputing every main-column textarea's `height` at the uniform
        12 px line height (see the 12px-line-height test above) shrinks each
        box by a different amount depending on its own line count, while
        every subsequent record's `top` is still Sterling's original, now-
        stale cursor position — left uncorrected, the *authored* gap between
        one record and the next becomes visibly uneven from record to record,
        only self-healing once the client's own reflow ("Układ CV") repacks
        every gap from real measured heights. Every consecutive pair of
        page-1 main-column textareas, sorted by `top`, must already show one
        of exactly two gap sizes: a small one between fields of the SAME
        record (title→meta→body) and a larger one between two records —
        never a third, arbitrary value.
        """
        long_bullets = ["Punkt numer jeden z dłuższym opisem.", "Punkt numer dwa.", "Punkt trzeci z opisem."]
        elements = generate_resume(
            "vestige",
            {
                "name": "Kamil Wrzochalski",
                "title": "AML Analyst",
                "email": "k@example.com",
                "phone": "+48 792 575 970",
                "summary": "Starszy analityk AML/KYC.",
                "experience": [
                    {"title": "Senior AML Analyst", "company": "PwC", "period": "06/2025 – obecnie",
                     "bullets": long_bullets},
                    {"title": "Customer Service Representative", "company": "Medtronic", "period": "01/2025 – 05/2025",
                     "bullets": ["Jeden krótki punkt."]},
                    {"title": "AML Analyst", "company": "Citibank", "period": "07/2022 – 12/2024",
                     "bullets": long_bullets},
                    {"title": "Customer Service Specialist", "company": "Amazon", "period": "08/2020 – 06/2022",
                     "bullets": long_bullets + ["Jeszcze jeden punkt na końcu."]},
                ],
                "education": [],
                "skills": ["Strategia"],
                "languages": [],
            },
        )
        main_bodies = [
            element for element in elements
            if element.get("page", 1) == 1 and element["category"] == "textarea"
            and element.get("flowLane") != "sidebar"
            and element.get("flowRole") not in {"masthead", "masthead-anchor"}
        ]
        main_bodies.sort(key=lambda element: element["top"])
        self.assertGreater(len(main_bodies), 4, "fixture must produce enough records to compare gaps")
        gaps = set()
        for earlier, later in zip(main_bodies, main_bodies[1:]):
            gap = round(later["top"] - (earlier["top"] + earlier["height"]), 1)
            gaps.add(gap)
        self.assertLessEqual(
            len(gaps), 2,
            f"expected at most 2 distinct gap sizes (same-record, between-record), got {sorted(gaps)!r}",
        )


if __name__ == "__main__":
    unittest.main()
