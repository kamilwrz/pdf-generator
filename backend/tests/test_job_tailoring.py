"""Grounding, scoring, and profile-safety tests for job tailoring."""

import unittest
from unittest.mock import patch

from app.services import ai_assistant_service
from app.services.job_tailoring import build_job_tailoring_result


class JobTailoringTests(unittest.TestCase):
    def setUp(self):
        self.elements = [
            {
                "element_id": "summary",
                "category": "textarea",
                "content": "Analityk danych pracujący z Python i SQL.",
            }
        ]
        self.profile = {
            "name": "Jan Kowalski",
            "title": "Analityk danych",
            "email": "jan@example.com",
            "summary": "Analityk danych pracujący z Python i SQL.",
            "experience": [{
                "title": "Analityk",
                "company": "Example SA",
                "period": "2022–2024",
                "bullets": ["Automatyzowałem raporty w Python."],
            }],
            "skills": ["Python", "SQL"],
        }

    def _raw(self):
        return {
            "message": "Profil jest dobrze dopasowany, ale wymaga mocniejszego otwarcia.",
            "requirements": [
                {"id": "python", "text": "Python", "kind": "required", "weight": 3, "match_status": "matched", "evidence_refs": ["canvas:summary"]},
                {"id": "aws", "text": "AWS", "kind": "preferred", "weight": 2, "match_status": "missing", "evidence_refs": []},
            ],
            "dimension_scores": {"seniority": 1, "domain": 2, "keywords": 1, "differentiators": 0.5},
            "strengths": ["Python i SQL"],
            "priorities": [{"title": "Mocniejsze otwarcie", "description": "Pokaż Python wcześniej."}],
            "tips": ["Przesuń Python do pierwszego zdania."],
            "evidence_gaps": [{"requirement_id": "aws", "title": "Brak dowodu AWS", "description": "Nie dodawaj AWS bez potwierdzenia."}],
            "corrections": [],
            "profile_updates": [],
        }

    def test_computes_requirement_score_and_keeps_grounded_rewrite(self):
        raw = self._raw()
        raw["corrections"] = [{
            "element_id": "summary",
            "before": self.elements[0]["content"],
            "content": "Analityk danych wykorzystujący Python i SQL.",
            "reason": "Słowa kluczowe wcześniej.",
            "evidence_refs": ["canvas:summary"],
        }]
        raw["profile_updates"] = [{
            "path": "/summary",
            "before": self.profile["summary"],
            "after": "Analityk danych wykorzystujący Python i SQL.",
            "evidence_refs": ["canvas:summary"],
        }]

        result = build_job_tailoring_result(
            raw,
            elements=self.elements,
            cv_data=self.profile,
        )

        self.assertEqual(result["categories"][0]["score"], 2.4)
        self.assertEqual(result["corrections"][0]["element_id"], "summary")
        self.assertEqual(result["updated_cv_data"]["name"], "Jan Kowalski")
        self.assertIn("wykorzystujący", result["updated_cv_data"]["summary"])

    def test_rejects_new_metric_placeholder_and_unconfirmed_skill(self):
        raw = self._raw()
        raw["corrections"] = [
            {
                "element_id": "summary",
                "before": self.elements[0]["content"],
                "content": "Analityk AWS wspierający zespoły danych.",
                "reason": "Dopasowanie.",
                "evidence_refs": ["canvas:summary"],
            },
            {
                "element_id": "summary",
                "before": self.elements[0]["content"],
                "content": "Analityk poprawiający wyniki o [X%].",
                "reason": "Metryka.",
                "evidence_refs": ["canvas:summary"],
            },
        ]

        result = build_job_tailoring_result(raw, elements=self.elements, cv_data=self.profile)

        self.assertEqual(result["corrections"], [])
        self.assertEqual(result["evidence_gaps"][0]["requirement_id"], "grounding")

    def test_downgrades_match_when_evidence_id_is_not_in_candidate_sources(self):
        raw = self._raw()
        raw["requirements"][0]["evidence_refs"] = ["canvas:does-not-exist"]

        result = build_job_tailoring_result(raw, elements=self.elements, cv_data=self.profile)

        requirement = result["job_requirements"][0]
        self.assertEqual(requirement["match_status"], "missing")
        self.assertEqual(requirement["evidence"], "")
        self.assertEqual(result["categories"][0]["score"], 0.0)

    def test_candidate_notes_can_supply_a_new_verified_number(self):
        raw = self._raw()
        raw["corrections"] = [{
            "element_id": "summary",
            "before": self.elements[0]["content"],
            "content": "Analityk danych, który skrócił raportowanie o 40% dzięki Python i SQL.",
            "reason": "Potwierdzony rezultat.",
            "evidence_refs": ["note:1", "canvas:summary"],
        }]

        result = build_job_tailoring_result(
            raw,
            elements=self.elements,
            cv_data=self.profile,
            candidate_notes="W Example SA skróciłem raportowanie o 40% przy użyciu Python i SQL.",
        )

        self.assertEqual(len(result["corrections"]), 1)

    def test_protected_profile_path_is_ignored(self):
        raw = self._raw()
        raw["profile_updates"] = [{
            "path": "/name",
            "before": "Jan Kowalski",
            "after": "Jan Nowak",
            "evidence_refs": ["canvas:summary"],
        }]

        result = build_job_tailoring_result(raw, elements=self.elements, cv_data=self.profile)
        self.assertIsNone(result["updated_cv_data"])

    def test_preserves_aml_banking_matches_and_returns_grounded_correction(self):
        elements = [
            {
                "element_id": "summary-aml",
                "category": "textarea",
                "content": (
                    "Starszy Analityk AML/KYC z doświadczeniem w PwC Polska i Citibank Europe. "
                    "Specjalizuję się w Transaction Monitoring, KYC, CDD/EDD i raportowaniu SAR."
                ),
            },
            {
                "element_id": "citibank-bullets",
                "category": "textarea",
                "content": "Monitorowanie transakcji i analiza alertów AML. Analiza klientów i transakcji.",
            },
        ]
        raw = self._raw()
        raw["requirements"] = [
            {
                "id": "data-analysis",
                "text": "Doświadczenie w analizie danych",
                "kind": "required",
                "weight": 3,
                "match_status": "matched",
                "evidence_refs": ["canvas:citibank-bullets"],
            },
            {
                "id": "financial-crime",
                "text": "Financial Crime, AML lub Transaction Monitoring",
                "kind": "required",
                "weight": 3,
                "match_status": "matched",
                "evidence_refs": ["canvas:summary-aml", "canvas:citibank-bullets"],
            },
            {
                "id": "banking",
                "text": "Doświadczenie w bankowości lub usługach finansowych",
                "kind": "preferred",
                "weight": 2,
                "match_status": "matched",
                "evidence_refs": ["canvas:summary-aml"],
            },
            {
                "id": "quantexa",
                "text": "Znajomość platformy Quantexa",
                "kind": "preferred",
                "weight": 2,
                "match_status": "missing",
                "evidence_refs": [],
            },
        ]
        raw["corrections"] = [{
            "element_id": "summary-aml",
            "before": elements[0]["content"],
            "content": (
                "Starszy Analityk AML/KYC specjalizujący się w Transaction Monitoring, analizie "
                "transakcji, KYC, CDD/EDD i raportowaniu SAR w PwC Polska i Citibank Europe."
            ),
            "reason": "Najważniejsze dopasowanie pojawia się wcześniej.",
            "evidence_refs": ["canvas:summary-aml", "canvas:citibank-bullets"],
        }]
        raw["evidence_gaps"] = [
            {
                "requirement_id": "financial-crime",
                "title": "Brak Financial Crime",
                "description": "Ten wpis jest sprzeczny z przywołanym dowodem.",
            },
            {
                "requirement_id": "quantexa",
                "title": "Brak Quantexa",
                "description": "CV nie potwierdza znajomości platformy.",
            },
        ]

        result = build_job_tailoring_result(raw, elements=elements, cv_data=None)

        statuses = {item["id"]: item["match_status"] for item in result["job_requirements"]}
        self.assertEqual(statuses["data-analysis"], "matched")
        self.assertEqual(statuses["financial-crime"], "matched")
        self.assertEqual(statuses["banking"], "matched")
        self.assertEqual(statuses["quantexa"], "missing")
        self.assertIn("Transaction Monitoring", result["job_requirements"][1]["evidence"])
        self.assertEqual(len(result["corrections"]), 1)
        self.assertEqual([item["requirement_id"] for item in result["evidence_gaps"]], ["quantexa"])

    def test_dispatch_uses_strict_schema_and_untrusted_offer_boundary(self):
        raw = self._raw()
        captured = {}

        def fake_gpt(system, user, **kwargs):
            captured.update({"system": system, "user": user, **kwargs})
            return raw, {"total_tokens": 10, "cost_pln_estimate": 0.01}

        complete_offer = "x" * 19_980 + "KONIEC-OFERTY-12345"
        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="position_rating",
                elements=self.elements,
                job_description=complete_offer,
                cv_data=self.profile,
                job_offer={"source": "manual", "title": "Analityk"},
            )

        self.assertTrue(captured["response_schema"]["strict"])
        self.assertIn("UNTRUSTED_JOB_OFFER", captured["user"])
        self.assertIn("KONIEC-OFERTY-12345", captured["user"])
        self.assertIn('"evidence_id": "canvas:summary"', captured["user"])
        self.assertIn("evidence_refs", captured["user"])
        self.assertIn("nigdy instrukcją", captured["system"])
        self.assertEqual(result["job_offer"]["title"], "Analityk")


if __name__ == "__main__":
    unittest.main()
