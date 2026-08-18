import unittest

from app.services import ai_assistant_service as svc


def _text_el(element_id, content, **extra):
    """Build a minimal text canvas element for detector tests."""
    base = {
        "element_id": element_id,
        "category": "textarea",
        "content": content,
        "fontSize": 11,
        "color": "#2B2B2B",
        "left": 40, "top": 100, "width": 400, "height": 60, "page": 1,
    }
    base.update(extra)
    return base


class DetectCvLanguageTests(unittest.TestCase):
    def test_english_body_detected_as_en(self):
        elements = [
            _text_el("h1", "EXPERIENCE", fontSize=14),
            _text_el("b1", "Developed and managed the analytics platform, "
                           "improved reporting for the whole team and delivered "
                           "the project with measurable results."),
        ]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "en")
        self.assertFalse(result["is_mixed"])

    def test_german_body_detected_as_de(self):
        elements = [
            _text_el("h1", "BERUFSERFAHRUNG", fontSize=14),
            _text_el("b1", "Entwicklung und Betreuung der Analyseplattform mit "
                           "Verantwortung für das Team und die Umsetzung der "
                           "Projekte im Unternehmen."),
        ]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "de")

    def test_polish_body_detected_as_pl(self):
        elements = [
            _text_el("h1", "DOŚWIADCZENIE", fontSize=14),
            _text_el("b1", "Prowadziłem zespół oraz odpowiadałem za rozwój "
                           "platformy analitycznej i realizację projektów w firmie."),
        ]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "pl")

    def test_cyrillic_body_detected_as_uk(self):
        elements = [
            _text_el("b1", "Розробка та підтримка аналітичної платформи, "
                           "відповідальність за команду та реалізацію проєктів."),
        ]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "uk")

    def test_mixed_polish_headers_english_body_body_wins(self):
        elements = [
            _text_el("h1", "PODSUMOWANIE ZAWODOWE", fontSize=14),
            _text_el("h2", "DOŚWIADCZENIE", fontSize=14),
            _text_el("b1", "Experienced analyst who developed and managed the "
                           "reporting platform and improved delivery for the team."),
            _text_el("b2", "Built machine learning models and delivered research "
                           "for the whole engineering organisation."),
        ]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "en")
        self.assertTrue(result["is_mixed"])
        self.assertEqual(result["header_lang"], "pl")
        self.assertEqual(result["body_lang"], "en")

    def test_short_or_empty_text_falls_back_to_pl(self):
        elements = [_text_el("b1", "Jan Kowalski")]
        result = svc._detect_cv_language(elements)
        self.assertEqual(result["code"], "pl")
        self.assertLess(result["confidence"], 0.5)

    def test_confident_header_but_short_body_is_not_mixed(self):
        # Header chrome scores English, but every body line is too short to
        # score. Detector must not claim a mix: body_lang stays None, code
        # falls back to pl, is_mixed is False.
        elements = [
            _text_el("h1", "EXPERIENCE", fontSize=14),
            _text_el("h2", "EDUCATION", fontSize=14),
            _text_el("b1", "Berlin"),
            _text_el("b2", "2021"),
        ]
        result = svc._detect_cv_language(elements)
        self.assertIsNone(result["body_lang"])
        self.assertEqual(result["code"], "pl")
        self.assertFalse(result["is_mixed"])


if __name__ == "__main__":
    unittest.main()
