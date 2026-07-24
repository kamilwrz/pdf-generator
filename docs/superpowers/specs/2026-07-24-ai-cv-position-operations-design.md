# AI-driven CV position operations — design

## Problem

The CV AI assistant's chat box (upgraded in [2026-07-24-ai-freeform-cv-commands-design.md](2026-07-24-ai-freeform-cv-commands-design.md))
can now interpret free-text content/style instructions, but it deliberately
excludes anything positional — `_chat()` only ever sees content and style
fields, and `_safe_result()` strips `left`/`top`/`width`/`height`/`zIndex`/
`page` from every correction it returns, by design. That exclusion was a
direct response to an earlier incident where letting GPT choose coordinates
caused elements to overlap.

The user now wants the same chat box to also handle positional instructions —
"move all section headings left by 50px," "align all elements at x=50," "the
job entries in the experience section should be spaced more evenly" — without
reopening that failure mode.

## Goals

- A user can type a direct positional instruction (explicit offset, explicit
  axis value, or "make these consistent with each other") and get a
  previewable, safe repositioning proposal for the elements it refers to.
- A user can type an indirect/abstract complaint about spacing or alignment
  ("these aren't evenly spaced") for a described subset of the CV (e.g. "the
  job positions in the experience section") and get the same kind of
  proposal, with the assistant resolving *which* elements and *what
  operation* the complaint implies.
- GPT never supplies a raw coordinate. It only ever selects a target element
  set and a operation with parameters (an offset, an axis, an anchor, an
  optional explicit value); Python computes every actual `left`/`top` from
  the elements' real current measured positions, exactly like
  `layout_analysis.py` already does for the deterministic auto-scan.
- Every proposal is validated before being shown: nothing may leave the page,
  and nothing may create a new overlap that didn't already exist. If a
  request can't be satisfied safely, the assistant explains why in its reply
  instead of silently producing nothing or a broken result.
- Explicit instructions are not distance-capped the way the deterministic
  auto-scanner's speculative nudges are (`MAX_SAFE_SNAP_MOVE` /
  `MAX_SAFE_BOUNDS_MOVE` in `layout_analysis.py`) — a user who explicitly asks
  for a 200px move gets it, provided it still passes the bounds/overlap check.
- Ambiguous requests get a clarifying question in the chat reply, not a
  guessed operation. This reuses the existing chat history UI as-is — no new
  interaction mechanism.
- No new frontend UI: proposals flow through the existing `layout_groups`/
  `layout_issues` response fields and the existing `LayoutGroupCard`
  preview/accept/reject component, which already render for any chat message
  regardless of which action produced it.

## Non-goals (this spec)

- Page-fit / compaction ("put this CV on one page"). Deferred to its own
  follow-up spec — it requires shrinking fonts/spacing and reflowing
  multiple elements together, a fundamentally different and harder problem
  than repositioning elements that already fit.
- Changing page count, adding/removing elements, or resizing elements
  (`width`/`height`). This spec is about *position* (`left`/`top`) only.
  `_chat()`'s existing content/style correction path is unaffected and keeps
  its existing field allowlist.
- Deck and article documents — CV only, matching the existing chat feature's
  scope.
