# Free-form AI CV commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the existing free-text box in the CV AI assistant panel accept direct editing instructions ("change all heading font sizes to 13px", "reformat the education section"), not just questions, and have them come back as the same accept/reject correction cards the fixed actions already produce.

**Architecture:** The only functional change is to `_chat()` in `backend/app/services/ai_assistant_service.py`: today it receives plain joined CV text and always returns empty `corrections`; it changes to receive the structured per-element view (`element_id`, `fontSize`, `bold`, etc. — the same helper other actions already use) and a system prompt that can both answer questions and emit scoped `corrections` for editing instructions. Everything downstream (the `/ai/assistant` route, the correction-card UI, the `_ALLOWED_FIELDS` safety filter) is reused completely unchanged.

**Tech Stack:** Python (FastAPI backend, `openai` SDK), React (frontend), `unittest`/`unittest.mock` for backend tests.

## Global Constraints

- Corrections may only ever contain fields from the existing `_ALLOWED_FIELDS` set — `content`, `fontSize`, `fontFamily`, `color`, `bold`, `italic`, `align`. Never `left`, `top`, `width`, `height`, `zIndex`, or `page`. This is enforced today by `_safe_result()` and must not be weakened.
- All user-facing text (`message`, `tips`) is returned in Polish, matching the existing CV-coach persona used by every other action in this file.
- This spec is CV-only. No changes to `AiDeckPanel`/`AiArticlePanel`, no new element schema fields (`role`/`section`), no new route, no new `action` id, no new request/response field.
- Every change still goes through the existing accept/reject correction-card flow in the frontend — nothing auto-applies.

Reference: `docs/superpowers/specs/2026-07-24-ai-freeform-cv-commands-design.md`

---

### Task 1: Teach `_chat()` to recognize and execute editing commands

**Files:**
- Modify: `backend/app/services/ai_assistant_service.py:511-534` (the `_chat` function body)
- Modify: `backend/app/services/ai_assistant_service.py:561` (the dispatcher's `"chat"` entry, inside `analyze_action`)
- Test: `backend/tests/test_ai_chat_command.py` (new)

**Interfaces:**
- Consumes: `_extract_structured(elements: list[dict]) -> list[dict]` — already defined at line 35, unchanged. Returns one dict per text/textarea element with content: `{element_id, category, content, fontSize, bold, italic, align}`.
- Consumes: `_gpt(system: str, user: str) -> dict` — already defined at line 70, unchanged.
- Consumes: `_safe_result(raw: dict, allowed_fields: set = _ALLOWED_FIELDS) -> dict` — already defined at line 100, unchanged. Drops any correction missing `element_id`, and strips any field not in `allowed_fields`.
- Produces: `_chat(message: str, elements: list[dict]) -> dict` — **signature change** from today's `_chat(message: str, text: str) -> dict`. The only caller is the `"chat"` entry in `analyze_action`'s dispatcher (line 561), updated in this task.

- [ ] **Step 1: Make sure an OpenAI key is in your shell environment**

`ai_assistant_service.py` constructs its OpenAI client at *import time*
(`_client = OpenAI(api_key=OPENAI_API_KEY)` at line 15), which reads
`API_GPT_KEY` from the environment (`backend/app/core/config.py:22`). Nothing
in this codebase auto-loads `.env`, so if `API_GPT_KEY` isn't already set in
your shell, importing the module — and therefore collecting the test below —
raises `openai.OpenAIError: Missing credentials` before any test code runs.
Load it from `backend/.env` first (PowerShell):

```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
}
```

This only needs to be done once per shell session — it also covers Task 3.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_ai_chat_command.py`:

```python
import unittest
from unittest.mock import patch

from app.services import ai_assistant_service


class ChatCommandTests(unittest.TestCase):
    def test_dispatcher_gives_chat_structured_elements_and_filters_hallucinated_fields(self):
        elements = [
            {
                "element_id": "heading-1",
                "category": "text",
                "content": "WYKSZTAŁCENIE",
                "fontSize": 16,
                "bold": True,
                "italic": False,
                "align": "left",
                "left": 20, "top": 40, "width": 150, "height": 22, "zIndex": 3, "page": 1,
            },
        ]

        def fake_gpt(system, user):
            # The prompt must carry structured per-element data (id + style),
            # not just the element's plain joined text.
            self.assertIn('"element_id": "heading-1"', user)
            self.assertIn('"fontSize": 16', user)
            # And it must never carry positional data GPT has no business touching.
            self.assertNotIn('"left"', user)
            return {
                "message": "Zmieniono rozmiar czcionki nagłówka na 13px.",
                "corrections": [
                    {"element_id": "heading-1", "fontSize": 13, "left": 999, "page": 2},
                ],
            }

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="zmień rozmiar czcionki nagłówka na 13px",
            )

        # The hallucinated left/page fields must be stripped — only the
        # requested, allowed field survives.
        self.assertEqual(result["corrections"], [{"element_id": "heading-1", "fontSize": 13}])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run test to verify it fails**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: **FAIL** with `AssertionError` from inside `fake_gpt` — today's dispatcher still calls `_chat(message, text)` where `text` is just the joined plain content (`"WYKSZTAŁCENIE"`), so the prompt contains no `"element_id": "heading-1"` or `"fontSize": 16` JSON at all. (If instead you see `openai.OpenAIError: Missing credentials`, Step 1's environment variable didn't take in this shell — redo it.)

