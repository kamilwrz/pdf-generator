# Free-form AI CV commands — design

## Problem

The floating AI assistant (`AiAssistant.jsx` + `ai_assistant_service.py`) already
lets a user run one of eight fixed actions (rate CV, grammar, style, ATS score,
layout, etc.) or type a free-text question into its chat box. The chat box is
Q&A only today: `_chat()` receives the CV's plain concatenated text (no element
IDs, no style data) and always returns `corrections: []`, so nothing typed there
can ever change the canvas.

The user wants that same input to also accept direct editing instructions —
"format the education section," "change all heading font sizes to 13px" — and
have the assistant actually understand which elements on the canvas that refers
to and propose the change, the same way the fixed actions already propose
grammar/style corrections today.

## Goals

- Typing an instruction (not a question) into the existing chat box produces
  `corrections` scoped to the elements it actually refers to, rendered through
  the existing correction-card UI (accept / reject / apply-all) — no new UI.
- The assistant reasons about "headings," "the education section," etc. from
  the CV's actual content and structure (fontSize, bold, reading order,
  section-heading text) — it is not a hardcoded action, it interprets the
  instruction fresh each time.
- Requests that would require moving, resizing, or repositioning elements, or
  changing page count, are recognized as out of scope: the assistant explains
  the limitation in its reply and suggests an achievable alternative, rather
  than silently attempting a partial/wrong fix.
- Every change still passes through the existing `_ALLOWED_FIELDS` server-side
  filter (`content`, `fontSize`, `fontFamily`, `color`, `bold`, `italic`,
  `align`) — unchanged from today. This spec adds no new writable fields and no
  new way to bypass that filter.

## Non-goals (this spec)

- Position, size, or page-count edits ("put this on one page," "move the photo
  up"). This is explicitly deferred — it needs a different, safer mechanism
  than raw coordinate edits (which is exactly what broke things before), and is
  its own follow-up spec.
- Deck and article documents. The existing chat/assistant panel is CV-only
  (Polish CV-coach system prompts); this spec upgrades that CV path only.
  Porting the pattern to `AiDeckPanel`/`AiArticlePanel` is a follow-up.
- Adding a `role`/`section` field to the element schema. Targeting is inferred
  per-request from content and style, not from stored metadata.
- Any new frontend component, route, action id, or request/response field.

## Architecture

All of the required plumbing already exists and is reused unchanged:

- **Frontend** (`AiAssistant.jsx`): the free-text input already POSTs
  `{ action: "chat", elements: A4_Elements, message: userText, ... }` to
  `/ai/assistant`, and `ChatMessage`/`CorrectionCard` already render whatever
  `corrections` come back, with accept/reject and "Apply all." No changes.
- **Route** (`ai_assistant.py`): `"chat"` is already a valid action, request/
  response schemas already carry `elements` and `corrections`. No changes.
- **Backend handler** (`ai_assistant_service.py`, `_chat()`): this is the only
  function that changes. Today it takes `(message, text)` where `text` is
  joined plain content with no element IDs. It becomes `(message, elements)`
  and internally calls `_extract_structured(elements)` — the same helper
  `_fix_grammar`/`_check_style`/`_improve_content` already use, giving GPT
  `element_id`, `category`, `content`, `fontSize`, `bold`, `italic`, `align`
  per element.
- Result is still built through `_safe_result(raw, allowed_fields=_ALLOWED_FIELDS)`,
  identical to every other action — this is the existing guardrail that strips
  any `left`/`top`/`width`/`height`/`zIndex`/`page` field GPT might hallucinate,
  and it needs no changes for this spec.

## Prompt design

`_chat()`'s system prompt is extended (still Polish-language, matching the
existing CV-coach persona) to handle two request shapes in one GPT call —
there is no separate intent-classification step:

1. **Question** ("Is my summary too long?") → behave as today: answer in
   `message`, leave `corrections` empty.
2. **Instruction** ("change all heading font sizes to 13px", "tighten up the
   education section") → identify the matching elements from the structured
   list using the available signals (relative fontSize/bold for "headings";
   reading-order proximity to a section-heading's text for "the X section"),
   and emit one `corrections` entry per element that should change, using only
   `_ALLOWED_FIELDS`.
3. **Out-of-scope instruction** (would require `left`/`top`/`width`/`height`/
   page count) → do not attempt a coordinate-based workaround. Explain the
   limitation in `message` (e.g. "I can't reposition elements yet") and, where
   there's a content/style-only partial alternative (e.g. shrinking font sizes
   as a partial answer to "fit on one page"), offer it as a suggestion in
   `tips` rather than silently applying it as a `corrections` patch.

The prompt explicitly grounds the model in the actual element list it's given
each turn — it must reference real `element_id`s and real content, not invent
generic advice, consistent with how the existing fixed actions already behave.

## Error handling

No new error paths. This spec reuses the existing ones unchanged:

- `_gpt()` already raises if the model returns empty content.
- `_safe_result()` already drops any correction missing `element_id`, and
  strips any field not in the caller's `allowed_fields` set — this is what
  keeps a hallucinated position/page edit from ever reaching the frontend.
- The route's existing `try/except` around `analyze_action()` already turns
  any exception into a 500 with the error message.

## Testing / verification

There's no existing automated test coverage for `ai_assistant_service.py`
(prompt-driven output isn't a good fit for unit tests), so verification is
manual, run against the live app with a real CV on canvas:

1. A global style command ("change all heading font sizes to 13px") — confirm
   `corrections` target the elements a human would call headings, and that
   accept/reject and "Apply all" work.
2. A section-scoped command ("reformat the education section") — confirm only
   elements near/under that heading are targeted.
3. An out-of-scope command ("put this CV on one page") — confirm the reply
   explains the limitation instead of emitting corrections that quietly
   under-deliver.
4. A plain question — confirm existing Q&A behavior (`corrections: []`) is
   unchanged.
