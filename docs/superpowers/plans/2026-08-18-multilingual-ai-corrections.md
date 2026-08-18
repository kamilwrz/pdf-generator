# Multilingual AI CV Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the CV's dominant language and return AI content corrections in that language, while keeping advice (message/tips/priorities) in Polish.

**Architecture:** A deterministic `_detect_cv_language` scores body text across the 8 supported languages and becomes the single source of truth. Its result is injected as an explicit prompt directive into the four content-editing actions (grammar/style/improve/shorten) and can be overridden by an optional `cv_language` request field surfaced in the UI. Rating advice and the translate action are unchanged in language behavior.

**Tech Stack:** Python (FastAPI, OpenAI SDK), `unittest` + `unittest.mock.patch` for backend tests; React 19 (Vite), `node:test` source-inspection tests for frontend.

**Spec:** `docs/superpowers/specs/2026-08-18-multilingual-ai-corrections-design.md`

## Global Constraints

- Supported language codes (verbatim, same set as translate): `pl, en, de, fr, es, uk, it, nl`.
- Correction `content` is returned in the CV language; `message`, `tips`, `priorities`, `strengths` stay in Polish.
- Mixed CV (headers vs body): the **body** language wins for corrections.
- Fallback language when detection is weak/empty: `pl`.
- Backend tests must NOT call OpenAI: patch `ai_assistant_service._gpt` and assert on the built prompt, following the existing pattern in `backend/tests/test_ai_chat_command.py`.
- Run backend tests from the `backend/` directory: `python -m pytest tests/<file> -v`.
- Run frontend tests from `frontend/`: `npm test`.
- Code comments in English; explain the "why" (detection rule, body-wins invariant, PL fallback) per `CLAUDE.md`.
- Do not touch positional fields — content actions stay scoped to `_CONTENT_FIELDS`.

---

## File Structure

- `backend/app/services/ai_assistant_service.py` — add detector, prompt-directive helper, tense-rules helper; thread `language_code` into 4 handlers; thread `cv_language` through `analyze_action`; reconcile `_detect_language_mix` target.
- `backend/app/api/routes/ai_assistant.py` — shared `SUPPORTED_LANGUAGES` constant; `cv_language` on request/response; validation.
- `backend/tests/test_ai_language_detection.py` — new: detector + helper unit tests.
- `backend/tests/test_ai_content_language.py` — new: per-action prompt-language tests.
- `backend/tests/test_ai_assistant_schema.py` — extend: `cv_language` request/response validation.
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx` — CV-language selector + thread `cv_language` in `send`.
- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js` — extend: selector + payload assertions.
- `README.md`, `docs/PROMPTS.md` — documentation sync (Phase 5).

---

## Task 1: Language detector core

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py` (add near existing language helpers, after `_header_language_vote` ~line 273)
- Test: `backend/tests/test_ai_language_detection.py` (create)

**Interfaces:**
- Consumes: existing `_extract_structured`, `_is_language_chrome_label`, `_is_employment_period_line`, `_PL_DIACRITIC_RE`.
- Produces:
  - `_SUPPORTED_LANGS: tuple[str, ...]` = `("pl","en","de","fr","es","uk","it","nl")`
  - `_detect_cv_language(elements: list[dict]) -> dict` returning
    `{"code": str, "confidence": float, "body_lang": str, "header_lang": str | None, "is_mixed": bool}`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ai_language_detection.py`:

```python
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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_language_detection.py -v` (from `backend/`)
Expected: FAIL — `AttributeError: module 'app.services.ai_assistant_service' has no attribute '_detect_cv_language'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/app/services/ai_assistant_service.py` after `_header_language_vote` (~line 273). Add `import unicodedata`? Not needed — use a Cyrillic regex.

