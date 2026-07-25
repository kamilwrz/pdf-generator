import unittest
from pathlib import Path

from starlette.requests import Request

from app.api.routes.ai import _rebase_template_asset_urls
from app.services.cv_generator import generate_resume
from app.utils.image_src_to_path import image_src_to_local_path


LONG_CV = {
    "name": "Aleksandra Katarzyna Nowakowska-Wiśniewska",
    "title": "Dyrektorka Strategii Produktowej i Transformacji Operacyjnej",
    "email": "aleksandra.nowakowska-wisniewska@example.com",
    "phone": "+48 600 123 456",
    "location": "Warszawa, województwo mazowieckie",
    "summary": (
        "Doświadczona liderka produktów cyfrowych, która łączy strategię, badania "
        "i projektowanie usług, aby prowadzić złożone transformacje organizacyjne."
    ),
    "experience": [
        {
            "title": "Dyrektorka Strategii Produktowej i Transformacji Operacyjnej",
            "company": "Fundacja Rozwoju Usług Publicznych i Cyfrowych",
            "period": "2021 – obecnie",
            "bullets": [
                "Prowadziła wieloletni program transformacji obejmujący produkty, procesy i model operacyjny.",
                "Zbudowała zespół łączący badania, projektowanie, analitykę oraz rozwój oprogramowania.",
            ],
        },
        {
            "title": "Starsza Menedżerka Programów Strategicznych",
            "company": "Międzynarodowe Centrum Innowacji Społecznych",
            "period": "2017 – 2021",
            "bullets": [
                "Koordynowała programy realizowane z partnerami z sektora publicznego i prywatnego.",
                "Wprowadziła mierniki jakości usług oraz rytuały wspierające podejmowanie decyzji.",
            ],
        },
        {
            "title": "Menedżerka Produktu",
            "company": "Pracownia Projektowania Doświadczeń Użytkownika",
            "period": "2014 – 2017",
            "bullets": ["Prowadziła rozwój usług cyfrowych od badań po wdrożenie."],
        },
    ],
    "education": [
        {
            "degree": "Magister Zarządzania Innowacjami i Projektowania Usług",
            "period": "2012 – 2014",
            "detail": "Uniwersytet Ekonomiczny w Krakowie",
        }
    ],
    "skills": [
        "Strategia produktowa",
        "Projektowanie usług",
        "Badania jakościowe",
        "Zarządzanie zmianą",
        "Facylitacja",
        "Analiza procesów",
        "Rozwój organizacji",
        "Zarządzanie interesariuszami",
    ],
}


