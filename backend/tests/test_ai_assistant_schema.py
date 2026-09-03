"""Tests for structured rating fields and the translate assistant action."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes import ai_assistant as ai_assistant_route
from app.api.routes.ai_assistant import (
    AssistantRequest, AssistantResponse, SUPPORTED_LANGUAGES, TRANSLATE_LANGUAGES,
)
from app.core.security import verify_token
from app.dependencies import get_db
from app.main import app
from app.services import ai_assistant_service
from app.testing_support import ensure_test_auth_env


class SafeResultSchemaTests(unittest.TestCase):
    def test_safe_result_drops_empty_content_correction(self):
        result = ai_assistant_service._safe_result({
            "corrections": [
                {"element_id": "record-body", "content": "   "},
                {"element_id": "record-title", "content": "", "bold": True},
            ],
        })

        self.assertEqual(
            result["corrections"],
            [{"element_id": "record-title", "bold": True}],
        )

    def test_structured_context_keeps_empty_summary_textareas(self):
        structured = ai_assistant_service._extract_structured([
            {
                "element_id": "summary",
                "category": "textarea",
                "content": "",
                "fontSize": 10,
                "lineHeight": 14,
            },
            {
                "element_id": "contact-anchor",
                "category": "text",
                "content": "",
                "width": 0,
                "height": 0,
            },
        ])

        self.assertEqual(
            [(item["element_id"], item["content"]) for item in structured],
            [("summary", "")],
        )

    def test_safe_result_keeps_categories_and_strips_rozkład_tip(self):
        raw = {
            "message": "Dobre CV.",
            "rating": 7,
            "tips": [
                "Rozkład oceny: Sekcje 2/2 + Doświadczenie 2/3",
                "Dodaj metryki do doświadczenia.",
            ],
            "categories": [
                {"id": "experience", "label": "Doświadczenie", "score": 2, "max": 3},
                {"id": "bad", "label": "", "score": 1, "max": 1},
            ],
            "strengths": ["Mocny profil AML"],
            "priorities": [
                {"title": "Dodaj metryki", "description": "Uzupełnij % w bulletach."},
                "Skróć podsumowanie",
            ],
            "corrections": [],
            "web_sources": [],
        }
        result = ai_assistant_service._safe_result(raw)
        self.assertEqual(result["rating"], 7)
        self.assertEqual(result["tips"], ["Dodaj metryki do doświadczenia."])
        self.assertEqual(
            result["categories"],
            [{"id": "experience", "label": "Doświadczenie", "score": 2.0, "max": 3.0}],
        )
        self.assertEqual(result["strengths"], ["Mocny profil AML"])
        self.assertEqual(
            result["priorities"],
            [
                {"title": "Dodaj metryki", "description": "Uzupełnij % w bulletach."},
                {"title": "Skróć podsumowanie", "description": ""},
            ],
        )

    def test_safe_result_rewrites_ten_scale_scores_to_percent(self):
        # Dashboard shows rating×10 as %; prose must not keep "8/10" next to "80%".
        raw = {
            "message": "Oceniam to CV na 8/10. Mocny profil AML.",
            "rating": 8,
            "tips": ["Podnieś wynik z 7 / 10 po dodaniu metryk."],
            "strengths": ["Ocena blisko 10/10 w kompletności"],
            "priorities": [
                {
                    "title": "Język",
                    "description": "To obniża ocenę do 5/10.",
                }
            ],
            "corrections": [],
            "web_sources": [],
        }
        result = ai_assistant_service._safe_result(raw)
        self.assertEqual(result["message"], "Oceniam to CV na 80%. Mocny profil AML.")
        self.assertEqual(result["tips"], ["Podnieś wynik z 70% po dodaniu metryk."])
        self.assertEqual(result["strengths"], ["Ocena blisko 100% w kompletności"])
        self.assertEqual(
            result["priorities"],
            [{"title": "Język", "description": "To obniża ocenę do 50%."}],
        )


class EmploymentTenseAnnotationTests(unittest.TestCase):
    def test_annotate_marks_present_and_past_roles_from_period_lines(self):
        elements = [
            {
                "element_id": "cur_period",
                "category": "text",
                "content": "08/2023 – Obecnie",
                "page": 1,
                "top": 20,
                "left": 0,
            },
            {
                "element_id": "cur_bullets",
                "category": "textarea",
                "content": "Tworzyłem profile KYC.",
                "page": 1,
                "top": 40,
                "left": 0,
            },
            {
                "element_id": "past_period",
                "category": "text",
                "content": "01/2023 – 05/2023",
                "page": 1,
                "top": 120,
                "left": 0,
            },
            {
                "element_id": "past_bullets",
                "category": "textarea",
                "content": "Weryfikowałem zamówienia.",
                "page": 1,
                "top": 140,
                "left": 0,
            },
            {
                "element_id": "edu_header",
                "category": "text",
                "content": "EDUKACJA I KOMPETENCJE",
                "page": 1,
                "top": 220,
                "left": 0,
            },
            {
                "element_id": "edu_body",
                "category": "textarea",
                "content": "Studia ekonomiczne.",
                "page": 1,
                "top": 240,
                "left": 0,
            },
        ]

        tense_map = ai_assistant_service._annotate_employment_tense(elements)
        self.assertEqual(tense_map.get("cur_bullets"), "present")
        self.assertEqual(tense_map.get("past_bullets"), "past")
        self.assertNotIn("edu_body", tense_map)

        structured = {
            item["element_id"]: item
            for item in ai_assistant_service._extract_structured(elements)
        }
        self.assertEqual(structured["cur_bullets"]["employment_tense"], "present")
        self.assertEqual(structured["past_bullets"]["employment_tense"], "past")

    def test_language_prompt_forbids_rewriting_past_roles_to_present(self):
        elements = [
            {
                "element_id": "past_period",
                "category": "text",
                "content": "07/2022 – 12/2022",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "past_bullets",
                "category": "textarea",
                "content": "Prowadziłem procesy CDD.",
                "page": 1,
                "top": 30,
                "left": 0,
            },
        ]
        captured = {}

        def fake_gpt_result(system, user, **kwargs):
            captured["system"] = system
            captured["user"] = user
            return {
                "message": "ok",
                "rating": None,
                "tips": [],
                "corrections": [],
                "web_sources": [],
            }

        with patch.object(ai_assistant_service, "_gpt_result", side_effect=fake_gpt_result):
            ai_assistant_service._check_style(
                ai_assistant_service._extract_text(elements),
                elements,
            )

        self.assertIn("employment_tense", captured["user"])
        self.assertIn('"employment_tense": "past"', captured["user"])
        self.assertIn("NIGDY nie zamieniaj czasu przeszłego", captured["user"])
        self.assertIn("Obecnie", captured["system"])


class LanguageConsistencyTests(unittest.TestCase):
    def _mixed_pl_headers_en_body(self):
        return [
            {
                "element_id": "h1",
                "category": "text",
                "content": "PODSUMOWANIE ZAWODOWE",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "bio",
                "category": "textarea",
                "content": (
                    "In 2023 I graduated with a bachelor degree in bioinformatics "
                    "and started working with research data and AI models."
                ),
                "page": 1,
                "top": 30,
                "left": 0,
            },
            {
                "element_id": "h2",
                "category": "text",
                "content": "DOŚWIADCZENIE ZAWODOWE",
                "page": 1,
                "top": 80,
                "left": 0,
            },
            {
                "element_id": "meta",
                "category": "text",
                "content": "CURRENTLY",
                "page": 1,
                "top": 100,
                "left": 0,
            },
            {
                "element_id": "job",
                "category": "textarea",
                "content": (
                    "Building AI models for NGS analysis with galaxy and research tools "
                    "for the university project team."
                ),
                "page": 1,
                "top": 120,
                "left": 0,
            },
            {
                "element_id": "h3",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "page": 1,
                "top": 180,
                "left": 0,
            },
            {
                "element_id": "edu",
                "category": "textarea",
                "content": (
                    "Master degree in bioinformatics from the university with research "
                    "experience and data analysis coursework."
                ),
                "page": 1,
                "top": 200,
                "left": 0,
            },
        ]

    def test_detect_language_mix_flags_polish_headers_with_english_body(self):
        mix = ai_assistant_service._detect_language_mix(self._mixed_pl_headers_en_body())
        self.assertIsNotNone(mix)
        self.assertEqual(mix["headers_lang"], "pl")
        self.assertEqual(mix["body_lang"], "en")
        self.assertIn("po polsku", mix["fact"])
        self.assertIn("angielsku", mix["fact"])

    def test_detect_language_mix_ignores_consistent_polish_cv(self):
        elements = [
            {
                "element_id": "h1",
                "category": "text",
                "content": "PODSUMOWANIE ZAWODOWE",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "bio",
                "category": "textarea",
                "content": (
                    "Ukończyłem studia magisterskie z bioinformatyki i prowadzę analizy "
                    "danych NGS oraz projekty badawcze dla zespołu naukowego."
                ),
                "page": 1,
                "top": 30,
                "left": 0,
            },
            {
                "element_id": "h2",
                "category": "text",
                "content": "DOŚWIADCZENIE ZAWODOWE",
                "page": 1,
                "top": 80,
                "left": 0,
            },
            {
                "element_id": "job",
                "category": "textarea",
                "content": (
                    "Prowadzę modele AI do analizy danych NGS i usprawniam przygotowanie "
                    "wyników badawczych dla zespołu."
                ),
                "page": 1,
                "top": 100,
                "left": 0,
            },
        ]
        self.assertIsNone(ai_assistant_service._detect_language_mix(elements))

    def test_detect_language_mix_ignores_english_role_titles_in_polish_cv(self):
        elements = [
            {
                "element_id": "h1",
                "category": "text",
                "content": "DOŚWIADCZENIE ZAWODOWE",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "role-1",
                "category": "text",
                "content": "Senior Software Engineer",
                "page": 1,
                "top": 30,
                "left": 0,
            },
            {
                "element_id": "body-1",
                "category": "textarea",
                "content": (
                    "Projektowałem oraz rozwijałem platformę danych dla międzynarodowego "
                    "zespołu i skróciłem czas wdrożenia o 30 procent."
                ),
                "page": 1,
                "top": 50,
                "left": 0,
            },
            {
                "element_id": "role-2",
                "category": "text",
                "content": "Customer Service Specialist with German",
                "page": 1,
                "top": 90,
                "left": 0,
            },
            {
                "element_id": "body-2",
                "category": "textarea",
                "content": (
                    "Prowadziłem obsługę klientów oraz usprawniłem analizę zgłoszeń "
                    "w firmie działającej na kilku rynkach."
                ),
                "page": 1,
                "top": 110,
                "left": 0,
            },
        ]

        self.assertTrue(ai_assistant_service._is_international_role_title("Web Developer"))
        self.assertTrue(ai_assistant_service._is_international_role_title("Data Analyst"))
        self.assertIsNone(ai_assistant_service._detect_language_mix(elements))

    def test_rate_cv_prompt_exempts_international_role_titles_from_language_score(self):
        elements = [
            {
                "element_id": "h1",
                "category": "text",
                "content": "DOŚWIADCZENIE ZAWODOWE",
                "page": 1,
                "top": 10,
                "left": 0,
            },
            {
                "element_id": "role",
                "category": "text",
                "content": "Web Developer",
                "page": 1,
                "top": 30,
                "left": 0,
            },
            {
                "element_id": "body",
                "category": "textarea",
                "content": (
                    "Tworzyłem aplikacje internetowe oraz prowadziłem projekt dla "
                    "międzynarodowego zespołu w firmie technologicznej."
                ),
                "page": 1,
                "top": 50,
                "left": 0,
            },
        ]
        captured = {}

        def fake_gpt_result(system, user, **kwargs):
            captured["system"] = system
            captured["user"] = user
            return {
                "message": "Angielska nazwa roli jest poprawnym terminem branżowym.",
                "rating": 8,
                "tips": [],
                "categories": [
                    {"id": "language", "label": "Język", "score": 2, "max": 2},
                ],
                "strengths": [],
                "priorities": [],
                "corrections": [],
                "web_sources": [],
            }

        with patch.object(ai_assistant_service, "_gpt_result", side_effect=fake_gpt_result):
            result = ai_assistant_service._rate_cv(
                ai_assistant_service._extract_text(elements),
                elements,
            )

        self.assertIn("nie wolno za nie odejmować punktów", captured["system"])
        self.assertIn("Web Developer, Data Analyst", captured["user"])
        self.assertNotIn("FAKT Z WARSTWY DETERMINISTYCZNEJ", captured["user"])
        language = next(c for c in result["categories"] if c["id"] == "language")
        self.assertEqual(language["score"], 2)

    def test_rate_cv_injects_language_mix_priority_when_model_only_mentions_typos(self):
        elements = self._mixed_pl_headers_en_body()
        captured = {}

        def fake_gpt_result(system, user, **kwargs):
            captured["system"] = system
            captured["user"] = user
            return {
                "message": (
                    "Największy problem to język i forma — w podsumowaniu oraz w sekcji "
                    "edukacji jest sporo literówek i nienaturalnych sformułowań."
                ),
                "rating": 6,
                "tips": ["Popraw literówki w podsumowaniu."],
                "categories": [
                    {"id": "completeness", "label": "Kompletność", "score": 2, "max": 2},
                    {"id": "experience", "label": "Doświadczenie", "score": 1, "max": 3},
                    {"id": "language", "label": "Język", "score": 0, "max": 2},
                    {"id": "structure", "label": "Struktura", "score": 2, "max": 2},
                    {"id": "standout", "label": "Wyróżnienie", "score": 1, "max": 1},
                ],
                "strengths": ["Techniczny profil bioinformatyczny"],
                "priorities": [
                    {
                        "title": "Opisz efekty, nie zadania",
                        "description": "Zamień ogólne punkty na rezultaty.",
                    }
                ],
                "corrections": [],
                "web_sources": [],
            }

        with patch.object(ai_assistant_service, "_gpt_result", side_effect=fake_gpt_result):
            result = ai_assistant_service._rate_cv(
                ai_assistant_service._extract_text(elements),
                elements,
            )

        self.assertIn("SPÓJNOŚĆ JĘZYKOWĄ", captured["user"])
        self.assertIn("FAKT Z WARSTWY DETERMINISTYCZNEJ", captured["user"])
        self.assertIn("spójność językowa", captured["system"].lower())
        self.assertIn("spójności językowej", result["message"])
        self.assertEqual(result["priorities"][0]["title"], "Ujednolicić język CV")
        self.assertIn("Przetłumacz CV", result["priorities"][0]["description"])
        language = next(c for c in result["categories"] if c["id"] == "language")
        self.assertEqual(language["score"], 0.0)
        self.assertEqual(result["rating"], 6)


class TranslateActionTests(unittest.TestCase):
    def test_translate_dispatches_with_target_language(self):
        elements = [
            {
                "element_id": "bio",
                "category": "textarea",
                "content": "Doświadczony analityk AML.",
            }
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("angielski", user)
            self.assertIn("bio", user)
            return {
                "message": "Przetłumaczono 1 element.",
                "rating": None,
                "tips": ["Sprawdź nazwy własne."],
                "corrections": [
                    {"element_id": "bio", "content": "Experienced AML analyst."},
                ],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="translate",
                elements=elements,
                target_language="en",
            )

        self.assertEqual(
            result["corrections"],
            [{"element_id": "bio", "content": "Experienced AML analyst."}],
        )
        self.assertIn("Przetłumaczono", result["message"])

    def test_shorten_dispatches_and_returns_content_corrections(self):
        elements = [
            {
                "element_id": "sum",
                "category": "textarea",
                "content": (
                    "Bardzo długie podsumowanie zawodowe z wieloma powtórzeniami "
                    "i ogólnikami, które można znacząco skrócić bez utraty sensu."
                ),
            }
        ]

        def fake_gpt(system, user, **kwargs):
            # The prompt must lead with shortening intent, not strengthening,
            # and forbid inventing new facts.
            self.assertIn("skrócić", user)
            self.assertIn("NIE wymyślasz", system)
            self.assertIn("NIE WYMYŚLAJ", user)
            return {
                "message": "Skrócono podsumowanie z 5 do 3 wierszy.",
                "rating": None,
                "tips": ["Sprawdź, czy skrócone punkty oddają najważniejsze osiągnięcia."],
                "corrections": [
                    {"element_id": "sum", "content": "Zwięzłe, mocne podsumowanie."},
                ],
            }, {"tokens": 1}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="shorten",
                elements=elements,
            )

        self.assertEqual(
            result["corrections"],
            [{"element_id": "sum", "content": "Zwięzłe, mocne podsumowanie."}],
        )
        self.assertIn("Skrócono", result["message"])


class _FakeQuery:
    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class _FakeDB:
    def query(self, *args, **kwargs):
        return _FakeQuery()


class TranslateRouteValidationTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        app.dependency_overrides[verify_token] = lambda: {"sub": "testuser"}

        def _fake_get_db():
            yield _FakeDB()

        app.dependency_overrides[get_db] = _fake_get_db
        self.client = TestClient(app)
        self._user_patch = patch.object(
            ai_assistant_route,
            "resolve_user_from_payload",
            return_value=SimpleNamespace(id=1, username="testuser"),
        )
        self._entitlement_patch = patch.object(
            ai_assistant_route, "assert_can_use_ai_action", return_value=None
        )
        self._user_patch.start()
        self._entitlement_patch.start()

    def tearDown(self):
        self._user_patch.stop()
        self._entitlement_patch.stop()
        app.dependency_overrides.clear()

    def test_translate_requires_target_language(self):
        response = self.client.post(
            "/ai/assistant",
            json={"action": "translate", "elements": []},
            headers={"Idempotency-Key": "translate-missing-language"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "target_language_required")

    def test_translate_rejects_unknown_language(self):
        response = self.client.post(
            "/ai/assistant",
            json={"action": "translate", "elements": [], "target_language": "xx"},
            headers={"Idempotency-Key": "translate-unknown-language"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "unsupported_target_language")

    def test_removed_appearance_actions_are_rejected(self):
        for action in ("design_rating", "layout"):
            response = self.client.post(
                "/ai/assistant",
                json={"action": action, "elements": []},
                headers={"Idempotency-Key": f"removed-{action}"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"]["code"], "invalid_ai_action")


class SupportedLanguagesTests(unittest.TestCase):
    def test_supported_languages_matches_translate_set(self):
        # One source of truth: detection/correction speak the translate vocabulary.
        assert SUPPORTED_LANGUAGES == frozenset({"pl", "en", "de", "fr", "es", "uk", "it", "nl"})
        assert SUPPORTED_LANGUAGES == TRANSLATE_LANGUAGES

    def test_request_accepts_optional_cv_language(self):
        req = AssistantRequest(action="improve", elements=[], cv_language="en")
        assert req.cv_language == "en"

    def test_request_defaults_cv_language_empty(self):
        req = AssistantRequest(action="improve", elements=[])
        assert req.cv_language == ""

    def test_response_carries_cv_language(self):
        resp = AssistantResponse(message="ok", cv_language="de")
        assert resp.cv_language == "de"


if __name__ == "__main__":
    unittest.main()
