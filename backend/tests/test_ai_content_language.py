"""Tests for CV-language-aware content corrections (Tasks 3 + 5, merged).

Covers two things that must land together:
1. The four content-editing handlers (`_fix_grammar`, `_check_style`,
   `_improve_content`, `_shorten_content`) accept a `language_code` and build
   prompts that request correction `content` in that language, while advice
   fields (`message`/`tips`/`priorities`) stay Polish.
2. `analyze_action` resolves the correction language (explicit `cv_language`
   override, else auto-detection via `_detect_cv_language`) and echoes the
   resolved code back in the result as `cv_language`.

No OpenAI calls are made: `ai_assistant_service._gpt` is patched with a fake
that captures the built system+user prompt and returns a canned response,
matching the pattern used in `test_ai_chat_command.py`.
"""

import unittest
from unittest.mock import patch

from app.services import ai_assistant_service as svc


def _text_el(element_id, content, **extra):
    base = {
        "element_id": element_id, "category": "textarea", "content": content,
        "fontSize": 11, "color": "#2B2B2B",
        "left": 40, "top": 100, "width": 400, "height": 60, "page": 1,
    }
    base.update(extra)
    return base


_EN_CV = [
    _text_el("h1", "EXPERIENCE", fontSize=14),
    _text_el("b1", "Developed and managed the analytics platform and delivered "
                   "measurable reporting improvements for the whole team."),
]


class ContentActionLanguageTests(unittest.TestCase):
    def _capture_prompt(self, action, **kwargs):
        """Run one content action with _gpt patched; return the built user+system prompt."""
        captured = {}

        def fake_gpt(system, user, **_kw):
            captured["system"] = system
            captured["user"] = user
            return {"message": "ok", "corrections": []}, {}

        with patch.object(svc, "_gpt", side_effect=fake_gpt):
            svc.analyze_action(action=action, elements=_EN_CV, **kwargs)
        return captured

    def test_improve_english_cv_asks_for_english_content(self):
        captured = self._capture_prompt("improve")
        blob = captured["system"] + captured["user"]
        self.assertIn("angielski", blob)
        # Advice stays Polish.
        self.assertIn("po polsku", blob)
        # No Polish verb samples leak into a non-Polish rewrite.
        self.assertNotIn("Tworzyłem", blob)

    def test_grammar_english_cv_asks_for_english_content(self):
        captured = self._capture_prompt("grammar")
        self.assertIn("angielski", captured["system"] + captured["user"])

    def test_shorten_english_cv_asks_for_english_content(self):
        captured = self._capture_prompt("shorten")
        self.assertIn("angielski", captured["system"] + captured["user"])

    def test_style_english_cv_asks_for_english_content(self):
        captured = self._capture_prompt("language")
        self.assertIn("angielski", captured["system"] + captured["user"])

    def test_polish_cv_still_requests_polish(self):
        pl_cv = [
            _text_el("h1", "DOŚWIADCZENIE", fontSize=14),
            _text_el("b1", "Prowadziłem zespół oraz odpowiadałem za rozwój "
                           "platformy analitycznej i realizację projektów w firmie."),
        ]
        captured = {}

        def fake_gpt(system, user, **_kw):
            captured["blob"] = system + user
            return {"message": "ok", "corrections": []}, {}

        with patch.object(svc, "_gpt", side_effect=fake_gpt):
            svc.analyze_action(action="improve", elements=pl_cv)
        self.assertIn("po polsku", captured["blob"])


class AnalyzeActionLanguageWiringTests(unittest.TestCase):
    def test_detected_language_is_returned_in_result(self):
        with patch.object(svc, "_gpt", return_value=({"message": "ok", "corrections": []}, {})):
            result = svc.analyze_action(action="improve", elements=_EN_CV)
        self.assertEqual(result["cv_language"], "en")

    def test_explicit_override_beats_detection(self):
        captured = {}

        def fake_gpt(system, user, **_kw):
            captured["blob"] = system + user
            return {"message": "ok", "corrections": []}, {}

        # English CV, but user forces German.
        with patch.object(svc, "_gpt", side_effect=fake_gpt):
            result = svc.analyze_action(action="improve", elements=_EN_CV, cv_language="de")
        self.assertEqual(result["cv_language"], "de")
        self.assertIn("niemiecki", captured["blob"])

    def test_rating_action_does_not_get_cv_language_field_requirement(self):
        # Rating advice stays Polish; wiring must not crash for non-content actions.
        with patch.object(svc, "_gpt", return_value=({"message": "ok", "rating": 7,
                                                       "corrections": [], "categories": []}, {})):
            result = svc.analyze_action(action="rating", elements=_EN_CV)
        self.assertIn("cv_language", result)


if __name__ == "__main__":
    unittest.main()
