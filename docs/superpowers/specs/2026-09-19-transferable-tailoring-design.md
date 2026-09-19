# Transferable-evidence job tailoring and cleaner editorial output

Date: 2026-09-19 · Status: approved direction, phased implementation (1 → 2 → 3)

## Problem

The "Dopasuj CV do oferty" workflow underuses evidence that matches a
requirement *indirectly*: similar duties, comparable outcomes, and soft skills
demonstrated by described situations. Today:

1. **Analysis loses obvious indirect matches.** `match_status` is only
   `matched / partial / missing`; related-but-not-identical experience
   collapses into `partial`/`missing` with no captured link to the evidence
   that makes it related, so the report cannot show *how* to present it.
2. **Interview questions are generic.** For an unresolved requirement the
   templates ask "Czy masz doświadczenie związane z wymaganiem X?" instead of
   bridging from what the candidate already wrote ("W roli Y robiłeś Z — czy
   obejmowało to też X?").
3. **The generated CV ignores related facts.** Generation has no explicit
   repositioning strategy for transferable evidence or confirmed soft skills.
4. **The report is hard to act on.** matched / needs-detail / not-mentioned
   labels say nothing about indirect fit.
5. **Editorial output is not clean.** Mixed grammatical forms, filler,
   summary↔record repetition, template-AI phrasing, and skills entries that
   gain a dash-description ("SQL — analiza danych w …") instead of bare names.

## Decisions (product owner)

- **Scope:** full pipeline — analysis → interview → generation/editorial.
- **Honesty boundary: moderate.** The generated CV may use the offer's
  vocabulary where meaning is equivalent, may raise similar duties/outcomes in
  prominence, and may add soft skills backed by a described situation. It must
  never claim the missing requirement itself is met.
- **Soft skills:** inferred from described situations, then confirmed by one
  short interview question with an example; only confirmed skills enter the CV.
- **Score:** unchanged. Indirect matches are presentation + interview input
  only; a transfer is a hypothesis to confirm, not a fulfilled requirement.
- **Rollout:** phased 1 → 2 → 3, each phase verified and shipped separately.

## Invariants (do not change)

- No new paid operation; the analysis stays one `position_rating` charge and
  interview questions keep their existing billing and the 50-answer ceiling.
- Requirement IDs stay `requirement:<sha of text>`; saved sessions, retries
  and extensions must not repeat topics.
- Old settled receipts (no new fields) stay readable: absent
  `related_evidence_refs` simply means no indirect matches.
- Grounding contract: every positive signal cites existing evidence-catalog
  IDs; the job offer is never evidence; negations/qualifiers are preserved;
  "wspieranie ≠ kierowanie" rules stay superior to the new transfer search.
- `matched` requirements are still skipped by the interview; "no experience",
  "cannot remember" and skip still close a topic immediately.
- Analysis text never becomes a career fact without the existing confirmation
  paths; `transfer_note` is report/question context only and never enters CV
  content or the PDF tree.

## Phase 1 — Analysis: indirect matches as first-class data

Backend (`app/services/tailoring/analysis.py`, `policy.py`):

- Extend the requirement item in `JOB_TAILORING_RESPONSE_SCHEMA` with
  `related_evidence_refs` (array, max 5, same ID space as `evidence_refs`) and
  `transfer_note` (string, one sentence naming the bridge *and* the residual
  gap, e.g. "koordynacja wolontariuszy ≈ zarządzanie zespołem; brak
  potwierdzenia w środowisku komercyjnym").
- Grounding: validate `related_evidence_refs` against the evidence catalog
  exactly like `evidence_refs`; drop unknown IDs; empty after filtering ⇒ no
  indirect match. `transfer_note` is stripped of technical IDs/paths before it
  reaches the UI (same rule as existing user-facing notices).
- `JOB_MATCHING_RULES` gains a section: actively look for transferable
  support — similar activities, comparable outcomes, soft skills evidenced by
  situations; always cite the existing evidence and name what is still
  missing; a transfer never upgrades `match_status`.
- Definition: an *indirect match* is `match_status ∈ {partial, missing}` with
  non-empty validated `related_evidence_refs`.

Frontend (matching workspace report):

- Fourth plain-language category **„Dopasowanie pośrednie” / “Related
  experience”** between matched and needs-detail: requirement text, the quoted
  related CV evidence, and the residual gap from `transfer_note`. No technical
  IDs, PL/EN parity, wraps at compact widths and 200% zoom.
- Score formula and dimension scores unchanged.

Docs: DESIGN.md matching-workspace contract gains the fourth label; README
(EN+PL) analysis section updated.

## Phase 2 — Interview: bridging questions and soft-skill confirmation

Backend (`interviews/job_analysis.py`, `discovery.py`, `questions.py`):

- `requirement_topics` carries `related_evidence_refs` + `transfer_note` into
  topics (IDs unchanged); `requirement_facts` also resolves related refs via
  the existing snapshot rules, so bridging questions can quote real facts from
  the currently selected store only.
- For an unresolved requirement **with** related facts, the first question is
  a *bridging* question that quotes the candidate's own fact: „W roli {rola}
  {fakt}. Czy obejmowało to również {wymaganie}? Opisz przykład." The second
  slot and the 2-questions-per-requirement cap are unchanged. Requirements
  without related facts keep today's templates.
- Soft-skill confirmation: when the analysis ties a soft-skill requirement to
  a described situation, the requirement's single bridging question asks for
  confirmation plus one short example; a confirmed answer persists as an
  ordinary cited answer-fact, refusal/"nie pamiętam" closes the topic without
  creating a fact. Fits inside the existing slots — no new charges.

## Phase 3 — Generation and editorial cleanliness

Generation prompts (`interviews/editorial.py`, generation task ±
`cv/editorial_policy.py`):

- Explicit repositioning strategy (moderate honesty): use offer vocabulary
  only where meaning is equivalent; order related duties/outcomes higher
  within records and the summary; include confirmed soft skills with their
  situational backing; never state that an unmet requirement is met. The
  independent factual verification stage gains one check: "a transfer did not
  become a direct claim".
- **Skills hygiene (reported defect):** skill entries are bare names — no
  dash-descriptions ("SQL — analiza danych…"); explanatory content belongs to
  record bullets. Enforced in the prompt *and* post-processed (split on the
  first " — "/" – " in generated skill names; move nothing silently into
  records — excess text is dropped from the skill and remains available in
  the source answers).
- Editorial rules tightened: one fact per bullet; action verb / consistent
  noun-form opening; one grammatical form across the document; deduplicate
  summary↔records; strip template-AI phrases ("odpowiedzialny za",
  "dynamiczny zespół"); keep numbers and proper names verbatim.

## Testing (per phase)

1. Schema/grounding units (valid + unknown related refs, legacy receipts);
   report rendering with all four categories, PL/EN, empty states.
2. Topic-building units (related facts resolution, stable IDs, retry/no
   repeat); question-selection units (bridging first, generic fallback,
   soft-skill confirm/refuse paths); budget invariants (2/requirement, 50).
3. Editorial units for skills hygiene and dedup; generation-verification
   fixture where a transfer tries to become a direct claim and is rejected;
   existing interview e2e suites re-run.

Mocked-provider tests check orchestration and safeguards, not live model
quality; prompt-quality is validated manually per phase on real offers.

## Out of scope

- Score/dimension formula changes; new billing actions; changes to the
  editor's scoped AI actions; career-profile storage model; ATS scoring.