```python
# Supported CV languages for auto-detection and content corrections. Mirrors the
# translate action's language set so detection, correction, and translation all
# speak the same vocabulary. Order is irrelevant; membership is what matters.
_SUPPORTED_LANGS: tuple[str, ...] = ("pl", "en", "de", "fr", "es", "uk", "it", "nl")

# Cyrillic script is unique among the supported languages to Ukrainian, so its
# mere presence in the body is a strong, cheap signal.
_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")

# High-frequency function/domain words per language. These are deliberately
# distinctive: each list avoids short tokens (w, i, a) that collide across
# languages, so a word-boundary count of body copy reliably picks the dominant
# language without a heavyweight NLP dependency. Extend only with words that do
# not appear in another supported language.
_LANG_STOPWORDS: dict[str, tuple[str, ...]] = {
    "pl": ("oraz", "przez", "doświadczenie", "wykształcenie", "umiejętności",
           "obecnie", "firma", "projekt", "prowadziłem", "odpowiadałem", "realizację"),
    "en": ("the", "and", "with", "experience", "education", "skills",
           "currently", "team", "project", "developed", "managed", "delivered"),
    "de": ("und", "der", "die", "das", "mit", "für", "erfahrung", "ausbildung",
           "kenntnisse", "derzeit", "unternehmen", "entwicklung", "berufserfahrung"),
    "fr": ("et", "les", "des", "avec", "pour", "expérience", "compétences",
           "actuellement", "entreprise", "projet", "développement", "gestion"),
    "es": ("los", "las", "con", "para", "experiencia", "habilidades",
           "actualmente", "empresa", "proyecto", "desarrollo", "gestión"),
    "it": ("con", "per", "esperienza", "competenze", "attualmente", "azienda",
           "progetto", "sviluppo", "gestione", "responsabile", "realizzazione"),
    "nl": ("het", "een", "met", "voor", "ervaring", "opleiding", "vaardigheden",
           "momenteel", "bedrijf", "ontwikkeling", "verantwoordelijk"),
    "uk": ("та", "для", "досвід", "освіта", "навички", "наразі", "компанія",
           "проєкт", "розробка", "відповідальність", "реалізацію"),
}

# Minimum weighted score before we trust a detection over the Polish fallback.
_DETECT_MIN_SCORE = 3


def _score_language_signals(text: str) -> dict[str, int]:
    """Return a per-language weighted score for ``text``.

    Word-boundary stopword hits are the base signal; Cyrillic and Polish
    diacritics add script-level weight because they are unique among the
    supported languages. The scores are comparable across languages, so the
    caller can pick the maximum.
    """
    scores = {code: 0 for code in _SUPPORTED_LANGS}
    if not text or not text.strip():
        return scores
    lower = text.lower()
    for code, words in _LANG_STOPWORDS.items():
        for word in words:
            # Word-boundary match so "and" does not fire inside "band".
            scores[code] += len(re.findall(rf"\b{re.escape(word)}\b", lower))
    # Script-level tie-breakers unique to one supported language.
    scores["uk"] += len(_CYRILLIC_RE.findall(text)) * 3
    scores["pl"] += len(_PL_DIACRITIC_RE.findall(text)) * 2
    return scores


def _dominant_language(text: str) -> tuple[str | None, float]:
    """Pick the highest-scoring language and a 0..1 confidence margin.

    Confidence is the winner's share of the top-two total, so a clear winner
    approaches 1.0 and a tie approaches 0.5. Returns ``(None, 0.0)`` when no
    signal crosses ``_DETECT_MIN_SCORE``.
    """
    scores = _score_language_signals(text)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_code, top_score = ranked[0]
    if top_score < _DETECT_MIN_SCORE:
        return None, 0.0
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    confidence = top_score / (top_score + runner_up) if (top_score + runner_up) else 1.0
    return top_code, confidence


def _detect_cv_language(elements: list[dict]) -> dict:
    """Detect the CV's dominant language from its body copy.

    Business rule: when headers and body disagree (bilingual templates), the
    BODY language wins, because that is the text the content actions rewrite —
    we must never translate the user's own prose against their intent. Section
    headers only inform the ``is_mixed`` flag surfaced to the rating action.

    Falls back to Polish (the product's home market) when the visible text is
    too short to score, so a name-only canvas still behaves predictably.

    @returns ``{"code", "confidence", "body_lang", "header_lang", "is_mixed"}``.
    """
    headers: list[str] = []
    body_chunks: list[str] = []
    for el in elements or []:
        if el.get("category") not in ("text", "textarea"):
            continue
        content = str(el.get("content") or "").replace("\\n", "\n").strip()
        if not content:
            continue
        flat = " ".join(content.split())
        if _is_language_chrome_label(flat):
            headers.append(flat)
            continue
        if _is_employment_period_line(flat):
            continue
        if "@" in flat or flat.startswith("http"):
            continue
        if len(flat) < 18:
            continue
        body_chunks.append(flat)

    body_lang, confidence = _dominant_language(" ".join(body_chunks))
    header_lang, _ = _dominant_language(" ".join(headers))

    code = body_lang or "pl"
    is_mixed = bool(header_lang and body_lang and header_lang != body_lang)
    return {
        "code": code,
        "confidence": confidence,
        "body_lang": body_lang or "pl",
        "header_lang": header_lang,
        "is_mixed": is_mixed,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_language_detection.py -v`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_language_detection.py