- [ ] **Step 4: Implement the minimal change**

Replace the `_chat` function (`backend/app/services/ai_assistant_service.py:511-534`) with:

```python
def _chat(message: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "Jesteś ekspertem i coachem CV. Masz pełną treść i strukturę CV użytkownika jako kontekst. "
        "Wiadomość użytkownika może być PYTANIEM (np. „Czy moje podsumowanie jest za długie?”) "
        "albo POLECENIEM edycji (np. „zmień rozmiar czcionki wszystkich nagłówków na 13px”, "
        "„popraw sekcję wykształcenie”).\n"
        "Jeśli to pytanie — odpowiedz konkretnie w polu message, zostaw corrections jako pustą listę.\n"
        "Jeśli to polecenie edycji — znajdź w ELEMENTACH te, których dotyczy polecenie "
        "(np. „nagłówki” to elementy o wyraźnie większym lub pogrubionym fontSize niż otaczający tekst; "
        "„sekcja X” to elementy sąsiadujące w kolejności czytania z nagłówkiem o treści zbliżonej do X), "
        "i zwróć po jednej poprawce na każdy pasujący element w polu corrections. "
        "Każda poprawka może zawierać WYŁĄCZNIE pola: content, fontSize, fontFamily, color, bold, italic, align. "
        "NIGDY nie zwracaj pól left, top, width, height, zIndex ani page — nie masz wpływu na pozycję elementów.\n"
        "Jeśli polecenie wymaga przesunięcia, zmiany rozmiaru lub pozycji elementów, albo zmiany liczby stron "
        "(np. „zmieść CV na jednej stronie”, „przesuń zdjęcie wyżej”) — NIE próbuj tego obejść zmianą treści lub stylu bez wyjaśnienia. "
        "W message wyjaśnij, że nie możesz jeszcze zmieniać pozycji, rozmiaru ani liczby stron, "
        "a w tips zaproponuj osiągalną alternatywę opartą wyłącznie o treść lub styl "
        "(np. zmniejszenie czcionki lub skrócenie tekstu). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""ELEMENTY CV (id, typ, treść, styl — bez pozycji):
{json.dumps(structured, ensure_ascii=False)}

WIADOMOŚĆ UŻYTKOWNIKA:
{message}

Zwróć JSON:
{{
  "message": "<Twoja odpowiedź — konkretna i oparta na powyższych elementach>",
  "rating": null,
  "tips": ["<wskazówka lub osiągalna alternatywa, jeśli istotna>"],
  "corrections": [
    {{"element_id": "<id>", "fontSize": 13}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))
```

Then update the dispatcher entry at `backend/app/services/ai_assistant_service.py:561` from:

```python
        "chat":            lambda: _chat(message, text),
```

to:

```python
        "chat":            lambda: _chat(message, elements),
```

(`text` is still used by the `rating`, `position_rating`, and `ats_score` entries above it — leave those and the `text = _extract_text(elements)` line untouched.)

- [ ] **Step 5: Run test to verify it passes**

Run from `backend/`:
```
./.venv/Scripts/python.exe -m unittest tests.test_ai_chat_command -v
```
Expected: **PASS** — `Ran 1 test ... OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_assistant_service.py backend/tests/test_ai_chat_command.py
git commit -m "feat: let the CV chat action execute formatting/content commands"
```

---

### Task 2: Update the assistant panel's copy to surface the new capability

Without this, nothing in the UI hints that the free-text box now accepts commands, not just questions — the empty state and placeholder both currently say "ask a question."

**Files:**
- Modify: `frontend/src/components/ai/AiAssistant/AiAssistant.jsx:535` (empty-state hint text)
- Modify: `frontend/src/components/ai/AiAssistant/AiAssistant.jsx:572` (chat input placeholder)

**Interfaces:** None — plain JSX text content, no props/state change.

- [ ] **Step 1: Update the empty-state hint**

Change (line 535):
```jsx
                                    <p>Kliknij akcję powyżej lub wpisz pytanie o swoje CV.</p>
```
to:
```jsx
                                    <p>Kliknij akcję powyżej, zadaj pytanie o swoje CV lub wpisz polecenie, np. „zmień rozmiar czcionki nagłówków na 13px”.</p>
```

- [ ] **Step 2: Update the input placeholder**

Change (line 572):
```jsx
                                placeholder="Zadaj pytanie o swoje CV…"
```
to:
```jsx
                                placeholder="Zadaj pytanie lub wydaj polecenie…"
```

- [ ] **Step 3: Visually verify in the browser**