- Compound multi-operation instructions in one message ("move X left and
  align Y to Z"). One instruction resolves to one operation for v1.
- Any change to the deterministic auto-scan (`analyze_layout` / the "Układ"
  quick-action button) — it keeps its own conservative distance caps and
  clustering heuristics untouched.

## Architecture

**Operation vocabulary — the only three shapes GPT can select:**

- **`shift`** — move a target set of elements by a relative offset `(dx, dy)`.
- **`align`** — set a target set of elements to a common value on one axis
  (`x` or `y`) at an anchor (`start` = left/top edge, `center`, `end` =
  right/bottom edge). The value is either an explicit number from the
  instruction, or omitted — in which case Python uses the median of the
  targets' current anchor positions (mutual alignment, no invented number).
- **`distribute`** — equalize the gaps between a target set of elements along
  one axis, holding the first and last element fixed and repositioning the
  ones between them. Requires at least 3 targets (first, last, and at least
  one to redistribute) — matching `layout_analysis.py`'s existing
  `MIN_CLUSTER_SIZE` convention for spacing detection; a directive with fewer
  than 3 targets resolves to no patch plus an explanation.

GPT's output for a positional instruction is a directive: operation name,
target `element_id` list, axis/anchor/offset/value as applicable — never a
`left`/`top` value itself. This directive is the *only* new thing GPT can
produce; everything else about `_chat()`'s existing question/content-style
behavior is unchanged.

**Resolution and validation** happen entirely in `layout_analysis.py`, which
already states "this module is the sole authority for layout coordinates."
New functions (`resolve_shift`, `resolve_align`, `resolve_distribute`) take
the directive plus the elements' real current bounds and produce concrete
`{element_id, left, top}` patches, built on the module's existing safety
primitives:

- `_apply_patches` / `_is_safe_group` already do exactly the validation this
  needs (no result element leaves the page; no patch introduces an overlap
  that wasn't already present) — reused unchanged, just called with
  GPT-directed patches instead of auto-detected ones.
- The existing `MAX_SAFE_SNAP_MOVE`/`MAX_SAFE_BOUNDS_MOVE` distance caps are
  NOT applied to these directed operations (per the Goals section) — only
  the page-bounds and no-new-overlap checks apply.
- If validation fails, the resolver returns a reason instead of a patch, and
  `_chat()` surfaces that reason in `message` (e.g. "moving the heading there
  would overlap the summary block, so I didn't apply it").

**Response shape:** unchanged. `_chat()` already returns a dict shaped for
`AssistantResponse`, which already has `layout_groups`/`layout_issues` fields
(populated today only by the `"layout"` action's `analyze_layout()` call). A
resolved positional instruction populates the same fields; the frontend's
`ChatMessage` component already renders `layout_groups` for any message, and
`LayoutGroupCard`'s preview/accept/reject already calls the existing
`applyLayoutPatches`/`setLayoutPreviewPatches` context functions. No frontend
component changes.

**Targeting** (which elements a phrase like "the job positions in the
experience section" refers to) uses the same semantic-inference approach as
the existing content/style command path — GPT reasons over the structured
element list rather than matching a stored `role`/`section` tag, since none
exists. The difference here is *this* structured list must include geometric
data (current `left`/`top`/`width`/`height`/`page`) alongside content/style,
since resolving "more evenly spaced" or "align at x=50" requires knowing
current positions. Content/style-only requests continue to work exactly as
before — the extra geometric fields are additional context, not a behavior
change for that path.

## Geometry accuracy

The element list sent to the backend must reflect real rendered size, not
stored `width`/`height` (which can be stale, especially for `textarea`
elements with wrapped multi-line content — exactly the shape of the "job
positions in the experience section" example). Today there are two divergent
measurement approaches in the frontend:

- `getElementBounds` (`useA4Elements.js:24`) — measures the actual DOM node
  via `getBoundingClientRect`, corrected for canvas zoom scale. Already used
  for the existing group-drag logic (`moveElementsByDelta`). This is real
  ground truth.
- `createLayoutSnapshot` (`AiAssistant.jsx`) — approximates text width via
  `canvas.measureText`, only for `category === "text"`; `textarea` and other
  categories fall back to raw stored `width`/`height` uncorrected.

This spec extracts `getElementBounds`'s DOM-measurement approach into a
shared helper and uses it for the geometry snapshot sent to the backend for
`"chat"` requests (replacing `createLayoutSnapshot`'s approximation), so
`textarea` job-entry blocks measure as accurately as single-line text does
today. The existing `"layout"` action's snapshot moves to the same shared
helper for consistency, rather than maintaining two measurement code paths.

## Testing / verification

Same split as the content/style command work:

- An automated test mocks `_gpt()` and proves the plumbing: a directive with
  a target/operation/params resolves to the expected patch, an
  out-of-bounds/overlap-creating directive resolves to zero patches plus an
  explanatory reason, and content/style requests are unaffected by the added
  geometric context.
- Manual verification against a real model, run against representative CV
  elements, covering: an explicit shift, an explicit-value align, an
  implicit (mutual) align, a distribute request phrased abstractly ("more
  evenly spaced"), a request that should fail validation (moving something
  into a collision) and produce an explanation instead of silently doing
  nothing, and an ambiguous request that should produce a clarifying
  question instead of a guess.