git commit -m "feat(ai): deterministic CV language detector (8 languages, body-wins)"
```

---

## Task 2: Language directive + tense-rules helpers

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py` (add after `_detect_cv_language`; `_tense_rules_for` after `_TENSE_RULES_PL` ~line 1324)
- Test: `backend/tests/test_ai_language_detection.py` (extend)

**Interfaces:**
- Consumes: `_TRANSLATE_LANGUAGE_NAMES` (already defined ~line 1530), `_TENSE_RULES_PL` (~line 1315).
- Produces:
  - `_content_language_directive(lang_code: str) -> str`
  - `_tense_rules_for(lang_code: str) -> str`

Note: `_TRANSLATE_LANGUAGE_NAMES` is defined lower in the file than these helpers will live if placed after `_detect_cv_language`. To avoid a forward reference at call time (module-level dicts are evaluated at import), place `_content_language_directive` and `_tense_rules_for` **below** `_TRANSLATE_LANGUAGE_NAMES` and `_TENSE_RULES_PL` (i.e. after ~line 1539), not next to the detector. The detector itself does not reference them.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_ai_language_detection.py`:

```python
class ContentLanguageDirectiveTests(unittest.TestCase):
    def test_directive_names_target_language_for_content(self):
        directive = svc._content_language_directive("en")
        self.assertIn("angielski", directive)
        # Advice fields must stay Polish regardless of CV language.
        self.assertIn("po polsku", directive)

    def test_directive_polish_is_all_polish(self):
        directive = svc._content_language_directive("pl")
        self.assertIn("po polsku", directive)

    def test_directive_unknown_code_falls_back_to_polish(self):
        directive = svc._content_language_directive("zz")
        self.assertIn("po polsku", directive)


class TenseRulesForTests(unittest.TestCase):
    def test_polish_returns_polish_verb_examples(self):
        rules = svc._tense_rules_for("pl")
        self.assertIn("Tworzę", rules)

    def test_non_polish_has_no_polish_verb_examples(self):
        rules = svc._tense_rules_for("en")
        self.assertNotIn("Tworzę", rules)
        self.assertNotIn("Tworzyłem", rules)
        # Still expresses the finished-vs-current rule generically.
        self.assertTrue(rules.strip())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_language_detection.py -v`
Expected: FAIL — `_content_language_directive` / `_tense_rules_for` not defined.

- [ ] **Step 3: Write minimal implementation**

Add below `_TRANSLATE_LANGUAGE_NAMES` (~line 1539) in `ai_assistant_service.py`:

```python
# Language-neutral tense rule for non-Polish CVs. It states the finished-vs-
# current rule WITHOUT Polish verb samples, so the model does not drift the
# rewrite toward Polish while still respecting employment tense.
_TENSE_RULES_NEUTRAL = """\
VERB TENSE FOR ROLES (MANDATORY — a violation is an error):
- Field `employment_tense` on an element: `present` = current role, `past` = ended.
- `present` / end date "Obecnie"/"Present"/"Now": use PRESENT tense.
- `past` / a concrete end date (e.g. 05/2023, 12/2022): use PAST tense.
- NEVER switch an ended role's past tense to present, or a current role's present to past.
- When `employment_tense` is absent: keep the element's original tense and grammatical person.
"""


def _tense_rules_for(lang_code: str) -> str:
    """Pick the tense-rule prompt block for the target correction language.

    Polish keeps its verb-sample rules; every other language gets the neutral
    variant so we never inject Polish verbs into a non-Polish rewrite.
    """
    return _TENSE_RULES_PL if (lang_code or "pl") == "pl" else _TENSE_RULES_NEUTRAL


