# Application localisation acceptance matrix

Each row requires PL and EN checks for default, hover, active, focus-visible,
disabled, loading, empty, validation, failure/retry and success where applicable.
Responsive checks use 390, 834, 1280 and 1920 px, 200% zoom and reduced motion.

| Surface | Required behaviour |
| --- | --- |
| Landing, templates/detail, pricing, help, privacy | Equivalent copy, links, semantic headings and sample previews |
| Login, registration, verification, Google | Preserve entered fields and return intent; localised messages and email |
| Library, account, career profile, checkout return | Equivalent actions, limits, dates and recovery |
| Setup and start chooser | Independent CV language; retain choices across UI switches |
| Editor, canvas controls, inspector and galleries | Translate chrome without changing persisted content or geometry |
| Save, import, export, confirmation and progress | Preserve operation identity, drafts and focus |
| Assistant, scoped review, ATS and tailoring | UI-language advice; document-language corrections |
| Interview, facts, clarification and preview | New questions follow UI language; historical evidence stays literal |
| Global errors, route loading, dialogs and notifications | Accessible, recoverable and translated |

The matrix is an acceptance checklist, not a claim that validation has passed.


## Verification record (12 September 2026)

- Frontend Node suite: 1,159 passing tests.
- Frontend runtime suite: 102 passing tests in 18 files after the concurrent interview-source change was reconciled.
- Backend localisation/authentication/email/Stripe contracts: 60 passing tests, including 33 localisation cases.
- Full backend snapshot: 912 passing, five skipped and three Regent layout failures. The same three failures were reproduced from clean HEAD (`ContactPlacementTests.test_regent_header_contacts_are_masthead`, `CvTemplateLayoutTests.test_active_templates_keep_textareas_inside_page_bounds`, `CvTemplateLayoutTests.test_header_rule_mastheads_clear_first_section_heading`).
- Fullscreen setup: all 27 browser scenarios pass, including responsive layouts, focus trapping, pending creation, retry and cancellation.
- All ten browser localisation tests pass together (2.1 minutes). They cover 390/834/1280/1920 px, PL/EN persistence, independent CV language, retained registration fields, English verification/download, Polish document content and AI undo, and public pages at 200% text zoom with reduced motion. The retained-history interview check is included in the same suite.
- Ten English previews were regenerated through the existing PDF renderer and visually inspected together. All include English headings and retain template-specific styling; only Free document packs are distributed to the client.
- Translation completeness, ESLint, production build, bundle budgets and documentation-link checks pass. Measured gzip totals: landing 196.52 KiB (limit 200), editor synchronous graph 454.66 KiB (limit 500), largest feature 216.45 KiB (limit 300).

Release remains gated on the complete application matrix, including resolving the baseline Regent failures and rerunning the integrated suite on a stable revision. The source-required interview flow changed concurrently during this work; earlier browser results for creating an interview predate that change. No deployment or real provider transaction has been performed. Provider-language contracts use mocks; real AI wording, email delivery and a hosted Stripe round trip are not claimed as verified.
