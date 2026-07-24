# Allow overlap for AI-directed position operations — design

## Problem

`resolve_shift`/`resolve_align`/`resolve_distribute` (added in
[2026-07-24-ai-cv-position-operations-design.md](2026-07-24-ai-cv-position-operations-design.md))
reject any directed position operation that would create a new overlap
between elements, via the shared `_is_safe_group` check. This blocks
legitimate, explicitly-requested moves — e.g. moving a caption to sit over
the bottom of a photo, or any other intentional overlapping layout — since
the safety net treats every new overlap as unsafe, with no way to say "I
meant to do that."

## Goal

A directed position operation (`shift`, `align`, or `distribute`) may result
in a new overlap between elements, on either axis. Page-bounds checking is
unchanged — an element still can't be moved off the page.

## Non-goals

- The deterministic auto-scanner (`_bounds_groups`/`_alignment_groups`/
  `_spacing_groups`, the "Układ" quick-action) is unchanged — it's making
  inferred guesses about intent, not executing an explicit instruction, and
  keeps rejecting new overlaps.
- No z-index/stacking-order control. Overlapping elements keep whatever
  render order they already have; this spec doesn't add a way to change it.
- No change to `distribute`'s `gap < 0` rejection ("elements are too tightly
  packed to distribute at all," a different condition from a normal
  overlap) or to the `< 3 targets` / cross-page / no-raw-coordinate rules.

## Design

Add `allow_overlap: bool = False` to `_group()` and `_is_safe_group()`.
`_is_safe_group` skips its new-overlap rejection loop when `allow_overlap`
is `True`; the bounds check is unaffected either way. The three directed
resolvers pass `allow_overlap=True`; the auto-scanner's existing call sites
pass nothing, keeping the default `False` and their current behavior
unchanged.

Consequence: `resolve_directed_operation`'s rejection message ("would leave
the page or overlap another element") becomes partly inaccurate for
directed operations, since overlap can no longer be the actual rejection
reason for `shift`/`align`/`distribute`. Trim it to name only the page-bounds
reason for that path.

## Testing

Update the existing `layout_analysis` tests that currently assert a
directed operation is rejected *because* it would create a new overlap
(`test_shift_rejects_move_that_creates_a_new_overlap`) to instead assert it
now succeeds. Add a new test confirming the auto-scanner's own overlap
rejection (already covered by
`test_rejects_bound_correction_that_would_create_overlap`) is unaffected —
no change needed there since it doesn't pass `allow_overlap`.