def _content_language_directive(lang_code: str) -> str:
    """Build the prompt directive fixing the language of each response field.

    Correction `content` must be in the CV language; advice fields (`message`,
    `tips`, `priorities`) stay Polish because the app serves the Polish market
    and users read guidance in Polish. Unknown codes fall back to Polish.
    """
    code = (lang_code or "pl").strip().lower()
    lang_name = _TRANSLATE_LANGUAGE_NAMES.get(code, "polski")
    if code == "pl" or lang_name == "polski":
        return (
            "Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, "
            "zwracaj po polsku."
        )
    return (
        f"Pole `content` w każdej poprawce zwracaj w języku: {lang_name} "
        f"(kod: {code}) — to język CV użytkownika. "
        "Pola `message`, `tips` i `priorities` ZAWSZE zwracaj po polsku."
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_language_detection.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_language_detection.py
git commit -m "feat(ai): language directive + neutral tense-rules helpers"
```

---

## Task 3: Thread language into the four content actions

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py`
  - `_fix_grammar` (~1280), `_check_style` (~1327), `_improve_content` (~1405), `_shorten_content` (~1469)
- Test: `backend/tests/test_ai_content_language.py` (create)

**Interfaces:**
- Consumes: `_content_language_directive`, `_tense_rules_for` (Task 2).
- Produces (new signatures — Task 5 depends on these):
  - `_fix_grammar(elements: list[dict], language_code: str = "pl") -> dict`
  - `_check_style(text: str, elements: list[dict], language_code: str = "pl") -> dict`
  - `_improve_content(elements: list[dict], language_code: str = "pl") -> dict`
  - `_shorten_content(elements: list[dict], language_code: str = "pl") -> dict`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ai_content_language.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_content_language.py -v`
Expected: FAIL — `analyze_action` still calls handlers without `language_code`; prompts contain "po polsku" for English CVs, so `assertIn("angielski", …)` fails. (This also exercises Task 5 dispatch; if Task 5 not yet done, detection is not wired — expect failure either way. Implement Steps 3 here, then Task 5.)

- [ ] **Step 3: Write minimal implementation**

In `_fix_grammar`, change the signature and the system prompt's final sentence:

```python
def _fix_grammar(elements: list[dict], language_code: str = "pl") -> dict:
    """Propose content-only grammar/spelling corrections per text element.

    ``language_code`` fixes the language of the corrected `content` so an
    English or German CV is not silently rewritten into Polish. Advice fields
    remain Polish (see `_content_language_directive`).
    """
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym korektorem specjalizującym się w dokumentach biznesowych i CV. "
        "Poprawiaj WYŁĄCZNIE gramatykę, ortografię i interpunkcję. Nie zmieniaj znaczenia, tonu, "
        "czasu gramatycznego ani osoby. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
```

Leave the rest of `_fix_grammar` unchanged.

In `_check_style`, change signature and inject directive + language-specific tense rules:

```python
def _check_style(text: str, elements: list[dict], language_code: str = "pl") -> dict:
    """Language/style review with content patches where safe.

    ``language_code`` keeps rewrites in the CV language; advice stays Polish.
    """
    structured = _extract_structured(elements)
    language_mix = _detect_language_mix(elements)
    mix_block = _language_mix_prompt_block(language_mix)

    system = (
        "Jesteś profesjonalnym autorem CV specjalizującym się w poprawianiu tonu, jasności "
        "i profesjonalizmu języka w CV. "
        "Najpierw upewnij się, że nagłówki i treść są w jednym języku. "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska: zakończone role = przeszły, "
        "aktualne (Obecnie) = teraźniejszy. Nigdy nie ujednolicaj wszystkich opisów do jednego czasu. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
```

Then replace the `{_TENSE_RULES_PL}` interpolation inside the `user` f-string of `_check_style` with `{_tense_rules_for(language_code)}`.

In `_improve_content`, change signature, system prompt, and tense interpolation:

```python
def _improve_content(elements: list[dict], language_code: str = "pl") -> dict:
    """Suggest stronger CV wording without changing layout geometry.

    ``language_code`` keeps rewrites in the CV language; advice stays Polish.
    """
    structured = _extract_structured(elements)
    full_text = _extract_text(elements)
    language_mix = _detect_language_mix(elements)
    mix_block = _language_mix_prompt_block(language_mix)

    system = (
        "Jesteś wysokiej klasy autorem CV. Specjalizujesz się w przekształcaniu zwykłych opisów obowiązków "
        "w przekonujące, oparte na metrykach punkty, które przechodzą przez ATS i robią wrażenie na rekruterach. "
        "Zachowuj spójność językową z treścią CV (nie zmieniaj języka treści). "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska (`employment_tense` / Obecnie vs data końcowa). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
```

Replace `{_TENSE_RULES_PL}` in the `_improve_content` user f-string with `{_tense_rules_for(language_code)}`. Also soften the Polish-specific verb examples in rule ② so they do not force Polish: change the fixed sample line to reference "language of the CV" generically, e.g. replace the two verb-sample lines with:

```
   Dla `past`: mocny czasownik dokonany w czasie przeszłym; dla `present`: w czasie teraźniejszym.
   (Użyj czasowników w języku CV — nie tłumacz treści na inny język.)
```

In `_shorten_content`, change signature and the final system sentence:

```python
def _shorten_content(elements: list[dict], language_code: str = "pl") -> dict:
    """Content-only cuts so an over-long CV fits on fewer pages.

    ``language_code`` keeps the shortened `content` in the CV language.
    (Docstring body unchanged below.)
    """
    structured = _extract_structured(elements)
    full_text = _extract_text(elements)

    system = (
        "Jesteś redaktorem CV specjalizującym się w zwięzłości. Skracasz zbyt długie CV, "
        "aby zmieściło się na mniejszej liczbie stron, nie tracąc ważnych informacji zawodowych. "
        "NIE wymyślasz nowych danych, liczb ani osiągnięć — wyłącznie skracasz, łączysz lub usuwasz to, co najmniej istotne. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
```

> Note: the JSON skeleton lines like `"<pełny przeredagowany tekst po polsku>"` inside the user prompts are illustrative and harmless, but for cleanliness change the literal "po polsku" in those `content` placeholder strings to "w języku CV" in all four handlers so the skeleton does not contradict the directive.

- [ ] **Step 4: Run test to verify it passes**

This task's tests route through `analyze_action`, which is wired in Task 5. If executing strictly in order, run only the handler-level portion now by calling handlers directly; otherwise implement Task 5 next and run:

Run: `python -m pytest tests/test_ai_content_language.py -v`
Expected: PASS after Task 5. Until then, verify the handler in isolation:

```bash
python -c "from app.services import ai_assistant_service as s; \
import unittest.mock as m; \
cap={}; \
_=[cap.update({'b':sys+usr}) for sys,usr in [('','')]]; \
print('manual check: call _improve_content with language_code=\"en\" and grep prompt')"
```

Prefer to implement Task 5 immediately, then run the Task 3 test file.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_content_language.py
git commit -m "feat(ai): content actions honor CV language for corrections"
```

---

## Task 4: Reconcile `_detect_language_mix` to dominant body language

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py` — `_detect_language_mix` (~292–393)
- Test: `backend/tests/test_ai_language_detection.py` (extend)

**Interfaces:**
- Consumes: `_detect_cv_language` (Task 1). Existing `_detect_language_mix` return shape is preserved (keys `headers_lang`, `body_lang`, `fact`, `fix`, `priority_title`, `priority_description`, `message_sentence`, `tip`).
- Produces: unchanged callers (`_rate_cv`, `_check_style`) keep working; only the `fix`/message wording now points at the detected body language.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_ai_language_detection.py`:

```python
class LanguageMixReconcileTests(unittest.TestCase):
    def test_polish_headers_english_body_suggests_unifying_to_english(self):
        elements = [
            _text_el("h1", "PODSUMOWANIE ZAWODOWE", fontSize=14),
            _text_el("h2", "DOŚWIADCZENIE", fontSize=14),
            _text_el("b1", "Experienced analyst who developed and managed the "
                           "reporting platform and improved delivery for the team."),
            _text_el("b2", "Built machine learning models and delivered research "
                           "for the whole engineering organisation."),
        ]
        mix = svc._detect_language_mix(elements)
        self.assertIsNotNone(mix)
        # Body wins: the fix must not push the user's English prose into Polish.
        self.assertNotIn("na polski", mix["fix"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_language_detection.py::LanguageMixReconcileTests -v`
Expected: FAIL — current `_detect_language_mix` emits "przetłumacz treść na polski" for PL-headers/EN-body.

- [ ] **Step 3: Write minimal implementation**

In `_detect_language_mix`, the `headers_lang == "pl" and body_lang == "en"` branch currently recommends translating the body to Polish. Flip the recommendation so the **body** language is the unify target. Replace that branch's `fact`/`fix` with body-oriented copy:

```python
    if headers_lang == "pl" and body_lang == "en":
        fact = (
            f"Nagłówki sekcji są po polsku ({examples}), a treść podsumowania/"
            "doświadczenia/wykształcenia jest po angielsku."
        )
        # Body wins: unify toward the language the user actually wrote their
        # content in, or translate headers up to it — never rewrite the user's
        # prose into Polish behind their back.
        fix = (
            "Ujednolić język całego CV do języka treści (angielski): zamień "
            "nagłówki na angielskie (Summary / Experience / Education) albo "
            "świadomie użyj akcji „Przetłumacz CV”, jeśli chcesz wersję polską."
        )
    else:
```

Leave the `else` (EN headers / PL body) branch as is — there the body is Polish, which is already the market default. No behavioral regression for that direction.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_language_detection.py -v`
Expected: PASS (all classes)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_language_detection.py
git commit -m "feat(ai): language-mix fix targets the dominant body language"
```

---

## Task 5: Wire detection + override through `analyze_action`

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py` — `analyze_action` (~2127–2194)
- Test: `backend/tests/test_ai_content_language.py` (extend)

**Interfaces:**
- Consumes: `_detect_cv_language` (Task 1); new handler signatures (Task 3).
- Produces: `analyze_action(..., cv_language: str = "")`; result dict gains `"cv_language": str`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_ai_content_language.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_content_language.py -v`
Expected: FAIL — `analyze_action` has no `cv_language` param / result lacks the key.

- [ ] **Step 3: Write minimal implementation**

Edit `analyze_action`:

```python
def analyze_action(
    action: str,
    elements: list[dict],
    message: str = "",
    job_description: str = "",
    page_size: dict | None = None,
    history: list | None = None,
    template_id: str | None = None,
    target_language: str = "",
    cv_language: str = "",
    db=None,
) -> dict:
    """Dispatch one assistant action and return a UI-ready dict.

    ``cv_language`` optionally overrides auto-detection for the content-editing
    actions (grammar/language/improve/shorten). When empty, the CV language is
    detected from the canvas so corrections come back in the CV's language while
    advice stays Polish. The resolved code is echoed back as ``cv_language`` so
    the UI selector can reflect what was actually used.
    """
    text = _extract_text(elements)
    ats_resolver = make_image_resolver(db) if db is not None else image_src_to_local_path

    # Resolve the correction language once: explicit override wins, else detect.
    override = (cv_language or "").strip().lower()
    if override in _SUPPORTED_LANGS:
        resolved_language = override
    else:
        resolved_language = _detect_cv_language(elements)["code"]

    dispatchers = {
        "rating":          lambda: _rate_cv(text, elements),
        "design_rating":   lambda: _rate_design(elements, page_size),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _fix_grammar(elements, resolved_language),
        "language":        lambda: _check_style(text, elements, resolved_language),
        "improve":         lambda: _improve_content(elements, resolved_language),
        "shorten":         lambda: _shorten_content(elements, resolved_language),
        "ats_score":       lambda: _ats_score(
            elements, page_size, template_id, image_resolver=ats_resolver,
        ),
        "translate":       lambda: _translate_cv(elements, target_language),
        "chat":            lambda: _chat(message, elements, page_size, history),
        "layout":          lambda: _layout_session(
            message, elements, page_size, history, template_id=template_id
        ),
    }

    fn = dispatchers.get(action)
    if fn is None:
        return {
            "message": f"Nieznana akcja: {action}",
            "rating": None, "tips": [], "corrections": [], "web_sources": [],
            "cv_language": resolved_language,
        }
    try:
        result = fn()
        # Echo the language used for corrections so the UI selector can sync.
        if isinstance(result, dict):
            result.setdefault("cv_language", resolved_language)
        return result
    except AtsReadabilityError as exc:
        raise AIServiceError(
            str(exc), action=action, elements_count=len(elements),
            original=exc, user_message=exc.user_message,
        ) from exc
    except AIServiceError as exc:
        exc.action = exc.action or action
        exc.elements_count = exc.elements_count or len(elements)
        raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_content_language.py tests/test_ai_language_detection.py -v`
Expected: PASS (Task 3 and Task 5 tests all green now)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_content_language.py
git commit -m "feat(ai): detect + override CV language in analyze_action dispatch"
```

---

## Task 6: API surface — `cv_language` on request/response + validation

**Files:**
- Modify: `backend/app/api/routes/ai_assistant.py`
- Test: `backend/tests/test_ai_assistant_schema.py` (extend)

**Interfaces:**
- Consumes: `analyze_action(..., cv_language=...)` (Task 5).
- Produces: `SUPPORTED_LANGUAGES` constant; `AssistantRequest.cv_language`, `AssistantResponse.cv_language`.

- [ ] **Step 1: Write the failing test**

First inspect the existing file to mirror its test style:

Run: `python -m pytest tests/test_ai_assistant_schema.py -v` (confirm current green baseline)

Append to `backend/tests/test_ai_assistant_schema.py` (import `AssistantRequest`, `AssistantResponse`, `SUPPORTED_LANGUAGES` from `app.api.routes.ai_assistant`):

```python
from app.api.routes.ai_assistant import (
    AssistantRequest, AssistantResponse, SUPPORTED_LANGUAGES, TRANSLATE_LANGUAGES,
)


def test_supported_languages_matches_translate_set():
    # One source of truth: detection/correction speak the translate vocabulary.
    assert SUPPORTED_LANGUAGES == frozenset({"pl", "en", "de", "fr", "es", "uk", "it", "nl"})
    assert SUPPORTED_LANGUAGES == TRANSLATE_LANGUAGES


def test_request_accepts_optional_cv_language():
    req = AssistantRequest(action="improve", elements=[], cv_language="en")
    assert req.cv_language == "en"


def test_request_defaults_cv_language_empty():
    req = AssistantRequest(action="improve", elements=[])
    assert req.cv_language == ""


def test_response_carries_cv_language():
    resp = AssistantResponse(message="ok", cv_language="de")
    assert resp.cv_language == "de"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ai_assistant_schema.py -v`
Expected: FAIL — `SUPPORTED_LANGUAGES` not exported; `cv_language` fields missing.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/api/routes/ai_assistant.py`:

Replace the translate-language constant block with a shared one:

```python
# ISO-ish language codes shared by detection, content corrections, and translate.
SUPPORTED_LANGUAGES = frozenset({"pl", "en", "de", "fr", "es", "uk", "it", "nl"})
# Backwards-compatible alias for the translate action's existing references.
TRANSLATE_LANGUAGES = SUPPORTED_LANGUAGES
```

Add to `AssistantRequest`:

```python
    # Optional CV-language override for content actions (grammar/language/
    # improve/shorten). Empty means the backend auto-detects from the canvas.
    cv_language: str = ""
```

Add to `AssistantResponse`:

```python
    # Language actually used for corrections, echoed so the UI selector syncs.
    cv_language: str = ""
```

In the `ai_assistant` handler, validate the override and pass it through:

```python
    cv_language = (request.cv_language or "").strip().lower()
    if cv_language and cv_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieobsługiwany język CV. "
                "Dozwolone: pl, en, de, fr, es, uk, it, nl."
            ),
        )
```

Then in the `analyze_action(...)` call add `cv_language=cv_language,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ai_assistant_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/ai_assistant.py backend/tests/test_ai_assistant_schema.py
git commit -m "feat(ai): cv_language request override + response echo with validation"
```

---

## Task 7: Frontend — CV-language selector and payload wiring

**Files:**
- Modify: `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`
- Test: `frontend/src/components/ai/AiAssistant/AiAssistant.test.js` (extend)

**Interfaces:**
- Consumes: `POST /ai/assistant` now accepts `cv_language` and returns `cv_language`.
- Reuses existing `TRANSLATE_LANGUAGES` array (~line 141) and `send(action, text, options)` (~line 1349).

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/ai/AiAssistant/AiAssistant.test.js` (source-inspection style, matching the existing tests):

```javascript
test("assistant threads a cv_language override into the request body", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    // send() must forward an optional cv_language for content actions.
    assert.match(source, /const cvLanguageOverride = options\.cv_language \|\| cvLanguage/);
    assert.match(source, /\.\.\.\(cvLanguageOverride[\s\S]*?cv_language: cvLanguageOverride/);
});

test("assistant tracks the detected cv_language from responses", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const \[cvLanguage, setCvLanguage\] = useState\(""\)/);
    // Detected language from the backend syncs the selector default.
    assert.match(source, /res\.cv_language[\s\S]*?setCvLanguage/);
});

test("assistant exposes a CV language selector using the shared language list", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /handleCvLanguageChange/);
    // Selector is built from the same TRANSLATE_LANGUAGES source of truth.
    assert.match(source, /TRANSLATE_LANGUAGES\.map/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` (from `frontend/`)
Expected: FAIL — the three new assertions do not match current source.

- [ ] **Step 3: Write minimal implementation**

In `AiAssistant.jsx`:

Add state near the other `useState` hooks in the component body:

```javascript
    // Detected (or user-overridden) CV language. Empty until the first backend
    // response reports one; the selector then reflects it. Sent with content
    // actions so corrections come back in the CV language, not always Polish.
    const [cvLanguage, setCvLanguage] = useState("");
```

Inside `send`, build the override just before the request body and include it for content actions:

```javascript
            const targetLanguage = options.target_language || "";
            // Content actions (grammar/language/improve/shorten) may carry a CV
            // language. An explicit option wins; otherwise reuse the last
            // detected/selected language. Empty lets the backend auto-detect.
            const cvLanguageOverride = options.cv_language || cvLanguage;
            const contentActions = ["grammar", "language", "improve", "shorten"];
```

Then in the JSON body, add:

```javascript
                    ...(contentActions.includes(action) && cvLanguageOverride
                        ? { cv_language: cvLanguageOverride }
                        : {}),
```

After a successful response is parsed (where `res.usage` is handled ~line 1425), sync the detected language:

```javascript
            // Keep the selector aligned with the language the backend used.
            if (res.cv_language && res.cv_language !== cvLanguage) {
                setCvLanguage(res.cv_language);
            }
```

Add the change handler near `handleTranslateLanguage` (~line 1568):

```javascript
    // Manual override: user picks the CV language when auto-detection is wrong.
    const handleCvLanguageChange = useCallback((code) => {
        setCvLanguage(code);
    }, []);
```

Render a compact selector in the content panel (near the content sub-actions UI). Follow DESIGN.md inputs (label above field, sharp edges). Minimal markup:

```jsx
    {/* CV language override for content corrections. Defaults to the detected
        language reported by the backend; users can correct a misdetection. */}
    <label className={classes.cvLangLabel}>
        Język CV
        <select
            className={classes.cvLangSelect}
            value={cvLanguage}
            onChange={(e) => handleCvLanguageChange(e.target.value)}
        >
            <option value="">Auto</option>
            {TRANSLATE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
        </select>
    </label>
```

Add matching `.cvLangLabel` / `.cvLangSelect` rules to `AiAssistant.module.css` using existing design tokens (1px border, 0px radius, accent focus ring). Reuse variables already present in that stylesheet; do not introduce new colors.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (new + existing AiAssistant tests green)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ai/AiAssistant/AiAssistant.jsx frontend/src/components/ai/AiAssistant/AiAssistant.test.js frontend/src/components/ai/AiAssistant/AiAssistant.module.css
git commit -m "feat(ai): CV language selector + cv_language payload in assistant"
```

---

## Task 8: Documentation sync (README + PROMPTS)

**Files:**
- Modify: `README.md` (English + Polish sections)
- Modify: `docs/PROMPTS.md` (regenerate)
- Verify: `scripts/generate_prompts_md.py`

**Interfaces:**
- Consumes: all prior tasks (final behavior).

- [ ] **Step 1: Regenerate the prompts reference**

Run: `python scripts/generate_prompts_md.py` (from repo root or `backend/` per its shebang/usage; check the file header first).
Expected: `docs/PROMPTS.md` updated to reflect the new language directives. Review the diff.

- [ ] **Step 2: Update README (English section)**

In the Features section, document the multilingual correction behavior:
- Content actions (grammar/language/improve/shorten) now detect the CV's language (pl/en/de/fr/es/uk/it/nl) and return corrections in that language; advice stays Polish.
- Mixed CVs: the body language wins; header inconsistency is still reported by the rating.
- Optional `cv_language` override (request field + UI selector), auto-detect by default.
- Reference exact symbols: `_detect_cv_language`, `_content_language_directive`, `_tense_rules_for` in `backend/app/services/ai_assistant_service.py`; `cv_language` on `AssistantRequest`/`AssistantResponse` in `backend/app/api/routes/ai_assistant.py`.

- [ ] **Step 3: Update README (Polish section)**

Mirror Step 2 in the Polish version with identical substantive content. Keep terminology consistent with the rest of the README.

- [ ] **Step 4: Verify no broken references and run the full test suite**

Run: `python -m pytest tests/ -q` (from `backend/`) and `npm test` (from `frontend/`).
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/PROMPTS.md
git commit -m "docs: multilingual AI corrections (EN+PL README, PROMPTS regen)"
```

---

## Self-Review

**1. Spec coverage:**
- §4.1 detector → Task 1 ✅
- §4.2 directive helper → Task 2 ✅
- §4.3 tense rules → Task 2 ✅
- §4.4 reconcile language-mix → Task 4 ✅
- §4.5 analyze_action wiring + echo → Task 5 ✅
- §4.6 API request/response/validation → Task 6 ✅
- §4.7 frontend selector → Task 7 ✅
- §8 roadmap phases 0–5 map to Tasks 1–8 (Phase 1 spans Tasks 2–3, Phase 5 = Task 8) ✅
- §10 docs (README PL+EN, PROMPTS regen) → Task 8 ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"; all code shown. The one manual-check note in Task 3 Step 4 explicitly recommends implementing Task 5 next — acceptable ordering guidance, not a placeholder.

**3. Type consistency:**
- `_detect_cv_language` return keys (`code`, `confidence`, `body_lang`, `header_lang`, `is_mixed`) consistent across Tasks 1 and 5.
- Handler signatures `(…, language_code: str = "pl")` consistent between Task 3 (definition) and Task 5 (call sites pass positional `resolved_language`).
- `analyze_action(cv_language=…)` (Task 5) matches route call (Task 6).
- `SUPPORTED_LANGUAGES` frozenset used in Task 6; `_SUPPORTED_LANGS` tuple in service (Task 1) — intentionally different types/scopes (route validation vs. membership check). Both list the same 8 codes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-18-multilingual-ai-corrections.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
