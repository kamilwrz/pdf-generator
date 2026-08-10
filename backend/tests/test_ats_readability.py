"""Unit tests for deterministic ATS PDF readability scoring."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.services.ats_readability import (
    AtsReadabilityError,
    analyze_pdf_readability,
    is_decorative_element,
    merge_ats_categories,
    percent_to_rating,
    score_contact,
    score_length,
    score_section_order,
    score_text_extract,
    weighted_overall_percent,
)
from app.utils.image_src_to_path import image_src_to_local_path


def _text(content, *, top=40, left=40, page=1, **extra):
    base = {
        "element_id": extra.pop("element_id", f"el-{top}-{left}"),
        "category": "text",
        "content": content,
        "page": page,
        "left": left,
        "top": top,
        "width": 200,
        "height": 18,
        "fontFamily": "Helvetica",
        "fontSize": 12,
        "color": "#222222",
    }
    base.update(extra)
    return base


class DecorativeFilterTests(unittest.TestCase):
    def test_chrome_and_ordinals_are_decorative(self):
        self.assertTrue(is_decorative_element(_text("01", isDecorativeChromeText=True)))
        self.assertTrue(is_decorative_element(_text("Doświadczenie", flowRole="section-chrome")))
        self.assertTrue(is_decorative_element(_text("footer", fixedToPage=True)))
        self.assertTrue(is_decorative_element({"category": "line", "width": 100, "height": 1}))
        self.assertTrue(is_decorative_element(_text("02")))
        self.assertFalse(is_decorative_element(_text("Doświadczenie zawodowe")))


class ScoringHelpersTests(unittest.TestCase):
    def test_text_extract_finds_expected_snippets(self):
        pdf = "Kamil Test\nAML Analyst\nDoświadczenie zawodowe\nPwC"
        snippets = ["kamil test", "aml analyst", "doświadczenie zawodowe", "pwc"]
        score = score_text_extract(pdf, snippets)
        self.assertGreaterEqual(score, 90)

    def test_contact_and_length_heuristics(self):
        text = "Anna Nowak\nanna@email.com\n+48 600 000 000\nlinkedin.com/in/anna\nWarszawa\n" + ("słowo " * 320)
        self.assertEqual(score_contact(text), 100.0)
        self.assertEqual(score_length(text), 100.0)

    def test_section_order_rewards_canvas_order(self):
        pdf = "podsumowanie zawodowe aaa doświadczenie zawodowe bbb wykształcenie ccc"
        snippets = ["podsumowanie zawodowe", "doświadczenie zawodowe", "wykształcenie"]
        self.assertGreaterEqual(score_section_order(pdf, snippets), 95)

    def test_weighted_overall_matches_category_blend(self):
        categories = [
            {"id": "text_extract", "label": "Odczyt", "score": 100, "max": 100},
            {"id": "headers", "label": "Nagłówki", "score": 75, "max": 100},
            {"id": "contact", "label": "Kontakt", "score": 100, "max": 100},
            {"id": "section_order", "label": "Kolejność", "score": 100, "max": 100},
            {"id": "keywords", "label": "Słowa", "score": 100, "max": 100},
            {"id": "length", "label": "Długość", "score": 75, "max": 100},
        ]
        # 0.25*100 + 0.20*75 + 0.15*100 + 0.15*100 + 0.15*100 + 0.10*75
        # = 25 + 15 + 15 + 15 + 15 + 7.5 = 92.5
        overall = weighted_overall_percent(categories)
        self.assertAlmostEqual(overall, 92.5, places=1)
        self.assertEqual(percent_to_rating(overall), 9)

    def test_merge_prefers_deterministic_length(self):
        det = [
            {"id": "text_extract", "label": "Odczyt tekstu", "score": 100, "max": 100},
            {"id": "contact", "label": "Dane kontaktowe", "score": 100, "max": 100},
            {"id": "section_order", "label": "Kolejność treści", "score": 90, "max": 100},
            {"id": "length", "label": "Długość", "score": 80, "max": 100},
        ]
        llm = [
            {"id": "headers", "label": "Nagłówki", "score": 2, "max": 2},
            {"id": "keywords", "label": "Słowa kluczowe", "score": 3, "max": 3},
            {"id": "length", "label": "Długość", "score": 10, "max": 100},
        ]
        merged = merge_ats_categories(det, llm)
        by_id = {c["id"]: c for c in merged}
        self.assertEqual(by_id["length"]["score"], 80.0)
        self.assertEqual(by_id["headers"]["score"], 100.0)
        self.assertEqual(by_id["keywords"]["score"], 100.0)


class PdfPipelineTests(unittest.TestCase):
    def test_simple_cv_extracts_and_scores_high(self):
        elements = [
            _text("Anna Kowalska", top=40, fontSize=18, element_id="name"),
            _text("AML Analyst", top=62, element_id="title"),
            _text("anna@email.com · +48 600 000 000 · Warszawa", top=84, element_id="contact"),
            _text("Podsumowanie zawodowe", top=120, element_id="h-sum", bold=True),
            _text("Analityczka z doświadczeniem w AML i compliance.", top=142, element_id="sum"),
            _text("Doświadczenie zawodowe", top=180, element_id="h-exp", bold=True),
            _text("Senior AML Analyst — PwC — 2021–Obecnie", top=202, element_id="exp"),
            _text("Wykształcenie", top=240, element_id="h-edu", bold=True),
            _text("Mgr Finanse — SGH — 2016", top=262, element_id="edu"),
        ]
        # Decorative chrome that must not tank extractability.
        elements.extend([
            _text("01", top=178, left=20, isDecorativeChromeText=True, element_id="ord"),
            {
                "element_id": "rule",
                "category": "line",
                "left": 40,
                "top": 198,
                "width": 200,
                "height": 1,
                "page": 1,
                "backgroundColor": "#486151",
            },
        ])

        result = analyze_pdf_readability(elements, {"width": 595, "height": 842}, image_src_to_local_path)
        self.assertIn("anna@email.com", result["pdf_text"].lower())
        by_id = {c["id"]: c for c in result["categories"]}
        self.assertGreaterEqual(by_id["text_extract"]["score"], 80)
        self.assertGreaterEqual(by_id["contact"]["score"], 70)
        self.assertGreaterEqual(by_id["section_order"]["score"], 70)

    def test_render_failure_raises_ats_error(self):
        with patch(
            "app.services.ats_readability.build_pdf_to_buffer",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertRaises(AtsReadabilityError) as ctx:
                analyze_pdf_readability(
                    [_text("Hello")],
                    {"width": 595, "height": 842},
                    image_src_to_local_path,
                )
        self.assertIn("PDF", ctx.exception.user_message)


class AnalyzeActionAtsWiringTests(unittest.TestCase):
    def test_ats_score_failure_becomes_ai_service_error_without_charge_path(self):
        from app.services.ai_assistant_service import AIServiceError, analyze_action

        with patch(
            "app.services.ai_assistant_service.analyze_pdf_readability",
            side_effect=AtsReadabilityError("fail", user_message="Nie udało się wygenerować PDF."),
        ):
            with self.assertRaises(AIServiceError) as ctx:
                analyze_action("ats_score", [_text("Hello")], page_size={"width": 595, "height": 842})
        self.assertEqual(ctx.exception.user_message, "Nie udało się wygenerować PDF.")
        self.assertEqual(ctx.exception.action, "ats_score")


if __name__ == "__main__":
    unittest.main()
