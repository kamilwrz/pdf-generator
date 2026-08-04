# English

# CV Studio

CV Studio is a Polish-language A4 CV editor: a WYSIWYG canvas, 25 individual templates (each with its own name and short stylistic description), PDF import via AI, a guided bio wizard, a floating AI assistant, and ReportLab PDF export that matches the canvas 1:1 (coordinates in points, top-left origin on the frontend, flipped for ReportLab).

This README is the technical entry point for developers. A beginner-friendly deep guide to canvas coordinates, React interaction, deterministic Python layout, AI responsibilities, reflow, persistence, and ReportLab export lives in [`CANVA.md`](CANVA.md). Every live AI prompt (full text, variables, file/line references) is documented in [`PROMPTS.md`](PROMPTS.md). Product-oriented feature copy lives in [`docs/FEATURES.md`](docs/FEATURES.md). Marketing brief for the website „Dlaczego CV STUDIO” section (features + competitive positioning, no competitor brand names in public copy) lives in [`FEATURES_MARKETING.md`](FEATURES_MARKETING.md). Template generation (AI extract vs Python layout) is explained in [`docs/cv-template-generation.md`](docs/cv-template-generation.md). A layperson-friendly end-to-end guide covering Frontend and Backend (flows, files, classes, functions) lives in [`CV_GENERATOR.md`](CV_GENERATOR.md).

---

## Table of contents