Run from `frontend/`:
```
npm run dev
```
Open the app, open the floating AI assistant panel (bottom-right star button) on any CV with no messages yet, and confirm:
- The empty-state paragraph shows the new copy and wraps cleanly (no overflow/clipping in the panel).
- The textarea placeholder shows "Zadaj pytanie lub wydaj polecenie…" before typing.

This step doesn't require the backend — it's a static string change.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ai/AiAssistant/AiAssistant.jsx
git commit -m "copy: hint that the AI assistant chat box also accepts commands"
```

---

### Task 3: Verify command behavior against a real model

Task 1's test proves the plumbing (structured data in, safety filter applied to what comes out) with a mocked GPT response. It cannot prove the model actually *understands* "headings" or "the education section" — that needs a real call, per the design spec's testing section.

**Files:** none (verification only; the script below is not committed to the repo).

- [ ] **Step 1: Make sure the OpenAI key is available in your shell**

The backend reads `API_GPT_KEY` from the environment (`backend/app/core/config.py:22`), and nothing in this codebase auto-loads `.env`. If `API_GPT_KEY` isn't already set in your shell, load it from `backend/.env` (PowerShell):

```powershell
Get-Content backend/.env | ForEach-Object {
    if ($_ -match '^([^=#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
}
```

- [ ] **Step 2: Save and run the verification script**

Save as `verify_chat_command.py` in a scratch/temp directory of your choice
(it's a throwaway verification script, not something to commit):

```python
"""Manual verification for the _chat() command-handling change. Not part of the test suite."""
import sys
sys.path.insert(0, r"c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend")

from app.services.ai_assistant_service import analyze_action

ELEMENTS = [
    {"element_id": "name",     "category": "text",     "content": "Jan Kowalski",
     "fontSize": 24, "bold": True,  "italic": False, "align": "left",
     "left": 20, "top": 20,  "width": 300, "height": 30, "page": 1},
    {"element_id": "exp-head", "category": "text",     "content": "DOŚWIADCZENIE ZAWODOWE",
     "fontSize": 16, "bold": True,  "italic": False, "align": "left",
     "left": 20, "top": 60,  "width": 300, "height": 20, "page": 1},
    {"element_id": "exp-body", "category": "textarea", "content": "Zbudowałem system rekrutacji obsługujący 10 000 kandydatów miesięcznie.",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 20, "top": 85,  "width": 300, "height": 40, "page": 1},
    {"element_id": "edu-head", "category": "text",     "content": "WYKSZTAŁCENIE",
     "fontSize": 16, "bold": True,  "italic": False, "align": "left",
     "left": 20, "top": 140, "width": 300, "height": 20, "page": 1},
    {"element_id": "edu-body", "category": "textarea", "content": "Politechnika Warszawska, Informatyka. Byłem odpowiedzialny za projekt zespołowy.",
     "fontSize": 11, "bold": False, "italic": False, "align": "left",
     "left": 20, "top": 165, "width": 300, "height": 40, "page": 1},
]

SCENARIOS = [
    ("global style command",   "zmień rozmiar czcionki wszystkich nagłówków sekcji na 13px"),
    ("section-scoped command", "popraw sekcję wykształcenie"),
    ("out-of-scope command",   "zmieść to CV na jednej stronie"),
    ("plain question",         "Czy moje doświadczenie zawodowe brzmi wystarczająco mocno?"),
]

for label, message in SCENARIOS:
    print(f"\n=== {label}: {message!r} ===")
    result = analyze_action(action="chat", elements=ELEMENTS, message=message)
    print("message:", result["message"])
    print("tips:", result["tips"])
    print("corrections:", result["corrections"])
```

Run it with the backend venv's interpreter, passing the script's full path
(the script sets its own `sys.path`, so your current directory doesn't
matter):
```
c:\Users\Kamil\learningCode\PROJECTS\PDF\pdf-generator\backend\.venv\Scripts\python.exe <full-path-to>\verify_chat_command.py
```

- [ ] **Step 3: Confirm each scenario against these expectations**

1. **Global style command** — `corrections` should include `exp-head` and `edu-head` with `fontSize: 13`, and should NOT include `name`, `exp-body`, or `edu-body`.
2. **Section-scoped command** — `corrections` should only touch `edu-head`/`edu-body` (and ideally catch the passive-voice "Byłem odpowiedzialny" in `edu-body`), not touch anything under `exp-*`.
3. **Out-of-scope command** — `message` should clearly state it can't change page count/position yet; `corrections` should be empty or limited to a content/style-only partial suggestion (e.g. smaller `fontSize`), not silently claim the CV now fits one page.
4. **Plain question** — `corrections` empty; `message` gives a specific answer grounded in the actual `exp-body` text, not generic advice.

If a scenario doesn't match, that's a prompt-wording issue in Task 1's `_chat()` system prompt, not a plumbing bug — go back and adjust the wording, then re-run this script (Task 1's automated test doesn't need to change).

- [ ] **Step 4: No commit** — this is a verification pass, not a code change. If you tweak the prompt in `_chat()` as a result, that's a normal edit to the existing `ai_assistant_service.py` file — commit it with a message describing what the prompt fix addresses.
