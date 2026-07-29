# CV Studio — a browser CV builder that renders real PDFs

CV Studio is a web application for designing a CV on a drag-and-drop A4 canvas and
exporting it as a pixel-faithful PDF. You pick a designed template, edit the text
and shapes directly on the page, and the server re-draws the exact same layout into
a downloadable PDF. It also has an AI layer that can read an existing CV (a PDF you
upload) and rebuild it inside a chosen template, plus an in-editor AI assistant that
rates and improves the document.

This README is written to be **read start-to-finish by someone who has never seen the
code**. It explains not just *where* things are, but *why* they work the way they do,
and it glosses each technology the first time it appears. If you are new to full-stack
web development, you can treat it as a guided tour.

---

## Table of contents

1. [The 60-second mental model](#1-the-60-second-mental-model)
2. [Technology stack (with plain-English glosses)](#2-technology-stack-with-plain-english-glosses)
3. [High-level architecture](#3-high-level-architecture)
4. [The single most important concept: the "element"](#4-the-single-most-important-concept-the-element)
5. [Repository / folder structure](#5-repository--folder-structure)
6. [Backend deep dive](#6-backend-deep-dive)
7. [Frontend deep dive](#7-frontend-deep-dive)
8. [The template system (two of them)](#8-the-template-system-two-of-them)
9. [Database schema](#9-database-schema)
10. [End-to-end data flows](#10-end-to-end-data-flows)
11. [Authentication & security](#11-authentication--security)
12. [Plans, limits & entitlements](#12-plans-limits--entitlements)
13. [Running it locally](#13-running-it-locally)
14. [Testing](#14-testing)
15. [Glossary of technologies](#15-glossary-of-technologies)

---

## 1. The 60-second mental model

There are **two programs** in this repository that talk to each other over HTTP:

- **`frontend/`** — a **single-page application** (SPA: one HTML page whose content is
  swapped by JavaScript instead of by full page reloads) built with **React**. It runs
  in your browser and *is* the editor: the A4 page you see, the elements you drag, the
  toolbars.
- **`backend/`** — an **API server** (a program that answers HTTP requests with data,
  usually JSON) built with **FastAPI** in Python. It stores your documents in a
  database, enforces plan limits, talks to OpenAI, and — most importantly — **renders
  the final PDF** with ReportLab.

The thing both sides agree on is a list of **elements**. An element is a plain object
that says "a bold text saying 'Anna Nowak' at position (x=50, y=54), font Inter, size
30". The browser draws that list with HTML/CSS so you can edit it; the server draws the
*same* list with ReportLab so the PDF matches what you saw. Everything else in this
codebase exists to create, edit, store, bill, or render that list.

```
   YOU (browser)                    SERVER (Python)                 STORAGE
 ┌───────────────┐   HTTP/JSON   ┌──────────────────┐            ┌───────────┐
 │  React editor │ ───────────►  │   FastAPI API    │ ─────────► │ Database  │
 │  (A4 canvas)  │               │                  │            │ (SQLite / │
 │               │ ◄───────────  │  ReportLab → PDF │ ◄───────── │ Postgres) │
 └───────────────┘   elements    │  OpenAI (AI)     │            └───────────┘
        ▲                        └──────────────────┘            ┌───────────┐
        │  download PDF                                          │ Files:    │
        └────────────────────────────────────────────────────►  │ local /S3 │
                                                                 └───────────┘
```

---

## 2. Technology stack (with plain-English glosses)

### Frontend (`frontend/`)

| Technology | What it is | Why it's here |
|---|---|---|
| **React 19** | A JavaScript library for building user interfaces out of reusable *components* (functions that return HTML-like markup called JSX). | The whole editor UI. |
| **Vite** | A dev server + build tool. It serves the app instantly while you code and bundles it into static files for production. | `npm run dev` (local), `npm run build` (production bundle in `frontend/dist`). |
| **React Router** (`react-router-dom`) | Client-side routing: shows different "pages" for different URLs without asking the server. | `/`, `/login`, `/register`, `/pdfcanvas`. |
| **CSS Modules** (`*.module.css`) | CSS files whose class names are scoped to one component, so styles never leak. | Every component has its own `.module.css`. |
| **motion** | An animation library. | Element/UI animations. |
| **nanoid** | Generates short unique IDs. | Every element gets a unique `element_id`. |
| **react-dropzone** | A file drag-and-drop helper. | Uploading images into the gallery. |
| **react-icons / react-spinners** | Icon set and loading spinners. | Toolbar icons, loading states. |

### Backend (`backend/`)

| Technology | What it is | Why it's here |
|---|---|---|
| **FastAPI** | A modern Python web framework for building APIs. It validates request data automatically and generates interactive docs. | Every endpoint (`/pdf/...`, `/auth/...`, `/ai/...`). |
| **Uvicorn** | An **ASGI** server — the process that actually runs a FastAPI app and listens for HTTP. | `uvicorn app.main:app`. |
| **Pydantic** | A data-validation library. You declare a class with typed fields; it rejects malformed input. | Request/response *schemas* (`app/schemas/`). |
| **SQLAlchemy** | An **ORM** (Object-Relational Mapper): you work with Python classes and it writes the SQL for you. | Database models (`app/models/models.py`). |
| **ReportLab** | A Python library that draws text/shapes/images onto a PDF canvas. | The PDF renderer (`app/services/pdf_generator.py`). |
| **fontTools** | Reads and rewrites font files (`.ttf`). | Fixes font name tables so bold/italic variants register correctly. |
| **python-jose** | Creates and verifies **JWT** tokens (signed login tickets). | Login sessions (`app/core/security.py`). |
| **passlib / bcrypt** | Password hashing (stores a scrambled, one-way version of the password). | Never stores plaintext passwords. |
| **OpenAI** | Client for GPT models. | Reads uploaded CVs (GPT-4o vision) and powers the AI assistant. |
| **PyMuPDF** (`fitz`) | Renders PDF pages to images. | Turns an uploaded CV PDF into images GPT-4o can "see". |
| **boto3** | AWS SDK for Python. | Uploads/downloads files to Amazon **S3** when configured. |
| **duckduckgo-search** | Web search client. | Supplies web context for some AI assistant actions. |

### Data storage

- **SQLite** — a zero-setup database that lives in a single file (`pdfgenerator.db`). Used locally.
- **PostgreSQL** — a full client/server database. Used in production (e.g. on Render).
- **Amazon S3** — object storage for files (the rendered PDFs and uploaded images) when running in the cloud. Locally, files just go to folders on disk.

---

## 3. High-level architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (React SPA)                             │
│                                                                             │
│  Pages:  Hero (/)   Login   Register   PdfCanvas (/pdfcanvas, protected)     │
│                                                                             │
│  PdfCanvas  = the editor shell. It owns almost all state through two hooks: │
│    • useA4Elements  → the A4_Elements array (the live list of elements)     │
│    • usePdfExport   → create / update / autosave the PDF                    │
│  and shares everything through React Context (PdfContext).                  │
│                                                                             │
│  Canvas components draw each element (Text, Textarea, Line, Rectangle,      │
│  Ellipse, Image, Connectors). Editor/Sidebar/Topbar are the controls.       │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │  fetch()  (JSON + Bearer token in Authorization header)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (FastAPI, app/)                            │
│                                                                             │
│  api/routes/     auth · pdf · images · ai · ai_assistant · events · billing │
│       │            (each route depends on verify_token + a DB session)      │
│       ▼                                                                      │
│  services/       pdf_generator (ReportLab)   entitlements (plan limits)      │
│                  ai_service + cv_generator (AI CV pipeline)                  │
│                  s3_storage (files)          cv_data (validation)           │
│       │                                                                      │
│       ▼                                                                      │
│  crud/           thin functions that read/write rows                        │
│       │                                                                      │
│       ▼                                                                      │
│  models/         SQLAlchemy tables  ── engine ──►  SQLite / PostgreSQL       │
└────────────────────────────────────────────────────────────────────────────┘
```

**Deployment note:** in production the built frontend (`frontend/dist`) is served *by the
same FastAPI server*. `app/main.py` mounts the static assets and has a catch-all route
that returns `index.html` for any non-API path, so client-side routing works. Locally you
usually run the two separately (Vite on `:5173`, Uvicorn on `:8000`).

---

## 4. The single most important concept: the "element"

Everything the user creates is an **element** — one entry in a list called `A4_Elements`
in the browser and `root` in the API request. The server stores each element as a row in
the `pdf_elements` table and re-draws it into the PDF. Understand this object and you
understand the app.

The authoritative field list lives in two places that mirror each other:
`backend/app/schemas/pdf_schema.py` (the API contract) and
`frontend/src/templates/helpers.js` (the constructors used by templates).

| Field | Type | Meaning |
|---|---|---|
| `category` | string | The kind of element: `text`, `textarea`, `line`, `rectangle`, `circle`, `ellipse`, `connector`, `image`. This decides how it is drawn. |
| `element_id` | string | A unique id (nanoid). Used to match, update, delete, and to connect connectors. |
| `page` | int | Which document page (1-based) the element belongs to. |
| `left`, `top` | float | Position from the **top-left** of the page, in PDF points (1 pt = 1/72 inch). |
| `width`, `height` | float/str | Size. Text has none; boxes/lines/images do. |
| `zIndex` | int | Stacking order (higher = on top). |
| `content` | string | The text (for `text`/`textarea`). |
| `fontFamily`, `fontSize`, `color` | string/float | Typography. |
| `lineHeight`, `letterSpacing` | float | Textarea line spacing and tracking. |
| `bold`, `italic`, `underline` | bool | Text style toggles. |
| `align` | string | Textarea alignment: `left` / `center` / `right` / `justify`. |
| `bulletList` | bool | Textarea lines starting with `•` get a hanging indent. |
| `autoHeight` | bool | Textarea height follows its rendered content (used by templates). |
| `backgroundColor` | string | Fill colour for `line`; fill **or** stroke colour for shapes. |
| `borderWidth` | float | Outline thickness for `rectangle` / `circle` / `ellipse` / `connector`. |
| `filled` | bool | Circle/ellipse: solid fill (`true`) or outline only (`false`). |
| `source_id`, `target_id`, `arrow` | string/bool | A `connector` links two elements by id and optionally draws an arrowhead. |
| `src` | string | Image URL/path (for `image`). |
| `fixedToPage` | bool | Decoration that stays anchored while auto-height content reflows around it. |
| `locked` | bool | Prevents the user *and* the AI from moving the element. |
| `img_id` | int | Links an image element back to its uploaded `images` row. |
| `deleted` | bool | Marks an element for removal on the next save. |

### The coordinate flip (the classic gotcha)

Browsers put the **origin (0,0) at the top-left** and y grows downward. PDF (ReportLab)
puts the **origin at the bottom-left** and y grows upward. So the server converts every
element with the same formula, in `pdf_generator.py`:

```python
corrected_y = page_height - top - height
```

This one line is why the exported PDF matches the on-screen canvas exactly. Text, wrapping,
letter-spacing and fonts are all deliberately measured with the *same* metrics on both
sides so a line breaks in the PDF exactly where it breaks on screen.

---

## 5. Repository / folder structure

```
pdf-generator/
├── backend/                      # FastAPI + ReportLab API server
│   ├── app/
│   │   ├── main.py               # App entry: creates FastAPI, mounts routes & static, startup hooks
│   │   ├── dependencies.py       # get_db(): yields a DB session per request
│   │   ├── core/
│   │   │   ├── config.py         # Env-driven settings (CORS, dirs, S3, OpenAI key, feature flags)
│   │   │   └── security.py       # Password hashing + JWT create/verify
│   │   ├── models/
│   │   │   ├── database.py       # SQLAlchemy engine + SessionLocal + Base
│   │   │   └── models.py         # All tables + init_db() + lightweight migrations
│   │   ├── schemas/              # Pydantic request/response models (API contracts)
│   │   │   ├── pdf_schema.py     # PdfElement + PDFCreate/UpdateRequest  ← the element contract
│   │   │   ├── user_schema.py
│   │   │   └── cv_data_schema.py
│   │   ├── api/routes/           # HTTP endpoints, one file per area
│   │   │   ├── auth.py           # register / token(login) / verify / entitlements
│   │   │   ├── pdf.py            # create / fetch / show / update / save_elements / download / delete
│   │   │   ├── images.py         # upload / fetch / delete images
│   │   │   ├── ai.py             # extract_cv / fill_template / bio_cv_draft
│   │   │   ├── ai_assistant.py   # /ai/assistant: rating, grammar, layout, chat, ...
│   │   │   ├── billing.py        # plans / select-plan
│   │   │   └── events.py         # product metric logging
│   │   ├── crud/                 # Thin DB read/write helpers (no business rules)
│   │   │   ├── pdfs.py           # create_new_pdf, update_pdf_elements, ...
│   │   │   ├── user.py           # get/create/authenticate user
│   │   │   ├── images.py
│   │   │   └── bio_cv_drafts.py
│   │   ├── services/             # Business logic
│   │   │   ├── pdf_generator.py  # ★ ReportLab renderer (PDF_Generator class)
│   │   │   ├── cv_generator.py   # ★ Deterministic AI-CV layout engine (per-template builders)
│   │   │   ├── ai_service.py     # OpenAI: extract CV data from an uploaded PDF (GPT-4o)
│   │   │   ├── ai_assistant_service.py  # OpenAI: in-editor assistant actions
│   │   │   ├── entitlements.py   # ★ Plans, monthly usage meters, limit gates
│   │   │   ├── cv_data.py        # Validate/normalize extracted CV JSON
│   │   │   ├── s3_storage.py     # Upload/download/presign files on S3
│   │   │   ├── openai_pricing.py # Convert token usage → cost estimate
│   │   │   └── legacy_document_cleanup.py
│   │   └── utils/
│   │       ├── build_pdf.py      # Render a PDF into an in-memory buffer (used for S3)
│   │       ├── image_src_to_path.py
│   │       └── pdf_file_ops.py   # rename/delete files on local disk
│   ├── fonts/                    # Bundled TTF fonts (Unicode/Polish-safe)
│   ├── template_assets/          # PNGs used by templates (sidebar art, etc.)
│   ├── tests/                    # pytest suite
│   ├── requirements.txt          # Python dependencies
│   └── .env.example              # Copy to .env and fill in
│
├── frontend/                     # React + Vite single-page app
│   ├── src/
│   │   ├── main.jsx              # Boots React into #root
│   │   ├── App.jsx               # Router: defines the 4 routes
│   │   ├── ProtectedRoute.jsx    # Redirects to /login if no token
│   │   ├── pages/
│   │   │   ├── Hero/             # Landing page (/)
│   │   │   ├── Login/  Register/ # Auth screens
│   │   │   └── PdfCanvas.jsx     # ★ The editor shell (owns state, wires everything)
│   │   ├── hooks/
│   │   │   ├── useA4Elements.js  # ★ The central element-state machine
│   │   │   ├── usePdfExport.js   # create / update / autosave requests
│   │   │   ├── useEntitlements.js# fetch current plan + usage
│   │   │   └── useToasts.js
│   │   ├── store/
│   │   │   └── pdfgenerator-context.jsx  # React Context shape shared app-wide
│   │   ├── components/
│   │   │   ├── canvas/           # Draws elements: Text, Textarea, Line, Rectangle, Ellipse, Image, Connectors, A4, Guides, SelectionOverlay
│   │   │   ├── editor/           # Editor (properties panel), Sidebar, Topbar, PageControls
│   │   │   ├── ai/               # AiCvPanel, AiAssistant, BioCvModal
│   │   │   ├── gallery/          # Image upload (Dropzone) + gallery
│   │   │   ├── modals/           # Documents list, Templates picker, Plan picker
│   │   │   └── common/           # Buttons, dialogs, progress, spinner, toasts
│   │   ├── templates/            # ★ 24 static designed templates (arrays of elements) + helpers
│   │   ├── services/
│   │   │   ├── api.js            # ApiClient (fetch wrapper) + ENDPOINTS map
│   │   │   └── eventLog.js
│   │   └── utils/                # Pure logic: text wrapping/height, spacing guides, page spread, save queue, ...
│   ├── package.json
│   └── vite.config.js
│
├── docs/                         # Design specs (incl. docs/superpowers/)
├── CLAUDE.md                     # Instructions for the AI coding assistant
├── BUGZ.MD / TODOS.md            # Working notes
└── README.md                     # You are here
```

The `★` files are the ones worth reading first — they carry the core logic.

---

## 6. Backend deep dive

### 6.1 Entry point — `app/main.py`

Creates the FastAPI `app`, and on startup calls `init_db()` (creates tables, runs small
migrations, seeds the plan catalogue). It mounts three static file areas
(`/uploads`, `/template-assets`, `/static/generated`), includes every router, and — if a
frontend build exists — serves the SPA. It also registers CORS
(**Cross-Origin Resource Sharing**: the rule that lets the browser on `localhost:5173`
call the API on `localhost:8000`).

### 6.2 Configuration — `app/core/config.py`

Reads environment variables (from the real environment in production, or a `.env` file
locally) into simple module-level constants: allowed CORS origins, upload directories, the
S3 bucket (empty = use local disk), the OpenAI key, and a feature flag
`ALLOW_UNPAID_PLAN_SELECTION` (lets users self-activate paid plans until Stripe billing is
wired in).

### 6.3 Database plumbing — `app/models/database.py`

Builds the SQLAlchemy **engine** (the connection to the database) from `DATABASE_URL`. If
that URL is SQLite it disables the same-thread check; if it is Postgres it enables
`pool_pre_ping` (silently reconnects dropped connections). `SessionLocal` is a factory that
produces a **session** (a unit-of-work you use to query and commit). `Base` is the parent
class every table model inherits from.

### 6.4 Tables — `app/models/models.py`

Defines every table as a Python class (see [§9 Database schema](#9-database-schema) for the
full listing). Two functions matter:

- `init_db()` — creates all tables, runs `_run_lightweight_migrations()` (hand-written
  `ALTER TABLE` statements for columns SQLAlchemy's `create_all` won't add to existing
  tables), then seeds billing. It retries a few times because a fresh cloud Postgres often
  drops the first SSL connection during a deploy.
- `_run_lightweight_migrations()` — idempotent (safe to run repeatedly) column adds for the
  multi-page feature.

### 6.5 Security — `app/core/security.py`

- `hash_password` / `verify_password` — bcrypt hashing. Bcrypt only accepts 72 bytes, so
  passwords are truncated to 72 bytes first.
- `create_access_token` — builds a **JWT** (JSON Web Token: a base64 string carrying claims
  and a signature). It embeds `sub` (the username) and an expiry, then signs it with
  `SECRET_KEY` using algorithm `HS256`. Default lifetime is 7 days.
- `verify_token` — a FastAPI **dependency**. Any route that declares
  `payload = Depends(verify_token)` will only run if the request carries a valid, unexpired
  token; otherwise the caller gets `403`. The decoded payload (with `sub`) is handed to the
  route.

### 6.6 Routes — `app/api/routes/`

Every route follows the same shape: it declares its dependencies (`verify_token` for auth,
`get_db` for a database session), does its work, and returns JSON. Ownership is always
enforced — a logged-in user can only touch their own rows.

**`auth.py`**

| Method & path | Purpose |
|---|---|
| `POST /auth/register` | Create a user (rejects a duplicate username). |
| `POST /auth/token` | Log in with username+password (OAuth2 form), returns a JWT. |
| `GET /auth/verify-token/{token}` | Confirms a token is still valid (the SPA polls this). |
| `GET /auth/me/entitlements` | Current plan, limits, and monthly usage. |

**`pdf.py`** (the core document API; every by-id route runs through `_require_owned_pdf`,
which returns `403` if the document isn't yours — this closes an **IDOR** hole, where
guessing another user's id would otherwise expose their data)

| Method & path | Purpose |
|---|---|
| `POST /pdf/create_pdf` | Save a new document: insert the `pdfs` row + all `pdf_elements`, render the PDF (to disk or S3). Checks the project limit first. |
| `GET /pdf/fetch_pdfs` | List the user's documents. |
| `POST /pdf/show_pdf` | Return one document's elements (used to reopen it in the editor). |
| `PUT /pdf/update_pdf` | Re-save and re-render an existing document. |
| `PUT /pdf/save_elements` | **Lightweight autosave**: persist elements + page geometry only — no PDF render, no S3 upload. Cheap enough to fire on an idle debounce. |
| `POST /pdf/download_pdf` | Check the monthly export limit, record the export, return a (presigned) download link. |
| `DELETE /pdf/delete_pdf` | Delete the row, its elements, and the file. |

**`images.py`** — `upload_image` (to disk or S3), `fetch_images`, `delete_image` (refuses if
the image is still used inside a saved PDF).

**`ai.py`** — the AI-CV pipeline: `extract_cv` (upload a PDF → structured data),
`fill_template` (structured data + template id → a full element list), and CRUD for a saved
"bio" CV draft.

**`ai_assistant.py`** — `POST /ai/assistant` runs one of a fixed set of `VALID_ACTIONS`
(`rating`, `grammar`, `language`, `improve`, `ats_score`, `layout`, `chat`, …) over the
current elements and returns tips/corrections/layout suggestions.

**`billing.py`** — `GET /billing/plans` (catalogue for the picker), `POST /billing/select-plan`
(activate a plan; returns `402 payment_required` for paid plans once billing is enforced).

**`events.py`** — logs two product metrics (`template_picked`, `template_dismissed`).

### 6.7 The PDF renderer — `app/services/pdf_generator.py` (the heart)

`PDF_Generator` wraps a ReportLab canvas and knows how to draw each element category. Key
ideas:

- **Font registration.** All fonts are bundled TTFs so Polish characters (ą, ć, ę, ł, …)
  render. `_register_ttf` rewrites each font file's internal name table before handing it to
  ReportLab, because ReportLab de-duplicates fonts by their *internal* name — several bundled
  bold/italic files mislabel themselves as their Regular sibling, which would otherwise make
  bold text silently render as regular. `Helvetica`/`Courier` are aliased to `Inter` because
  ReportLab's built-ins can't render Polish.
- **`render_elements`** — the entry point. It groups elements by page, keeps an id→element
  map (so connectors can find their endpoints), then draws every page — emitting a ReportLab
  page even for empty pages so the page count is preserved.
- **`renderTextarea` + `_wrap_textarea`** — reproduce the browser's soft-wrapping exactly:
  same font metrics, same letter-spacing, same bullet hanging-indent, same clipping when text
  overflows the box. This is what makes "what you see is what you get".
- **`measure_textarea_height`** — a static method the AI layout engine reuses to measure text
  *before* placing it, so generated CVs never overlap.

### 6.8 The AI-CV pipeline — `ai_service.py` + `cv_generator.py`

This is a deliberate split of responsibilities:

1. **Extraction (AI, non-deterministic).** `ai_service.extract_cv_data` renders the uploaded
   PDF to images with PyMuPDF, sends them to **GPT-4o** with a strict prompt, and gets back a
   structured JSON object: `name`, `experience[]`, `education[]`, `skills[]`,
   `extra_sections[]`, etc. `cv_data.normalize_cv_data` validates/cleans it.
2. **Layout (deterministic, no AI).** `cv_generator.generate_resume(template_id, cv_data)`
   turns that data into the element list, using a `Builder` class that tracks a vertical
   cursor, measures each block with the real PDF metrics, and paginates when content would run
   past the page. Each template (finance, banking themes, ledger, nimbus, …) is its own
   generator function.

Why deterministic layout instead of letting the AI place things? Because a language model
cannot reliably produce non-overlapping, pixel-aligned coordinates. Splitting "understand the
CV" (AI) from "lay it out" (code) gives clean output every time.

### 6.9 Entitlements — `app/services/entitlements.py`

Owns the whole free/paid model with no external billing yet:

- `PLAN_SEEDS` defines Free / Standard / Premium and their limits.
- `get_entitlements` returns the user's plan, limits, current-month usage, and remaining
  allowances.
- `assert_can_*` functions are the **gates** each route calls before an expensive action
  (create project, export, use AI). They raise a `PlanLimitError` (a `403` with a structured
  payload the frontend turns into an upgrade prompt).
- `record_export` and `charge_ai_credits` increment the monthly `usage_counters` row. AI is
  billed by real OpenAI cost (1 credit = 0.05 PLN, minimum 1 per call).

### 6.10 File storage — `app/services/s3_storage.py`

When `S3_BUCKET_NAME` is set, PDFs and images live in S3; downloads use a **presigned URL**
(a temporary link that grants read access for 5 minutes without exposing credentials). When
it's empty, everything is plain files under `uploads/` and `static/generated/`. The routes
branch on the `USE_S3` flag.

---

## 7. Frontend deep dive

### 7.1 Boot & routing

`main.jsx` mounts `<App/>` into `#root`. `App.jsx` defines four routes with React Router.
`/pdfcanvas` is wrapped in `ProtectedRoute`, which checks for a token in **localStorage** (a
small key-value store the browser keeps per site) and redirects to `/login` if it's missing.

### 7.2 The editor shell — `pages/PdfCanvas.jsx`

This one component wires the whole editor together. It:

- calls `useA4Elements(titleRef)` to get the element state and every operation on it;
- calls `usePdfExport(...)` for create/update/autosave;
- keeps UI state (which modal/panel is open, the current pdf id, toasts, entitlements);
- runs the **debounced autosave** effect: 2 seconds after edits settle, it calls
  `/pdf/save_elements` — but only once the document has been saved once (has a `pdfId`), and
  it serialises saves through a queue so a slow older request can't overwrite newer data;
- packages everything into one big object and provides it via `PdfContext` so any component
  can read state and call operations without prop-drilling;
- renders the visible A4 page(s) and, on each, the elements, connectors, selection overlay,
  and alignment guides.

### 7.3 The central state machine — `hooks/useA4Elements.js`

This hook is the browser-side counterpart of `pdf_generator.py`. It owns `A4_Elements` (the
live list) and every mutation: add/move/select/edit/delete/duplicate/align elements, resize,
connect two elements, multi-select group moves, undo/redo history, page add/remove/clone/move,
zoom, two-page view, and loading a template or AI-generated document. When the user picks a
template, `handleLoadTemplate` copies that template's element array into `A4_Elements` and
assigns fresh ids and interaction defaults.

### 7.4 Talking to the server — `services/api.js`

`ApiClient` is a thin wrapper around the browser's `fetch`. It sets JSON headers, attaches the
`Authorization: Bearer <token>` header, sends cookies, and turns a non-OK response into a
thrown `Error` carrying the server's `detail` (including plan-limit `code` and
`upgrade_required`, which the UI uses to show upgrade prompts). `ENDPOINTS` is a single map of
every path so URLs are never hand-typed. `API_BASE_URL` comes from `VITE_API_URL` (or a
deployed default), so the same code works locally and in production.

### 7.5 Rendering & editing — `components/canvas/`

Each element category has a component (`Text`, `Textarea`, `Line`, `Rectangle`, `Ellipse`,
`Image`, `Connectors`). `A4` is the page surface; `SelectionOverlay` draws handles around the
selected element; `Guides` shows alignment/spacing lines while dragging. The `utils/` folder
holds the pure logic these rely on (text wrapping and height measurement mirroring the
backend, spacing guides, page-spread math, the serial save queue), and each pure module has a
matching `*.test.js`.

---

## 8. The template system (two of them)

This is the most common source of confusion, so it's worth stating plainly. There are **two
independent template systems**, and they are both real:

1. **Static frontend templates — `frontend/src/templates/*.js`.**
   24 hand-designed layouts (registered in `templates/index.js`). Each is just an **array of
   elements** built with the constructors in `helpers.js` (`text`, `block`, `line`, `circle`,
   `ellipse`, `bulleted`). When a user clicks a template in the picker, the editor drops that
   array straight onto the canvas and they edit the placeholder content by hand. This path
   uses **no AI**.

2. **Backend AI-CV generators — `backend/app/services/cv_generator.py`.**
   When a user uploads their existing CV and asks the app to rebuild it, the backend takes the
   *extracted data* plus a template id and generates a fresh element list sized to their real
   content (any number of jobs, multi-page if needed). This path is used by
   `POST /ai/fill_template`.

They share template *names* (ledger, nimbus, vector, kernel, …) and a visual language, but
they are different code taking different inputs: the frontend version is "pick a design and
type"; the backend version is "AI fills a design from your data".

Templates are also tiered: 8 are free "starter" templates
(`ledger, nimbus, vector, kernel, scribe, regent, quarry, graphite`); the rest require a paid
plan (enforced by `assert_template_allowed`).

---

## 9. Database schema

Defined in `backend/app/models/models.py`. Relationships (an arrow `A → B` means "A has a
foreign key pointing at B"):

```
users ─┬─◄ images            (owner_id)
       ├─◄ pdfs              (owner_id)
       ├─◄ bio_cv_drafts     (owner_id, one per user)
       ├─◄ user_subscriptions(user_id, one per user) ──► plans (plan_slug)
       ├─◄ usage_counters    (user_id, one row per month)
       └─◄ payments          (user_id)

pdfs ─◄ pdf_elements (pdf_id)      pdf_elements ─► images (img_id, optional)
```

| Table | Column | Meaning |
|---|---|---|
| **users** | `id` | Primary key. |
| | `username` | Unique login name. |
| | `email` | Contact email. |
| | `hashed_password` | Bcrypt hash (never plaintext). |
| | `created_at`, `is_active` | Metadata. |
| **images** | `id` | Primary key. |
| | `filename`, `file_path`, `file_size`, `mime_type` | The uploaded file. |
| | `owner_id` | → `users.id`. |
| **pdfs** | `id` | Primary key (the document). |
| | `title` | File name. |
| | `file_path` | Where the rendered PDF lives (disk path or S3 URL). |
| | `owner_id` | → `users.id`. |
| | `pages` | Page count. |
| | `page_width`, `page_height` | Page geometry (default A4: 595 × 842 pt). |
| | `created_at`, `updated_at` | Timestamps. |
| **pdf_elements** | `id` | Primary key. |
| | `pdf_id` | → `pdfs.id`. |
| | `element_id` | The nanoid used by the frontend. |
| | `category`, `page`, `left`, `top`, `width`, `height` | Core geometry. |
| | `content`, `fontSize`, `fontFamily`, `color`, `src`, `backgroundColor` | Common draw props. |
| | `img_id` | → `images.id` (only for image elements). |
| | `extra_properties` | **JSON** blob holding everything else (zIndex, bold/italic/underline, align, bulletList, autoHeight, fixedToPage, locked, borderWidth, filled, connector source/target/arrow, …). |
| **plans** | `slug` | Primary key: `free` / `standard` / `premium`. |
| | `max_projects`, `max_exports_per_month`, `max_ai_actions_per_month` | Limits (`NULL` = unlimited). |
| | `ai_assistant`, `extract_cv` | Feature flags. |
| | `template_tier` | `starter` or `all`. |
| | `stripe_price_id_monthly`, `is_active` | Billing-ready fields. |
| **user_subscriptions** | `user_id` | → `users.id` (primary key: one plan per user). |
| | `plan_slug` | → `plans.slug`. |
| | `status`, `current_period_*`, `stripe_*` | Subscription state (Stripe-ready). |
| **usage_counters** | `user_id` + `period_key` | Unique per user per month (`YYYY-MM`). |
| | `exports_count`, `ai_actions_count` | This month's meters. |
| **payments** | … | Ledger for future Stripe events. |
| **bio_cv_drafts** | `owner_id` | One resumable extracted-CV draft per user; `cv_data` is JSON. |
| **maintenance_markers** | `key` | Records one-off migrations so they never run twice. |

---

## 10. End-to-end data flows

**Create & download a PDF**

```
User edits canvas → clicks Save
  → usePdfExport.createPdf() POSTs {root: elements, pdf_title, pages, page_size} to /pdf/create_pdf
  → route: assert_can_create_project → create_new_pdf (rows) → PDF_Generator.render_elements (file/S3)
  → returns pdf_id
User clicks Download
  → /pdf/download_pdf: assert_can_export → record_export → presigned S3 URL (or file)
  → browser fetches the blob and saves it
```

**Autosave while editing** — 2s after edits settle, `PdfCanvas` calls `/pdf/save_elements`
(elements only, no render). `update_pdf_elements` treats the incoming list as authoritative:
it inserts new elements, updates changed ones, and **deletes** any DB rows no longer present
(so switching templates never leaves stale rows behind).

**AI: rebuild an uploaded CV**

```
Upload CV PDF → /ai/extract_cv
  → assert_can_extract_cv → PyMuPDF renders pages → GPT-4o → structured JSON → charge_ai_credits
Pick a template → /ai/fill_template
  → cv_generator builds the element list sized to the real content
  → frontend loads those elements onto the canvas to edit & export
```

**Login**

```
/auth/token (username+password) → verify bcrypt hash → issue JWT
  → frontend stores it in localStorage → every later request sends it as Bearer
  → verify_token guards protected routes; the SPA also polls /auth/verify-token to detect expiry
```

---

## 11. Authentication & security

- **Passwords** are bcrypt-hashed (`security.py`); the plaintext is never stored.
- **Sessions** are stateless **JWTs** signed with `SECRET_KEY`/`HS256`, kept in the browser's
  localStorage and sent as `Authorization: Bearer <token>`. Default lifetime 7 days.
- **Every protected route** depends on `verify_token`. Every by-id document/image route also
  checks ownership (`owner_id == current user`), preventing **IDOR** (reading someone else's
  data by guessing an id).
- **CORS** is restricted to the origins in `CORS_ORIGINS`.
- **Input** is validated by Pydantic schemas before any handler runs.
- **AI text** is sanitised before rendering (`sanitize_pdf_text` strips control/invisible
  characters that would show as missing-glyph boxes).

---

## 12. Plans, limits & entitlements

| | Free | Standard | Premium |
|---|---|---|---|
| Projects | 1 | 10 | unlimited |
| Exports / month | 3 | 30 | unlimited |
| AI credits / month | 0 | 150 | 300 |
| AI assistant | – | ✓ | ✓ |
| CV extraction | – | ✓ | ✓ |
| Templates | 8 starter | all 24 | all 24 |

Limits are enforced server-side by the `assert_can_*` gates and metered in `usage_counters`
(reset implicitly each month via the `YYYY-MM` period key). Until Stripe is wired in, the
`ALLOW_UNPAID_PLAN_SELECTION` flag lets a user self-activate a paid plan; the code already has
the seam (`402 payment_required`) where Checkout will slot in.

---

## 13. Running it locally

**Prerequisites:** Python 3.11+, Node.js 18+ (repo tested on Node 24).

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env      # then edit values (see below)
uvicorn app.main:app --reload   # serves the API on http://localhost:8000
```

Minimum `.env` to run locally with zero external services:

```ini
SECRET_KEY=any-long-random-string
ALGORITHM=HS256
DATABASE_URL=sqlite:///./pdfgenerator.db   # file DB, no install needed
CORS_ORIGINS=http://localhost:5173
# Leave S3_BUCKET_NAME empty → files go to backend/uploads and backend/static/generated
# Set API_GPT_KEY only if you want the AI features
```

(The database tables are created automatically on first startup, and the plan catalogue is
seeded for you.)

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Point the frontend at your local API by creating `frontend/.env.development`:

```ini
VITE_API_URL=http://localhost:8000
```

For a production build, `npm run build` outputs `frontend/dist`, which FastAPI will serve
automatically if present.

---

## 14. Testing

- **Backend** (pytest):

  ```bash
  cd backend
  pytest
  ```

  Covers PDF rendering (shapes, bullet layout, Unicode fonts), AI-CV routes and credits,
  entitlements/plan selection, auth token lifetime, and CV data validation.

- **Frontend** (Node's built-in test runner — there is no `npm test` script):

  ```bash
  cd frontend
  node --test src/**/*.test.js
  ```

  Covers the pure `utils/` logic (text wrapping/height, spacing guides, page spread, the
  serial save queue) and template invariants (`templates/*.test.js`), which read the template
  files as text and assert structural rules (e.g. Polish section headings, sidebar section
  placement).

---

## 15. Glossary of technologies

- **SPA (Single-Page Application)** — a website that loads once and then updates its content
  with JavaScript instead of fetching new HTML pages. Feels like an app.
- **React component** — a function that returns UI markup (JSX) and can hold *state*
  (remembered values that re-render the UI when they change).
- **Hook** — a React function (name starts with `use`) that lets a component use state and
  side-effects; here, custom hooks like `useA4Elements` package reusable logic.
- **Context** — React's built-in way to share values with many components without passing them
  down manually through every level.
- **Vite** — the build tool/dev server; `VITE_`-prefixed env vars are readable in the browser
  bundle.
- **REST API** — a set of HTTP endpoints (URLs + methods GET/POST/PUT/DELETE) that exchange
  JSON.
- **FastAPI dependency** — a function FastAPI runs before your route (e.g. `verify_token`,
  `get_db`) whose return value is injected into the handler.
- **ORM (SQLAlchemy)** — lets you use Python objects instead of writing SQL; a *session* is one
  unit of database work.
- **Pydantic schema** — a typed class that validates incoming/outgoing data and rejects bad
  input automatically.
- **JWT (JSON Web Token)** — a signed, self-contained login ticket. The server can verify it
  without storing session state.
- **bcrypt** — a deliberately slow password-hashing algorithm; slow is good because it makes
  brute-forcing stolen hashes expensive.
- **ReportLab** — the Python PDF drawing library; think of it as a canvas where you place text
  and shapes by coordinates.
- **PDF points** — the PDF unit of length: 1 point = 1/72 inch. A4 is 595 × 842 points.
- **S3 / presigned URL** — cloud file storage; a presigned URL is a temporary link that grants
  limited access without sharing credentials.
- **CORS** — the browser security rule that a page may only call APIs on origins the server
  has explicitly allowed.
- **IDOR (Insecure Direct Object Reference)** — a bug where changing an id in a request lets
  you read someone else's data; prevented here by ownership checks on every by-id route.

---

*Start reading the code at `frontend/src/pages/PdfCanvas.jsx` (the editor) and
`backend/app/services/pdf_generator.py` (the renderer). Between those two files, and the
element table in [§4](#4-the-single-most-important-concept-the-element), you can trace almost
any feature end to end.*