1. [Purpose and problem](#purpose-and-problem)
2. [Main user flows](#main-user-flows)
3. [Architecture and data flow](#architecture-and-data-flow)
4. [Technologies](#technologies)
5. [Folder structure](#folder-structure)
6. [Database](#database)
7. [Features (implementation map)](#features-implementation-map)
8. [API](#api)
9. [Installation and local development](#installation-and-local-development)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Security and privacy](#security-and-privacy)
13. [Accessibility and UX](#accessibility-and-ux)
14. [Known limitations and planned work](#known-limitations-and-planned-work)
15. [Further reading](#further-reading)

---

## Purpose and problem

Job seekers need CVs that look professional and export cleanly to PDF. Generic form builders hide layout; design tools are too heavy. CV Studio gives a true A4 canvas (595×842 pt), templates filled with real career data, and AI that extracts or improves content without inventing unsafe coordinates for decorative chrome.

**Implemented today:** editor, templates, extract/fill, bio draft, AI assistant (ratings, grammar, layout review cards), entitlements (Free / Standard / Premium), autosave, local or S3 storage, JWT auth.

**Optional:** AWS S3 (`S3_BUCKET_NAME`), unpaid plan selection (`ALLOW_UNPAID_PLAN_SELECTION`).

**Not implemented as full Stripe Checkout yet:** paid plans can be activated without payment when unpaid selection is enabled; `402 payment_required` is the seam for future Checkout.

---

## Main user flows

1. **Choose a landing-page start** → “Upload my CV” (`start=import`) or “Create a CV from scratch” (`start=wizard`).
2. **Register / login** → JWT in `localStorage` → the selected `start` intent survives authentication and opens the matching editor dialog.
3. **Pick a template** → `handleLoadTemplate` materializes specs → canvas.
4. **Import PDF** → `POST /ai/extract_cv` → choose template → `POST /ai/fill_template` → Python layout in `cv_generator.generate_resume`.
5. **Bio wizard** → draft CRUD on `/ai/bio_cv_draft` → fill template.
6. **Edit** → drag/resize/style → debounced `PUT /pdf/save_elements`.
7. **AI assistant** → `POST /ai/assistant` → tips / corrections / reviewable layout groups.
8. **Export** → create/update PDF → `POST /pdf/download_pdf` (export quota charged).

```mermaid
flowchart LR
    Browser[React editor] -->|JWT + JSON| API[FastAPI]
    API --> Auth[auth / entitlements]
    API --> Canvas[pdf CRUD + autosave]
    API --> AI[extract / fill / assistant]
    API --> DB[(SQLite or Postgres)]
    API --> Files[local disk or S3]
    API --> OpenAI[OpenAI API]
    Canvas --> ReportLab[ReportLab PDF]
```

---

## Architecture and data flow

### Entry points

| Layer | Entry | Role |
|--------|--------|------|
| Frontend | `frontend/src/main.jsx` → `App.jsx` | Router: `/`, `/login`, `/register`, protected `/pdfcanvas` |
| Editor page | `frontend/src/pages/PdfCanvas.jsx` (`PdfCanvas`) | Composes hooks into Canvas / UiSurfaces / Session (+ `PdfContext` facade) |
| Backend | `backend/app/main.py` | FastAPI app, CORS, `/health`, routers, optional SPA static |

### Frontend layers

- **Pages** — marketing, auth, editor shell.
- **Hooks** — `useA4Elements` is the canvas facade; undo/redo in `useDocumentHistory`; selection/drag in `useElementSelectionDrag`; factories/materialize helpers are pure utils; `usePdfExport` talks to PDF endpoints; `useEntitlements` loads plan limits.
- **Context** — nested `CanvasContext` / `UiSurfacesContext` / `SessionContext` from `PdfCanvas`, plus temporary merged `PdfContext` facade for remaining consumers.
- **Services** — `ApiClient` (`services/api.js`) with long timeouts and retries for Render cold start; shared `fillTemplate` for `/ai/fill_template`; authenticated image blob helper for private library photos.
- **Templates** — static element specs in `frontend/src/templates/`; registry in `templates/index.js`.

### Backend layers

- **Routes** — thin HTTP in `app/api/routes/*` (PDF create/update delegates to `document_service`).
- **CRUD** — SQLAlchemy writes in `app/crud/*`.
- **Services** — PDF render, CV layout, AI, entitlements, S3.
- **Models** — `app/models/models.py`; engine in `app/models/database.py`.

### Coordinate system

Canvas and stored geometry use **top-left** origin (CSS-like). ReportLab uses **bottom-left**; `PDF_Generator` flips `top` using `page_h` before drawing (`backend/app/services/pdf_generator.py`). Textarea soft-wrap uses the same word-break rules as the canvas, plus a 2 px `WRAP_WIDTH_TOLERANCE_PX` so borderline last words (tight Inter body lines) stay on the same line in the PDF as on the canvas — see `tests/test_pdf_bullet_layout.py`.

### Auto-height reflow and aligned icons

Template textareas start with authored placeholder heights and are measured after the browser loads their real fonts. `reflowTextareaHeight` then moves all following elements in the same visual lane by the measured delta. Text-aligned Iconic images (`alignWithText: true`, including backward-compatible `/template-assets/iconic/` URLs) are classified as section chrome and may join a lane when they hang to the left of the column (Ridge rail, ~40 px). Icons that sit entirely to the right of a narrow column are excluded, so Loom's sidebar cannot drag main-column icons away from their headings.

Undo/redo history treats that post-load reflow as part of the **baseline**, not as a user edit: `markHistoryQuiet` in `useA4Elements` updates the current history entry in place so Cofnij stays disabled until the user actually changes the document. Otherwise Undo would restore pre-measure heights and revive uneven Y gaps (e.g. diploma → school in education records).

Every auto-height textarea measures twice — once immediately, once again after `document.fonts.ready` — and each measurement calls `reflowTextareaHeight` independently, so a later field can briefly carry a stale `page` number from an earlier pass. `rawSamePageGap` checks authored `top` values (ignoring `page`) before applying the generic page-break gap: a same-record pair with a stale page keeps its authored small gap, while a genuine cross-page seam uses `DEFAULT_PACK_GAP` (10 px, `SPACE_RECORD`) for ordinary blocks and `SECTION_PACK_GAP` (21 px, `SPACE_SECTION`) for section chrome. Using the leftover page-top inset (often 0–6 px when education starts near `pageTop` on page 2) crushed headings such as WYKSZTAŁCENIE under the previous section. IT templates mark section markers/rules `locked` for interaction and guides, but `flowRole: "section-chrome"` still lets them reflow with their heading so underlines do not stay stranded on the next page. The reflow intentionally does **not** infer title/meta relationships from font size or boldness; that heuristic distorted valid Onyx record spacing and compounded independent height deltas. Onyx and IT section marker/label/rule use `section-chrome`, and ordinary records use `content`. Keep-with-next logic therefore cannot mistake a job title for a section heading and move the real heading behind its own content. Legacy templates without this property keep the category-based fallback.

During the canvas enter hold, auto-height reflow is suppressed and resumes after fonts are ready. Every textarea emitted by the Python generators carries `preserveInitialLayout: true` (via `_block` in `cv_generator_primitives.py`). On first mount the canvas may **shrink** a box to browser `scrollHeight` when ReportLab overshoots (so empty slack cannot inflate visual section gaps), but it will not **grow** — independent growth races still stretch gaps. Editing content or later changing typography/width still triggers normal auto-height reflow. See `textareaHeight.test.js` (`shouldShrinkPreservedLayout`) and `textareaReflow.test.js` packing cases.

Section headings are kept with their first body block across page breaks: `avoidOrphanChrome` reserves the full first keep-together record height (degree + meta + description, not only the first textarea), and when a measured body textarea itself jumps to the next page, `precedingRecordMates` + `precedingChromeCluster` pull title/meta siblings and the icon/heading/rule with it. That prevents orphans such as “UMIEJĘTNOŚCI” alone at the bottom of page 1, and the education split where Bachelor stayed on page 1 while its description moved to page 2. Backend generators use `Builder.need_section(chrome, body)` before placing a heading, and `Builder.keep_together(height)` for experience/education/other records — each emitted element is tagged with the same `flowGroup` id so canvas reclaim-packing (when earlier boxes shrink) cannot pull only part of a record back onto the previous page. Sections may continue on the next page, but each record stays whole. ReportLab receives the same geometry visible on the canvas.

### Decorative chrome

Elements with `fixedToPage: true` (backgrounds, frames, sidebars, page numbers) are cloned across pages by default and must not be selected/moved/deleted in the UI (`isDecorativeChrome` in `frontend/src/utils/elementInteraction.js`). First-page-only chrome sets `repeatOnContinuation: false`, which prevents `cloneFixedPageDecorations` from copying it when overflow creates another page. Design rating prompts respect template typography.

---

## Technologies

| Technology | Version / note | Purpose | Main locations |
|------------|----------------|---------|----------------|
| React | ^19.2 | UI components and hooks | `frontend/src/` |
| Vite | ^7.2 | Dev server and production build | `frontend/` |
| React Router | ^7.13 | Client routes + `ProtectedRoute` | `App.jsx` |
| FastAPI | (requirements) | HTTP API | `backend/app/main.py`, routes |
| Uvicorn | (requirements) | ASGI server | local / Render |
| SQLAlchemy | (requirements) | ORM | `models/`, `crud/` |
| SQLite / PostgreSQL | via `DATABASE_URL` | Persistence | `database.py` |
| ReportLab + fontTools | (requirements) | PDF drawing + TTF name fixes | `pdf_generator.py` |
| PyMuPDF (fitz) | (requirements) | PDF → images for extract | `ai_service.py` |
| OpenAI SDK | (requirements) | Extract + assistant | `ai_service.py`, `ai_assistant_service.py` |
| python-jose / passlib bcrypt | (requirements) | JWT + passwords | `core/security.py` |
| boto3 | optional | S3 uploads | `s3_storage.py` |
| nanoid | ^5.1 | Client element ids | canvas hooks |
| motion | ^12 | UI motion | modals / assistant |
| unittest | stdlib | Backend tests | `backend/tests/` |

Official docs: [React](https://react.dev/), [Vite](https://vite.dev/), [FastAPI](https://fastapi.tiangolo.com/), [SQLAlchemy](https://docs.sqlalchemy.org/), [ReportLab](https://www.reportlab.com/docs/reportlab-userguide.pdf), [OpenAI API](https://platform.openai.com/docs).

---

## Folder structure

```text
pdf-generator/
├── AGENTS.md                 # Project agent / documentation rules
├── BUGZ.MD                   # Known issues tracker
├── README.md                 # This file
├── docs/                     # Product + design + deep-dive docs
├── frontend/
│   ├── public/
│   │   ├── cv-studio-logo.svg     # Full orange CV Studio logo
│   │   ├── cv-studio-mark.svg     # Compact mark for favicon/editor rail
│   │   └── template-mockups/      # Static A4 preview PNGs
│   ├── src/
│   │   ├── components/       # canvas, editor, ai, modals, gallery, common
│   │   ├── hooks/            # useA4Elements facade, useDocumentHistory, usePdfExport, …
│   │   ├── pages/            # Hero, Login, Register, PdfCanvas
│   │   ├── services/         # ApiClient, fillTemplate, authenticatedImage, eventLog
│   │   ├── store/            # Canvas / UiSurfaces / Session + PdfContext facade
│   │   ├── templates/        # 25 template specs + helpers
│   │   └── utils/            # a4ElementFactories, canvasElementSchema, geometry, reflow
│   ├── package.json
│   └── .env.example
├── shared/
│   └── pdf-element.schema.json  # Exported from Pydantic PdfElement
└── backend/
    ├── app/
    │   ├── api/routes/       # auth, pdf, images, ai, assistant, billing, events
    │   ├── core/             # config, security
    │   ├── crud/
    │   ├── models/
    │   ├── schemas/          # PdfElement + JSON Schema export
    │   ├── services/         # pdf, document_service, cv_generator (+ cv_templates/), ai, entitlements
    │   ├── utils/            # image_src_to_path, metrics_logging, upload_security
    │   ├── main.py
    │   └── dependencies.py
    ├── alembic/              # Schema migrations (replaces ad-hoc ALTER)
    ├── fonts/                # Bundled TTFs for PDF
    ├── template_assets/      # Sidebar, IT and Iconic artwork/icons
    ├── tests/
    ├── alembic.ini
    ├── requirements.txt
    └── .env.example
```

**Rules:** Frontend templates must stay in sync with `_GENERATORS` in `cv_templates/registry.py` (re-exported from `cv_generator.py`; 25 ids). Each `cv_templates/templates/<id>.py` holds only that template’s live generator — not a shared multi-theme engine with sibling branches. Do not put secrets in the repo. Uploads and generated PDFs are runtime data (`uploads/`, `static/generated/`), not source. User image bytes are not publicly mounted — only via `GET /images/{id}/content`.

---

## Database

Configured by `DATABASE_URL` (`backend/app/models/database.py`). Default if unset: `sqlite:///./pdfgenerator.db`. `postgres://` URLs are rewritten to `postgresql://`. Postgres uses `pool_pre_ping` for Render cold starts.

Schema is created by `init_db()` during app lifespan (not at import): `Base.metadata.create_all` for missing tables, then `alembic upgrade head` for schema changes (multi-page columns live in `backend/alembic/versions/`). Billing catalog is seeded via `bootstrap_billing`. Manual CLI: `cd backend && alembic upgrade head`.

### Tables (business purpose)

| Table | Purpose |
|-------|---------|
| `users` | Accounts: username, email, bcrypt hash, `is_active`, timestamps |
| `images` | Uploaded image metadata; `file_path` local or S3 URL; `owner_id` → users |
| `pdfs` | CV documents: title, path, pages, page_width/height (default 595×842), owner |
| `pdf_elements` | Canvas elements; geometry + style columns; extras in `extra_properties` JSON (`fixedToPage`, `repeatOnContinuation`, `locked`, `flowRole`, `flowGroup`, `preserveInitialLayout`, bold, connectors, …) |
| `bio_cv_drafts` | One private JSON draft per user |
| `plans` | Free / standard / premium limits and feature flags |
| `user_subscriptions` | Current plan per user (Stripe columns ready, often null) |
| `usage_counters` | Monthly exports + AI credit usage (`period_key` = `YYYY-MM` UTC) |
| `payments` | Future payment ledger |
| `maintenance_markers` | One-off cleanup keys |

**Relationships:** One user owns many `pdfs` and `images`. Each `pdf` has many `pdf_elements`. Subscription and usage are per user.

Models: `backend/app/models/models.py` (`User`, `Pdf`, `PdfElements`, …).

---

## Features (implementation map)

Product narrative: [`docs/FEATURES.md`](docs/FEATURES.md).

### A4 canvas editor

Interactive multi-page **A4 portrait** canvas with selection, drag, resize, zoom, guides. Seven addable element types: text, textarea, line, rectangle, circle, ellipse, image (connectors are not offered in the sidebar). Ten bundled fonts shared by editor and PDF: Inter, Roboto, Helvetica, Montserrat, Times-Roman, PlayfairDisplay, CormorantGaramond, Lora, Courier, JetBrainsMono. Session undo/redo ignores post-load textarea reflow (`markHistoryQuiet`).

Implementation:

- `frontend/src/pages/PdfCanvas.jsx`, lines 46+, component `PdfCanvas`
- `frontend/src/hooks/useA4Elements.js`, lines 43+, function `useA4Elements` (incl. `markHistoryQuiet` / undo baseline)
- `frontend/src/components/canvas/*`
- `frontend/src/components/common/EditorControls/EditorControls.jsx`, `FONT_OPTIONS`
- The outcome-focused landing references the editor canvas and exact-export behaviour without exposing implementation statistics: `frontend/src/pages/Hero/Hero.jsx`, lines 285–313, section `editorSection`

### Outcome-focused landing and directed starts

The landing page presents one outcome, an editable PDF-ready CV, and two ways to begin: importing an existing PDF or creating content in the guided wizard. It explains the shared four-step journey, before/after transformation, templates, editable A4 canvas, privacy scope, effect-oriented plans, and a non-guaranteed ATS explanation. It intentionally describes AI as an assistive mechanism: users review document content and layout suggestions before proceeding.

The two primary CTAs carry `start=import` or `start=wizard`. Existing signed-in visitors go directly to `/pdfcanvas`; new visitors retain the choice through registration and login. `PdfCanvas` consumes the parameter once, opens either the import dialog or the bio wizard, and removes the parameter so a browser refresh does not re-open a dialog the user dismissed.

Standard includes PDF import and content-focused AI: CV and design ratings, role fit, grammar, style, improvement, ATS guidance, and ordinary chat. The full-canvas **Układ** geometry session is Premium-only; its landing-page FAQ and plan cards explain that it proposes previewable spacing, alignment, and collision corrections rather than changing the document automatically.

Implementation:

- `frontend/src/pages/Hero/Hero.jsx`, component `Hero`; `buildStartUrl`, `StartButton`, plan cards, and the FAQ
- `frontend/src/pages/Hero/Hero.module.css` — responsive editorial layout and reduced-motion handling
- `frontend/src/pages/Register/Register.jsx`, lines 37–44 and 92–95, preserves a valid start intent after registration
- `frontend/src/pages/Login/Login.jsx`, lines 23–26 and 81–85, sends the signed-in user to the intended editor entry point
- `frontend/src/pages/PdfCanvas.jsx`, lines 48–70 and 438–469, opens and then consumes the intended import/wizard dialog

### Rust brand logo

The application uses a transparent SVG brand system in the same rust accent as primary actions (`#DC6743`). The full logo combines a folded-document CV monogram with the **CV STUDIO** wordmark in Montserrat (with browser-safe sans-serif fallbacks), so it remains legible on both the dark landing header and warm-paper authentication screens. A compact version of the same mark is used where a wordmark would not fit: the editor tool rail and browser favicon. The former blue `kompoza-logo*.png` assets have been removed.

Implementation:

- `frontend/public/cv-studio-logo.svg`, lines 1–15 — full logo and wordmark
- `frontend/public/cv-studio-mark.svg`, lines 1–8 — compact mark
- `frontend/src/pages/Hero/Hero.jsx`, lines 141–145 and 442–445; `Hero.module.css`, lines 40–51 and 1173–1176 — landing header/footer lockup
- `frontend/src/pages/Login/Login.jsx`, lines 127–131; `Login.module.css`, lines 184–195 — login lockup
- `frontend/src/pages/Register/Register.jsx`, lines 129–133; `Register.module.css`, lines 180–191 — registration lockup
- `frontend/src/components/editor/Sidebar/Sidebar.jsx`, lines 43–46 — compact editor mark
- `frontend/index.html`, line 5 — SVG favicon

### Auth screens aligned with the landing

Login and registration continue the landing page’s editorial “document transformation” visual language instead of switching to the former generic dark cards. Both views use a responsive split layout: an explanatory story panel on the left and a paper-like form panel with the rust action accent on the right. On small screens, the story panel becomes a compact header above the form.

The intent-aware copy remains functional. Login confirms whether it will open PDF import or the guided wizard after authentication; registration confirms the selected path before account creation. Registration plan labels describe user outcomes, such as “import and AI help”, instead of AI-credit counts. Prices and entitlement gates are unchanged.

Implementation:

- `frontend/src/pages/Login/Login.jsx`, lines 102–192; `frontend/src/pages/Login/Login.module.css`
- `frontend/src/pages/Register/Register.jsx`, lines 104–228; `frontend/src/pages/Register/Register.module.css`
- `frontend/src/pages/Register/PlanSelector.jsx`, lines 4–31; `frontend/src/pages/Register/PlanSelector.module.css`

### Unified dark application palette

The editor keeps its near-black background as the dominant surface, while using the same rust action colour (`#DC6743`), deep rust pressed state (`#A73E26`), gold detail (`#CAA66B`), and warm-paper text family as the landing and auth screens. A shared warm `--on-accent` token keeps text legible on rust buttons. Shared controls, focus outlines, selection chrome, AI quick actions, page controls, and the PDF-rendering loader therefore no longer introduce a separate blue visual language. Control corners are deliberately tighter to make dark editor forms feel related to the paper-like landing forms without reducing their density.

White remains intentionally reserved for the editable A4 document and its template preview because it represents the exported page; editor chrome uses warm off-white instead. Green success and red destructive states remain semantic status colours rather than becoming brand accents.

Implementation:

- `frontend/src/index.css`, lines 1–77, root palette tokens, warm text colours, on-accent text, and shared control radius scale
- `frontend/src/App.css`, lines 5–18, charcoal application background with rust and gold ambient gradients
- `frontend/src/components/canvas/SelectionOverlay/SelectionOverlay.module.css`, lines 8–90, rust selection and movement chrome
- `frontend/src/components/common/Spinner/Spinner.module.css`, lines 7–167, dark overlay and paper-like export-status card

Limits:

- PDF extraction and content-focused AI actions are entitlement-gated from Standard; the full-canvas `layout` action requires Premium. The landing assigns the import start to Standard and the guided wizard to Free, which includes eight starter templates.
- ATS feedback is guidance about document readability and content structure. It is not a promise of recruiter response or an ATS pass.
- The privacy section describes implemented data use at a high level and does not claim unimplemented certifications or anonymisation.

### Template load

Loads static specs; assigns `element_id`, interaction flags, locks chrome.

Implementation:

- `frontend/src/templates/index.js` — `TEMPLATES` registry (`name` + `description` for UI; `layouts` tags for generators)
- `frontend/src/utils/materializeElementSpecs.js`, `materializeElementSpecs`
- `frontend/src/hooks/useA4Elements.js`, `handleLoadTemplate` / `useDocumentHistory`

### Canvas enter fade

When a full document lands on the canvas (AI CV upload, bio wizard, or template pick), interactive content fades in from opacity 0→1. Elements are held invisible until `document.fonts.ready` (capped at 1000 ms) so fallback→webfont swaps stay hidden, then fade over 750 ms. Decorative chrome (`fixedToPage`, not selectable) appears immediately with no animation. Manual add/duplicate still uses the same fade for the new ids only. AI-filled **Onyx** section chrome (marker + label → rule 14px below → body +16px) matches `frontend/src/templates/onyx.js`; `flowRole` keeps chrome/content ordered, while `preserveInitialLayout` blocks first-mount growth (shrink-to-content is still allowed so box height matches glyphs).

Implementation:

- `frontend/src/utils/canvasEnter.js`, lines 1–58, `markContentElementsEnter`, `CANVAS_ENTER_MS`, `CANVAS_ENTER_FONT_WAIT_MS`
- `frontend/src/hooks/useCanvasEnterIds.js`, lines 1–80, `useCanvasEnterIds`
- `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx` + `CanvasElements.module.css`
- `frontend/src/hooks/useA4Elements.js` — `handleLoadAiElements`, `handleLoadTemplate`, `handleLoadTemplateWithFill` call `markContentElementsEnter`
- `backend/app/services/cv_templates/templates/onyx.py`, `_gen_onyx`; `frontend/src/templates/onyx.js`, lines 1–101 — assign Onyx `flowRole` and `preserveInitialLayout`
- `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`, lines 29–55; `frontend/src/components/canvas/Textarea/Textarea.jsx`, lines 42–164 — skip only the initial Onyx textarea measurement
- `backend/app/schemas/pdf_schema.py`, lines 44–46; `backend/app/crud/pdfs.py`, lines 81–82, 187–188, 226–227; `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx`, lines 104–105 — persist and restore the Onyx flow flags

Tests:

- `frontend/src/utils/canvasEnter.test.js` — pending-id registry and chrome exclusion

### Monument monochrome template

Monument is a paid Classic template for users who want an elegant editorial result without colour. Its visual identity comes from numbered black rectangles, outlined heading frames, thin grey rules, and an asymmetric masthead. The smallest text is 9 px; body copy and the summary both use 9 px so the lead paragraph does not sit one step above surrounding text, record titles use 11 px, education titles use 10 px, and section headings plus the job-position line use 12.5 px. Cormorant Garamond supplies the formal display voice, while Montserrat keeps dense CV content easy to scan. The same summary-equals-body rule applies across every filled template in `generate_resume` (for example Regent/Scribe use 9.3 px to match experience bullets).

The frontend starter array and the deterministic Python generator use the same A4 geometry and grayscale palette. `_gen_monument` preserves complete experience and education records during page breaks, supports custom sections through `_extra_sections`, and groups each number, frame, label, and rule into one reflow unit so the heading geometry remains aligned after browser text measurement. The page frame and footer repeat on every page, while the name-and-position masthead and its tall side bars appear only on page one; `repeatOnContinuation: false` preserves this rule when the editor creates another page later. Layout decisions are never sent to the AI model.

Implementation:

- `frontend/src/templates/monument.js`, lines 1–108, exported array `monumentTemplate`
- `frontend/src/templates/index.js`, registry entry `monument` (`tier: "paid"`, `layouts: ["single"]`)
- `backend/app/services/cv_templates/templates/monument.py`, function `_gen_monument`; `cv_templates/registry.py`, `_GENERATORS["monument"]`
- `frontend/src/utils/structureOperation.js`, lines 34–63, function `cloneFixedPageDecorations`
- `frontend/public/template-mockups/monument.png`, source-driven A4 preview

Tests:

- `frontend/src/templates/monument.test.js`, lines 6–56, starter-layout hierarchy, section-number, frame-geometry, and page-one masthead assertions
- `frontend/src/utils/structureOperation.test.js`, lines 25–44, continuation-page cloning opt-out
- `backend/tests/test_cv_template_layouts.py`, `test_monument_is_monochrome_and_keeps_summary_at_body_size`; `test_summary_matches_experience_body_type_size` — every generator keeps summary type equal to main-column experience body

Known limitation: long user-provided section names are shortened only inside the fixed decorative heading frame. Their section content remains complete.

### Words Word-style template

Words is a paid Classic template for users who want a familiar office-document result rather than a poster-like CV. It uses a single Times-Roman column on pure white paper, with a 29 px name, a 13.5 px position, 12 px section headings, and 10–11.5 px content. Thin grey rules and circles no larger than 7 px are its only decoration. It has no rectangles, side panels, or decorative margin frames.

The frontend starter and `_gen_words` share the same A4 geometry. Long names, positions, and contact lines wrap instead of being shortened, and the first section moves down by the measured header height. The Python generator keeps complete experience and education records together when they fit, supports custom sections through `_extra_sections`, starts continuation content below a compact 58 px inset, and repeats only the plain page background, footer rule, small footer circle, and page number. Explicit `flowRole` and `preserveInitialLayout` values keep the browser's text measurement from separating section markers from their headings or repaginating the deterministic initial layout.

Implementation:

- `frontend/src/templates/words.js`, lines 1–123, exported array `wordsTemplate`
- `frontend/src/templates/index.js`, registry entry `words` (`tier: "paid"`, `layouts: ["single"]`)
- `backend/app/services/cv_templates/templates/words.py`, function `_gen_words`; `cv_templates/registry.py`, `_GENERATORS["words"]`
- `frontend/public/template-mockups/words.png`, source-driven A4 preview

Tests:

- `frontend/src/templates/words.test.js`, lines 6–37, Word-like typography, grayscale palette, marker size, and no-frame assertions
- `backend/tests/test_cv_template_layouts.py`, lines 733–801, `test_words_uses_word_document_rhythm_without_decorative_frames`

Known limitation: Words reproduces the visual language of a carefully formatted Word document, but it does not create or import `.docx` files. Export remains PDF.

### Cardinal noble-red template

Cardinal is a paid single-column template (`layouts: ["icons"]`) for candidates who want a formal document with one restrained accent of colour. It reserves a "noble red" (`#9E2532`) for typography only — the role line under the name and every section heading — while all ornament stays neutral grey (`#8A8A8A`): the generated line-art icons beside each section heading and contact detail, plus the decorative rules under the headings and along the header and footer. Body copy is dark grey (`#333333`); the name uses Times-Roman while labels, contact, dates, and body use Helvetica. Pairing generated icons with every heading and contact row is what sets it apart from Scribe, Regent, Aldine, Merit, Monument, and Words.

The grey glyphs come from a dedicated `cardinal` theme added to the shared icon pipeline (`scripts/generate_iconic_icons.py`, `THEMES["cardinal"] = "#8A8A8A"`), rendered to `backend/template_assets/iconic/cardinal/*.png` and served from the existing `/template-assets/` mount. The static editor preview and the deterministic AI fill share one visual identity because the backend generator reuses the same single-column icon machinery as other icon-tagged templates, under its own layout branch so no red accent band is drawn.

Implementation:

- `frontend/src/templates/cardinal.js`, lines 1–158 — static starter spec; local `icon` helper (line 49), `sectionHead` (line 65), `contact` (line 76), and the `flowRole` mapping in `cardinalTemplate` (line 150)
- `frontend/src/templates/index.js`, registry entry `cardinal` (`tier: "paid"`, `layouts: ["icons"]`, `accent: "#9E2532"`)
- `backend/app/services/cv_templates/templates/cardinal.py`, function `_gen_cardinal`
- `backend/app/services/cv_templates/registry.py`, `_GENERATORS["cardinal"]`
- `scripts/generate_iconic_icons.py`, line 23, grey `cardinal` icon theme
- `frontend/public/template-mockups/cardinal.png`, source-driven A4 preview

Tests:

- `frontend/src/templates/cardinal.test.js`, lines 1–57 — single-column, red-headings-only, grey-icons/rules, dark-grey body, and serif-name assertions
- `backend/tests/test_template_registry_sync.py`, `test_frontend_ids_match_backend_generators` — enforces the frontend/backend id parity that `cardinal` now participates in

### Moss sidebar photo placeholder

Moss is a paid botanical sidebar template (`layouts: ["sidebar"]`). The gold-frame ornament (rectangle + ellipse + filled circle) is the photo placeholder at the top of the narrow left sidebar, aligned with the main-column name. Contact and fitted sidebar sections (skills, languages, interests, education) begin below that placeholder — not mid-page under empty vertical space. The main column keeps name / title / contact line without masthead decoration.

Sidebar packing (`_fit_sidebar_sections`) accepts any complete section that still fits the remaining first-page height. An older per-section 160 px cap rejected ordinary wizard skill lists and long education records, so those sections appeared only in the main column after **Utwórz CV krok po kroku**, while shorter PDF-extracted lists stayed in the sidebar.

Implementation:

- `backend/app/services/cv_templates/templates/moss.py`, function `_gen_moss` (photo geometry and sidebar stack, lines 59–131)
- `backend/app/services/cv_templates/shared/extras.py`, `_fit_sidebar_sections` — remaining-height budget only
- `frontend/src/templates/moss.js`, lines 32–48 — static starter with the same sidebar photo + raised KONTAKT stack
- `frontend/src/templates/index.js`, registry entry `moss`

Tests:

- `backend/tests/test_cv_template_layouts.py`, `test_moss_photo_placeholder_leads_sidebar_at_name_height`, lines 582–608
- `backend/tests/test_cv_template_layouts.py`, `test_moss_wizard_length_skills_and_education_stay_in_sidebar`, lines 358–429

### Harbor two-column template

Harbor is a paid two-column template (`layouts: ["sidebar", "icons"]`) that reproduces the popular "double column" résumé: a wide main column on the left (summary + experience) and a narrower sidebar on the right (education, skills, languages, tools). A single teal accent (`#17A2B8`) carries the role line, company names, tool-list diamonds and filled proficiency dots; everything else is charcoal (`#2B2B2B`/`#3A3A3A`) on white, set in Inter. Grey contact and meta icons (phone, email, a `< >` code mark for a repository link, location, calendar) come from the `harbor` icon theme; the teal diamond bullet comes from the `harbor-accent` variant. A circular photo placeholder (a soft-grey disc plus a centred person glyph) sits in the top-right; users drop their own photo over it in the editor.

Harbor introduces three sidebar widgets not used elsewhere:

- **Skill pills** — bordered rectangles with rounded corners. This required a new `borderRadius` field end-to-end: `PdfElement.borderRadius` (schema), a CSS `border-radius` on the canvas (`Rectangle.jsx`), and ReportLab `roundRect` in the PDF renderer (`renderRectangle`). None/0 keeps square corners, so every existing rectangle is unchanged.
- **Language proficiency dots** — five `circle` primitives per row, filled teal up to the level and outlined grey for the remainder.
- **Tools list** — teal diamond glyph bullets.

The static editor preview and the deterministic AI fill share the same identity. Because the fill uses normalised CV data, generic "other" list sections are folded into `skills` (rendered as pills) while genuine custom sections (certifications, interests, projects) render as diamond lists; languages render as dot rows.

New icon glyphs (`github`, `calendar`, `diamond`) are kept in a separate `EXTRA_ICONS` set and generated only for the two curated Harbor themes, so other icon-theme asset folders stay untouched.

Implementation:

- `frontend/src/templates/harbor.js`, lines 1–251 — static starter spec; `rect` with `borderRadius` (line 48), `skillPills` packer (line 102), `languageRow` dots (line 124), `toolItem` diamonds (line 138), sidebar IIFE (line 144)
- `frontend/src/templates/index.js`, registry entry `harbor` (`tier: "paid"`, `layouts: ["sidebar", "icons"]`, `accent: "#17A2B8"`)
- `backend/app/services/cv_templates/templates/harbor.py`, `_gen_harbor`; `cv_templates/registry.py`, `_GENERATORS["harbor"]`
- `scripts/generate_iconic_icons.py`, `draw_github`/`draw_calendar`/`draw_diamond` (lines 183–213), `EXTRA_ICONS` (line 234), `SUBSET_THEMES` (line 244)
- `backend/app/schemas/pdf_schema.py`, line 85, `borderRadius` field
- `backend/app/services/pdf_generator.py`, `renderRectangle` rounded-corner path (uses `roundRect`); dispatch at line 629
- `frontend/src/components/canvas/Rectangle/Rectangle.jsx`, line 50; `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`, line 122
- `frontend/public/template-mockups/harbor.png`, source-driven A4 preview

Tests:

- `frontend/src/templates/harbor.test.js`, lines 1–67 — two-column origins, rounded pills, teal diamonds, grey icons, proficiency dots, photo placeholder, and Polish-headings assertions
- `backend/tests/test_template_registry_sync.py`, `test_frontend_ids_match_backend_generators` — enforces the frontend/backend id parity that `harbor` now participates in

### Icon-tagged templates and icon reflow

Nova, Ridge, Loom, Volt, Cardinal, and Harbor are individual templates that share the `icons` layout tag (and optionally `sidebar` / `dark`). The same template IDs are generated deterministically by Python. Browser font measurement can change textarea heights, so icon images are explicitly grouped with nearby heading chrome instead of being left at their authored Y coordinate.

Loom contact rows are special-cased: three single-line `text` labels (not an auto-height email textarea) share a 22 px rhythm, with 9 px icons geometrically centred via `alignWithText: false`. The forest sidebar uses the same geometric icon alignment for skills / interests / languages (not the main-column optical shift), packs section bodies by measured height with a constant gap, and keeps every label and bullet list on one text column (`left: 40`). Main-column section headings still use optical alignment (`alignWithText: true`). Iconic experience entries use the same textarea-block stack as project records (`SPACE_STACK` inside a job, `SPACE_RECORD` / 10 px between jobs) so canvas spacing guides stay consistent. The flag is stored in `extra_properties` and restored when a PDF is reopened.

Implementation:

- `frontend/src/templates/iconic.js`, lines 1–386, exports `novaTemplate`, `ridgeTemplate`, `loomTemplate`, `voltTemplate`, and `loomContact`
- `backend/app/services/cv_templates/shared/icons.py` — `_icon`, `_icon_beside`, `_icon_key_for_label`
- `backend/app/services/cv_templates/templates/{nova,ridge,loom,volt,cardinal}.py` — per-template `_gen_*` entry points
- `frontend/src/utils/textareaReflow.js`, functions `isTextAlignedImage`, `isPositionLockedForReflow`, `belongsToFlowLane`, `packGapAfterPageBreak`, `rawSamePageGap`, `remainingRecordHeight`, `avoidOrphanChrome`, `precedingChromeCluster`, `precedingRecordMates`, and `reflowTextareaHeight`
- `frontend/src/components/canvas/Image/Image.jsx`, lines 22–76, functions `isTextAlignedIcon`, `iconicDrawTop`; canvas images use `object-fit: fill` so full-page backgrounds stretch like ReportLab `drawImage` (not `contain`, which letterboxed Rift/Relay PNGs that are 1024×1536)
- `backend/app/services/pdf_generator.py`, lines 141–193, method `PDF_Generator.renderImage`
- `backend/app/crud/pdfs.py` / `backend/app/schemas/pdf_schema.py` — persist `alignWithText` in `extra_properties`

Tests:

- `frontend/src/utils/textareaReflow.test.js`, lines 83–758 — Iconic grouping, explicit Onyx flow roles, keep-heading-with-body, stale-page gaps, chrome rhythm, and non-collapsing record spacing
- `backend/tests/test_pdf_shapes.py`, lines 67–131 — optical alignment, explicit `alignWithText: false`, and alpha-mask regressions
- `backend/tests/test_cv_template_layouts.py`, `test_iconic_templates_pair_contact_and_section_icons` — Loom contact geometry and sidebar column alignment

**Regenerating source-driven mockups.** `frontend/public/template-mockups/{nova,ridge,loom,volt,monument,words,cardinal,harbor}.png` — the previews shown in the Hero template gallery (`frontend/src/pages/Hero/Hero.jsx`), the in-app template picker (`frontend/src/components/modals/TemplatesModal/TemplatesModal.jsx`), and the hover pane in **Wypełnij z mojego CV** (`frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`) — are rendered from the same starter element arrays a user gets when picking the template in the editor, not hand-drawn mockups. Whenever `frontend/src/templates/iconic.js`, `frontend/src/templates/monument.js`, `frontend/src/templates/words.js`, `frontend/src/templates/cardinal.js`, or `frontend/src/templates/harbor.js` changes, regenerate them:

```bash
node --import ./frontend/scripts/register-hook.mjs ./frontend/scripts/dump-iconic-templates.mjs
python scripts/render_iconic_mockups.py           # renders each theme through ReportLab, rasterizes page 1 with PyMuPDF
```

The dump script (`frontend/scripts/dump-iconic-templates.mjs`) needs a small Node ESM loader (`frontend/scripts/resolve-js-ext-hook.mjs`, registered via `frontend/scripts/register-hook.mjs`) because `iconic.js` uses Vite-style extensionless imports (`from "../services/api"`) that plain Node cannot resolve; the hook also stubs `import.meta.env` so the module-level `API_BASE_URL` read does not throw outside Vite. The intermediate JSON is git-ignored — it is always regenerated from `iconic.js`, never edited by hand.

### PDF create / update / autosave / download

Full render on create/update; autosave is elements-only.

Implementation:

- `frontend/src/hooks/usePdfExport.js`, lines 19+, `createPdf` / `updatePdf` / `saveElements`
- `backend/app/api/routes/pdf.py`, `create_user_pdf`, `save_pdf_elements`, `download_pdf`
- `backend/app/services/pdf_generator.py`, class `PDF_Generator`, `render_elements` (line 492+)
- `backend/app/crud/pdfs.py`, `create_new_pdf`, `update_pdf_elements`

### Image upload (validated, private content)

Users upload images for canvas elements. The endpoint treats every part of the
upload as untrusted: it verifies the real raster format from the file's leading
bytes (PNG, JPEG, WEBP, GIF only — SVG is rejected as an inline-script vector),
derives the stored name from a server-generated UUID (so a crafted filename
cannot cause path traversal), caps the body size (bounding memory use), and
enforces a per-user image count. The original filename is stored for display
only and is never used to locate the object. Limits are configurable via
`MAX_UPLOAD_BYTES` (default 8 MB) and `MAX_IMAGES_PER_USER` (default 200).

Bytes are **not** served from a public `/uploads` StaticFiles mount. The gallery
and canvas fetch `GET /images/{id}/content` with a Bearer token and display a
blob URL. Canvas elements persist a stable `/images/{id}/content` `src` plus
`img_id`; PDF export resolves that URL through `document_service.resolve_image_src_for_pdf`.

Implementation:

- `backend/app/utils/upload_security.py`, `sniff_image_type`, `safe_object_name`, `is_safe_path_segment`
- `backend/app/api/routes/images.py`, lines 57–143, `create_upload_image`; lines 167–199, `get_image_content`
- `backend/app/services/document_service.py`, lines 39–66, `resolve_image_src_for_pdf` / `make_image_resolver`
- `frontend/src/services/authenticatedImage.js`, `fetchAuthenticatedImageObjectUrl`
- `frontend/src/components/gallery/Gallery/Gallery.jsx`, `GalleryItem.jsx`, `canvas/Image/Image.jsx`
- `backend/app/crud/images.py`, `create_image`, `count_images_by_user_id`
- `backend/app/core/config.py`, `MAX_UPLOAD_BYTES`, `MAX_IMAGES_PER_USER`
- Deletion is IDOR-checked and blocked while a PDF element still references the image (`delete_user_image`)

Tests: `backend/tests/test_image_upload_security.py` — accepts a real PNG, rejects HTML disguised as PNG (415), neutralises traversal filenames, rejects oversize (413), enforces the per-user count (403), owner-only content GET; `backend/tests/test_document_service.py` — content URL → local path.

### Deterministic template fill

Python layout from normalised `cv_data` (not LLM placement). In every generated template, an education record uses the same semantic colour system as experience: degree in the primary ink, school/city/period in muted metadata colour, and an optional description in the readable body colour. Compact sidebar records intentionally use their own sidebar palette because they occupy a different background panel.

Implementation:

- `backend/app/services/cv_generator_primitives.py`, class `Builder` — `need`, `need_section`, `keep_together` (tags `flowGroup`; re-exported from `cv_generator.py`)
- `backend/tests/test_builder_keep_together.py` — whole-record page-break regression
- `frontend/src/utils/textareaReflow.test.js` — `flowGroup` reclaim / grow keep-together cases
- `backend/app/services/cv_templates/shared/records.py`, `_place_education_record` — distinguishes education metadata from body text; `generate_resume` via `cv_generator` facade
- `backend/app/api/routes/ai.py`, `fill_template`
- `backend/app/services/document_service.py`, lines 69–127, `create_pdf_document`; lines 129–165, `update_pdf_document`
- Docs: [`docs/cv-template-generation.md`](docs/cv-template-generation.md)

Tests: `backend/tests/test_cv_template_layouts.py`, `test_education_description_uses_the_experience_body_color` — verifies all 14 affected generated templates keep education descriptions aligned with the experience body colour.

### Record-style extra sections (projects, references, …)

Custom sections such as projects or references render like experience: a **bold title** per entry and a **nested bullet list** for the description. Flat chip-lists (interests, certifications, languages) stay a single bullet block. Record extras page-break like experience: the generator reserves only the section heading plus the first entry, then moves later entries individually. Requiring the whole block before the break previously pushed projects onto page 2 and left a large empty band under experience.

Normalization in `cv_data` accepts structured items `{title, subtitle?, bullets[]}`, upgrades headings like `PROJEKTY` even when extract sets `kind: "other"`, and regroups flat bullet dumps with a separator heuristic (`—`, `/`, short heading + longer follow-ups). `_extra_sections` is the shared renderer for every template.

Heuristic regroup is deterministic and imperfect; Standard/Premium already pay for AI extract credits — a future optional LLM “structure correction” pass before `generate_resume` can refine ambiguous cases without changing layout code.

Implementation:

- `backend/app/services/cv_data.py`, lines 204–380+, `is_record_section`, `group_flat_items_into_records`, `_normalize_section_items`
- `backend/app/services/cv_templates/shared/extras.py`, `_measure_one_record_height`, `_render_record_section_body`, `_extra_sections`
- `backend/tests/test_cv_template_layouts.py`, `test_record_extra_sections_start_on_page_one_when_first_entry_fits`
- `backend/app/services/ai_service.py`, `extract_cv_data` (line 39+) — extract schema asks for record objects on projects/references
- `frontend/src/utils/bioCvData.js`, `parseSectionItems` — expands records for the wizard textarea
- `frontend/src/components/ai/BioCvModal/BioCvModal.jsx` — kind options include projects/references

Tests:

- `backend/tests/test_cv_data.py`, `test_flat_projects_list_regroups_into_title_and_bullets`, `test_structured_project_records_pass_through`

### CV PDF extract

Vision extract of first pages → structured `cv_data`, including record-shaped `extra_sections` items when the source CV has titled entries with description bullets.

Implementation:

- `backend/app/services/ai_service.py`, `extract_cv_data` (line 39+)
- `backend/app/api/routes/ai.py`, `extract_cv`
- `backend/app/services/cv_data.py`, `normalize_cv_data` (line 585+)

### Template carousel (import, bio wizard, change template)

The same endless-loop `TemplateCarousel` gallery is used after PDF extract (**Wypełnij z mojego CV**), on the bio wizard **Podsumowanie** step, and in **Zmień szablon**. In **Wypełnij z mojego CV**, step 1 and step 2 are exclusive full-body panes (no stacked modal scrollbar); footer arrows between the step label and Anuluj switch steps. Templates appear as individual cards (`name` + short `description` from `TEMPLATES`; registry order via `templateLayouts.js`). There are no industry/style collection chips. Each card shows the template’s A4 mockup and description; hovering or focusing enlarges it in place (`whileHover`/`whileFocus` via Framer Motion). Only five cards render at once (modulo indexing), so prev/next never hits an end. The **Szablony** modal (`TemplatesModal`) renders the same flat grid. Locked (non-Standard) templates stay visible with a **Standard** badge; the currently-filling template shows a spinner. All three flows call the shared `fillTemplate(cvData, templateId)` helper (`POST /ai/fill_template`). Layout tags (`single` / `sidebar` / `icons` / `dark`) stay in code for generators and reflow — they are not product categories.

Implementation:

- `frontend/src/services/fillTemplate.js`, lines 19–34, `fillTemplate`
- `frontend/src/components/ai/AiCvPanel/TemplateCarousel.jsx` — modulo-indexed visible window, optional `selectedId`, arrows, hover-enlarge
- `frontend/src/utils/templateLayouts.js` — registry order, `layouts` helpers, `startIndexForSelectedTemplate`
- `frontend/src/components/modals/TemplatesModal/TemplatesModal.jsx` — flat name/description grid
- `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx` — exclusive step panes (no modal scroll), footer step arrows between the step label and Anuluj, step-2 carousel + `handleFill`
- `frontend/src/components/ai/BioCvModal/BioCvModal.jsx`, lines 486–492, `renderReview` carousel
- `frontend/src/components/editor/Topbar/ChangeTemplateModal.jsx` — restyle via `replaceActiveElements`
- Assets: `frontend/public/template-mockups/{id}.png`

### Change template on the current CV (Topbar)

Once a CV has been filled at least once this session (via PDF import or the bio wizard), the Topbar's **Zmień szablon** button opens a dialog with the same `TemplateCarousel` gallery, so the user can restyle the document without re-uploading a PDF or redoing the wizard. It reuses the exact `cv_data` captured at the last successful fill (`PdfContext.activeCvData`) and calls the same `/ai/fill_template` endpoint. The carousel receives `selectedId={activeTemplateId}`: the current template is labelled **Obecny**, named in the identity header, and becomes the first card in the browsing window so prev/next starts from that choice.

The important difference from the initial fill flows: this one applies the result through `replaceActiveElements` (the raw `handleLoadAiElements` from `useA4Elements`) instead of `loadAiElements`. `loadAiElements` is wrapped in `startFreshDocument`, which clears `pdfId` and starts a brand-new, unsaved project — correct for "create a CV," wrong for "restyle this one." `replaceActiveElements` swaps the canvas elements and template id but leaves `pdfId` and the project title untouched, so the very next autosave updates the *same* saved document instead of creating a duplicate.

`activeCvData` is set only at the moment a fill succeeds (in `AiCvPanel.handleFill` and `BioCvModal.handleFill`) and is cleared whenever the canvas stops representing that data: starting any fresh document (`startFreshDocument` — covers clear/template/AI-load), discarding the active document, or opening a different saved PDF from **Moje dokumenty** (`ModalPdfs.showPDF`, which has no persisted `cv_data` to offer). The Topbar button is disabled with an explanatory tooltip whenever `activeCvData` is null.

Implementation:

- `frontend/src/store/pdfgenerator-context.jsx` — `activeCvData`, `setActiveCvData`, `replaceActiveElements`, `isChangeTemplateModal`, `showChangeTemplateModal` defaults
- `frontend/src/pages/PdfCanvas.jsx` — owns `activeCvData` state and the `'changeTemplate'` dialog slot; `startFreshDocument`/`discardActiveDocument` clear it; exposes `replaceActiveElements: handleLoadAiElements` (raw, no `pdfId` reset)
- `frontend/src/components/editor/Topbar/ChangeTemplateModal.jsx`, `.module.css` — identity summary + `TemplateCarousel` with `selectedId={activeTemplateId}`, `handleChangeTemplate`
- `frontend/src/utils/templateLayouts.js`, `startIndexForSelectedTemplate` — carousel window aligned to the active template
- `frontend/src/components/editor/Topbar/Topbar.jsx` — **Zmień szablon** button, disabled when `activeCvData` is null
- `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`, `frontend/src/components/ai/BioCvModal/BioCvModal.jsx` — `setActiveCvData(...)` on successful fill
- `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx`, `showPDF` — `setActiveCvData(null)` when opening a different saved document

### AI assistant

Standard provides CV and design ratings, role fit, grammar, style, improvements, ATS guidance, and ordinary chat. Premium additionally unlocks **Układ**, the full-canvas geometry session.

The assistant opens as a responsive panel up to 430 px wide, with slightly enlarged interface text for readability. Its composer starts at two lines, grows with the prompt up to 136 px, and then scrolls internally so long commands do not push the conversation out of view. Grammar, style, and improve **correction cards** stay compact in the chat; on pointer hover or keyboard focus they animate open, stack the full **Przed** / **Po** texts vertically, and project subtly beyond their message bubble. The expanded card remains connected to the chat scroll area and scrolls into view, so it cannot flicker, detach, or sit underneath the composer. Leaving the card restores the previous size and position.

Activating **Układ** is a local UI action: the assistant greets the user and shows about ten quiet suggestion chips without calling the API, uploading the canvas, consuming credits, or waking the backend. Each chip shows a short Polish label in the chat, while the fuller geometry prompt is what GPT receives. The first layout request is sent only after the user picks a suggestion or writes and submits a message. A synchronous in-flight guard blocks double-clicks on chips before `isLoading` re-renders, so a second parallel call cannot append a provider error under a successful answer.

**Układ** is a Premium-only, toggleable GPT **geometry corrector**: while active, every question sends a **full multi-page A4 JSON** (`left`/`top`/`width`/`height`/`fontSize`/…). Starting the mode creates a fresh layout-history boundary, so the first analysis cannot repeat a conclusion from ordinary chat or a previous layout session; follow-up questions receive only turns from the active session. `gpt-5.6-luna` groups raw elements itself; Python does not invent per-section gap metrics from freestyle authoring dimensions such as `width: 3`, which are too unreliable for a deterministic grouping heuristic. Instead, every snapshot includes a canonical `layout_contract` with the generator rhythm (`SPACE_STACK=4`, `SPACE_RECORD=10`, `SPACE_SECTION=21`, `SPACE_AFTER_RULE=8`, `SPACE_AFTER_MASTHEAD=32` under solid header bands, `SPACE_AFTER_HEADER_RULE=36` under thin masthead dividers) and the same under-header gap band (6–10 px, target 6). Elements that carry template `flowRole` expose that role in the snapshot so chrome can be distinguished from body text. When the editor knows the active template slug (template picker, AI fill, bio wizard), the request also sends optional `template_id` for a short layout hint; freestyle or reopened documents may omit it and still analyse correctly. Both `text` and `textarea` are explicitly textual—generated experience and education records commonly use `textarea`. The frontend normally records the live DOM box in `layout_bounds`. If a visible single-line `<p>` has a collapsed box, `measureElements` falls back to browser `Range` glyph width and a font-size line box, reporting `bounds_measurement_source`; unmounted pages remain explicitly estimated with `bounds_estimate_reason`. The model sees compact sequential references (`e1`, `e2`, …), while private canvas IDs remain server-side; Python resolves valid references after the response and rejects invented ones. Every snapshot also contains precomputed `right` and `bottom`, so the model does not recalculate `left + width` or `top + height`. A single-line `text` element is normalized to at least its `fontSize` because `Text.jsx` renders it as `<p>` with `line-height: 1`; this prevents absent or near-zero stored heights from collapsing `bottom` onto `top`. The original value remains available as diagnostic `measuredHeight`. Separate `<p>` nodes aligned on the same top axis—typically a job/degree title on the left and its date on the right—are exposed as one authoritative `text_rows` row with `row_top`, `row_bottom`, and peer references. `effectiveLineHeight` therefore reflects the rendered line box even when stored `lineHeight` is null or zero. Before proposing corrections, the model must return `section_inventory`, assigning every textual reference exactly once to a section and logical block. Known decorative refs accidentally included as members are ignored for textual coverage, while genuinely unknown or duplicate refs still reject the response. If the model omits one or more text/textarea ids that are **not** part of any proposed move, the compiler soft-completes the inventory by parking those ids under `INNE / NIEPRZYPISANE` / `unassigned` and keeps the reply (with a mild Polish warning). Hard rejection (`incomplete_text_inventory`) remains only when an omitted text id appears in a move — that would risk splitting a logical block. A block-scoped move is also rejected unless every textual member receives the same delta; this prevents a title/date from moving while its company, description, or bullets stay behind. The high-reasoning layout prompt treats top-to-top only as diagnostic and bases analysis on the real bottom-edge gap. It prefers `layout_contract` spacing over inventing a new rhythm when peers already match the generator values. Under-header spacing targets about **6 px** (allowed 6–10 px). A `real_gap` near 0 px means body text sits on the heading line box and is treated as too tight, not “safe”. When peer section gaps differ by more than 2 px, the model must standardize them to one shared positive rhythm—prefer expanding tight gaps downward rather than collapsing a larger gap to 0. Section-gap changes carry structured before/after metrics; the Python compiler rejects any `section_header_gap` whose `real_gap_after` falls below 6 px. The endpoint returns `status` + Polish `summary` + optional `changes[]`, compiled to previewable `layout_groups`. Legacy `findings[].moves` still works without the new inventory contract. Deselect **Układ** to leave the mode. Chat `position_operation` resolvers remain for freeform edit commands. **Projekt** (`design_rating`) uses `summarize_geometry_issues` for geometry score caps.

Layout explanations shown to users are deliberately plain Polish: they name the visible section and the improvement, rather than internal references, coordinates, formulas, or JSON fields. The compiler replaces leaked technical copy with a short fallback and returns warnings only when a safe proposal cannot be created, so the card explanation is not duplicated underneath it.

**Projekt** assesses typography, hierarchy, colour consistency, emphasis, and text alignment. It does not send or display a geometry report, and intentional small template labels are not a penalty. The largest editable one-line identity element is marked as `primary_identity`: its distinct typeface, size, and weight are intentional template contrast and cannot be rewritten or scored as inconsistent. When there are no structural faults and no concrete, editable typography correction remains, the displayed score has an **8/10** baseline rather than an unsupported low score. The backend still checks for unreadable structural faults privately; any collision, clipped textarea, line through text, or element outside the page caps the displayed score at **5/10**, without exposing diagnostic counts in this assessment. Page-fixed or locked background images, rules, and rectangles are treated as template chrome rather than CV content, so their intentional overlap cannot lower the score.

Layout calls use **`gpt-5.6-luna`** by default (`AI_LAYOUT_MODEL`) with **`reasoning_effort=high`** (`AI_LAYOUT_REASONING_EFFORT` — Luna’s maximum supported effort; `none`/`low`/`medium`/`high`) and OpenAI **Fast mode** (`service_tier=fast` via `AI_LAYOUT_SERVICE_TIER`, default **fast**; `"priority"` is equivalent). Fast mode is metered at the published Luna Fast rates (**USD 0.20 / 1.20 → 0.40 / 2.40** per 1M input/output tokens — 2× Standard). A larger completion budget (`AI_LAYOUT_MAX_COMPLETION_TOKENS`, default **48000**) covers remaining reasoning headroom; empty layout responses return an actionable Polish tip to retry a narrower request. Other assistant actions stay on **`gpt-5.4-mini`** (`AI_ASSISTANT_MODEL`) at Standard processing. Costs come from `openai_pricing.py` (USD list prices → PLN via `USD_TO_PLN`, default 4.0). **1 AI credit = 5 groszy (0.05 PLN)**; each successful call charges `max(1, ceil(cost_pln / 0.05))` from the selected model's estimated input/output token cost (including Fast tier when used) and returns `usage.credits_charged` plus `usage.service_tier`.

Implementation:

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, lines 41–155, `LAYOUT_MODE_GREETING` / `LAYOUT_SUGGESTIONS` — short chat labels with fuller GPT geometry prompts
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, lines 185–262, `CorrectionCard` — stable Przed/Po correction review expansion
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, lines 661–1301, component `AiAssistant` — Premium upgrade path for Układ, local greeting with suggestion chips, deferred request, optional `template_id`, layout-session history boundary, review cards, and composer
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, lines 700–708 and 1274–1293 — auto-growing two-line chat composer
- `frontend/src/hooks/useA4Elements.js`, `activeTemplateId` — tracks the last loaded template slug for Layout AI
- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js`, lines 5–35 — layout activation stays local; suggestion chips send fuller prompts with short display labels
- `frontend/src/components/ai/AiAssistant/AiAssistant.module.css`, lines 42–57, 308–361, 401–450, 488–736, and 903–950 — panel width, layout suggestion chips, scroll-safe correction expansion, and composer sizing
- `frontend/src/utils/elementBounds.js`, lines 6–58 (`getCanvasMeasurement`, `getTextRangeRect`) and 140–207 (`measureElements`) — `layout_bounds`, `content_height`, `clipped`, measurement source and estimation reason
- `backend/app/api/routes/ai_assistant.py`, `AssistantRequest.template_id`, `ai_assistant` (action `layout`), `TokenUsage`
- `backend/app/services/ai_assistant_service.py`, lines 158–227, `_primary_identity_id`, `_extract_typography`, and `_protected_typography_ids` — protects intentional name styling; lines 390–493, `_rate_design` — template-respecting visual rating, 8/10 no-correction baseline, and private 5/10 safety cap; lines 1071–1171, `_layout_session` — snapshot with `layout_contract` + UI-ready plain-language summary; plus `_model_for_action`, `_chat`
- `backend/app/services/layout_gpt.py`, lines 38–656 (`SECTION_HEADER_GAP_*`, `_build_layout_contract`, `_can_share_text_row`, `_build_text_rows`, `_build_layout_snapshot_data`, `build_layout_snapshot`, `build_layout_user_prompt`), 694–762 (`_resolve_model_references`), 763–853 (plain-language copy guard), 926–973 (`_parse_section_inventory`), 975–1017 (`_moved_element_ids_from_payload`, `_assign_missing_text_to_unassigned`), 1020–1164 (`_affected_text_ids`, `_changes_to_findings`, `_collapses_below_min_section_gap`), and 1234–1549 (`compile_layout_gpt_response`, including inventory soft-complete)
- `backend/app/services/layout_analysis.py`, `resolve_directed_operation`; lines 868–940, `_is_static_template_chrome` and `summarize_geometry_issues` — ignores page-fixed and locked template chrome in the private design-score cap
- `backend/app/services/openai_pricing.py`, `usage_from_response`, `estimate_cost_usd`

Tests: `backend/tests/test_layout_gpt.py`, lines 78–103 (`test_snapshot_includes_layout_contract_and_flow_role`), 105–137 (`test_user_prompt_includes_corrector_contract`), 139–152 (`test_user_prompt_standardizes_positive_section_header_gaps`), 168–230 (row grouping and text-height regressions), 336–364 (`test_compile_replaces_technical_layout_copy_with_plain_polish`), 365–399 (`test_compile_rejects_collapsing_section_header_gap_to_zero`), 400–435 (`test_compile_allows_standardizing_section_header_gap_to_target`), 522–615 (inventory soft-complete and hard-reject when an omitted text id is moved), plus the remaining inventory and compiler tests in the same module; `backend/tests/test_ai_chat_command.py`, lines 612–841 (template-font policy, protected primary identity, private score cap, and page-fixed background regression); also `test_openai_pricing.py`, `test_ai_credits.py`, and `test_layout_analysis.py`.

### Entitlements / plans

Gates projects, exports, AI, templates. Standard permits the content-focused assistant actions; `layout` is Premium-only and returns a structured `plan_feature_ai_layout` upgrade response for lower plans. AI credits: **1 credit = 0.05 PLN (5 groszy)**; charged from each call’s `cost_pln_estimate`.

Implementation:

- `backend/app/services/entitlements.py`, `CREDIT_PLN`, `PREMIUM_ONLY_AI_ACTIONS`, `assert_can_use_ai_action`, `get_entitlements`, `assert_can_export`, `charge_ai_credits`
- `backend/app/api/routes/billing.py`, `get_plans`, `select_plan`
- `frontend/src/hooks/useEntitlements.js`

### Auth

Register, OAuth2 password token, JWT Bearer, entitlements probe. Registration
rejects duplicate usernames and duplicate emails with an actionable HTTP 400
(the email pre-check avoids a raw database uniqueness 500), and the email is
format-checked and trimmed before it reaches the database.

Implementation:

- `backend/app/api/routes/auth.py`, `register_user` — username + email uniqueness
- `backend/app/schemas/user_schema.py`, `UserCreateRequest` — email format validator
- `backend/app/crud/user.py`, `get_user_by_email`
- `backend/app/core/security.py` — bcrypt 72-byte truncate, JWT

### Decorative chrome lock

`fixedToPage` elements are non-interactive in the editor.

Implementation:

- `frontend/src/utils/elementInteraction.js`, `isDecorativeChrome`
- Guards in `useA4Elements` select/move/delete; canvas components use `pointer-events: none`

---

## API

Base URL: `VITE_API_URL` (frontend) / deployed backend. Auth: `Authorization: Bearer <jwt>` unless noted. Polish `detail` strings are returned to the UI.

| Method | Path | Auth | Purpose | Handler |
|--------|------|------|---------|---------|
| GET | `/health` | no | Liveness / dyno wake | `health` in `main.py` |
| POST | `/auth/register` | no | Create user (+ plan) | `register_user` |
| POST | `/auth/token` | no | OAuth2 password → JWT | `login_for_acess_token` |
| GET | `/auth/verify-token/{token}` | token in path | Validity check | `verify_user_token` |
| GET | `/auth/me/entitlements` | yes | Plan limits for UI | `me_entitlements` |
| POST | `/pdf/create_pdf` | yes | Create doc + render PDF | `create_user_pdf` |
| GET | `/pdf/fetch_pdfs` | yes | List docs | `fetch_user_pdfs` |
| POST | `/pdf/show_pdf` | yes | Load elements (body: pdf id) | `show_user_pdf` |
| PUT | `/pdf/update_pdf` | yes | Save + re-render | `update_user_pdf` |
| PUT | `/pdf/save_elements` | yes | Autosave elements only | `save_pdf_elements` |
| DELETE | `/pdf/delete_pdf` | yes | Delete owned doc | `delete_user_pdf` |
| POST | `/pdf/download_pdf` | yes | Export URL/row + meter | `download_pdf` |
| POST | `/images/upload_image` | yes | Multipart image | `create_upload_image` |
| GET | `/images/fetch_images` | yes | List images | `fetch_user_images` |
| GET | `/images/{img_id}/content` | yes | Private image bytes (owner only) | `get_image_content` |
| DELETE | `/images/delete_image` | yes | Delete if unused | `delete_user_image` |
| POST | `/ai/extract_cv` | yes | PDF → cv_data | `extract_cv` |
| POST | `/ai/fill_template` | yes | cv_data + template → elements | `fill_template` |
| GET/PUT/DELETE | `/ai/bio_cv_draft` | yes | Private draft | bio draft routes |
| POST | `/ai/assistant` | yes | Assistant actions | `ai_assistant` |
| GET | `/billing/plans` | yes | Plan catalog | `get_plans` |
| POST | `/billing/select-plan` | yes | Activate plan | `select_plan` |
| POST | `/events/log` | yes | Product metrics log | `log_event` |

**Ownership:** PDF/image by-id routes use IDOR checks (`_require_owned_pdf` in `pdf.py`).

Example login (form body):

```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

username=demo&password=secret
```

Example autosave body shape: `{ "pdf_id", "pdf_title", "root": [PdfElement...], "pages", "page_width", "page_height" }` — see `backend/app/schemas/pdf_schema.py`.

---

## Installation and local development

### Requirements

- Node.js 20+ recommended (Vite 7)
- Python 3.11+ recommended
- Optional: PostgreSQL; otherwise SQLite file is fine
- Optional: OpenAI API key for AI routes

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env   # or cp on Unix — then edit secrets
```

Run API (from `backend/` so `app` imports resolve):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

OpenAPI docs: `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env   # set VITE_API_URL=http://localhost:8000
npm run dev
```

App: `http://localhost:5173`.

### Environment variables

#### Backend (see `backend/.env.example` + `app/core/config.py`)

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `SECRET_KEY` | yes (prod) | JWT signing | long random string |
| `ALGORITHM` | yes | JWT alg | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Token lifetime (default 7 days) | `10080` |
| `DATABASE_URL` | no | DB URL (default SQLite file) | `sqlite:///./pdfgenerator.db` |
| `CORS_ORIGINS` | no | Comma-separated origins | `http://localhost:5173` |
| `BACKEND_URL` | no | Public API base for links | `http://localhost:8000` |
| `API_GPT_KEY` | for AI | OpenAI API key | `sk-...` |
| `AI_ASSISTANT_MODEL` | no | Default assistant model (non-layout) | `gpt-5.4-mini` |
| `AI_LAYOUT_MODEL` | no | Model for **Układ** (`action=layout`) | `gpt-5.6-luna` |
| `AI_LAYOUT_REASONING_EFFORT` | no | Layout reasoning effort (Luna max: `high`) | `high` |
| `AI_LAYOUT_SERVICE_TIER` | no | Layout Fast mode (`fast`/`priority`) or `default` | `fast` |
| `AI_LAYOUT_MAX_COMPLETION_TOKENS` | no | Layout completion budget incl. reasoning | `48000` |
| `USD_TO_PLN` | no | FX used for credit metering | `4.0` |
| `S3_BUCKET_NAME` | no | Enable S3 when set | bucket name |
| `AWS_REGION` / keys | with S3 | AWS credentials | — |
| `ALLOW_UNPAID_PLAN_SELECTION` | no | Allow activating paid plans without Stripe (`false` default; set `true` locally pre-Stripe) | `true` (local) |
| `ADMIN_RESET_SECRET` | for admin reset | Dedicated secret for `POST /billing/admin/reset-ai-credits` (does **not** fall back to `SECRET_KEY`) | long random string |
| `ALLOW_INSECURE_SECRET` | no | Local throwaway only: skip strong `SECRET_KEY` boot check | `true` |
| `MAX_UPLOAD_BYTES` | no | Max image upload size in bytes (default 8 MB) | `8388608` |
| `MAX_IMAGES_PER_USER` | no | Max stored images per user (default 200) | `200` |

#### Frontend

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `VITE_API_URL` | recommended | API origin, no trailing slash | `http://localhost:8000` |

Never commit real secrets.

### Scripts

| Area | Command | Notes |
|------|---------|--------|
| Frontend dev | `npm run dev` | Vite |
| Frontend build | `npm run build` | Output `frontend/dist` |
| Frontend lint | `npm run lint` | ESLint |
| Frontend unit tests | `npm test` | From `frontend/`; Node built-in test runner |
| Backend tests | `python -m unittest discover -s tests` | from `backend/` |
| Export element schema | `python -m app.schemas.export_pdf_element_schema` | Writes `shared/pdf-element.schema.json` |
| Alembic upgrade | `alembic upgrade head` | from `backend/` |
| CI | GitHub Actions `.github/workflows/ci.yml` | Backend unittest + frontend `npm test` on PR/push |

### Troubleshooting

- **Login “Failed to fetch” on Render:** free dyno cold start. Frontend uses long timeouts + retries and `wakeBackend()`; `/health` must answer while DB init runs in background (`main.py` lifespan).
- **Asystent AI / Układ “trwa uruchamianie” or timeout:** AI calls wake the dyno, retry network blips (not client timeouts), and use longer waits (`layout` up to 240s for `gpt-5.6-luna`). A timeout message means the client aborted — retry once; if it persists, check Render logs for OpenAI errors.
- **AI 500 with Polish message:** check `API_GPT_KEY` and server logs (`AIServiceError` handler).
- **Fonts look wrong in PDF:** bold/italic TTFs are remapped via fontTools in `pdf_generator.py` — do not replace fonts without re-testing Polish glyphs.

---

## Testing

- **Framework:** Python `unittest` under `backend/tests/`.
- **Coverage focus:** image upload security (format sniffing, traversal, size/count limits, owner-only content), PDF ownership IDOR, export metering HTTP, Free extract rejection, PdfElement schema contract (`shared/pdf-element.schema.json`), layout analysis safety, AI chat/command sanitisation, entitlements, template registry sync (frontend `TEMPLATES` ↔ `_GENERATORS` ↔ `FREE_STARTER_TEMPLATE_IDS`), PDF element upsert/`fixedToPage`, CV data normalisation, bullet layout, Unicode fonts.
- **Run:** `cd backend && python -m unittest discover -s tests`.
- **Frontend:** ESLint via `npm run lint`; unit tests via `cd frontend && npm test` (Node built-in runner).
- **CI:** `.github/workflows/ci.yml` runs both suites on push/PR.

---

## Deployment

Typical production split (as used with Render):

- **Backend service** — Uvicorn / FastAPI, Postgres, env vars above, optional S3.
- **Frontend static** — `npm run build`, host `frontend/dist` (or co-host via `main.py` SPA fallback when `frontend/dist` exists next to the backend tree).

Cold-start behaviour is intentional: DB init is deferred so `/health` stays fast.

Migrations: `create_all` + Alembic (`backend/alembic/`) on startup.

CI/CD: configure in your host (Render dashboards / GitHub Actions) — no committed workflow is required by this README.

---

## Security and privacy

- Passwords: bcrypt; inputs truncated to 72 bytes consistently (`security.py`).
- Sessions: JWT Bearer; username in `sub`.
- Authorisation: ownership checks on PDF/image mutations; plan gates on create/export/AI/templates.
- CORS: explicit origin allowlist (`CORS_ORIGINS`).
- Uploads: format verified from file bytes (PNG/JPEG/WEBP/GIF; SVG rejected), stored under server-generated names (no path traversal), size-capped (`MAX_UPLOAD_BYTES`) and count-limited per user (`MAX_IMAGES_PER_USER`); images owned by user; delete blocked while referenced by a PDF element; bytes served only via ownership-checked `GET /images/{id}/content` (no public `/uploads` mount) (`upload_security.py`, `images.py`).
- Registration: duplicate username/email rejected with 400; email format-validated (`auth.py`, `user_schema.py`).
- AI: provider errors mapped to generic Polish 500; details stay in logs.
- Metrics: `/events/log` logs numeric `user_id`, not raw usernames (`metrics_logging.py`).
- Secrets: env only; never in README or git.

This does not claim SOC2/compliance — it documents controls that exist in code.

---

## Accessibility and UX

- Dialogs use `DialogShell` (Escape to close, backdrop, titled header). Large surfaces (`PlanSelectModal`, `TemplatesModal`, `BioCvModal` form steps) share a 1280px shell with `radius={2}`; fill/summary galleries widen to 1400px (`AiCvPanel`, `BioCvModal` review, `ChangeTemplateModal`). Narrower dialogs (docs library, dropzone) keep compact widths and the default 8px radius.
- Docked panels use `PanelShell`.
- Forms expose labels/icons; plan radios use `role="radiogroup"`.
- Loading: PDF spinner minimum display time; toasts via `useToasts` / `ToastStack`.
- Empty docs library returns a clear Polish 404 message prompting create.
- Canvas zoom is view-only so export size stays document-true.

Gaps: not a full WCAG audit; continue improving focus traps and contrast where needed.

---

## Known limitations and planned work

See [`BUGZ.MD`](BUGZ.MD) and [`TODOS.md`](TODOS.md).

Notable product facts:

- Stripe Checkout not fully wired; unpaid plan selection is a temporary gate.
- Render free tier sleeps — expect cold starts.
- Layout AI proposes; `layout_analysis` owns safe coordinates. Overlaps/clips produce critical repair groups before cosmetic alignment.
- Design rating must not punish intentional small template fonts (prompt + filters in `_rate_design`), but must cap the score when geometry reports overlaps, clipped textareas, rules through text, or out-of-bounds boxes.

---

## Further reading

- [React documentation](https://react.dev/) — components, hooks, rendering.
- [FastAPI documentation](https://fastapi.tiangolo.com/) — routes, dependencies, OpenAPI.
- [SQLAlchemy 2.x documentation](https://docs.sqlalchemy.org/) — ORM sessions and models.
- [ReportLab user guide](https://www.reportlab.com/docs/reportlab-userguide.pdf) — PDF canvas drawing.
- [OpenAI platform docs](https://platform.openai.com/docs) — chat and vision APIs.
- [Vite guide](https://vite.dev/guide/) — frontend tooling.
- Project: [`CANVA.md`](CANVA.md), [`CV_GENERATOR.md`](CV_GENERATOR.md) (layperson CV generation guide), [`PROMPTS.md`](PROMPTS.md) (all AI prompts with line references), [`docs/cv-template-generation.md`](docs/cv-template-generation.md), [`docs/FEATURES.md`](docs/FEATURES.md), [`docs/designs/cv-only-ux-monetization.md`](docs/designs/cv-only-ux-monetization.md).

---

# Polski

# CV Studio

CV Studio to polski edytor CV na A4: płótno WYSIWYG, 25 indywidualnych szablonów (każdy z własną nazwą i krótkim opisem stylistycznym), import PDF przez AI, kreator bio, pływający asystent AI oraz eksport PDF w ReportLab zgodny z kanwą 1:1 (współrzędne w punktach, początek układu lewy-górny na froncie, odwrócenie Y w ReportLab).

Ten README to wejście techniczne dla programistów. Obszerne, napisane dla początkujących wyjaśnienie współrzędnych canvasu, interakcji React, deterministycznego layoutu Python, roli AI, reflow, zapisu i eksportu ReportLab znajduje się w [`CANVA.md`](CANVA.md). Wszystkie prompty AI (treść, zmienne, numery linii): [`PROMPTS.md`](PROMPTS.md). Opis produktowy funkcji: [`docs/FEATURES.md`](docs/FEATURES.md). Brief marketingowy pod sekcję „Dlaczego CV STUDIO” na stronie (funkcje + pozycjonowanie względem rynku, bez nazw marek konkurencji w copy publicznym): [`FEATURES_MARKETING.md`](FEATURES_MARKETING.md). Generowanie szablonów (AI extract vs layout w Pythonie): [`docs/cv-template-generation.md`](docs/cv-template-generation.md). Przystępny, kompletny przewodnik Frontend + Backend (ścieżki, pliki, klasy, funkcje): [`CV_GENERATOR.md`](CV_GENERATOR.md).

---

## Spis treści

1. [Cel i problem](#cel-i-problem)
2. [Główne przepływy użytkownika](#główne-przepływy-użytkownika)
3. [Architektura i przepływ danych](#architektura-i-przepływ-danych)
4. [Technologie](#technologie-1)
5. [Struktura katalogów](#struktura-katalogów)
6. [Baza danych](#baza-danych)
7. [Funkcje (mapa implementacji)](#funkcje-mapa-implementacji)
8. [API](#api-1)
9. [Instalacja i rozwój lokalny](#instalacja-i-rozwój-lokalny)
10. [Testy](#testy)
11. [Wdrożenie](#wdrożenie)
12. [Bezpieczeństwo i prywatność](#bezpieczeństwo-i-prywatność)
13. [Dostępność i UX](#dostępność-i-ux)
14. [Ograniczenia i plany](#ograniczenia-i-plany)
15. [Dalsza lektura](#dalsza-lektura)

---

## Cel i problem

Kandydaci potrzebują CV, które wygląda profesjonalnie i eksportuje się do PDF bez niespodzianek. Formularze ukrywają układ; ciężkie narzędzia graficzne są nadmiarem. CV Studio daje prawdziwe płótno A4 (595×842 pt), szablony z danymi kariery oraz AI, które wyciąga lub poprawia treść bez wymyślania niebezpiecznych pozycji dla dekoracji szablonu.

**Zaimplementowane:** edytor, szablony, extract/fill, szkic bio, asystent AI, entitlements (Free / Standard / Premium), autozapis, dysk lokalny lub S3, JWT.

**Opcjonalne:** S3 (`S3_BUCKET_NAME`), wybór planu bez płatności (`ALLOW_UNPAID_PLAN_SELECTION`).

**Jeszcze nie jako pełny Stripe Checkout:** płatne plany można aktywować bez karty, gdy flaga na to pozwala; odpowiedź `402 payment_required` to miejsce pod przyszły Checkout.

---

## Główne przepływy użytkownika

1. **Wybór startu na stronie głównej** → „Wgraj moje CV” (`start=import`) albo „Stwórz CV od początku” (`start=wizard`).
2. **Rejestracja / logowanie** → JWT w `localStorage` → wybrany parametr `start` przechodzi przez uwierzytelnienie i otwiera właściwy dialog edytora.
3. **Wybór szablonu** → `handleLoadTemplate` materializuje elementy → płótno.
4. **Import PDF** → `POST /ai/extract_cv` → szablon → `POST /ai/fill_template` → layout w `cv_generator.generate_resume`.
5. **Kreator bio** → CRUD `/ai/bio_cv_draft` → wypełnienie szablonu.
6. **Edycja** → przeciąganie / styl → debounced `PUT /pdf/save_elements`.
7. **Asystent AI** → `POST /ai/assistant` → wskazówki / poprawki / karty układu do akceptacji.
8. **Eksport** → create/update PDF → `POST /pdf/download_pdf` (naliczany limit eksportów).

```mermaid
flowchart LR
    Browser[Edytor React] -->|JWT + JSON| API[FastAPI]
    API --> Auth[auth / entitlements]
    API --> Canvas[CRUD PDF + autozapis]
    API --> AI[extract / fill / asystent]
    API --> DB[(SQLite lub Postgres)]
    API --> Files[dysk lub S3]
    API --> OpenAI[OpenAI API]
    Canvas --> ReportLab[PDF ReportLab]
```

---

## Architektura i przepływ danych

### Punkty wejścia

| Warstwa | Wejście | Rola |
|---------|---------|------|
| Frontend | `frontend/src/main.jsx` → `App.jsx` | Routing: `/`, `/login`, `/register`, chronione `/pdfcanvas` |
| Edytor | `frontend/src/pages/PdfCanvas.jsx` (`PdfCanvas`) | Canvas / UiSurfaces / Session (+ fasada `PdfContext`) |
| Backend | `backend/app/main.py` | FastAPI, CORS, `/health`, routery, opcjonalny SPA |

### Warstwy frontendu

- **Pages** — marketing, auth, edytor.
- **Hooks** — `useA4Elements` (fasada), `useDocumentHistory`, `useElementSelectionDrag`, `usePdfExport`, `useEntitlements`; fabryki / `materializeElementSpecs` / `canvasElementSchema` w utils.
- **Context** — zagnieżdżone `CanvasContext` / `UiSurfacesContext` / `SessionContext` + tymczasowa fasada `PdfContext`.
- **Services** — `ApiClient` z długim timeoutem i retry (cold start Render); `fillTemplate`; `authenticatedImage`.
- **Templates** — specyfikacje w `frontend/src/templates/`.

### Warstwy backendu

- **Routes** — `app/api/routes/*` (PDF create/update przez `document_service`)
- **CRUD** — `app/crud/*`
- **Services** — PDF, `cv_generator` + `cv_templates/`, AI, entitlements, S3
- **Models** — `app/models/models.py`; migracje Alembic w `backend/alembic/`

### Współrzędne

Kanwa: początek **lewy-górny**. ReportLab: **lewy-dolny**; `PDF_Generator` odwraca `top` przez `page_h`. Soft-wrap textarea używa tych samych reguł łamania co kanwa oraz 2 px `WRAP_WIDTH_TOLERANCE_PX`, żeby graniczne ostatnie słowa (ciasne linie Inter) zostawały w PDF w tej samej linii co na kanwie — zob. `tests/test_pdf_bullet_layout.py`.

### Reflow automatycznej wysokości i wyrównanie ikon

Pola tekstowe szablonów zaczynają z projektową wysokością zastępczą, a po załadowaniu właściwych fontów przeglądarka mierzy ich naturalną wysokość. `reflowTextareaHeight` przesuwa następnie wszystkie dalsze elementy w tej samej kolumnie o zmierzoną różnicę. Obrazy Iconic wyrównane do tekstu (`alignWithText: true`, również starsze adresy `/template-assets/iconic/`) są traktowane jak część nagłówka sekcji i mogą dołączyć do kolumny, gdy wiszą po jej lewej stronie (szyna Ridge, ok. 40 px). Ikony leżące całkowicie na prawo od wąskiej kolumny są wykluczane, więc sidebar Loom nie odciąga ikon głównej kolumny od nagłówków.

Historia cofnij/ponów traktuje ten reflow po załadowaniu jako **stan bazowy**, nie jako edycję użytkownika: `markHistoryQuiet` w `useA4Elements` aktualizuje bieżący wpis historii w miejscu, więc Cofnij pozostaje nieaktywne, dopóki użytkownik realnie nie zmieni dokumentu. Inaczej Undo przywracałoby wysokości sprzed pomiaru i nierówne odstępy Y (np. dyplom → uczelnia).

Każde pole tekstowe z automatyczną wysokością mierzy się dwukrotnie — od razu i ponownie po `document.fonts.ready` — a każdy pomiar osobno wywołuje `reflowTextareaHeight`, więc późniejsze pole może chwilowo nosić nieaktualny numer `page` z wcześniejszego przebiegu. `rawSamePageGap` sprawdza projektowe wartości `top` (ignorując `page`) przed użyciem ogólnego odstępu page-break: para z jednego rekordu ze stale `page` zachowuje swój mały odstęp, a prawdziwy szew między stronami używa `DEFAULT_PACK_GAP` (10 px, `SPACE_RECORD`) dla zwykłych bloków oraz `SECTION_PACK_GAP` (21 px, `SPACE_SECTION`) dla chrome sekcji. Użycie pozostałego insetu od góry strony (często 0–6 px, gdy edukacja startuje blisko `pageTop` na stronie 2) zgniatało nagłówki takie jak WYKSZTAŁCENIE pod poprzednią sekcją. Szablony IT oznaczają markery/linie sekcji jako `locked` (interakcja i prowadnice), ale `flowRole: "section-chrome"` nadal pozwala im jechać z nagłówkiem w reflow, żeby podkreślenia nie zostawały na następnej stronie. Reflow celowo **nie** zgaduje relacji tytuł/meta na podstawie rozmiaru lub pogrubienia fontu — ta heurystyka deformowała poprawny rytm rekordów Onyx i kumulowała delty niezależnych pomiarów. Onyx i IT oznaczają marker/etykietę/linię sekcji jako `section-chrome`, a zwykłe rekordy jako `content`. Logika keep-with-next nie może więc pomylić tytułu stanowiska z nagłówkiem sekcji i przenieść właściwego nagłówka za jego treść. Starsze szablony bez tej właściwości zachowują fallback oparty na kategorii.

W czasie enter-hold reflow auto-height jest wstrzymany i wraca po gotowości fontów. Każda textarea z generatorów Pythona ma `preserveInitialLayout: true` (przez `_block` w `cv_generator_primitives.py`). Przy pierwszym montażu canvas może **zmniejszyć** box do `scrollHeight` przeglądarki, gdy ReportLab zawyży wysokość (żeby pusta przestrzeń nie psuła wizualnych odstępów sekcji), ale nie **powiększa** go — niezależny growth nadal psuje rytm. Edycja treści lub późniejsza zmiana typografii/szerokości nadal uruchamia normalny auto-height reflow. Zobacz `textareaHeight.test.js` (`shouldShrinkPreservedLayout`) oraz packing w `textareaReflow.test.js`.

Nagłówki sekcji zostają z pierwszym blokiem treści przy podziale strony: `avoidOrphanChrome` rezerwuje pełną wysokość pierwszego rekordu keep-together (stopień + meta + opis, nie tylko pierwsze pole), a gdy zmierzone pole treści samo skacze na następną stronę, `precedingRecordMates` + `precedingChromeCluster` zabierają ze sobą rodzeństwo tytułu/meta oraz ikonę, nagłówek i linię. Dzięki temu nie powstają sieroty w stylu samego „UMIEJĘTNOŚCI” na dole strony 1 ani rozcięcie edukacji, gdzie Bachelor zostawał na stronie 1, a opis na stronie 2. Generatory backendu stosują `Builder.need_section(chrome, body)` przed nagłówkiem oraz `Builder.keep_together(height)` dla wpisów doświadczenia/edukacji — każdy element z kontekstu dostaje to samo `flowGroup`, żeby reclaim-packing na kanwie (gdy wcześniejsze boxy się kurczą) nie ściągał tylko części rekordu na poprzednią stronę. Sekcja może iść na kolejną stronę, ale każdy rekord zostaje w całości. ReportLab dostaje tę samą geometrię, którą widać na kanwie.

### Dekoracje szablonu

Elementy z `fixedToPage: true` — tła, ramki, sidebary, numery stron — są domyślnie klonowane na kolejne strony i nie można ich zaznaczać, przesuwać ani usuwać w UI (`isDecorativeChrome`). Dekoracje przeznaczone wyłącznie dla pierwszej strony ustawiają `repeatOnContinuation: false`, dzięki czemu `cloneFixedPageDecorations` nie kopiuje ich po utworzeniu nowej strony przez overflow. Ocena „Projekt” respektuje typografię szablonu.

---

## Technologie

| Technologia | Wersja / uwaga | Rola | Główne miejsca |
|-------------|----------------|------|----------------|
| React | ^19.2 | UI | `frontend/src/` |
| Vite | ^7.2 | Build / dev | `frontend/` |
| React Router | ^7.13 | Trasy + `ProtectedRoute` | `App.jsx` |
| FastAPI | requirements | API HTTP | `main.py`, routes |
| Uvicorn | requirements | Serwer ASGI | lokalnie / Render |
| SQLAlchemy | requirements | ORM | `models/`, `crud/` |
| SQLite / PostgreSQL | `DATABASE_URL` | Persistencja | `database.py` |
| ReportLab + fontTools | requirements | PDF + fonty | `pdf_generator.py` |
| PyMuPDF | requirements | PDF → obrazki (extract) | `ai_service.py` |
| OpenAI SDK | requirements | Extract + asystent | serwisy AI |
| python-jose / bcrypt | requirements | JWT + hasła | `security.py` |
| boto3 | opcjonalnie | S3 | `s3_storage.py` |
| unittest | stdlib | Testy backendu | `backend/tests/` |

Dokumentacja oficjalna: [React](https://react.dev/), [Vite](https://vite.dev/), [FastAPI](https://fastapi.tiangolo.com/), [SQLAlchemy](https://docs.sqlalchemy.org/), [ReportLab](https://www.reportlab.com/docs/reportlab-userguide.pdf), [OpenAI](https://platform.openai.com/docs).

---

## Struktura katalogów

```text
pdf-generator/
├── AGENTS.md
├── BUGZ.MD
├── README.md
├── docs/
├── frontend/
│   ├── public/
│   │   ├── cv-studio-logo.svg
│   │   ├── cv-studio-mark.svg
│   │   └── template-mockups/
│   ├── src/
│   │   ├── components/       # canvas, editor, ai, modals, gallery, common
│   │   ├── hooks/            # useA4Elements, useDocumentHistory, useElementSelectionDrag, …
│   │   ├── pages/
│   │   ├── services/         # ApiClient, fillTemplate, authenticatedImage
│   │   ├── store/            # Canvas / UiSurfaces / Session + fasada PdfContext
│   │   ├── templates/
│   │   └── utils/            # a4ElementFactories, canvasElementSchema, geometry, reflow
│   ├── package.json
│   └── .env.example
├── shared/
│   └── pdf-element.schema.json  # Eksport z Pydantic PdfElement
└── backend/
    ├── app/
    │   ├── api/routes/
    │   ├── core/
    │   ├── crud/
    │   ├── models/
    │   ├── schemas/          # PdfElement + eksport JSON Schema
    │   ├── services/         # pdf, document_service, cv_generator (+ cv_templates/), ai, …
    │   ├── utils/
    │   ├── main.py
    │   └── dependencies.py
    ├── alembic/              # Migracje schematu
    ├── fonts/
    ├── template_assets/
    ├── tests/
    ├── alembic.ini
    ├── requirements.txt
    └── .env.example
```

**Zasady:** 25 id szablonów frontu muszą odpowiadać `_GENERATORS` w `cv_templates/registry.py` (re-eksport z `cv_generator.py`). Każdy `cv_templates/templates/<id>.py` zawiera wyłącznie żywy generator tego szablonu — bez wspólnego silnika multi-theme i martwych gałęzi siblingów. Sekrety tylko w env. `uploads/` i `static/generated/` to dane runtime. Bajty obrazów użytkownika nie są publicznie montowane — tylko przez `GET /images/{id}/content`.

---

## Baza danych

`DATABASE_URL` (`database.py`). Domyślnie SQLite. `postgres://` → `postgresql://`. Postgres: `pool_pre_ping`.

`init_db()` w lifespanie: `create_all` + `alembic upgrade head` (kolumny wielostronicowe w `backend/alembic/versions/`); seed planów przez `bootstrap_billing`. CLI: `cd backend && alembic upgrade head`.

| Tabela | Cel |
|--------|-----|
| `users` | Konta |
| `images` | Metadane obrazów użytkownika |
| `pdfs` | Dokumenty CV |
| `pdf_elements` | Elementy kanwy (+ `extra_properties`, m.in. `fixedToPage`, `repeatOnContinuation`, `locked`, `flowRole`, `flowGroup`, `preserveInitialLayout`) |
| `bio_cv_drafts` | Jeden prywatny szkic bio / user |
| `plans` | Limity Free / Standard / Premium |
| `user_subscriptions` | Aktualny plan |
| `usage_counters` | Eksporty i kredyty AI / miesiąc UTC |
| `payments` | Ledger płatności (przyszłość) |
| `maintenance_markers` | Jednorazowe cleanupy |

Modele: `backend/app/models/models.py`.

---

## Funkcje (mapa implementacji)

Opis produktowy: [`docs/FEATURES.md`](docs/FEATURES.md).

### Edytor A4

Płótno **A4 pion**, wiele stron, zaznaczanie / przeciąganie / zoom / prowadnice. Siedem typów elementów do dodania: tekst, textarea, linia, prostokąt, koło, elipsa, obraz (łączniki nie są w sidebarze). Dziesięć czcionek wspólnych dla edytora i PDF: Inter, Roboto, Helvetica, Montserrat, Times-Roman, PlayfairDisplay, CormorantGaramond, Lora, Courier, JetBrainsMono. Cofnij/ponów w sesji pomija reflow po załadowaniu (`markHistoryQuiet`).

- `frontend/src/pages/PdfCanvas.jsx`, `PdfCanvas` (ok. linia 46+)
- `frontend/src/hooks/useA4Elements.js`, `useA4Elements` (ok. linia 43+; w tym `markHistoryQuiet`)
- `frontend/src/components/canvas/*`
- `frontend/src/components/common/EditorControls/EditorControls.jsx`, `FONT_OPTIONS`
- Landing skupiony na rezultacie pokazuje płótno i wierność eksportu bez technicznych statystyk: `frontend/src/pages/Hero/Hero.jsx`, linie 285–313, sekcja `editorSection`

### Landing skupiony na rezultacie i skierowane starty

Strona główna przedstawia jeden rezultat, edytowalne CV gotowe do PDF, oraz dwa sposoby rozpoczęcia: import istniejącego PDF albo tworzenie treści w kreatorze krok po kroku. Opisuje wspólną czteroetapową drogę, transformację przed/po, szablony, płótno A4 do ręcznej edycji, zakres prywatności, plany opisane efektami oraz analizę ATS bez obietnic. AI jest przedstawiane jako mechanizm pomocniczy: użytkownik przegląda treść dokumentu i propozycje układu przed podjęciem decyzji.

Dwa główne CTA przekazują `start=import` albo `start=wizard`. Zalogowany użytkownik przechodzi bezpośrednio do `/pdfcanvas`; nowy użytkownik zachowuje wybór po rejestracji i logowaniu. `PdfCanvas` odczytuje parametr tylko raz, otwiera import albo kreator bio i usuwa parametr, więc odświeżenie strony nie przywraca dialogu zamkniętego przez użytkownika.

Standard obejmuje import PDF oraz AI skoncentrowane na treści: oceny CV i projektu, dopasowanie do oferty, gramatykę, styl, ulepszanie opisów, wskazówki ATS i zwykły czat. Pełnopłótnowa sesja geometrii **Układ** jest dostępna wyłącznie w Premium; FAQ i karty planów wyjaśniają, że pokazuje ona podgląd propozycji odstępów, wyrównań i korekt kolizji, a nie zmienia dokumentu automatycznie.

Implementacja:

- `frontend/src/pages/Hero/Hero.jsx`, komponent `Hero`; `buildStartUrl`, `StartButton`, karty planów i FAQ
- `frontend/src/pages/Hero/Hero.module.css` — responsywny, redakcyjny układ oraz obsługa `prefers-reduced-motion`
- `frontend/src/pages/Register/Register.jsx`, linie 37–44 i 92–95, zachowanie prawidłowego intencji startu po rejestracji
- `frontend/src/pages/Login/Login.jsx`, linie 23–26 i 81–85, przejście po logowaniu do wybranego wejścia edytora
- `frontend/src/pages/PdfCanvas.jsx`, linie 48–70 i 438–469, otwarcie i jednorazowe zużycie importu albo kreatora

### Rdzawo-pomarańczowe logo marki

Aplikacja używa przezroczystego systemu logo SVG w tym samym rdzawo-pomarańczowym akcencie co przyciski główne (`#DC6743`). Pełne logo łączy monogram CV w formie zagiętego dokumentu z napisem **CV STUDIO** w Montserrat (oraz bezpiecznymi fontami zastępczymi), dlatego pozostaje czytelne zarówno na ciemnym nagłówku strony głównej, jak i na papierowym tle ekranów uwierzytelniania. Krótsza wersja tego samego znaku działa tam, gdzie napis nie zmieściłby się dobrze: w pasku narzędzi edytora oraz jako favicon. Poprzednie niebieskie pliki `kompoza-logo*.png` zostały usunięte.

Implementacja:

- `frontend/public/cv-studio-logo.svg`, linie 1–15 — pełne logo z wordmarkiem
- `frontend/public/cv-studio-mark.svg`, linie 1–8 — skrócony znak
- `frontend/src/pages/Hero/Hero.jsx`, linie 141–145 i 442–445; `Hero.module.css`, linie 40–51 i 1173–1176 — lockup w nagłówku i stopce strony głównej
- `frontend/src/pages/Login/Login.jsx`, linie 127–131; `Login.module.css`, linie 184–195 — logo logowania
- `frontend/src/pages/Register/Register.jsx`, linie 129–133; `Register.module.css`, linie 180–191 — logo rejestracji
- `frontend/src/components/editor/Sidebar/Sidebar.jsx`, linie 43–46 — skrócony znak w edytorze
- `frontend/index.html`, linia 5 — favicon SVG

### Ekrany uwierzytelniania spójne z landing page

Logowanie i rejestracja kontynuują redakcyjny język wizualny „transformacji dokumentu” ze strony głównej zamiast poprzednich, generycznych ciemnych kart. Oba widoki mają responsywny układ dzielony: po lewej znajduje się panel wyjaśniający proces, a po prawej karta formularza przypominająca papier z rdzawym akcentem akcji. Na małych ekranach panel staje się krótkim nagłówkiem nad formularzem.

Treść zależna od intencji nadal działa. Login potwierdza, czy po uwierzytelnieniu otworzy import PDF, czy kreator krok po kroku; rejestracja pokazuje tę ścieżkę jeszcze przed utworzeniem konta. Etykiety planów opisują efekt dla użytkownika, na przykład „import i pomoc AI”, zamiast liczby kredytów AI. Ceny i bramki uprawnień nie uległy zmianie.

Implementacja:

- `frontend/src/pages/Login/Login.jsx`, linie 102–192; `frontend/src/pages/Login/Login.module.css`
- `frontend/src/pages/Register/Register.jsx`, linie 104–228; `frontend/src/pages/Register/Register.module.css`
- `frontend/src/pages/Register/PlanSelector.jsx`, linie 4–31; `frontend/src/pages/Register/PlanSelector.module.css`

### Spójna ciemna paleta aplikacji

Edytor zachowuje niemal czarne tło jako dominującą powierzchnię, a jednocześnie korzysta z tego samego rdzawego koloru akcji (`#DC6743`), ciemnej rdzy dla stanu wciśniętego (`#A73E26`), złotego detalu (`#CAA66B`) i ciepłej rodziny bieli co landing oraz ekrany uwierzytelniania. Wspólny token `--on-accent` zapewnia czytelny, ciepły tekst na rdzawych przyciskach. Wspólne kontrolki, obramowania fokusu, zaznaczenie na płótnie, szybkie akcje AI, sterowanie stronami i ekran generowania PDF nie wprowadzają już oddzielnego, niebieskiego języka wizualnego. Narożniki kontrolek są celowo mniej zaokrąglone, aby ciemne formularze edytora nawiązywały do papierowych formularzy landingu bez zmniejszania ich gęstości.

Biel pozostaje celowo zarezerwowana dla edytowalnej strony A4 i podglądu szablonu, ponieważ reprezentuje wynikowy dokument. Chrome edytora używa zamiast niej ciepłej złamanej bieli. Zielony sukces i czerwone działania destrukcyjne pozostają kolorami stanów semantycznych, a nie akcentami marki.

Implementacja:

- `frontend/src/index.css`, linie 1–77, tokeny głównej palety, ciepłe kolory tekstu, tekst na akcencie i wspólna skala promieni kontrolek
- `frontend/src/App.css`, linie 5–18, grafitowe tło aplikacji z rdzawymi i złotymi gradientami otoczenia
- `frontend/src/components/canvas/SelectionOverlay/SelectionOverlay.module.css`, linie 8–90, rdzawe zaznaczenie i chrome przesuwania
- `frontend/src/components/common/Spinner/Spinner.module.css`, linie 7–167, ciemna warstwa tła i karta statusu eksportu przypominająca papier

Ograniczenia:

- Ekstrakcja PDF i działania AI skupione na treści wymagają planu Standard, natomiast pełnopłótnowa akcja `layout` wymaga Premium. Landing przypisuje import do Standard, a kreator krok po kroku do Free, który zawiera siedem szablonów startowych.
- Wskazówki ATS dotyczą czytelności struktury i treści. Nie są gwarancją odpowiedzi rekrutera ani przejścia przez system ATS.
- Sekcja prywatności opisuje ogólnie zaimplementowane użycie danych i nie deklaruje niezaimplementowanych certyfikatów ani anonimizacji.

### Ładowanie szablonu

- `frontend/src/templates/index.js` — `TEMPLATES` (`name` + `description` w UI; tagi `layouts` dla generatorów)
- `frontend/src/utils/materializeElementSpecs.js` — `materializeElementSpecs`
- `frontend/src/hooks/useA4Elements.js` — `handleLoadTemplate` / `useDocumentHistory`

### Fade wejścia na kanwie

Gdy pełny dokument ląduje na kanwie (upload CV AI, kreator bio lub wybór szablonu), interaktywna treść pojawia się fade’em opacity 0→1. Elementy są trzymane niewidoczne do `document.fonts.ready` (limit 1000 ms), żeby zmiana fontu zapasowy→webfont nie była widoczna, potem fade trwa 750 ms. Dekoracje (`fixedToPage`, bez zaznaczania) pojawiają się od razu bez animacji. Ręczne dodanie/duplikacja używa tego samego fade tylko dla nowych id. Chrome sekcji **Onyx** z AI (marker + etykieta → linia 14 px poniżej → treść +16 px) odpowiada `frontend/src/templates/onyx.js`; `flowRole` utrzymuje kolejność chrome/treści, a `preserveInitialLayout` blokuje powiększanie przy pierwszym montażu (shrink-to-content nadal dopasowuje wysokość do glifów).

Implementacja:

- `frontend/src/utils/canvasEnter.js`, linie 1–58, `markContentElementsEnter`, `CANVAS_ENTER_MS`, `CANVAS_ENTER_FONT_WAIT_MS`
- `frontend/src/hooks/useCanvasEnterIds.js`, linie 1–80, `useCanvasEnterIds`
- `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx` + `CanvasElements.module.css`
- `frontend/src/hooks/useA4Elements.js` — `handleLoadAiElements`, `handleLoadTemplate`, `handleLoadTemplateWithFill` wywołują `markContentElementsEnter`
- `backend/app/services/cv_templates/templates/onyx.py`, `_gen_onyx`; `frontend/src/templates/onyx.js`, linie 1–101 — przypisanie `flowRole` i `preserveInitialLayout` Onyx
- `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`, linie 29–55; `frontend/src/components/canvas/Textarea/Textarea.jsx`, linie 42–164 — pominięcie wyłącznie pierwszego pomiaru textarea Onyx
- `backend/app/schemas/pdf_schema.py`, linie 44–46; `backend/app/crud/pdfs.py`, linie 81–82, 187–188, 226–227; `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx`, linie 104–105 — zapis i odtwarzanie flag przepływu Onyx

Testy:

- `frontend/src/utils/canvasEnter.test.js` — rejestr id oraz wykluczenie chrome

### Monochromatyczny szablon Monument

Monument to płatny jednokolumnowy szablon (`layouts: ["single"]`) dla osób, które chcą eleganckiego, redakcyjnego efektu bez koloru. Jego charakter budują numerowane czarne prostokąty, konturowe ramki nagłówków, cienkie szare linie i asymetryczny masthead. Najmniejszy tekst ma 9 px; treść główna i podsumowanie używają po 9 px, żeby akapit wstępny nie był o stopień większy od otaczającego tekstu, tytuły stanowisk mają 11 px, tytuły edukacji 10 px, a nagłówki sekcji i linia stanowiska przy nazwisku 12,5 px. Cormorant Garamond odpowiada za formalny charakter display, a Montserrat utrzymuje czytelność gęstej treści CV. Ta sama zasada „podsumowanie = treść body” obowiązuje we wszystkich szablonach wypełnianych przez `generate_resume` (np. Regent/Scribe używają 9,3 px jak bulletów doświadczenia).

Startowa tablica frontendu oraz deterministyczny generator Python używają tej samej geometrii A4 i palety szarości. `_gen_monument` nie rozdziela wpisów doświadczenia ani edukacji przy zmianie strony, obsługuje sekcje własne przez `_extra_sections` i grupuje numer, ramkę, etykietę oraz linię jako jeden element reflow, dzięki czemu geometria nagłówka pozostaje równa po pomiarze tekstu w przeglądarce. Rama strony i stopka powtarzają się na każdej stronie, natomiast masthead z nazwiskiem i stanowiskiem oraz jego wysokie boczne belki występują wyłącznie na pierwszej stronie; `repeatOnContinuation: false` zachowuje tę regułę również wtedy, gdy edytor później utworzy kolejną stronę. Decyzje o layoucie nie są przekazywane do modelu AI.

Implementacja:

- `frontend/src/templates/monument.js`, linie 1–108, eksportowana tablica `monumentTemplate`
- `frontend/src/templates/index.js`, wpis rejestru `monument` (`tier: "paid"`, `layouts: ["single"]`)
- `backend/app/services/cv_templates/templates/monument.py`, funkcja `_gen_monument`; `cv_templates/registry.py`, `_GENERATORS["monument"]`
- `frontend/src/utils/structureOperation.js`, linie 34–63, funkcja `cloneFixedPageDecorations`
- `frontend/public/template-mockups/monument.png`, podgląd A4 generowany ze źródła

Testy:

- `frontend/src/templates/monument.test.js`, linie 6–56, asercje hierarchii, numeracji sekcji, geometrii ramek i mastheadu wyłącznie na pierwszej stronie
- `frontend/src/utils/structureOperation.test.js`, linie 25–44, wyłączenie klonowania dekoracji na stronach kontynuacji
- `backend/tests/test_cv_template_layouts.py`, `test_monument_is_monochrome_and_keeps_summary_at_body_size`; `test_summary_matches_experience_body_type_size` — każdy generator trzyma typografię podsumowania równą treści doświadczenia w kolumnie głównej

Znane ograniczenie: długie nazwy sekcji podane przez użytkownika są skracane wyłącznie w stałej ramce dekoracyjnego nagłówka. Treść sekcji pozostaje kompletna.

### Szablon Words w stylu dokumentu Word

Words to płatny jednokolumnowy szablon (`layouts: ["single"]`) dla osób, które chcą znajomego efektu dokumentu biurowego zamiast CV przypominającego plakat. Używa jednej kolumny Times-Roman na czysto białej stronie: nazwisko ma 29 px, stanowisko 13,5 px, nagłówki sekcji 12 px, a treść 10–11,5 px. Jedynymi dekoracjami są cienkie szare linie i kółka nie większe niż 7 px. Szablon nie zawiera prostokątów, paneli bocznych ani dekoracyjnych ramek udających dodatkowe marginesy.

Startowy układ frontendu i `_gen_words` używają tej samej geometrii A4. Długie imię, stanowisko i dane kontaktowe zawijają się zamiast być skracane, a pierwsza sekcja przesuwa się w dół o zmierzoną wysokość nagłówka. Generator Python nie rozdziela kompletnych wpisów doświadczenia ani edukacji, jeżeli mieszczą się razem, obsługuje sekcje własne przez `_extra_sections`, rozpoczyna treść kolejnej strony poniżej zwartego wcięcia 58 px i powtarza wyłącznie białe tło, linię stopki, małe kółko oraz numer strony. Jawne `flowRole` i `preserveInitialLayout` zapobiegają rozdzieleniu markerów od nagłówków oraz ponownemu przepaginowaniu początkowego układu przez pomiar tekstu w przeglądarce.

Implementacja:

- `frontend/src/templates/words.js`, linie 1–123, eksportowana tablica `wordsTemplate`
- `frontend/src/templates/index.js`, wpis rejestru `words` (`tier: "paid"`, `layouts: ["single"]`)
- `backend/app/services/cv_templates/templates/words.py`, funkcja `_gen_words`; `cv_templates/registry.py`, `_GENERATORS["words"]`
- `frontend/public/template-mockups/words.png`, podgląd A4 generowany ze źródła

Testy:

- `frontend/src/templates/words.test.js`, linie 6–37, asercje typografii dokumentu Word, palety szarości, rozmiaru markerów i braku ramek
- `backend/tests/test_cv_template_layouts.py`, linie 733–801, `test_words_uses_word_document_rhythm_without_decorative_frames`

Znane ograniczenie: Words odtwarza wizualny język starannie sformatowanego dokumentu Word, ale nie tworzy ani nie importuje plików `.docx`. Eksport pozostaje w formacie PDF.

### Szablon Cardinal w szlachetnej czerwieni

Cardinal to płatny jednokolumnowy szablon (`layouts: ["icons"]`) dla osób, które chcą formalnego dokumentu z jednym powściągliwym akcentem koloru. „Szlachetna czerwień” (`#9E2532`) jest zarezerwowana wyłącznie dla typografii — linii stanowiska pod nazwiskiem oraz każdego nagłówka sekcji — a cała dekoracja pozostaje neutralnie szara (`#8A8A8A`): generowane ikony line-art przy każdym nagłówku sekcji i elemencie kontaktu oraz dekoracyjne linie pod nagłówkami i wzdłuż nagłówka i stopki. Treść główna jest ciemnoszara (`#333333`); nazwisko używa Times-Roman, a etykiety, kontakt, daty i treść — Helvetica. Połączenie generowanych ikon z każdym nagłówkiem i wierszem kontaktu odróżnia go od Scribe, Regent, Aldine, Merit, Monument i Words.

Szare glify pochodzą z dedykowanego motywu `cardinal` dodanego do wspólnego potoku ikon (`scripts/generate_iconic_icons.py`, `THEMES["cardinal"] = "#8A8A8A"`), renderowane do `backend/template_assets/iconic/cardinal/*.png` i serwowane z istniejącego montowania `/template-assets/`. Statyczny podgląd w edytorze i deterministyczne wypełnianie AI mają jedną tożsamość wizualną, ponieważ generator backendu korzysta z tej samej jednokolumnowej maszynerii ikon co inne szablony z tagiem `icons`, w osobnej gałęzi układu, dzięki czemu nie jest rysowany żaden czerwony pas akcentu.

Implementacja:

- `frontend/src/templates/cardinal.js`, linie 1–158 — statyczna specyfikacja startowa; lokalny helper `icon` (linia 49), `sectionHead` (linia 65), `contact` (linia 76) oraz mapowanie `flowRole` w `cardinalTemplate` (linia 150)
- `frontend/src/templates/index.js`, wpis rejestru `cardinal` (`tier: "paid"`, `layouts: ["icons"]`, `accent: "#9E2532"`)
- `backend/app/services/cv_templates/templates/cardinal.py`, funkcja `_gen_cardinal`
- `backend/app/services/cv_templates/registry.py`, `_GENERATORS["cardinal"]`
- `scripts/generate_iconic_icons.py`, linia 23, szary motyw ikon `cardinal`
- `frontend/public/template-mockups/cardinal.png`, podgląd A4 generowany ze źródła

Testy:

- `frontend/src/templates/cardinal.test.js`, linie 1–57 — asercje jednej kolumny, czerwieni tylko w nagłówkach, szarych ikon/linii, ciemnoszarej treści i szeryfowego nazwiska
- `backend/tests/test_template_registry_sync.py`, `test_frontend_ids_match_backend_generators` — wymusza parytet id frontend/backend, w którym `cardinal` teraz uczestniczy

### Placeholder zdjęcia w sidebarze Moss

Moss to płatny botaniczny szablon z sidebarem (`layouts: ["sidebar"]`). Złota ramka (prostokąt + elipsa + wypełnione koło) jest placeholdérem zdjęcia na górze wąskiego lewego sidebara, wyrównanym do imienia i nazwiska w kolumnie głównej. Kontakt oraz dopasowane sekcje sidebara (umiejętności, języki, zainteresowania, wykształcenie) zaczynają się pod tym placeholdérem — nie w połowie strony pod pustą przestrzenią. Kolumna główna zachowuje imię / stanowisko / linię kontaktu bez dekoracji w mastheadzie.

Pakowanie sidebara (`_fit_sidebar_sections`) przyjmuje każdą kompletną sekcję, która jeszcze mieści się w pozostałej wysokości pierwszej strony. Starszy limit 160 px na sekcję odrzucał typowe listy z kreatora oraz dłuższe wpisy wykształcenia, więc po **Utwórz CV krok po kroku** lądowały w kolumnie głównej, podczas gdy krótsze listy z PDF zostawały w sidebarze.

Implementacja:

- `backend/app/services/cv_templates/templates/moss.py`, funkcja `_gen_moss` (geometria zdjęcia i stos sidebara, linie 59–131)
- `backend/app/services/cv_templates/shared/extras.py`, `_fit_sidebar_sections` — tylko budżet pozostałej wysokości
- `frontend/src/templates/moss.js`, linie 32–48 — statyczny starter z tym samym zdjęciem w sidebarze i podniesionym stosem KONTAKT
- `frontend/src/templates/index.js`, wpis rejestru `moss`

Testy:

- `backend/tests/test_cv_template_layouts.py`, `test_moss_photo_placeholder_leads_sidebar_at_name_height`, linie 582–608
- `backend/tests/test_cv_template_layouts.py`, `test_moss_wizard_length_skills_and_education_stay_in_sidebar`, linie 358–429

### Szablon dwukolumnowy Harbor

Harbor to płatny dwukolumnowy szablon (`layouts: ["sidebar", "icons"]`) odtwarzający popularny układ „dwukolumnowy": szeroka kolumna główna po lewej (podsumowanie + doświadczenie) i węższy sidebar po prawej (edukacja, umiejętności, języki, narzędzia). Jeden akcent teal (`#17A2B8`) niesie linię stanowiska, nazwy firm, diamenty listy narzędzi oraz wypełnione kropki biegłości; reszta jest w grafitowej czerni (`#2B2B2B`/`#3A3A3A`) na bieli, złożona krojem Inter. Szare ikony kontaktu i metadanych (telefon, e-mail, znak `< >` dla linku do repozytorium, lokalizacja, kalendarz) pochodzą z motywu ikon `harbor`; teal diamentowy punktor pochodzi z wariantu `harbor-accent`. Okrągły placeholder zdjęcia (miękko-szary dysk z wyśrodkowanym glifem osoby) znajduje się w prawym górnym rogu; użytkownik nakłada na niego własne zdjęcie w edytorze.

Harbor wprowadza trzy widżety sidebara nieużywane w innych szablonach:

- **Pigułki umiejętności** — obramowane prostokąty z zaokrąglonymi rogami. Wymagało to nowego pola `borderRadius` w całym potoku: `PdfElement.borderRadius` (schemat), CSS `border-radius` na kanwie (`Rectangle.jsx`) oraz ReportLab `roundRect` w rendererze PDF (`renderRectangle`). Wartość None/0 zachowuje proste rogi, więc każdy istniejący prostokąt pozostaje bez zmian.
- **Kropki biegłości językowej** — pięć prymitywów `circle` w wierszu, wypełnione teal do poziomu i obrysowane szarością dla reszty.
- **Lista narzędzi** — punktory w postaci teal diamentów.

Statyczny podgląd w edytorze i deterministyczne wypełnianie AI mają tę samą tożsamość. Ponieważ wypełnianie korzysta ze znormalizowanych danych CV, ogólne sekcje listowe typu „other" są scalane do `skills` (renderowane jako pigułki), natomiast właściwe sekcje niestandardowe (certyfikaty, zainteresowania, projekty) renderują się jako listy diamentów; języki renderują się jako wiersze kropek.

Nowe glify ikon (`github`, `calendar`, `diamond`) są trzymane w osobnym zbiorze `EXTRA_ICONS` i generowane tylko dla dwóch dedykowanych motywów Harbor, więc pozostałe foldery motywów ikon pozostają nietknięte.

Implementacja:

- `frontend/src/templates/harbor.js`, linie 1–251 — statyczna specyfikacja startowa; `rect` z `borderRadius` (linia 48), packer `skillPills` (linia 102), kropki `languageRow` (linia 124), diamenty `toolItem` (linia 138), IIFE sidebara (linia 144)
- `frontend/src/templates/index.js`, wpis rejestru `harbor` (`tier: "paid"`, `layouts: ["sidebar", "icons"]`, `accent: "#17A2B8"`)
- `backend/app/services/cv_templates/templates/harbor.py`, `_gen_harbor`; `cv_templates/registry.py`, `_GENERATORS["harbor"]`
- `scripts/generate_iconic_icons.py`, `draw_github`/`draw_calendar`/`draw_diamond` (linie 183–213), `EXTRA_ICONS` (linia 234), `SUBSET_THEMES` (linia 244)
- `backend/app/schemas/pdf_schema.py`, linia 85, pole `borderRadius`
- `backend/app/services/pdf_generator.py`, ścieżka zaokrąglonych rogów w `renderRectangle` (używa `roundRect`); wywołanie w linii 629
- `frontend/src/components/canvas/Rectangle/Rectangle.jsx`, linia 50; `frontend/src/components/canvas/CanvasElements/CanvasElements.jsx`, linia 122
- `frontend/public/template-mockups/harbor.png`, podgląd A4 generowany ze źródła

Testy:

- `frontend/src/templates/harbor.test.js`, linie 1–67 — asercje dwóch kolumn, zaokrąglonych pigułek, teal diamentów, szarych ikon, kropek biegłości, placeholdera zdjęcia oraz polskich nagłówków
- `backend/tests/test_template_registry_sync.py`, `test_frontend_ids_match_backend_generators` — wymusza parytet id frontend/backend, w którym `harbor` teraz uczestniczy

### Szablony z tagiem `icons` i reflow ikon

Nova, Ridge, Loom, Volt, Cardinal i Harbor to indywidualne szablony ze wspólnym tagiem layoutu `icons` (opcjonalnie też `sidebar` / `dark`). Te same identyfikatory generuje deterministycznie backend w Pythonie. Ponieważ pomiar fontów w przeglądarce może zmienić wysokości pól tekstowych, obrazy ikon są grupowane z nagłówkami i przesuwają się razem z nimi zamiast pozostawać na pierwotnej współrzędnej Y.

Kontakt w Loom jest osobnym przypadkiem: trzy jednoliniowe etykiety `text` (bez auto-height textarea na e-mailu) mają rytm 22 px, a ikony 9 px są wyśrodkowane geometrycznie (`alignWithText: false`). Sidebar (umiejętności / zainteresowania / języki) używa tego samego wyrównania geometrycznego ikon — nie optycznego przesunięcia z kolumny głównej — pakuje sekcje według zmierzonej wysokości ze stałym odstępem i trzyma etykiety oraz listy punktów w jednej kolumnie tekstu (`left: 40`). Nagłówki w kolumnie głównej nadal używają wyrównania optycznego (`alignWithText: true`). Wpisy doświadczenia w Iconic używają tego samego stosu bloków textarea co projekty (`SPACE_STACK` w środku wpisu, `SPACE_RECORD` / 10 px między wpisami), żeby prowadnice odstępów na kanwie były spójne. Flaga jest zapisywana w `extra_properties` i odtwarzana przy ponownym otwarciu PDF.

Implementacja:

- `frontend/src/templates/iconic.js`, linie 1–386, eksporty `novaTemplate`, `ridgeTemplate`, `loomTemplate`, `voltTemplate`, `loomContact`
- `backend/app/services/cv_templates/shared/icons.py` — `_icon`, `_icon_beside`, `_icon_key_for_label`
- `backend/app/services/cv_templates/templates/{nova,ridge,loom,volt,cardinal}.py` — osobne wejścia `_gen_*`
- `frontend/src/utils/textareaReflow.js`, funkcje `isTextAlignedImage`, `isPositionLockedForReflow`, `belongsToFlowLane`, `packGapAfterPageBreak`, `rawSamePageGap`, `remainingRecordHeight`, `avoidOrphanChrome`, `precedingChromeCluster`, `precedingRecordMates`, `reflowTextareaHeight`
- `frontend/src/components/canvas/Image/Image.jsx`, linie 22–76, funkcje `isTextAlignedIcon`, `iconicDrawTop`; obrazy na kanwie używają `object-fit: fill`, żeby tła pełnostronicowe rozciągały się jak ReportLab `drawImage` (nie `contain`, które dawało białe paski przy PNG 1024×1536 w Rift/Relay)
- `backend/app/services/pdf_generator.py`, linie 141–193, metoda `PDF_Generator.renderImage`
- `backend/app/crud/pdfs.py` / `backend/app/schemas/pdf_schema.py` — zapis `alignWithText` w `extra_properties`

Testy:

- `frontend/src/utils/textareaReflow.test.js`, linie 83–758 — grupowanie Iconic, jawne role przepływu Onyx, keep-heading-with-body, stale-page gaps, rytm chrome oraz niekolidujące odstępy rekordów
- `backend/tests/test_pdf_shapes.py`, linie 67–131 — wyrównanie optyczne, jawne `alignWithText: false` oraz maska alfa
- `backend/tests/test_cv_template_layouts.py`, `test_iconic_templates_pair_contact_and_section_icons` — geometria kontaktu Loom i wyrównanie kolumny sidebara

**Regenerowanie podglądów opartych na kodzie źródłowym.** Pliki `frontend/public/template-mockups/{nova,ridge,loom,volt,monument,words,cardinal,harbor}.png` — podglądy widoczne w galerii szablonów na stronie głównej (`frontend/src/pages/Hero/Hero.jsx`), w wewnętrznym wyborze szablonów (`frontend/src/components/modals/TemplatesModal/TemplatesModal.jsx`) oraz w panelu hover w **Wypełnij z mojego CV** (`frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`) — są renderowane z tych samych tablic elementów startowych, które użytkownik dostaje po wybraniu szablonu w edytorze, a nie rysowane ręcznie. Po każdej zmianie w `frontend/src/templates/iconic.js`, `frontend/src/templates/monument.js`, `frontend/src/templates/words.js`, `frontend/src/templates/cardinal.js` lub `frontend/src/templates/harbor.js` należy je odtworzyć:

```bash
node --import ./frontend/scripts/register-hook.mjs ./frontend/scripts/dump-iconic-templates.mjs
python scripts/render_iconic_mockups.py           # renderuje każdy motyw przez ReportLab i rasteryzuje stronę 1 w PyMuPDF
```

Skrypt zrzutu (`frontend/scripts/dump-iconic-templates.mjs`) wymaga niewielkiego hooka ładującego moduły Node ESM (`frontend/scripts/resolve-js-ext-hook.mjs`, rejestrowanego przez `frontend/scripts/register-hook.mjs`), ponieważ `iconic.js` używa importów bez rozszerzenia w stylu Vite (`from "../services/api"`), których zwykły Node nie potrafi rozwiązać; hook podstawia też `import.meta.env`, żeby odczyt `API_BASE_URL` na poziomie modułu nie rzucał wyjątku poza Vite. Pośredni plik JSON jest w `.gitignore` — zawsze generowany na nowo z `iconic.js`, nigdy edytowany ręcznie.

### PDF create / update / autosave / download

- `frontend/src/hooks/usePdfExport.js` — `createPdf`, `updatePdf`, `saveElements`
- `backend/app/api/routes/pdf.py`
- `backend/app/services/pdf_generator.py` — `PDF_Generator.render_elements` (ok. 492+)
- `backend/app/crud/pdfs.py` — `create_new_pdf`, `update_pdf_elements`

### Upload obrazów (walidowany, prywatna treść)

Użytkownik przesyła obrazy do elementów kanwy. Endpoint traktuje każdą część
uploadu jako niezaufaną: weryfikuje rzeczywisty format rastrowy z początkowych
bajtów pliku (tylko PNG, JPEG, WEBP, GIF — SVG jest odrzucany jako wektor
skryptu), tworzy nazwę pliku z serwerowego UUID (spreparowana nazwa nie może
wywołać path traversal), ogranicza rozmiar ciała (limit pamięci) oraz liczbę
obrazów na użytkownika. Oryginalna nazwa jest zapisywana tylko do wyświetlania
i nigdy nie służy do lokalizacji pliku. Limity konfiguruje `MAX_UPLOAD_BYTES`
(domyślnie 8 MB) i `MAX_IMAGES_PER_USER` (domyślnie 200).

Bajty **nie** są serwowane z publicznego mountu `/uploads`. Galeria i kanwa
pobierają `GET /images/{id}/content` z tokenem Bearer i pokazują blob URL.
Elementy kanwy zapisują stabilne `src` `/images/{id}/content` oraz `img_id`;
eksport PDF rozwiązuje ten URL przez `document_service.resolve_image_src_for_pdf`.

Implementacja:

- `backend/app/utils/upload_security.py` — `sniff_image_type`, `safe_object_name`, `is_safe_path_segment`
- `backend/app/api/routes/images.py`, linie 57–143 — `create_upload_image`; linie 167–199 — `get_image_content`
- `backend/app/services/document_service.py`, linie 39–66 — `resolve_image_src_for_pdf` / `make_image_resolver`
- `frontend/src/services/authenticatedImage.js` — `fetchAuthenticatedImageObjectUrl`
- `frontend/src/components/gallery/Gallery/Gallery.jsx`, `GalleryItem.jsx`, `canvas/Image/Image.jsx`
- `backend/app/crud/images.py` — `create_image`, `count_images_by_user_id`
- `backend/app/core/config.py` — `MAX_UPLOAD_BYTES`, `MAX_IMAGES_PER_USER`
- Usuwanie jest chronione przed IDOR i blokowane, gdy element PDF nadal używa obrazu (`delete_user_image`)

Testy: `backend/tests/test_image_upload_security.py` — PNG, HTML-as-PNG (415), traversal, oversize (413), limit liczby (403), content tylko dla właściciela; `backend/tests/test_document_service.py` — URL content → ścieżka lokalna.

### Deterministyczne wypełnianie szablonu

Layout Python powstaje ze znormalizowanego `cv_data`, a nie z pozycji wymyślonych przez LLM. W każdym wygenerowanym szablonie wpis wykształcenia korzysta z tego samego systemu znaczenia kolorów co doświadczenie: kierunek ma podstawowy kolor tekstu, szkoła/miasto/okres mają stonowany kolor metadanych, a opcjonalny opis ma czytelny kolor treści. Zwarty wpis w sidebarze celowo używa własnej palety sidebara, ponieważ jest wyświetlany na innym panelu tła.

- `backend/app/services/cv_generator_primitives.py` — klasa `Builder` (`need`, `need_section`, `keep_together` z tagiem `flowGroup`; re-eksport z `cv_generator.py`)
- `backend/tests/test_builder_keep_together.py` — regresja: rekord nie dzieli się między stronami
- `frontend/src/utils/textareaReflow.test.js` — przypadki keep-together `flowGroup` przy reclaim/wzroście
- `backend/app/services/cv_templates/shared/records.py` — `_place_education_record`; `generate_resume` przez fasadę `cv_generator`
- `backend/app/api/routes/ai.py` — `fill_template`
- `backend/app/services/document_service.py`, linie 69–127 — `create_pdf_document`; linie 129–165 — `update_pdf_document`
- [`docs/cv-template-generation.md`](docs/cv-template-generation.md)

Testy: `backend/tests/test_cv_template_layouts.py`, `test_education_description_uses_the_experience_body_color` — sprawdza, czy wszystkie 14 dotkniętych wygenerowanych szablonów utrzymuje kolor opisu wykształcenia zgodny z treścią doświadczenia.

### Sekcje rekordowe (projekty, referencje, …)

Sekcje własne takie jak projekty lub referencje renderują się jak doświadczenie: **pogrubiony tytuł** wpisu i **zagnieżdżona lista punktów** z opisem. Zwarte listy (zainteresowania, certyfikaty, języki) pozostają jednym blokiem bulletów. Sekcje rekordowe łamią stronę jak doświadczenie: generator rezerwuje tylko nagłówek sekcji i pierwszy wpis, a kolejne przenosi osobno. Wcześniejsze wymaganie całego bloku przed łamaniem wypychało projekty na stronę 2 i zostawiało dużą pustą przestrzeń pod doświadczeniem.

Normalizacja w `cv_data` przyjmuje obiekty `{title, subtitle?, bullets[]}`, rozpoznaje nagłówki typu `PROJEKTY` nawet przy `kind: "other"` i grupuje płaskie listy heurystyką separatorów (`—`, `/`, krótki nagłówek + dłuższy opis). Wspólny renderer to `_extra_sections` we wszystkich szablonach.

Heurystyka jest deterministyczna i niedoskonała; plany Standard/Premium już rozliczają kredyty AI przy ekstrakcji — opcjonalny przyszły krok LLM „korekty struktury” przed `generate_resume` może rozstrzygać niejednoznaczne przypadki bez ruszania kodu layoutu.

Implementacja:

- `backend/app/services/cv_data.py`, linie 204–380+, `is_record_section`, `group_flat_items_into_records`, `_normalize_section_items`
- `backend/app/services/cv_templates/shared/extras.py`, `_measure_one_record_height`, `_render_record_section_body`, `_extra_sections`
- `backend/tests/test_cv_template_layouts.py`, `test_record_extra_sections_start_on_page_one_when_first_entry_fits`
- `backend/app/services/ai_service.py`, `extract_cv_data` (linia 39+) — schemat ekstrakcji wymaga obiektów rekordów dla projektów/referencji
- `frontend/src/utils/bioCvData.js`, `parseSectionItems`
- `frontend/src/components/ai/BioCvModal/BioCvModal.jsx` — typy sekcji: projekty, referencje, …

Testy:

- `backend/tests/test_cv_data.py`, `test_flat_projects_list_regroups_into_title_and_bullets`, `test_structured_project_records_pass_through`

### Extract CV z PDF

- `backend/app/services/ai_service.py` — `extract_cv_data` (linia 39+)
- `backend/app/api/routes/ai.py` — `extract_cv`
- `backend/app/services/cv_data.py` — `normalize_cv_data` (ok. 585+)

### Karuzela szablonów (import, kreator bio, zmiana szablonu)

Ta sama nieskończona galeria `TemplateCarousel` jest używana po ekstrakcji PDF (**Wypełnij z mojego CV**), na kroku **Podsumowanie** kreatora bio oraz w **Zmień szablon**. W **Wypełnij z mojego CV** kroki 1 i 2 to osobne pełne panele (bez scrolla całego modala); strzałki w stopce między etykietą kroku a Anuluj przełączają kroki. Szablony pojawiają się jako indywidualne karty (`name` + krótki `description` z `TEMPLATES`; kolejność rejestru przez `templateLayouts.js`). Nie ma chipów kolekcji branżowych/stylistycznych. Każda karta pokazuje mockup A4 i opis; najazd/fokus powiększa ją w miejscu. Renderowanych jest naraz pięć kart (indeksowanie modulo). Modal **Szablony** (`TemplatesModal`) pokazuje tę samą płaską siatkę. Zablokowane szablony mają plakietkę **Standard**. Wszystkie trzy ścieżki wołają wspólny helper `fillTemplate(cvData, templateId)` (`POST /ai/fill_template`). Tagi layoutu (`single` / `sidebar` / `icons` / `dark`) zostają w kodzie dla generatorów i reflow — nie są kategoriami produktowymi.

Implementacja:

- `frontend/src/services/fillTemplate.js`, linie 19–34 — `fillTemplate`
- `frontend/src/components/ai/AiCvPanel/TemplateCarousel.jsx` — okno modulo, opcjonalne `selectedId`, strzałki, powiększenie
- `frontend/src/utils/templateLayouts.js` — kolejność rejestru, helpery `layouts`, `startIndexForSelectedTemplate`
- `frontend/src/components/modals/TemplatesModal/TemplatesModal.jsx` — płaska siatka nazwa/opis
- `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx` — osobne panele kroków (bez scrolla modala), strzałki w stopce między etykietą kroku a Anuluj, karuzela kroku 2 + `handleFill`
- `frontend/src/components/ai/BioCvModal/BioCvModal.jsx`, linie 486–492 — karuzela w `renderReview`
- `frontend/src/components/editor/Topbar/ChangeTemplateModal.jsx` — restyl przez `replaceActiveElements`
- Pliki: `frontend/public/template-mockups/{id}.png`

### Zmiana szablonu na bieżącym CV (Topbar)

Gdy CV zostało w tej sesji przynajmniej raz wypełnione (przez import PDF albo kreator bio), przycisk **Zmień szablon** w Topbarze otwiera dialog z tą samą galerią `TemplateCarousel`, więc użytkownik może przestylizować dokument bez ponownego przesyłania PDF-a czy przechodzenia kreatora od nowa. Wykorzystuje dokładnie te same dane `cv_data` zapisane przy ostatnim udanym wypełnieniu (`PdfContext.activeCvData`) i wywołuje ten sam endpoint `/ai/fill_template`. Karuzela dostaje `selectedId={activeTemplateId}`: bieżący szablon ma etykietę **Obecny**, jest nazwany w nagłówku tożsamości i staje się pierwszą kartą w oknie przeglądania, więc strzałki zaczynają od tego wyboru.

Kluczowa różnica względem początkowych ścieżek wypełniania: ta akcja aplikuje wynik przez `replaceActiveElements` (surowe `handleLoadAiElements` z `useA4Elements`), a nie przez `loadAiElements`. `loadAiElements` jest opakowane w `startFreshDocument`, które czyści `pdfId` i zaczyna zupełnie nowy, niezapisany projekt — poprawne dla „utwórz CV”, błędne dla „przestylizuj to CV”. `replaceActiveElements` podmienia elementy płótna i id szablonu, ale zostawia `pdfId` oraz tytuł projektu nietknięte, więc najbliższy autozapis aktualizuje *ten sam* zapisany dokument zamiast tworzyć duplikat.

`activeCvData` jest ustawiane wyłącznie w momencie udanego wypełnienia (w `AiCvPanel.handleFill` i `BioCvModal.handleFill`) i czyszczone, gdy płótno przestaje reprezentować te dane: rozpoczęcie dowolnego nowego dokumentu (`startFreshDocument` — obejmuje czyszczenie/szablon/wczytanie AI), odrzucenie aktywnego dokumentu albo otwarcie innego zapisanego PDF-a z **Moje dokumenty** (`ModalPdfs.showPDF`, który nie ma trwałych danych `cv_data` do zaoferowania). Przycisk w Topbarze jest wyłączony z wyjaśniającym tooltipem, gdy `activeCvData` jest puste.

Implementacja:

- `frontend/src/store/pdfgenerator-context.jsx` — wartości domyślne `activeCvData`, `setActiveCvData`, `replaceActiveElements`, `isChangeTemplateModal`, `showChangeTemplateModal`
- `frontend/src/pages/PdfCanvas.jsx` — trzyma stan `activeCvData` i slot dialogu `'changeTemplate'`; `startFreshDocument`/`discardActiveDocument` je czyszczą; wystawia `replaceActiveElements: handleLoadAiElements` (surowe, bez resetu `pdfId`)
- `frontend/src/components/editor/Topbar/ChangeTemplateModal.jsx`, `.module.css` — podsumowanie tożsamości + `TemplateCarousel` z `selectedId={activeTemplateId}`, `handleChangeTemplate`
- `frontend/src/utils/templateLayouts.js`, `startIndexForSelectedTemplate` — okno karuzeli wyrównane do aktywnego szablonu
- `frontend/src/components/editor/Topbar/Topbar.jsx` — przycisk **Zmień szablon**, wyłączony gdy `activeCvData` jest puste
- `frontend/src/components/ai/AiCvPanel/AiCvPanel.jsx`, `frontend/src/components/ai/BioCvModal/BioCvModal.jsx` — `setActiveCvData(...)` po udanym wypełnieniu
- `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx`, `showPDF` — `setActiveCvData(null)` przy otwieraniu innego zapisanego dokumentu

### Asystent AI

Standard obejmuje oceny CV i projektu, dopasowanie do oferty, gramatykę, styl, ulepszanie opisów, wskazówki ATS i zwykły czat. Premium dodatkowo odblokowuje **Układ**, czyli pełnopłótnową sesję geometrii.

Asystent otwiera się jako responsywny panel o szerokości do 430 px, z lekko powiększoną typografią interfejsu. Pole wpisywania ma początkowo wysokość dwóch wierszy, rośnie wraz z poleceniem do 136 px, a następnie przewija zawartość wewnętrznie, dzięki czemu długie polecenia nie wypychają rozmowy poza ekran. Karty **poprawek** (gramatyka, styl, ulepsz) są w czacie kompaktowe; po najechaniu kursorem lub otrzymaniu fokusu z klawiatury animują otwarcie, układają pełne teksty **Przed** / **Po** jeden pod drugim i lekko wychodzą poza bąbelek wiadomości. Rozwinięta karta pozostaje połączona z obszarem przewijania czatu oraz jest do niego przewijana, dlatego nie mruga, nie odrywa się od elementu i nie chowa się pod polem wpisywania. Po zejściu kursora wraca do poprzedniego rozmiaru i pozycji.

Włączenie **Układu** jest lokalną akcją interfejsu: asystent wita użytkownika i pokazuje około dziesięciu spokojnych propozycji (chipów) bez wywołania API, wysyłania płótna, zużywania kredytów ani budzenia backendu. Każdy chip ma krótką etykietę w czacie, a do GPT trafia pełniejsze zlecenie geometrii. Pierwszy request Układu wychodzi dopiero po wyborze propozycji albo napisaniu i wysłaniu własnej wiadomości. Synchroniczna blokada in-flight chroni przed podwójnym kliknięciem chipa zanim przeładuje się `isLoading`, więc równoległy drugi request nie dokłada błędu providera pod udaną odpowiedzią.

**Układ** to dostępny wyłącznie w Premium, przełączany **korektor geometrii** GPT: gdy aktywny, każde pytanie dostaje **pełny JSON A4**. Włączenie trybu wyznacza nową granicę historii, więc pierwsza analiza nie powtarza wniosku ze zwykłego czatu ani poprzedniej sesji Układu; kolejne pytania otrzymują wyłącznie wcześniejsze wiadomości z aktywnej sesji. `gpt-5.6-luna` sam grupuje surowe elementy; Python nie wymyśla metryk odstępów sekcji z wymiarów freestyle, np. `width: 3`, bo są zbyt zawodne dla deterministycznej heurystyki. Zamiast tego każdy snapshot zawiera kanoniczny `layout_contract` z rytmem generatora (`SPACE_STACK=4`, `SPACE_RECORD=10`, `SPACE_SECTION=21`, `SPACE_AFTER_RULE=8`, `SPACE_AFTER_MASTHEAD=32` under solid header bands, `SPACE_AFTER_HEADER_RULE=36` under thin masthead dividers) oraz tym samym pasem odstępu pod nagłówkiem (6–10 px, cel 6). Elementy z szablonowym `flowRole` przekazują tę rolę w snapshocie, żeby chrome dało się odróżnić od treści. Gdy edytor zna aktywny slug szablonu (wybór szablonu, wypełnienie AI, kreator bio), request wysyła opcjonalne `template_id` ze krótką wskazówką układu; dokumenty freestyle lub ponownie otwarte mogą je pominąć i nadal są analizowane poprawnie. Zarówno `text`, jak i `textarea` są jawnie traktowane jako elementy tekstowe—wygenerowane wpisy doświadczenia i wykształcenia zwykle używają `textarea`. Frontend standardowo zapisuje rzeczywiste pole DOM w `layout_bounds`. Jeśli widoczny jednowierszowy `<p>` ma złożone pole o zerowym rozmiarze, `measureElements` używa pomiaru glifów przez przeglądarkowy `Range` oraz pola linii o wysokości co najmniej `fontSize`, zapisując `bounds_measurement_source`; niewyrenderowane strony pozostają jawnie oszacowane wraz z `bounds_estimate_reason`. Model widzi krótkie kolejne referencje (`e1`, `e2`, …), natomiast prywatne ID płótna pozostają po stronie serwera; Python po odpowiedzi zamienia poprawne referencje na ID i odrzuca zmyślone wartości. Każdy snapshot zawiera również gotowe `right` oraz `bottom`, więc model nie liczy ponownie `left + width` ani `top + height`. Jednowierszowy element `text` jest normalizowany do wysokości co najmniej `fontSize`, ponieważ `Text.jsx` renderuje go jako `<p>` z `line-height: 1`; brakująca lub bliska zeru zapisana wysokość nie może już złożyć `bottom` do wartości `top`. Surowa wartość pozostaje dostępna diagnostycznie jako `measuredHeight`. Osobne węzły `<p>` ustawione na tej samej osi `top`—zwykle tytuł stanowiska/wykształcenia po lewej i data po prawej—są przekazywane jako jeden autorytatywny wiersz `text_rows` z `row_top`, `row_bottom` i referencjami peerów. `effectiveLineHeight` odzwierciedla dzięki temu wyrenderowane pole linii również wtedy, gdy zapisane `lineHeight` jest puste lub równe zero. Przed zaproponowaniem korekty model musi zwrócić `section_inventory`, przypisując dokładnie raz każdą tekstową referencję do sekcji i logicznego bloku. Znane referencje dekoracji omyłkowo wpisane do `members` nie psują pokrycia tekstu, natomiast rzeczywiście nieznane albo powtórzone referencje nadal odrzucają odpowiedź. Jeśli model pominie jeden lub więcej elementów text/textarea, które **nie** wchodzą w żadną propozycję ruchu, kompilator uzupełnia inwentarz (parkując je w `INNE / NIEPRZYPISANE` / `unassigned`) i zachowuje odpowiedź (z łagodnym ostrzeżeniem po polsku). Twarde odrzucenie (`incomplete_text_inventory`) zostaje tylko wtedy, gdy pominięte ID tekstowe pojawia się w ruchu — wtedy ryzyko jest rozdzielenie logicznego bloku. Ruch całego bloku jest także odrzucany, jeśli wszystkie jego tekstowe elementy nie otrzymały identycznej delty; tytuł albo data nie mogą więc odjechać bez firmy, opisu lub punktów. Prompt Układu z reasoningiem high traktuje top-to-top tylko diagnostycznie i opiera analizę na realnym odstępie między krawędziami. Preferuje odstępy z `layout_contract` zamiast inventować nowy rytm, gdy peery już odpowiadają wartościom generatora. Odstęp pod nagłówkiem celuje w ok. **6 px** (dopuszczalnie 6–10 px). `real_gap` bliski 0 px oznacza, że treść siedzi na dolnej krawędzi nagłówka — to za ciasno, nie „bezpiecznie”. Gdy peery różnią się o więcej niż 2 px, model musi ujednolicić je do jednego dodatniego rytmu — lepiej odsunąć zbyt ciasną treść w dół niż zwijać większy odstęp do 0. Zmiany odstępu pod nagłówkiem mają strukturalne wartości przed/po; kompilator Pythona odrzuca każdy `section_header_gap` z `real_gap_after` poniżej 6 px. Endpoint zwraca `status` + `summary` + opcjonalne `changes[]` → karty `layout_groups`. Stary format `findings[].moves` nadal działa bez nowego kontraktu inwentarza. Ponowne kliknięcie **Układ** wychodzi z trybu. Czatowe `position_operation` nadal działają. **Projekt** używa `summarize_geometry_issues` do limitu oceny przy kolizjach.

Komunikaty **Układu** widoczne dla użytkownika są celowo pisane prostą polszczyzną: wskazują sekcję i efekt zmiany, zamiast referencji wewnętrznych, współrzędnych, wzorów lub pól JSON. Kompilator zastępuje przypadkowo zwrócony techniczny opis krótkim, zrozumiałym komunikatem i zwraca listę ostrzeżeń tylko wtedy, gdy nie da się bezpiecznie przygotować propozycji. Dzięki temu opis karty nie jest powtarzany ponownie pod kartami.

**Projekt** ocenia typografię, hierarchię, spójność kolorów, wyróżnienia i wyrównanie tekstu. Nie wysyła ani nie pokazuje raportu geometrii, a celowo małe etykiety szablonu nie obniżają wyniku. Największy edytowalny, jednowierszowy element tożsamości jest oznaczany jako `primary_identity`: jego odmienny krój, rozmiar i pogrubienie są celowym kontrastem szablonu i nie mogą zostać poprawione ani uznane za niespójność. Gdy nie ma błędów konstrukcyjnych ani konkretnej, edytowalnej poprawki typografii, widoczna ocena ma bazę **8/10**, a nie nieuzasadniony niski wynik. Backend nadal prywatnie sprawdza nieczytelne błędy konstrukcyjne; kolizja, ucięte pole tekstowe, linia przechodząca przez tekst lub element poza stroną ogranicza widoczną ocenę do **5/10**, bez pokazywania liczników diagnostycznych w tej ocenie. Obrazy tła, linie i prostokąty przypięte do strony albo zablokowane są traktowane jako chrome szablonu, a nie treść CV, więc ich celowe nachodzenie nie obniża wyniku.

Układ domyślnie woła **`gpt-5.6-luna`** (`AI_LAYOUT_MODEL`) z **`reasoning_effort=high`** (`AI_LAYOUT_REASONING_EFFORT` — maksymalny poziom obsługiwany przez Lunę; `none`/`low`/`medium`/`high`) oraz trybem **Fast** (`service_tier=fast` przez `AI_LAYOUT_SERVICE_TIER`, domyślnie **fast**; `"priority"` działa tak samo). Fast jest liczony według cennika Luna Fast (**USD 0.40 / 2.40** za 1 mln tokenów wejściowych/wyjściowych — 2× Standard). Większy budżet odpowiedzi (`AI_LAYOUT_MAX_COMPLETION_TOKENS`, domyślnie **48000**) zostawia zapas na rozumowanie; puste odpowiedzi Układu dostają konkretną wskazówkę po polsku. Pozostałe akcje asystenta zostają na **`gpt-5.4-mini`** (`AI_ASSISTANT_MODEL`) w trybie Standard. Koszt liczy `openai_pricing.py` (cennik USD → PLN przez `USD_TO_PLN`, domyślnie 4.0). **1 kredyt AI = 5 groszy (0.05 PLN)**; udane wywołanie pobiera `max(1, ceil(cost_pln / 0.05))` z oszacowanego kosztu tokenów (w tym stawki Fast, gdy użyte) i zwraca `usage.credits_charged` oraz `usage.service_tier`.

Implementacja:

- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, linie 41–155, `LAYOUT_MODE_GREETING` / `LAYOUT_SUGGESTIONS` — krótkie etykiety w czacie i pełniejsze prompty geometrii dla GPT
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, linie 185–262, `CorrectionCard` — stabilne rozwijanie poprawek Przed/Po
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, linie 661–1301, komponent `AiAssistant` — ścieżka ulepszenia do Premium dla Układu, lokalne powitanie z chipami propozycji, odroczony request, opcjonalne `template_id`, granica historii sesji, karty zmian i pole wpisywania
- `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`, linie 700–708 i 1274–1293 — automatycznie rosnące, dwuwierszowe pole czatu
- `frontend/src/hooks/useA4Elements.js`, `activeTemplateId` — zapamiętuje slug ostatnio wczytanego szablonu dla Układu
- `frontend/src/components/ai/AiAssistant/AiAssistant.test.js`, linie 5–35 — włączenie Układu pozostaje lokalne; chipy wysyłają pełniejsze prompty z krótką etykietą
- `frontend/src/components/ai/AiAssistant/AiAssistant.module.css`, linie 42–57, 308–361, 401–450, 488–736 i 903–950 — szerokość panelu, chipy propozycji układu, bezpieczne przewijanie poprawek i pole wpisywania
- `frontend/src/utils/elementBounds.js`, linie 6–58 (`getCanvasMeasurement`, `getTextRangeRect`) i 140–207 (`measureElements`) — `layout_bounds`, przyczyna estymacji i źródło pomiaru
- `backend/app/api/routes/ai_assistant.py` — `AssistantRequest.template_id`, akcja `layout`, `TokenUsage`
- `backend/app/services/ai_assistant_service.py`, linie 158–227 — `_primary_identity_id`, `_extract_typography` oraz `_protected_typography_ids`, ochrona celowej stylizacji imienia; linie 390–493 — `_rate_design`, ocena zgodna z szablonem, baza 8/10 bez poprawek i prywatny limit 5/10; linie 1071–1171 — `_layout_session`, snapshot z `layout_contract` oraz proste podsumowanie dla UI; ponadto `_model_for_action`, `_chat`
- `backend/app/services/layout_gpt.py`, linie 38–656 (`SECTION_HEADER_GAP_*`, `_build_layout_contract`, `_can_share_text_row`, `_build_text_rows`, `_build_layout_snapshot_data`, `build_layout_snapshot`, `build_layout_user_prompt`), 694–762 (`_resolve_model_references`), 763–853 (ochrona prostego języka), 926–973 (`_parse_section_inventory`), 975–1017 (`_moved_element_ids_from_payload`, `_assign_missing_text_to_unassigned`), 1020–1164 (`_affected_text_ids`, `_changes_to_findings`, `_collapses_below_min_section_gap`) i 1234–1549 (`compile_layout_gpt_response`, w tym soft-complete inwentarza)
- `backend/app/services/layout_analysis.py` — `resolve_directed_operation`; linie 868–940, `_is_static_template_chrome` oraz `summarize_geometry_issues` — pomija przypięty do strony i zablokowany chrome szablonu w prywatnym limicie oceny Projekt
- `backend/app/services/openai_pricing.py` — `usage_from_response`, `estimate_cost_usd`

Testy: `backend/tests/test_layout_gpt.py`, linie 78–103 (`test_snapshot_includes_layout_contract_and_flow_role`), 105–137 (`test_user_prompt_includes_corrector_contract`), 139–152 (`test_user_prompt_standardizes_positive_section_header_gaps`), 168–230 (regresje grupowania wierszy oraz wysokości tekstu), 336–364 (`test_compile_replaces_technical_layout_copy_with_plain_polish`), 365–399 (`test_compile_rejects_collapsing_section_header_gap_to_zero`), 400–435 (`test_compile_allows_standardizing_section_header_gap_to_target`), 522–615 (soft-complete inwentarza i twarde odrzucenie, gdy pominięte ID tekstowe jest w ruchu), a także pozostałe testy inwentarza i kompilatora w tym samym module; `backend/tests/test_ai_chat_command.py`, linie 612–841 (polityka małych czcionek szablonu, chroniona główna tożsamość, prywatny limit oceny i regresja tła przypiętego do strony); ponadto `test_openai_pricing.py`, `test_ai_credits.py` i `test_layout_analysis.py`.

### Entitlements / plany

Standard udostępnia działania Asystenta AI skupione na treści, a `layout` wymaga Premium i dla niższych planów zwraca uporządkowaną odpowiedź o potrzebie ulepszenia `plan_feature_ai_layout`. **1 kredyt = 0.05 PLN (5 groszy)**; obciążenie z `cost_pln_estimate` wywołania.

- `backend/app/services/entitlements.py` — `CREDIT_PLN`, `PREMIUM_ONLY_AI_ACTIONS`, `assert_can_use_ai_action`, `credits_for_cost`, `charge_ai_credits`
- `backend/app/api/routes/billing.py`
- `frontend/src/hooks/useEntitlements.js`

### Auth

Rejestracja odrzuca zajętą nazwę użytkownika oraz zajęty e-mail komunikatem
HTTP 400 (kontrola e-maila przed zapisem zamienia surowy błąd unikalności bazy,
czyli 500, na czytelny komunikat), a adres e-mail jest walidowany formatem i
przycinany przed zapisem.

- `backend/app/api/routes/auth.py` — `register_user`, unikalność nazwy i e-maila
- `backend/app/schemas/user_schema.py` — `UserCreateRequest`, walidator formatu e-maila
- `backend/app/crud/user.py` — `get_user_by_email`
- `backend/app/core/security.py` — bcrypt (72 bajty), JWT

### Blokada dekoracji

- `frontend/src/utils/elementInteraction.js` — `isDecorativeChrome`
- Guardy w `useA4Elements` + `pointer-events: none` na chrome

---

## API

URL bazowy: `VITE_API_URL`. Auth: `Authorization: Bearer <jwt>` (chyba że zaznaczono inaczej). Komunikaty błędów po polsku w `detail`.

| Metoda | Ścieżka | Auth | Cel | Handler |
|--------|---------|------|-----|---------|
| GET | `/health` | nie | Liveness / budzenie dyno | `health` |
| POST | `/auth/register` | nie | Rejestracja | `register_user` |
| POST | `/auth/token` | nie | JWT | `login_for_acess_token` |
| GET | `/auth/verify-token/{token}` | token w ścieżce | Walidacja | `verify_user_token` |
| GET | `/auth/me/entitlements` | tak | Limity planu | `me_entitlements` |
| POST | `/pdf/create_pdf` | tak | Utwórz + render | `create_user_pdf` |
| GET | `/pdf/fetch_pdfs` | tak | Lista | `fetch_user_pdfs` |
| POST | `/pdf/show_pdf` | tak | Wczytaj elementy | `show_user_pdf` |
| PUT | `/pdf/update_pdf` | tak | Zapisz + render | `update_user_pdf` |
| PUT | `/pdf/save_elements` | tak | Autozapis | `save_pdf_elements` |
| DELETE | `/pdf/delete_pdf` | tak | Usuń | `delete_user_pdf` |
| POST | `/pdf/download_pdf` | tak | Pobierz + licznik | `download_pdf` |
| POST | `/images/upload_image` | tak | Multipart obraz | `create_upload_image` |
| GET | `/images/fetch_images` | tak | Lista obrazów | `fetch_user_images` |
| GET | `/images/{img_id}/content` | tak | Bajty obrazu (tylko właściciel) | `get_image_content` |
| DELETE | `/images/delete_image` | tak | Usuń nieużywany | `delete_user_image` |
| POST | `/ai/extract_cv` | tak | Extract | `extract_cv` |
| POST | `/ai/fill_template` | tak | Fill | `fill_template` |
| GET/PUT/DELETE | `/ai/bio_cv_draft` | tak | Szkic bio | routes/ai |
| POST | `/ai/assistant` | tak | Asystent | `ai_assistant` |
| GET/POST | `/billing/*` | tak | Plany | billing |
| POST | `/events/log` | tak | Metryki produktu | `log_event` |

Schemat elementów: `backend/app/schemas/pdf_schema.py`.

---

## Instalacja i rozwój lokalny

### Wymagania

- Node.js 20+ (zalecane)
- Python 3.11+ (zalecane)
- Opcjonalnie PostgreSQL i klucz OpenAI

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger: `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
# VITE_API_URL=http://localhost:8000
npm run dev
```

Aplikacja: `http://localhost:5173`.

### Zmienne środowiskowe

Backend (m.in.): `SECRET_KEY` (min. 16 znaków, bez placeholderów; boot-check w lifespan), `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `DATABASE_URL`, `CORS_ORIGINS`, `BACKEND_URL`, `API_GPT_KEY`, `AI_ASSISTANT_MODEL`, `AI_LAYOUT_MODEL`, `AI_LAYOUT_REASONING_EFFORT`, `AI_LAYOUT_SERVICE_TIER`, `AI_LAYOUT_MAX_COMPLETION_TOKENS`, `USD_TO_PLN`, `S3_BUCKET_NAME`, `AWS_*`, `ALLOW_UNPAID_PLAN_SELECTION` (domyślnie `false`; lokalnie `true`), `ADMIN_RESET_SECRET` (osobny sekret ops, bez fallbacku do `SECRET_KEY`), `ALLOW_INSECURE_SECRET` (tylko lokalne throwaway), `MAX_UPLOAD_BYTES` (domyślnie 8 MB), `MAX_IMAGES_PER_USER` (domyślnie 200).

Frontend: `VITE_API_URL`.

### Skrypty

| Obszar | Komenda |
|--------|---------|
| Frontend | `npm run dev` / `build` / `lint` / `test` |
| Backend testy | `python -m unittest discover -s tests` (z katalogu `backend/`) |
| Eksport schematu elementów | `python -m app.schemas.export_pdf_element_schema` → `shared/pdf-element.schema.json` |
| Alembic | `alembic upgrade head` (z `backend/`) |
| CI | GitHub Actions `.github/workflows/ci.yml` |

### Rozwiązywanie problemów

- Cold start Render: długie timeouty + `wakeBackend()`; `/health` bez blokady na DB.
- Asystent / Układ: `wakeBackend` + retry sieci (bez ponawiania AbortError); `layout` ma timeout do 240 s pod `gpt-5.6-luna`.
- Błędy AI: sprawdź `API_GPT_KEY` i logi.
- Fonty PDF: nie wymieniaj TTF bez testu polskich znaków (remap fontTools).

---

## Testy

- **Framework:** `unittest` w `backend/tests/`.
- **Zakres:** bezpieczeństwo uploadu (w tym content tylko dla właściciela), IDOR PDF, metering eksportów HTTP, reject extract na Free, kontrakt schematu `PdfElement` (`shared/pdf-element.schema.json`), analiza układu, sanityzacja AI, entitlements, synchronizacja rejestru szablonów, upsert elementów PDF, normalizacja `cv_data`, listy punktów, fonty Unicode.
- **Uruchomienie:** `cd backend && python -m unittest discover -s tests`.
- **Frontend:** `npm run lint` oraz `npm test`.
- **CI:** `.github/workflows/ci.yml` uruchamia obie suity przy push/PR.

---

## Wdrożenie

Typowy podział (Render):

- Backend: Uvicorn/FastAPI + Postgres + env (+ opcjonalnie S3).
- Frontend: `npm run build` → hosting `dist` (albo SPA z `main.py`, gdy `frontend/dist` jest dostępny).

Migracje: `create_all` + Alembic (`backend/alembic/`) przy starcie.

---

## Bezpieczeństwo i prywatność

- Bcrypt + spójne obcięcie hasła do 72 bajtów.
- JWT Bearer; `sub` = username.
- IDOR: właściciel PDF/obrazu; bramki planu na create/export/AI/szablony.
- CORS z allowlistą.
- Upload: format weryfikowany z bajtów pliku (PNG/JPEG/WEBP/GIF; SVG odrzucany), nazwy generowane po stronie serwera (brak path traversal), limit rozmiaru (`MAX_UPLOAD_BYTES`) i liczby obrazów na użytkownika (`MAX_IMAGES_PER_USER`); usuwanie blokowane, gdy obraz jest używany przez element PDF; bajty tylko przez `GET /images/{id}/content` z kontrolą właściciela (bez publicznego `/uploads`) (`upload_security.py`, `images.py`).
- Rejestracja: zajęta nazwa/e-mail odrzucane z 400; e-mail walidowany formatem (`auth.py`, `user_schema.py`).
- Błędy AI bez wycieku szczegółów do klienta.
- Metryki z `user_id`, nie raw username.
- Sekrety tylko w env.

---

## Dostępność i UX

- `DialogShell` / `PanelShell` (Escape, nagłówki). Duże powierzchnie (`PlanSelectModal`, `TemplatesModal`, kroki formularza `BioCvModal`) dzielą shell 1280px z `radius={2}`; galerie wypełniania/podsumowania rozszerzają się do 1400px (`AiCvPanel`, podsumowanie `BioCvModal`, `ChangeTemplateModal`). Węższe dialogi (biblioteka dokumentów, dropzone) zostają kompaktowe z domyślnym radiusem 8px.
- Toasty i spinner PDF z minimalnym czasem widoczności.
- Zoom tylko wizualny — eksport zostaje w rozmiarze dokumentu.
- Brak pełnego audytu WCAG — kolejne poprawki mile widziane.

---

## Ograniczenia i plany

Zobacz [`BUGZ.MD`](BUGZ.MD) i [`TODOS.md`](TODOS.md).

- Stripe Checkout nie jest domknięty.
- Free Render usypia dyno.
- Layout AI proponuje; współrzędne zatwierdza `layout_analysis`. Kolizje/ucięcia dają grupy krytyczne przed kosmetycznym wyrównaniem.
- Ocena „Projekt” nie powinna karać celowo małych czcionek szablonu, ale musi obniżyć wynik (max 5), gdy raport geometrii wykryje kolizje, ucięte textarea, linie przez tekst lub elementy poza stroną.

---

## Dalsza lektura

- [React](https://react.dev/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy](https://docs.sqlalchemy.org/)
- [ReportLab](https://www.reportlab.com/docs/reportlab-userguide.pdf)
- [OpenAI](https://platform.openai.com/docs)
- [Vite](https://vite.dev/guide/)
- Projekt: [`CANVA.md`](CANVA.md), [`CV_GENERATOR.md`](CV_GENERATOR.md) (przewodnik generowania CV dla laików), [`PROMPTS.md`](PROMPTS.md) (wszystkie prompty AI z referencjami linii), [`docs/cv-template-generation.md`](docs/cv-template-generation.md), [`docs/FEATURES.md`](docs/FEATURES.md), [`docs/designs/cv-only-ux-monetization.md`](docs/designs/cv-only-ux-monetization.md)
