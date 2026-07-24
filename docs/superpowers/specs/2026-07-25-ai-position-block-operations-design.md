# AI-directed position operations on multi-element blocks — design

## Problem

`resolve_shift`/`resolve_align`/`resolve_distribute`
([2026-07-24-ai-cv-position-operations-design.md](2026-07-24-ai-cv-position-operations-design.md))
operate on a flat set of individual elements — each target gets its own
independent patch. A CV's "experience" section is typically several job
entries, each made of multiple separate elements (a position-title text, a
company/date text, a description textarea). Asking to distribute those
entries evenly currently has no way to say "move these three elements
together, as one unit" — running `distribute` on every element in the
section would space out titles, companies, and descriptions independently,
scrambling which description belongs under which title (confirmed directly:
the assistant already declines this exact request today, correctly, since
nothing in the current directive shape lets it express a block).

There is no existing persistent grouping concept to build on — this
codebase's "group-selection" is an ephemeral `isSelected` UI flag for
manual multi-select drag, never sent to the backend as a named group and
not something the AI can reference.

## Goal

A position directive can target either flat elements (unchanged, today's
behavior) or **blocks** — named clusters of elements that move as one rigid
unit, preserving their internal relative layout. GPT partitions elements
into blocks itself, from the same content + position data it already
receives; Python never receives or invents element groupings beyond what
GPT names, and — as with individual elements — never receives or invents a
coordinate.

## Non-goals

- No persistent `group_id` on elements, no schema change, no way to create
  a durable group via the UI. This is directive-scoped only — a block only
  exists for the duration of resolving one instruction.
- No mixing flat `target_element_ids` and block `target_groups` in the same
  directive. One instruction picks one targeting shape.
- No nested blocks (a block's members are individual elements, not other
  blocks).
- Still CV-only, still position (`left`/`top`) only. Still no size changes,
  no page-count changes.

## Design

**New directive field**: `target_groups: list[list[str]]`, alternative to
`target_element_ids`. Each inner list is the element ids forming one block
(e.g. one job entry's title + company + description). GPT decides when to
use it — an instruction about "blocks," "entries," or "whole job positions"
signals block targeting; an instruction naming a category like "headings"
stays flat.

**Resolution, as an adapter over the existing per-item resolvers — `resolve_shift`/`resolve_align`/`resolve_distribute` themselves do not change:**

1. For each inner list in `target_groups`, look up its real member elements
   and compute their union bounding box (min left/top, max right/bottom).
   That box becomes a **synthetic single item** (`element_id` like
   `__block_0__`) standing in for the whole block.
2. Call the *existing, unchanged* `resolve_shift`/`resolve_align`/
   `resolve_distribute` against the list of synthetic block-items — the
   exact same geometry math (shift by offset, align to a shared value,
   equalize gaps holding the first/last fixed) now operates on block
   bounding boxes instead of individual elements. `distribute`'s existing
   "≥3 targets" rule becomes "≥3 blocks" for free, since it's just checking
   the length of whatever item list it's given.
3. Each resulting block-level patch (`{block_id, left, top}`) is converted
   into a delta (`new_left - old_left`, `new_top - old_top`) and applied
   identically to every real member of that block — a rigid translation
   that preserves each member's position relative to the others.
4. The expanded, per-member patches are re-validated through the existing
   `_group`/`_is_safe_group` (with `allow_overlap=True`, matching
   [2026-07-25-ai-position-allow-overlap-design.md](2026-07-25-ai-position-allow-overlap-design.md))
   against the *real* full element list — not just the synthetic block
   items — so page-bounds checking applies to every actual element, not an
   approximation.

A block whose members span more than one page is rejected with an
explanation, same as the existing cross-page rejection for flat targets.

## Testing

- Unit tests for the union-bbox computation and the delta-expansion step in
  isolation.
- Unit tests exercising each operation (`shift`/`align`/`distribute`)
  through `resolve_directed_operation` with a `target_groups` directive,
  confirming: multiple blocks move correctly and rigidly (internal member
  offsets preserved), the ≥3-blocks rule for `distribute`, cross-page block
  rejection, and that flat `target_element_ids` directives are completely
  unaffected (still take the pre-existing code path).
- Real-model verification: seed a CV with 2-3 multi-element job entries
  with uneven vertical spacing and ask to distribute them evenly; confirm
  GPT partitions into the right blocks (not flat elements) and each entry's
  internal layout (title above company above description) is preserved
  after the move.