class CvTemplateLayoutTests(unittest.TestCase):
    def test_generated_template_image_uses_public_request_origin(self):
        request = Request({
            "type": "http",
            "scheme": "http",
            "headers": [
                (b"host", b"internal-service:8000"),
                (b"x-forwarded-proto", b"https"),
                (b"x-forwarded-host", b"pdf-generator-07cb.onrender.com"),
            ],
        })
        elements = _rebase_template_asset_urls([{
            "category": "image",
            "src": "http://localhost:8000/template-assets/nimbus-finance-accent.png",
        }], request)

        self.assertEqual(
            elements[0]["src"],
            "https://pdf-generator-07cb.onrender.com/template-assets/nimbus-finance-accent.png",
        )

    def test_template_images_resolve_to_versioned_local_assets(self):
        for template_id in ("ledger", "nimbus"):
            with self.subTest(template_id=template_id):
                image = next(
                    element
                    for element in generate_resume(template_id, LONG_CV)
                    if element["category"] == "image"
                )
                local_path = Path(image_src_to_local_path(image["src"]))
                self.assertTrue(local_path.is_file())

    def test_ledger_contains_every_canvas_element_category(self):
        elements = generate_resume("ledger", LONG_CV)
        categories = {element["category"] for element in elements}

        self.assertTrue({"text", "textarea", "line", "rectangle", "image", "connector"} <= categories)
        self.assertTrue(all(
            element.get("autoHeight") is True
            for element in elements
            if element["category"] == "textarea"
        ))
        self.assertTrue(any(
            element["category"] == "image"
            and element["src"].endswith("/template-assets/ledger-finance-accent.png")
            for element in elements
        ))

    def test_nimbus_uses_every_canvas_element_without_theme_copy(self):
        elements = generate_resume("nimbus", LONG_CV)
        categories = {element["category"] for element in elements}
        rendered_copy = " ".join(
            str(element.get("content", ""))
            for element in elements
            if element["category"] in {"text", "textarea"}
        ).upper()

        self.assertTrue({"text", "textarea", "line", "rectangle", "image", "connector"} <= categories)
        self.assertNotIn("NIMBUS", rendered_copy)
        self.assertTrue(any(
            element["category"] == "image"
            and element["src"].endswith("/template-assets/nimbus-finance-accent.png")
            for element in elements
        ))

    def test_nimbus_repeats_section_rail_on_continuation_pages(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("nimbus", multi_page_cv)
        education_heading = next(
            element
            for element in elements
            if element["category"] == "text"
            and element["content"] == "WYKSZTAŁCENIE"
        )

        self.assertGreater(education_heading["page"], 1)
        self.assertTrue(any(
            element["category"] == "rectangle"
            and element["page"] == education_heading["page"]
            and element["left"] == 45
            and abs(element["top"] - (education_heading["top"] + 20)) < 0.01
            for element in elements
        ))
        self.assertTrue(any(
            element["category"] == "line"
            and element["page"] == education_heading["page"]
            and element["left"] == 52
            and abs(element["top"] - (education_heading["top"] + 5)) < 0.01
            for element in elements
        ))

    def test_cinder_is_single_column_and_repeats_page_decorations(self):
        multi_page_cv = {
            **LONG_CV,
            "experience": LONG_CV["experience"] * 4,
        }
        elements = generate_resume("cinder", multi_page_cv)
        categories = {element["category"] for element in elements}
        pages = {element.get("page", 1) for element in elements}
        rendered_copy = " ".join(
            str(element.get("content", ""))
            for element in elements
            if element["category"] in {"text", "textarea"}
        ).upper()

        self.assertTrue({"text", "textarea", "line", "rectangle", "connector"} <= categories)
        self.assertNotIn("CINDER", rendered_copy)
        self.assertGreater(max(pages), 1)
        self.assertTrue(all(
            element["left"] >= 76 and element["width"] >= 460
            for element in elements
            if element["category"] == "textarea"
        ))
        for page in pages:
            self.assertTrue(any(
                element["category"] == "line"
                and element.get("page", 1) == page
                and element["left"] == 0
                and element["top"] == 0
                and element["width"] == 595
                and element["height"] == 5
                and element["backgroundColor"] == "#C93F3F"
                for element in elements
            ))

    def test_final_templates_keep_textareas_inside_page_bounds(self):
        for template_id in ("solstice", "mistral", "axiom", "vellum"):
            with self.subTest(template_id=template_id):
                multi_page_cv = {
                    **LONG_CV,
                    "experience": LONG_CV["experience"] * 3,
                }
                elements = generate_resume(template_id, multi_page_cv)
                for element in elements:
                    if element["category"] != "textarea":
                        continue
                    self.assertGreaterEqual(element["left"], 0)
                    self.assertGreaterEqual(element["top"], 0)
                    self.assertLessEqual(element["left"] + element["width"], 595)
                    self.assertLessEqual(element["top"] + element["height"], 842)
                    self.assertTrue(element["autoHeight"])
                self.assertGreater(max(element.get("page", 1) for element in elements), 1)

    def test_mistral_keeps_main_flow_independent_from_sidebar_preview(self):
        elements = generate_resume("mistral", LONG_CV)
        summary_heading = next(
            element
            for element in elements
            if element["category"] == "text"
            and element["content"] == "PODSUMOWANIE ZAWODOWE"
        )

        self.assertEqual(summary_heading["left"], 204)
        self.assertEqual(summary_heading["top"], 194.0)
        self.assertTrue(any(
            element["category"] == "textarea"
            and element["left"] == 204
            and "Zarządzanie interesariuszami" in element["content"]
            for element in elements
        ))

    def test_side_panels_use_bounded_previews_without_dropping_main_skills(self):
        solstice = generate_resume("solstice", LONG_CV)
        mistral = generate_resume("mistral", LONG_CV)

        self.assertTrue(all(
            element["height"] <= 64
            for element in solstice
            if element["category"] == "textarea" and element["left"] == 36
        ))
        self.assertTrue(all(
            element["height"] <= 92
            for element in mistral
            if element["category"] == "textarea" and element["left"] == 48
        ))
        for elements, left in ((solstice, 224), (mistral, 204)):
            self.assertTrue(any(
                element["category"] == "textarea"
                and element["left"] == left
                and "Zarządzanie interesariuszami" in element["content"]
                for element in elements
            ))


if __name__ == "__main__":
    unittest.main()
