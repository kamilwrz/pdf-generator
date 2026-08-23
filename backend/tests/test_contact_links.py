"""Contact / social link helpers and template contact placement."""
from __future__ import annotations

import unittest

from app.services.contact_links import (
    categorize_contact_url,
    contact_display_label,
    extract_contact_fields_from_raw,
    merge_contact_fields,
)
from app.services.cv_data import normalize_cv_data
from app.services.cv_templates.registry import generate_resume
from app.services.cv_templates.shared.contact import (
    _contact_channel_items,
    _place_wrapping_icon_contacts,
)


class ContactLinkHelperTests(unittest.TestCase):
    def test_categorize_by_domain(self):
        self.assertEqual(categorize_contact_url("https://www.linkedin.com/in/anna"), "linkedin")
        self.assertEqual(categorize_contact_url("github.com/anna"), "github")
        self.assertEqual(categorize_contact_url("https://anna.dev"), "website")

    def test_display_labels_keep_the_full_contact_path(self):
        self.assertEqual(
            contact_display_label("linkedin", "https://www.linkedin.com/in/anna-kowalska"),
            "linkedin.com/in/anna-kowalska",
        )
        self.assertEqual(
            contact_display_label("github", "anna"),
            "github.com/anna",
        )
        self.assertEqual(
            contact_display_label("website", "https://www.anna.dev/about"),
            "anna.dev/about",
        )
        long_linkedin = "https://linkedin.com/in/dawid-frontczak-project-management-office"
        self.assertEqual(
            contact_display_label("linkedin", long_linkedin),
            "linkedin.com/in/dawid-frontczak-project-management-office",
        )

    def test_merge_rehouses_misplaced_urls(self):
        slots = merge_contact_fields(
            website="https://github.com/anna",
            linkedin="",
            github="",
        )
        self.assertEqual(slots["github"], "https://github.com/anna")
        self.assertEqual(slots["website"], "")

    def test_normalize_keeps_social_fields(self):
        profile = normalize_cv_data({
            "name": "Anna",
            "linkedin": "linkedin.com/in/anna",
            "github": "github.com/anna",
            "website": "https://anna.dev",
            "link": "https://should-not-overwrite-website.example",
        })
        self.assertEqual(profile["linkedin"], "linkedin.com/in/anna")
        self.assertEqual(profile["github"], "github.com/anna")
        self.assertEqual(profile["website"], "https://anna.dev")

    def test_extract_from_raw_links_list(self):
        slots = extract_contact_fields_from_raw({
            "links": [
                "https://linkedin.com/in/x",
                "https://github.com/x",
                "https://portfolio.example",
            ],
        })
        self.assertTrue(slots["linkedin"])
        self.assertTrue(slots["github"])
        self.assertTrue(slots["website"])


class ContactPlacementTests(unittest.TestCase):
    def test_contact_channels_never_truncate_user_values(self):
        long_profile = "linkedin.com/in/dawid-frontczak-project-management-office"
        long_location = "Zielona Góra / Wrocław / Dolnośląskie / Polska"
        items = _contact_channel_items({
            "phone": "+48 500 000 000 wew. 123456",
            "email": "dawid.frontczak.project.management.office@example.com",
            "linkedin": long_profile,
            "location": long_location,
        })
        self.assertIn(("linkedin", long_profile), items)
        self.assertIn(("location", long_location), items)
        self.assertTrue(all("…" not in value for _, value in items))

    def test_wrapping_placer_moves_to_second_line(self):
        items = _contact_channel_items({
            "phone": "+48 500 000 000",
            "email": "anna.kowalska@example.com",
            "linkedin": "linkedin.com/in/anna-kowalska",
            "github": "github.com/anna-kowalska",
            "website": "anna-portfolio.example",
            "location": "Warszawa",
        })
        els, bottom, _descriptor = _place_wrapping_icon_contacts(
            theme="volt",
            items=items,
            start_x=50.0,
            start_y=118.0,
            right_limit=400.0,
            text_fs=8.4,
            icon_size=14.0,
            text_color="#000",
            font="Montserrat",
        )
        tops = {e["top"] for e in els if e.get("category") == "text"}
        self.assertGreater(len(tops), 1)
        self.assertGreater(bottom, 118.0)
        self.assertGreaterEqual(len(els), 8)
        # Labels must share masthead ownership with icons (spacing pack safety).
        for element in els:
            if element.get("category") == "text":
                self.assertEqual(element.get("flowRole"), "masthead")

    def test_regent_header_contacts_are_masthead(self):
        cv = normalize_cv_data({
            "name": "Anna Rojek",
            "phone": "684 732 543",
            "email": "annarojek87@wp.pl",
            "location": "Warszawa",
        })
        els = generate_resume("volt", cv)
        contact_texts = [
            e for e in els
            if e.get("category") == "text"
            and e.get("content") in {"684 732 543", "annarojek87@wp.pl", "Warszawa"}
        ]
        self.assertEqual(len(contact_texts), 3)
        for element in contact_texts:
            self.assertEqual(element.get("flowRole"), "masthead")

    def test_regent_generator_includes_social_icons_and_pushes_rule(self):
        cv = normalize_cv_data({
            "name": "Anna Kowalska",
            "email": "anna@example.com",
            "phone": "+48 500 000 000",
            "location": "Warszawa",
            "linkedin": "linkedin.com/in/anna",
            "github": "github.com/anna",
            "website": "anna.dev",
        })
        els = generate_resume("regent", cv)
        srcs = " ".join(e.get("src", "") for e in els if e.get("category") == "image")
        self.assertIn("linkedin.png", srcs)
        self.assertIn("github.png", srcs)
        self.assertIn("website.png", srcs)
        # Header rule must sit below the stacked contact band (taller than the
        # old wrapping layout that stopped around y=144).
        rules = [
            e for e in els
            if e.get("category") == "line" and e.get("top", 0) > 100 and e.get("top", 0) < 280
            and e.get("width", 0) > 400
        ]
        self.assertTrue(rules)
        self.assertGreater(min(r["top"] for r in rules), 149.0)


if __name__ == "__main__":
    unittest.main()
