# CV STUDIO (Kompoza) — PDF / CV Generator

> A visual, canvas-based CV builder for the Polish job market. Design an A4 résumé on a
> real drag-and-drop canvas, start from 24 industry templates, import an old PDF or run the
> bio wizard with AI, then export a pixel-faithful PDF rendered server-side.

**Languages / Języki:** [English](#english) · [Polski](#polski)

- **Frontend:** React 19 + Vite 7 (visual A4 canvas editor, CSS Modules)
- **Backend:** FastAPI + SQLAlchemy + ReportLab (server-side PDF), OpenAI (GPT-4o / gpt-5.x)
- **Storage:** SQLite locally, PostgreSQL + AWS S3 in production (Render)
- **Auth:** JWT bearer tokens (7-day), bcrypt password hashing
- **AI:** CV extraction from PDF, template auto-fill, and a floating AI career coach

This README is written as a tutorial. It explains the foundations, the technologies, and
the actual functions/classes/modules that make the app work — so a developer who has never
seen the code can understand it end to end. It is intentionally long.

---

# English

## Table of contents

1. [What this app is](#1-what-this-app-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Technology stack and why each piece exists](#3-technology-stack-and-why-each-piece-exists)
4. [Folder structure (detailed)](#4-folder-structure-detailed)
5. [Database structure (detailed)](#5-database-structure-detailed)
6. [Getting started — a step-by-step tutorial](#6-getting-started--a-step-by-step-tutorial)
7. [How the backend works](#7-how-the-backend-works)
8. [How the frontend works](#8-how-the-frontend-works)
9. [The PDF rendering engine explained](#9-the-pdf-rendering-engine-explained)
10. [The AI subsystem explained](#10-the-ai-subsystem-explained)
11. [Plans, entitlements, and billing](#11-plans-entitlements-and-billing)
12. [API reference](#12-api-reference)
13. [Features → file & line map](#13-features--file--line-map)
14. [Testing](#14-testing)
15. [Further reading (web resources)](#15-further-reading-web-resources)

---

## 1. What this app is

CV STUDIO is a full-stack web application for building résumés (CVs). Unlike form-based CV
tools, everything happens on a **visual A4 canvas**: text, shapes, lines, connectors and
images are absolutely positioned in pixels that map 1:1 to the exported PDF. What you see on
the canvas is what lands in the file.

There are three ways to start a document:

1. **Pick a template** — 24 industry-flavoured layouts (Finance, IT, Classic, Sidebar,
   Banking, Dark).
2. **Import from PDF** — upload an existing résumé; GPT-4o Vision reads it, extracts
   structured data, and a deterministic Python engine pours that data into any template.
3. **Bio wizard** — walk through personal data, experience, education, skills, languages and
   custom sections; the draft autosaves so you can leave and return.

Once on the canvas, an optional **floating AI assistant** rates the CV, checks grammar and
style, scores ATS-readiness, matches the CV against a pasted job description (with live web
search), and can execute layout edits in natural language (move/align/distribute elements,
restructure a section, clone decorations, delete a page's contents) — all previewed before
you accept them.

The whole UI is in Polish, built for the Polish job market.

---

## 2. Architecture at a glance

```
                        ┌──────────────────────────────────────────────┐
                        │                   BROWSER                      │
                        │  React 19 SPA (Vite build)                     │
                        │                                                │
                        │  Hero / Login / Register  ──►  PdfCanvas       │
                        │                                 │              │
                        │        A4 canvas + Editor + AI panels          │
                        │        state: useA4Elements + PdfContext       │
                        └───────────────┬────────────────────────────────┘
                                        │  fetch() JSON + Bearer JWT
                                        │  (services/api.js → ApiClient)
                                        ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                        FastAPI backend                             │
        │                                                                    │
        │  Routers:  /auth  /pdf  /images  /ai  (assistant)  /events /billing│
        │     │         │       │      │                          │          │
        │     ▼         ▼       ▼      ▼                          ▼          │
        │  security   ReportLab  S3    OpenAI (GPT-4o / gpt-5.x)  entitlements│
        │  (JWT+bcrypt) PDF gen  boto3  + DuckDuckGo web search   (plans/usage)│
        │                                                                    │
        │  SQLAlchemy ORM  ──►  SQLite (local)  /  PostgreSQL (prod)          │
        └───────────────────────────────────────────────────────────────────┘

  In production the SAME FastAPI process also serves the built React SPA
  (frontend/dist) and mounts /uploads, /template-assets, /static/generated.
```

**Key idea:** the canvas is the single source of truth. Elements are plain JSON objects
(`{category, left, top, width, height, content, fontFamily, …}`). The frontend stores them in
React state; the backend persists them in the `pdf_elements` table and re-renders the exact
same geometry into a PDF with ReportLab. The browser's textarea wrapping and the server's
text wrapping are deliberately kept in sync so the export matches the screen.

---

## 3. Technology stack and why each piece exists

### Backend (`backend/`, Python 3.11)

| Library | Role in this app |
|---|---|
| **FastAPI** | HTTP framework. Every route is an `async def` with dependency-injected auth + DB session. |
| **Uvicorn** | ASGI server that runs FastAPI. |
| **SQLAlchemy** | ORM. Models in [models.py](backend/app/models/models.py); engine switch (SQLite/Postgres) in [database.py](backend/app/models/database.py). |
| **ReportLab** | The PDF engine. Draws every element onto an A4 canvas — see [pdf_generator.py](backend/app/services/pdf_generator.py). |
| **fontTools** | Rewrites TTF name tables at load so bold/italic variants register as distinct fonts in ReportLab. |
| **PyMuPDF (`fitz`)** | Renders uploaded PDF pages to PNG images for GPT-4o Vision — [ai_service.py](backend/app/services/ai_service.py). |
| **openai** | Calls GPT-4o (extraction) and gpt-5.x-mini (assistant). |
| **duckduckgo-search** | Live web search that grounds the "match to job posting" AI action. |
| **python-jose** | Encodes/decodes JWT access tokens. |
| **passlib + bcrypt** | Password hashing (72-byte-safe). |
| **boto3** | AWS S3 upload / presigned download URLs in production. |
| **psycopg2-binary** | PostgreSQL driver for production. |

### Frontend (`frontend/`, Node)

| Library | Role in this app |
|---|---|
| **React 19** | UI. Function components + hooks throughout. |
| **Vite 7** | Dev server (HMR) and production bundler. |
| **react-router-dom 7** | Client-side routes: `/`, `/login`, `/register`, `/pdfcanvas`. |
| **react-dropzone** | Drag-and-drop image upload in the gallery. |
| **react-icons** | Icon set for toolbars and controls. |
| **motion** (Framer Motion) | Animations for panels/modals. |
| **nanoid** | Generates unique `element_id`s for canvas elements. |
| **react-spinners** | Loading spinners during export. |
| **CSS Modules** | Component-scoped styling (`*.module.css`). |

---

## 4. Folder structure (detailed)

```
pdf-generator/
├── CLAUDE.md                     # Agent instructions (skill routing + README rules)
├── README.md                     # ← you are here
├── BUGZ.MD / TODOS.md            # Working notes
├── docs/                         # Product & engineering docs
│   ├── FEATURES.md               # Polish marketing-style feature overview
│   ├── cv-template-generation.md
│   ├── designs/                  # UX / monetization design notes
│   └── superpowers/              # Plans & specs authored during development
│
├── backend/                      # FastAPI application
│   ├── requirements.txt          # Python dependencies
│   ├── .env.example              # Environment template (auth, DB, CORS, S3)
│   ├── pdfgenerator.db           # Local SQLite DB (dev)
│   ├── fonts/                    # TTF font families bundled for the PDF engine
│   ├── template_assets/          # Versioned PNG assets used by built-in templates
│   ├── uploads/ , static/        # Local storage for images / generated PDFs
│   ├── tests/                    # pytest suite (see §14)
│   └── app/
│       ├── main.py               # App bootstrap: routers, static mounts, SPA serving
│       ├── dependencies.py       # get_db() session dependency
│       ├── core/
│       │   ├── config.py         # Env-driven settings (CORS, S3, OpenAI key, paths)
│       │   └── security.py       # JWT create/verify + bcrypt hash/verify
│       ├── models/
│       │   ├── database.py       # Engine + SessionLocal + declarative Base
│       │   └── models.py         # ORM tables + init_db() + lightweight migrations
│       ├── schemas/              # Pydantic request/response models
│       │   ├── pdf_schema.py     # PDFCreateRequest / PDFUpdateRequest (element list)
│       │   ├── cv_data_schema.py # Bio-CV draft request/response
│       │   └── user_schema.py
│       ├── crud/                 # DB read/write helpers (one module per entity)
│       │   ├── user.py  images.py  pdfs.py  bio_cv_drafts.py
│       ├── api/routes/           # HTTP routers (one file per domain)
│       │   ├── auth.py           # register / token / verify / entitlements
│       │   ├── pdf.py            # create / fetch / show / update / save / download / delete
│       │   ├── images.py         # upload / fetch / delete images
│       │   ├── ai.py             # extract_cv / fill_template / bio_cv_draft
│       │   ├── ai_assistant.py   # /ai/assistant chat + analysis dispatcher
│       │   ├── billing.py        # plans / select-plan
│       │   └── events.py         # client event logging
│       ├── services/             # Business logic (no HTTP here)
│       │   ├── pdf_generator.py  # ReportLab drawing engine (PDF_Generator class)
│       │   ├── ai_service.py     # GPT-4o Vision CV extraction + resume generation entry
│       │   ├── cv_generator.py   # Deterministic canvas-layout engine (2.7k lines)
│       │   ├── ai_assistant_service.py  # AI chat + rating/grammar/ATS/etc. prompts
│       │   ├── layout_analysis.py       # Deterministic move/align/restructure resolvers
│       │   ├── cv_data.py        # Normalizes/validates extracted CV data
│       │   ├── entitlements.py   # Plans, usage meters, Free-tier gates
│       │   ├── openai_pricing.py # Token → cost (USD/PLN) accounting
│       │   ├── s3_storage.py     # S3 upload + presigned URLs
│       │   └── legacy_document_cleanup.py
│       └── utils/
│           ├── build_pdf.py      # Render elements to an in-memory PDF buffer
│           ├── image_src_to_path.py
│           ├── pdf_file_ops.py   # Local file rename/delete
│           └── metrics_logging.py
│
└── frontend/                     # React + Vite SPA
    ├── package.json  vite.config.js  eslint.config.js  index.html
    ├── .env.example              # VITE_API_URL
    ├── public/                   # Static assets: fonts, logos, template mockups
    │   ├── fonts/                # Same TTFs as backend, @font-face'd for the canvas
    │   └── template-mockups/     # Preview thumbnails for the template picker
    └── src/
        ├── main.jsx  App.jsx     # Entry + router
        ├── ProtectedRoute.jsx    # Redirects unauthenticated users to /login
        ├── index.css  App.css    # Global styles + design tokens (CSS variables)
        ├── pages/
        │   ├── Hero/             # Marketing landing page
        │   ├── Login/  Register/ # Auth screens (+ PlanSelector)
        │   └── PdfCanvas.jsx     # The editor shell (context provider, orchestration)
        ├── store/
        │   └── pdfgenerator-context.jsx   # React Context shape (the app's shared API)
        ├── hooks/
        │   ├── useA4Elements.js  # THE canvas engine: elements, pages, drag, undo/redo
        │   ├── usePdfExport.js   # create/update/save network calls
        │   ├── useEntitlements.js
        │   ├── useToasts.js
        │   └── useCanvasEnterIds.js
        ├── services/
        │   ├── api.js            # ApiClient + ENDPOINTS map
        │   └── eventLog.js
        ├── templates/            # 24 template definitions (element arrays)
        │   ├── index.js          # TEMPLATES registry (id, tier, name, industry, accent)
        │   ├── ledger.js … onyx.js
        │   ├── banking.js        # 4 banking templates in one file
        │   └── helpers.js
        ├── components/
        │   ├── canvas/           # A4, Text, Textarea, Rectangle, Ellipse, Line,
        │   │                     #   Image, Connectors, Guides, SelectionOverlay
        │   ├── editor/           # Editor (properties panel), Sidebar, Topbar, PageControls
        │   ├── ai/               # AiAssistant, AiCvPanel, BioCvModal
        │   ├── gallery/          # Dropzone + image Gallery
        │   ├── modals/           # ModalPdfs, TemplatesModal, PlanSelectModal
        │   └── common/           # Buttons, dialogs, spinners, toasts, resize handles
        └── utils/                # Pure helpers, each with a *.test.js sibling
            ├── textareaReflow.js  textareaHeight.js  textareaEditing.js
            ├── spacingGuides.js   spacingLabelLayout.js  textSpacingHold.js
            ├── structureOperation.js  serialSaveQueue.js  pageSpread.js  pageDrag.js
            ├── cvTemplateSelection.js  bioCvData.js  entitlements.js
            └── elementBounds.js  canvasEnter.js  sanitizeTextContent.js  download.js
```

---

## 5. Database structure (detailed)

The schema is defined with SQLAlchemy in [models.py](backend/app/models/models.py). Tables
are created on startup by `init_db()` (with retries for Render's flaky first Postgres SSL
handshake) and a small hand-rolled migration adds multi-page columns to pre-existing rows.

### Entity relationships

```
users ──1:N──► images
  │  ╲
  │   ╲──1:N──► pdfs ──1:N──► pdf_elements ──0:1──► images (img_id)
  │
  ├──1:1──► bio_cv_drafts
  ├──1:1──► user_subscriptions ──N:1──► plans
  ├──1:N──► usage_counters   (unique per user+period_key)
  └──1:N──► payments

maintenance_markers   (standalone: one row per one-off migration)
```

### Tables

**`users`** — accounts.

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| username | String, unique, indexed | login handle |
| email | String, unique | |
| hashed_password | String | bcrypt hash |
| created_at | DateTime | |
| is_active | Boolean | |

**`images`** — uploaded images available to place on the canvas.

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| filename, file_path | String | local path or S3 URL |
| file_size | Integer | bytes |
| mime_type | String | |
| uploaded_at | DateTime | |
| owner_id | FK → users.id | |

**`pdfs`** — one row per saved document (project).

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| title | String | file name / project title |
| file_path | String, nullable | rendered PDF path or S3 URL |
| created_at / updated_at | DateTime | |
| owner_id | FK → users.id | |
| pages | Integer, default 1 | page count |
| page_width / page_height | Float, default 595 / 842 | A4 portrait in points |

**`pdf_elements`** — every canvas element of a document. This is the heart of the data model.

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| pdf_id | FK → pdfs.id | owning document |
| img_id | FK → images.id, nullable | for image elements |
| element_id | String | client-generated (nanoid), stable across saves |
| category | String | `text` \| `textarea` \| `line` \| `rectangle` \| `circle` \| `ellipse` \| `connector` \| `image` |
| page | Integer, default 1 | which page it lives on |
| left / top | Float | position (top-left origin, px = pt) |
| width / height | VARCHAR, nullable | stored as strings (mixed px/auto history) |
| content | Text, nullable | text/textarea copy |
| fontSize | Float, nullable | |
| fontFamily / color | String, nullable | |
| src | String, nullable | image source |
| backgroundColor | String, nullable | shape fill / border / line colour |
| extra_properties | JSON, nullable | catch-all: `bold`, `italic`, `underline`, `align`, `lineHeight`, `letterSpacing`, `bulletList`, `autoHeight`, `zIndex`, `borderWidth`, `filled`, `arrow`, `source_id`, `target_id`, `locked`, `fixedToPage`, … |

> **Why `extra_properties` JSON?** The canvas element model is richer and evolves faster than
> a fixed column set. Style and behaviour flags live in a JSON blob so new element features
> don't require a migration; the stable geometry/identity fields stay as real columns for
> querying.

**`bio_cv_drafts`** — one resumable wizard draft per user.

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| owner_id | FK → users.id, unique | one draft per user |
| cv_data | JSON | the structured CV being built |
| created_at / updated_at | DateTime | |

**`plans`** — subscription catalog (Free / Standard / Premium), seeded on boot.

| Column | Type | Notes |
|---|---|---|
| slug | String PK | `free` \| `standard` \| `premium` |
| name | String | display name |
| max_projects | Integer, nullable | `NULL` = unlimited |
| max_exports_per_month | Integer, nullable | |
| max_ai_actions_per_month | Integer, nullable | monthly AI credits |
| ai_assistant | Boolean | assistant feature gate |
| extract_cv | Boolean | PDF-extract feature gate |
| template_tier | String | `starter` (8 templates) \| `all` (24) |
| stripe_price_id_monthly | String, nullable | filled when Stripe lands |
| is_active | Boolean | |

**`user_subscriptions`** — the user's current plan (Stripe-ready columns nullable until billing lands).

| Column | Type | Notes |
|---|---|---|
| user_id | FK → users.id, PK | |
| plan_slug | FK → plans.slug | |
| status | String | `active` \| `canceled` \| `past_due` \| `trialing` |
| current_period_start / _end | DateTime, nullable | |
| stripe_customer_id / _subscription_id | String, nullable | |
| updated_at | DateTime | |

**`usage_counters`** — per-user monthly meters (unique on `user_id` + `period_key`).

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users.id | |
| period_key | String | `YYYY-MM` (UTC) |
| exports_count | Integer | PDF downloads this month |
| ai_actions_count | Integer | AI credits spent this month |

**`payments`** — a ledger for future Stripe (and other) payment events.

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | FK → users.id | |
| provider | String, default `stripe` | |
| provider_ref | String, nullable, indexed | external id |
| plan_slug | String, nullable | |
| amount_cents | Integer, nullable | |
| currency | String, default `pln` | |
| status | String | `pending` \| `succeeded` \| `failed` \| `refunded` |
| raw | JSON, nullable | provider payload |
| created_at | DateTime | |

**`maintenance_markers`** — records one-off operational migrations that must never run twice
(`key` unique, `completed_at`).

---

## 6. Getting started — a step-by-step tutorial

### Prerequisites

- **Python 3.11+** and **Node 18+**
- (Optional) an **OpenAI API key** for AI features
- (Optional) **PostgreSQL** and an **AWS S3** bucket for production-like storage

### Step 1 — Clone and enter the project

```bash
git clone <your-fork-url> pdf-generator
cd pdf-generator
```

### Step 2 — Backend: create a virtualenv and install

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### Step 3 — Configure backend environment

Copy the template and fill it in:

```bash
cp .env.example .env
```

Minimum for local dev (SQLite, local file storage, no AI):

```dotenv
SECRET_KEY=change-me-to-a-long-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080          # 7 days
DATABASE_URL=sqlite:///./pdfgenerator.db   # leave S3 vars empty for local storage
CORS_ORIGINS=http://localhost:5173
# Optional AI:
# API_GPT_KEY=sk-...
```

> Leaving `S3_BUCKET_NAME` empty makes the app store PDFs in `static/generated/` and images
> in `uploads/` on the local filesystem (see [config.py](backend/app/core/config.py)).

### Step 4 — Run the backend

```bash
uvicorn app.main:app --reload --port 8000
```

On startup `init_db()` creates all tables, runs the multi-page migration, and seeds the
Free/Standard/Premium plans. Interactive API docs: <http://localhost:8000/docs>.

### Step 5 — Frontend: install and configure

```bash
cd ../frontend
npm install
cp .env.example .env.development     # or .env
```

Set the API URL:

```dotenv
VITE_API_URL=http://localhost:8000
```

> If no `.env` is present, [api.js](frontend/src/services/api.js) falls back to the deployed
> Render backend, so a bare clone still runs.

### Step 6 — Run the frontend

```bash
npm run dev
```

Open <http://localhost:5173>, register an account, and you land on the canvas.

### Step 7 — Build for production

```bash
npm run build     # emits frontend/dist
```

In production the FastAPI process serves `frontend/dist` itself: [main.py](backend/app/main.py)
mounts `/assets` and adds a catch-all route that returns `index.html` for client-side routing.
So a single deployment (e.g. Render) hosts both the API and the SPA.

---

## 7. How the backend works

### App bootstrap — [main.py](backend/app/main.py)

`main.py` builds the FastAPI app, then:

- On `@app.on_event("startup")` it calls `init_db()` and runs `run_legacy_document_cleanup()`.
- Registers an exception handler for `AIServiceError` that logs full context but returns a
  generic Polish message (no internal leakage).
- Ensures upload directories exist and mounts static paths: `/uploads`, `/template-assets`,
  `/static/generated`.
- Includes every router (`auth`, `pdf`, `images`, `ai`, `ai_assistant`, `events`, `billing`).
- If `frontend/dist` exists, mounts `/assets` and adds the SPA catch-all.
- Adds CORS middleware driven by `CORS_ORIGINS`.

### Configuration — [config.py](backend/app/core/config.py)

All environment knobs in one place: CORS origins, backend URL, template-asset directory,
local upload folders, the S3 bucket + region (presence of a bucket flips `USE_S3`), the OpenAI
key, and `ALLOW_UNPAID_PLAN_SELECTION` (the pre-Stripe switch that lets users self-activate a
paid plan for free).

### Auth — [security.py](backend/app/core/security.py) + [auth.py](backend/app/api/routes/auth.py)

- `create_access_token()` signs a JWT with `python-jose`; lifetime defaults to 7 days and is
  configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`.
- `verify_token()` is a FastAPI dependency: it decodes the bearer token, extracts `sub`
  (username), and 403s on any failure. Every protected route depends on it.
- Passwords are hashed with `bcrypt`. `_password_to_72_bytes()` truncates to bcrypt's 72-byte
  limit so long passwords can't error at hash/verify time.
- Routes: `POST /auth/register`, `POST /auth/token` (login), `GET /auth/verify-token/{token}`,
  `GET /auth/me/entitlements`.

### Persistence — [database.py](backend/app/models/database.py) + CRUD

`database.py` reads `DATABASE_URL` and builds the engine. SQLite gets
`check_same_thread=False`; Postgres gets `pool_pre_ping=True` + `pool_recycle=300` to survive
Render dropping idle SSL sockets. `postgres://` URLs are rewritten to `postgresql://`.
`SessionLocal` is the session factory; `dependencies.get_db()` yields a session per request.

The `crud/` modules keep raw ORM queries out of the routers (e.g. `pdfs.create_new_pdf`,
`update_pdf_elements`, `request_pdf_elements_by_element_id`).

### Ownership & security in the PDF routes — [pdf.py](backend/app/api/routes/pdf.py)

Every by-id document route runs through `_require_owned_pdf()`, which 404s if the row is
missing and 403s if it belongs to another user. This closes an IDOR hole (any logged-in user
reading anyone's documents by guessing ids). Notable routes:

- `POST /pdf/create_pdf` — checks the project quota, renders a PDF (S3 or local), saves the
  row and its elements.
- `PUT /pdf/save_elements` — the **cheap autosave**: persists elements + page geometry only,
  no ReportLab render, no S3 upload. Called on an idle debounce while editing.
- `PUT /pdf/update_pdf` — full save: re-renders the PDF and updates elements.
- `POST /pdf/download_pdf` — checks the export quota, records the export, returns a presigned
  S3 URL (or the row locally).

---

## 8. How the frontend works

### Routing & guards — [App.jsx](frontend/src/App.jsx) + [ProtectedRoute.jsx](frontend/src/ProtectedRoute.jsx)

Four routes: `/` (Hero), `/login`, `/register`, and `/pdfcanvas` (wrapped in
`ProtectedRoute`, which redirects users without a token to `/login`).

### The canvas engine — [useA4Elements.js](frontend/src/hooks/useA4Elements.js)

This ~1,900-line hook is the heart of the editor. It owns:

- `A4_Elements` — the array of element objects currently on the canvas, plus
  `A4_Elements_deleted` (a queue of deletions to persist on the next save).
- **Element creation** — `handleAddText`, `handleAddTextarea`, `handleAddRectangle`,
  `handleAddCircle`, `handleAddEllipse`, `handleAddLine`, `handleAddImage`, and connector mode
  (`startConnecting` / `pickConnectorAt`). Each new element gets a `nanoid` id.
- **Selection & movement** — single and multi-select (Ctrl/Cmd), drag, group move, alignment,
  duplicate, delete, resize, z-index.
- **Multi-page** — `pageCount`, `currentPage`, add/remove/clone/reorder pages, and a
  two-page-spread view.
- **View-only zoom** — 25 %–300 %, snapped to a clean 0.1 grid; zoom never touches the exported
  geometry (`A4_PAGE_SIZE` is a frozen 595×842).
- **Undo / redo** — an in-session history stack (`undo`, `redo`, `canUndo`, `canRedo`).
- **Textarea reflow** — text boxes measure their own wrapped height with the same font metrics
  the PDF uses ([textareaReflow.js](frontend/src/utils/textareaReflow.js)), so what wraps on
  screen wraps in the file.

### Shared state — [pdfgenerator-context.jsx](frontend/src/store/pdfgenerator-context.jsx) + [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx)

`PdfCanvas.jsx` is the orchestration shell. It wires `useA4Elements`, `usePdfExport`,
`useEntitlements` and `useToasts` together and exposes everything through a single
`PdfContext.Provider` value (`ctxValue`). Every canvas/editor/modal component reads what it
needs from context instead of prop-drilling.

Highlights inside `PdfCanvas.jsx`:

- **Mutually-exclusive surfaces** — a single `dialog` state (`docs` / `templates` / `ai` /
  `bioCv` / `plan`) and a single `panel` state (`upload` / `gallery`) guarantee only one
  overlay is open at a time.
- **Serial autosave** — edits schedule a 2-second debounced save; saves run through a promise
  queue (`enqueueAutosave`) so a slow older request can never overwrite newer canvas data.
- **Preview-before-apply** — AI layout patches, structure operations and deletions render as a
  non-interactive preview (`previewedElements`) until the user accepts them.

### Talking to the API — [api.js](frontend/src/services/api.js)

`ApiClient.httpRequest()` wraps `fetch`, injects the bearer token, and normalizes errors —
including the structured plan-limit payload (`code`, `upgrade_required`, `message`) so the UI
can show upgrade prompts. `ENDPOINTS` is the single map of every backend path.

### Templates — [templates/index.js](frontend/src/templates/index.js)

`TEMPLATES` is an array of 24 entries, each `{ id, tier, name, industry, accent, elements }`.
`elements` is the same JSON element shape the canvas and backend use, so "load template" is
just "replace `A4_Elements` with this array." Free-tier users get 8 `tier: "free"` templates;
the rest are `tier: "paid"`.

---

## 9. The PDF rendering engine explained

File: [pdf_generator.py](backend/app/services/pdf_generator.py). This is where the canvas
becomes a real PDF, drawn with **ReportLab's low-level `canvas` API**.

### Coordinate flip

The browser canvas uses a **top-left origin** (y grows downward). ReportLab uses a
**bottom-left origin** (y grows upward). Every draw method converts with the same formula:

```python
corrected_y = self.page_h - top - height
```

So an element stored as `top=50, height=20` on an 842-pt page is drawn at `y = 842 - 50 - 20`.
This one line is why the export matches the screen exactly.

### Font registration (the tricky part)

`_register_ttf()` rewrites each TTF's internal name-table before handing it to ReportLab.
Why: ReportLab dedupes dynamic fonts by the file's *internal* PostScript name, not the name
you pass to `registerFont()`. Several bundled variant files mislabel themselves internally
(e.g. `Inter-Bold.ttf` self-reports as "Inter-Regular"), so registering them naively collides
and bold/italic silently renders as regular. Rewriting the name records makes each variant a
distinct entry. Real bold/italic cuts are registered as font families so styled text uses true
glyphs (not faux skew/stroke), and Helvetica/Courier are aliased to the Unicode-safe Inter so
Polish diacritics (ą ć ę ł ń ó ś ź ż) always render.

### The `PDF_Generator` class

Constructed with the document row and a ReportLab canvas. It exposes one render method per
element category — `renderText`, `renderTextarea`, `renderLine`, `renderRectangle`,
`renderEllipse`, `renderConnector`, `renderImage` — plus:

- **`_wrap_textarea()`** — reproduces the browser's soft-wrap: honours explicit newlines,
  breaks on spaces, hard-breaks over-long words per character, and supports bullet lists with a
  hanging indent. It measures widths with the exact font + letter-spacing the canvas uses.
- **`renderTextarea()`** — lays out wrapped lines with CSS-style half-leading, supports
  left/center/right/justify (justify stretches word spacing, leaving the last line ragged like
  CSS), clips overflowing lines, and can auto-size its height.
- **`_connector_geometry()`** — an orthogonal (right-angle) route between two element boxes,
  identical to the frontend's `connectorPath.js`, with an optional arrowhead.
- **`render_elements()`** — groups elements by `page`, emits one ReportLab page each (empty
  pages preserved), resolves image sources through an injected resolver, and saves.

`build_pdf.py`'s `build_pdf_to_buffer()` wires this together into an in-memory buffer used for
S3 uploads.

---

## 10. The AI subsystem explained

There are two independent AI flows plus a large deterministic layer.

### A) Import a PDF → structured data → filled template

1. **`POST /ai/extract_cv`** ([ai.py](backend/app/api/routes/ai.py)) accepts a PDF (≤10 MB),
   checks the `extract_cv` entitlement, and calls `extract_cv_data()`.
2. **`extract_cv_data()`** ([ai_service.py](backend/app/services/ai_service.py)) renders the
   first 3 pages to PNG at 150 DPI with PyMuPDF, sends them to **GPT-4o Vision** with a strict
   JSON schema (name, title, contact, summary, experience[], education[], skills[],
   extra_sections[]), and returns normalized data. `response_format={"type":"json_object"}`
   forces valid JSON.
3. **`POST /ai/fill_template`** validates the data, checks the template entitlement, and calls
   `generate_resume(template_id, cv_data)`.
4. **`cv_generator.py`** (a ~2,700-line deterministic engine) builds the full canvas-element
   array in the chosen template's visual style — the number of experience/education blocks
   matches the CV exactly, text is measured and paginated, nothing is truncated. **GPT never
   picks coordinates**; only the extraction step uses the model.

The **bio wizard** uses the same `fill_template` path, but the data comes from
`bio_cv_drafts` (autosaved via `GET/PUT/DELETE /ai/bio_cv_draft`) instead of a PDF.

### B) The floating AI assistant — [ai_assistant_service.py](backend/app/services/ai_assistant_service.py)

`POST /ai/assistant` dispatches an `action` to one handler. Analysis actions each build a
focused Polish prompt with an explicit scoring rubric and return a structured result
(`message`, `rating`, `tips`, `corrections`, `web_sources`):

| Action | What it does |
|---|---|
| `rating` | Overall CV score 1–10 against a 5-part rubric. |
| `design_rating` | Typography critique (font size/weight/colour/alignment) — corrections limited to style fields, never positions. |
| `position_rating` | Match the CV against a pasted job description, grounded with **live DuckDuckGo search**. |
| `grammar` | Proofreading — returns full corrected text per element. |
| `language` | Style/tone rewrite of weak bullets. |
| `improve` | Rewrites duties into strong, metric-driven bullets. |
| `ats_score` | ATS-compatibility score. |
| `layout` | Deterministic layout proposals (no model call at all). |
| `chat` | Free-form conversation + natural-language editing. |

**Safety by construction:** `_safe_result()` strips any positional fields from GPT
corrections — the model may only touch `content`, `fontSize`, `fontFamily`, `color`, `bold`,
`italic`, `align`. Position changes are never free-typed by the model.

**Natural-language editing (`chat`):** the model first decides `in_scope` (CV/résumé topics
only; off-topic messages get a polite refusal and never mutate the canvas). In scope, it can
emit one of several structured operations, each **resolved deterministically** by
[layout_analysis.py](backend/app/services/layout_analysis.py) so Python — not GPT — computes
the final pixels and rejects anything that would fall off the page or hit a locked/background
element:

- `position_operation` — `shift` / `align` / `distribute` / `space` / `move_to_page` /
  `move_to_sidebar`, on single elements or whole logical blocks.
- `structure_operation` — `restructure_section`: split one text block into properly-spaced
  heading/entry/body fields with reflow.
- `delete_operation` — mark elements for deletion (always requires a separate UI confirm).
- `clone_operation` — duplicate an element relative to a reference, matching size/alignment.

Every operation comes back as a **preview group** the UI renders before the user accepts.

### Cost accounting — [openai_pricing.py](backend/app/services/openai_pricing.py)

`usage_from_response()` turns token counts into USD and a PLN estimate. In `entitlements.py`,
`credits_for_cost()` converts that PLN cost into AI credits (1 credit = 0.05 PLN, minimum 1 per
call), and `charge_ai_credits()` increments the user's monthly meter.

---

## 11. Plans, entitlements, and billing

Defined in [entitlements.py](backend/app/services/entitlements.py) and exposed via
[billing.py](backend/app/api/routes/billing.py).

| | Free | Standard | Premium |
|---|---|---|---|
| Projects | 1 | 10 | unlimited |
| Exports / month | 3 | 30 | unlimited |
| AI credits / month | 0 | 150 | 300 |
| AI assistant | ✗ | ✓ | ✓ |
| CV extraction | ✗ | ✓ | ✓ |
| Templates | 8 starter | all 24 | all 24 |
| Price (PLN/mo) | 0 | 29 | 49 |

- `bootstrap_billing()` runs on startup: seeds the catalog, migrates any legacy `pro` →
  `premium`, and backfills a Free subscription for every user.
- `get_entitlements()` returns the plan, limits, current usage and remaining allowances — the
  same shape the frontend's `useEntitlements` consumes.
- Gate functions (`assert_can_create_project`, `assert_can_export`, `assert_has_ai_credits`,
  `assert_can_use_ai_assistant`, `assert_can_extract_cv`, `assert_template_allowed`) raise a
  `PlanLimitError` — a 403 whose structured detail (`code`, `message`, `upgrade_required`)
  drives the upgrade UI.
- **Stripe seam:** columns and code paths exist but are dormant. `ALLOW_UNPAID_PLAN_SELECTION`
  (default `true`) currently lets users self-activate a paid plan for free; flipping it to
  `false` makes `select-plan` return `402 payment_required` where Checkout will later plug in.

---

## 12. API reference

All routes except `register`/`token` require an `Authorization: Bearer <jwt>` header.

### Auth — `/auth`
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/token` | Log in, receive a JWT |
| GET | `/auth/verify-token/{token}` | Validate a token |
| GET | `/auth/me/entitlements` | Current plan, limits, usage |

### PDF / documents — `/pdf`
| Method | Path | Purpose |
|---|---|---|
| POST | `/pdf/create_pdf` | Render + save a new document |
| GET | `/pdf/fetch_pdfs` | List the user's documents |
| POST | `/pdf/show_pdf` | Load one document's elements |
| PUT | `/pdf/update_pdf` | Full save (re-render) |
| PUT | `/pdf/save_elements` | Lightweight autosave (elements only) |
| POST | `/pdf/download_pdf` | Get a (presigned) download URL |
| DELETE | `/pdf/delete_pdf` | Delete a document |

### Images — `/images`
| Method | Path | Purpose |
|---|---|---|
| POST | `/images/upload_image` | Upload an image to the gallery |
| GET | `/images/fetch_images` | List the user's images |
| DELETE | `/images/delete_image` | Delete an image |

### AI — `/ai`
| Method | Path | Purpose |
|---|---|---|
| POST | `/ai/extract_cv` | PDF → structured CV data (GPT-4o Vision) |
| POST | `/ai/fill_template` | CV data → canvas elements for a template |
| GET/PUT/DELETE | `/ai/bio_cv_draft` | Read/save/delete the bio wizard draft |
| POST | `/ai/assistant` | Assistant dispatcher (rating, chat, layout, …) |

### Billing & events
| Method | Path | Purpose |
|---|---|---|
| GET | `/billing/plans` | Plan catalog + current plan |
| POST | `/billing/select-plan` | Activate a plan (or signal payment required) |
| POST | `/events/log` | Client-side event logging |

---

## 13. Features → file & line map

Each feature below points at the primary source location(s). Line ranges are approximate
anchors, not exact bounds.

### Backend

| Feature | File | Lines |
|---|---|---|
| JWT create/verify + bcrypt hashing | [security.py](backend/app/core/security.py) | 30–70 |
| Auth routes (register/login/verify/entitlements) | [auth.py](backend/app/api/routes/auth.py) | 18–57 |
| ORM tables (all 10) | [models.py](backend/app/models/models.py) | 24–172 |
| DB init + multi-page migration + retries | [models.py](backend/app/models/models.py) | 175–244 |
| SQLite/Postgres engine switch | [database.py](backend/app/models/database.py) | 8–35 |
| Font registration (name-table rewrite) | [pdf_generator.py](backend/app/services/pdf_generator.py) | 44–103 |
| Top-left → bottom-left coordinate flip | [pdf_generator.py](backend/app/services/pdf_generator.py) | 117–139 |
| Textarea wrap matching the browser | [pdf_generator.py](backend/app/services/pdf_generator.py) | 314–373 |
| Textarea render (align/justify/clip/auto-height) | [pdf_generator.py](backend/app/services/pdf_generator.py) | 401–462 |
| Connector geometry + arrowhead | [pdf_generator.py](backend/app/services/pdf_generator.py) | 160–227 |
| Multi-page element rendering | [pdf_generator.py](backend/app/services/pdf_generator.py) | 468–528 |
| In-memory PDF buffer | [build_pdf.py](backend/app/utils/build_pdf.py) | 6–16 |
| IDOR ownership guard | [pdf.py](backend/app/api/routes/pdf.py) | 122–132 |
| Create document (quota + render + S3/local) | [pdf.py](backend/app/api/routes/pdf.py) | 39–101 |
| Lightweight autosave | [pdf.py](backend/app/api/routes/pdf.py) | 223–243 |
| Export with quota + presigned URL | [pdf.py](backend/app/api/routes/pdf.py) | 246–260 |
| PDF → images → GPT-4o extraction | [ai_service.py](backend/app/services/ai_service.py) | 16–95 |
| Deterministic CV layout engine | [cv_generator.py](backend/app/services/cv_generator.py) | 1–2765 |
| AI extract/fill/draft routes | [ai.py](backend/app/api/routes/ai.py) | 60–144 |
| Assistant dispatcher | [ai_assistant_service.py](backend/app/services/ai_assistant_service.py) | 943–979 |
| Analysis prompts (rating/design/ATS/…) | [ai_assistant_service.py](backend/app/services/ai_assistant_service.py) | 230–614 |
| NL chat + safe operation resolution | [ai_assistant_service.py](backend/app/services/ai_assistant_service.py) | 639–922 |
| Deterministic layout/structure/clone resolvers | [layout_analysis.py](backend/app/services/layout_analysis.py) | 1–2216 |
| Plan seeds + credit math | [entitlements.py](backend/app/services/entitlements.py) | 28–77 |
| Entitlement snapshot | [entitlements.py](backend/app/services/entitlements.py) | 307–351 |
| Feature/quota gates | [entitlements.py](backend/app/services/entitlements.py) | 354–424 |
| Billing routes + Stripe seam | [billing.py](backend/app/api/routes/billing.py) | 26–76 |
| S3 upload + presigned URLs | [s3_storage.py](backend/app/services/s3_storage.py) | 1–62 |
| Token → cost accounting | [openai_pricing.py](backend/app/services/openai_pricing.py) | 1–72 |
| App bootstrap + SPA serving | [main.py](backend/app/main.py) | 28–95 |

### Frontend

| Feature | File | Lines |
|---|---|---|
| Client routes | [App.jsx](frontend/src/App.jsx) | 9–14 |
| Auth guard | [ProtectedRoute.jsx](frontend/src/ProtectedRoute.jsx) | 3–12 |
| Canvas engine (elements/pages/drag/undo) | [useA4Elements.js](frontend/src/hooks/useA4Elements.js) | 31–1875 |
| Fixed A4 size + view-only zoom | [useA4Elements.js](frontend/src/hooks/useA4Elements.js) | 19–29 |
| Editor orchestration + context provider | [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx) | 38–745 |
| Mutually-exclusive dialog/panel state | [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx) | 49–66 |
| Serial autosave queue | [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx) | 298–373 |
| AI preview-before-apply | [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx) | 455–489 |
| Shared context shape | [pdfgenerator-context.jsx](frontend/src/store/pdfgenerator-context.jsx) | 7–80 |
| API client + endpoint map | [api.js](frontend/src/services/api.js) | 7–100 |
| 24-template registry | [templates/index.js](frontend/src/templates/index.js) | 23–48 |
| Floating AI assistant UI | [AiAssistant.jsx](frontend/src/components/ai/AiAssistant/AiAssistant.jsx) | 1–982 |
| Element properties panel | [Editor.jsx](frontend/src/components/editor/Editor/Editor.jsx) | 1–713 |
| Canvas element renderer | [CanvasElements.jsx](frontend/src/components/canvas/CanvasElements/CanvasElements.jsx) | 1–139 |
| Textarea reflow (matches PDF) | [textareaReflow.js](frontend/src/utils/textareaReflow.js) | — |
| Spacing guides & labels | [spacingGuides.js](frontend/src/utils/spacingGuides.js) | — |

---

## 14. Testing

The backend ships a `pytest` suite in [backend/tests/](backend/tests/) covering the risky,
deterministic parts: entitlements/plan selection, AI credit accounting, CV data normalization,
layout analysis, PDF shapes/bullets/unicode fonts, element updates, clone operations, and the
legacy cleanup.

```bash
cd backend
pytest
```

The frontend uses lightweight `*.test.js` files next to the pure utilities (e.g.
`textareaReflow.test.js`, `pageSpread.test.js`, `structureOperation.test.js`,
`serialSaveQueue.test.js`, `spacingGuides.test.js`).

---

## 15. Further reading (web resources)

**FastAPI, SQLAlchemy & JWT auth**
- [Securing FastAPI with JWT Token-based Authentication — TestDriven.io](https://testdriven.io/blog/fastapi-jwt-auth/)
- [Authentication and Authorization with FastAPI — Better Stack](https://betterstack.com/community/guides/scaling-python/authentication-fastapi/)
- [Serving a React Frontend with FastAPI — David Muraya](https://davidmuraya.com/blog/serving-a-react-frontend-application-with-fastapi/)

**ReportLab (PDF engine)**
- [ReportLab User Guide (PDF)](https://www.reportlab.com/docs/reportlab-userguide.pdf)
- [Getting Started with ReportLab's Canvas — Mouse vs Python](https://blog.pythonlibrary.org/2021/09/15/getting-started-with-reportlabs-canvas/)
- [How to draw shapes in PDF using ReportLab](https://woteq.com/how-to-draw-shapes-in-pdf-using-reportlab/)

**PyMuPDF (PDF → image)**
- [PyMuPDF Tutorial (official docs)](https://pymupdf.readthedocs.io/en/latest/tutorial.html)
- [Pixmap reference (official docs)](https://pymupdf.readthedocs.io/en/latest/pixmap.html)
- [Converting PDFs to Images with PyMuPDF — Artifex](https://artifex.com/blog/converting-pdfs-to-images-with-pymupdf-a-complete-guide)

**OpenAI Vision → structured JSON**
- [Using GPT-4o to extract structured JSON from PDFs — Microsoft Learn](https://learn.microsoft.com/en-us/samples/azure-samples/azure-openai-gpt-4-vision-pdf-extraction-sample/using-azure-openai-gpt-4o-to-extract-structured-json-data-from-pdf-documents)
- [GPT-4o Vision Guide — GetStream](https://getstream.io/blog/gpt-4o-vision-guide/)

**React state (Context + hooks)**
- [A guide to the React useReducer Hook — LogRocket](https://blog.logrocket.com/react-usereducer-hook-ultimate-guide/)
- [Context API & useReducer for global state — Medium](https://medium.com/@ahsan-ali-mansoor/using-context-api-and-usereducer-for-global-state-management-in-react-d49061df1ce)
- [Vite + React SPA — DEV Community](https://dev.to/tak089/vite-for-react-spa-3do9)

---
---

# Polski

> Wizualny kreator CV oparty na płótnie A4, zbudowany pod polski rynek pracy. Projektuj CV
> metodą przeciągnij-i-upuść, zaczynaj od 24 szablonów branżowych, importuj stare PDF-y lub
> przejdź kreator bio z AI, a następnie eksportuj wierny co do piksela PDF renderowany po
> stronie serwera.

## Spis treści

1. [Czym jest ta aplikacja](#1-czym-jest-ta-aplikacja)
2. [Architektura w skrócie](#2-architektura-w-skrócie)
3. [Stos technologiczny i po co każdy element](#3-stos-technologiczny-i-po-co-każdy-element)
4. [Struktura folderów (szczegółowo)](#4-struktura-folderów-szczegółowo)
5. [Struktura bazy danych (szczegółowo)](#5-struktura-bazy-danych-szczegółowo)
6. [Pierwsze kroki — samouczek](#6-pierwsze-kroki--samouczek)
7. [Jak działa backend](#7-jak-działa-backend)
8. [Jak działa frontend](#8-jak-działa-frontend)
9. [Silnik renderowania PDF](#9-silnik-renderowania-pdf)
10. [Podsystem AI](#10-podsystem-ai)
11. [Plany, uprawnienia i płatności](#11-plany-uprawnienia-i-płatności)
12. [Dokumentacja API](#12-dokumentacja-api)
13. [Funkcje → mapa plików i linii](#13-funkcje--mapa-plików-i-linii)
14. [Testy](#14-testy)
15. [Dalsza lektura](#15-dalsza-lektura)

---

## 1. Czym jest ta aplikacja

CV STUDIO to pełnostackowa aplikacja webowa do tworzenia CV. W przeciwieństwie do narzędzi
formularzowych wszystko dzieje się na **wizualnym płótnie A4**: tekst, kształty, linie,
łączniki i obrazy są pozycjonowane bezwzględnie w pikselach, które odwzorowują eksport PDF
w skali 1:1. To, co widzisz na płótnie, trafia do pliku.

Dokument można zacząć na trzy sposoby:

1. **Wybierz szablon** — 24 układy branżowe (Finanse, IT, Classic, Sidebar, Banking, Dark).
2. **Importuj z PDF** — prześlij istniejące CV; GPT-4o Vision je odczytuje, wyodrębnia dane, a
   deterministyczny silnik Pythona wlewa je do dowolnego szablonu.
3. **Kreator bio** — przejdź dane osobowe, doświadczenie, wykształcenie, umiejętności, języki i
   sekcje własne; szkic zapisuje się automatycznie, więc możesz wyjść i wrócić.

Na płótnie opcjonalny **pływający asystent AI** ocenia CV, sprawdza gramatykę i styl, liczy
wynik ATS, dopasowuje CV do wklejonego ogłoszenia (z wyszukiwaniem w sieci) i wykonuje
polecenia edycji w języku naturalnym (przesuwanie/wyrównywanie/rozkładanie elementów,
przebudowa sekcji, klonowanie dekoracji, usuwanie zawartości strony) — zawsze z podglądem
przed zatwierdzeniem.

Cały interfejs jest po polsku.

---

## 2. Architektura w skrócie

```
                        ┌──────────────────────────────────────────────┐
                        │                 PRZEGLĄDARKA                    │
                        │  React 19 SPA (build Vite)                     │
                        │                                                │
                        │  Hero / Login / Rejestracja ──► PdfCanvas      │
                        │                                 │              │
                        │        Płótno A4 + Edytor + panele AI          │
                        │        stan: useA4Elements + PdfContext        │
                        └───────────────┬────────────────────────────────┘
                                        │  fetch() JSON + Bearer JWT
                                        ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                        Backend FastAPI                             │
        │  Routery: /auth /pdf /images /ai (asystent) /events /billing       │
        │  security   ReportLab   S3    OpenAI (GPT-4o / gpt-5.x)  entitlements│
        │  (JWT+bcrypt) PDF        boto3 + wyszukiwanie DuckDuckGo (plany/limity)│
        │  SQLAlchemy ORM ──► SQLite (lokalnie) / PostgreSQL (produkcja)      │
        └───────────────────────────────────────────────────────────────────┘

  Na produkcji TEN SAM proces FastAPI serwuje też zbudowane SPA (frontend/dist)
  oraz montuje /uploads, /template-assets, /static/generated.
```

**Kluczowa idea:** płótno jest jedynym źródłem prawdy. Elementy to zwykłe obiekty JSON
(`{category, left, top, width, height, content, fontFamily, …}`). Frontend trzyma je w stanie
React; backend zapisuje je w tabeli `pdf_elements` i renderuje tę samą geometrię do PDF za
pomocą ReportLab. Zawijanie tekstu w przeglądarce i na serwerze jest celowo zsynchronizowane,
więc eksport odpowiada ekranowi.

---

## 3. Stos technologiczny i po co każdy element

### Backend (`backend/`, Python 3.11)

| Biblioteka | Rola w aplikacji |
|---|---|
| **FastAPI** | Framework HTTP. Każda trasa to `async def` z wstrzykiwaną autoryzacją i sesją DB. |
| **Uvicorn** | Serwer ASGI uruchamiający FastAPI. |
| **SQLAlchemy** | ORM. Modele w [models.py](backend/app/models/models.py); wybór silnika w [database.py](backend/app/models/database.py). |
| **ReportLab** | Silnik PDF. Rysuje każdy element na płótnie A4 — [pdf_generator.py](backend/app/services/pdf_generator.py). |
| **fontTools** | Przepisuje tablice nazw TTF, aby warianty bold/italic rejestrowały się jako odrębne fonty. |
| **PyMuPDF (`fitz`)** | Renderuje strony przesłanego PDF na obrazy PNG dla GPT-4o Vision. |
| **openai** | Wywołuje GPT-4o (ekstrakcja) i gpt-5.x-mini (asystent). |
| **duckduckgo-search** | Wyszukiwanie w sieci dla akcji „dopasuj do ogłoszenia”. |
| **python-jose** | Koduje/dekoduje tokeny JWT. |
| **passlib + bcrypt** | Haszowanie haseł (bezpieczne dla 72 bajtów). |
| **boto3** | Przesyłanie do S3 i podpisane linki pobierania na produkcji. |
| **psycopg2-binary** | Sterownik PostgreSQL. |

### Frontend (`frontend/`, Node)

| Biblioteka | Rola w aplikacji |
|---|---|
| **React 19** | UI — komponenty funkcyjne i hooki. |
| **Vite 7** | Serwer deweloperski (HMR) i bundler produkcyjny. |
| **react-router-dom 7** | Trasy klienckie: `/`, `/login`, `/register`, `/pdfcanvas`. |
| **react-dropzone** | Upload obrazów metodą przeciągnij-i-upuść. |
| **react-icons** | Zestaw ikon. |
| **motion** | Animacje paneli/modali. |
| **nanoid** | Generuje unikalne `element_id`. |
| **react-spinners** | Wskaźniki ładowania. |
| **CSS Modules** | Style ograniczone do komponentu (`*.module.css`). |

---

## 4. Struktura folderów (szczegółowo)

Zobacz szczegółowe drzewo w [sekcji angielskiej](#4-folder-structure-detailed) — struktura
jest identyczna. Najważniejsze katalogi:

- **`backend/app/api/routes/`** — routery HTTP (jeden plik na domenę: `auth`, `pdf`, `images`,
  `ai`, `ai_assistant`, `billing`, `events`).
- **`backend/app/services/`** — logika biznesowa: silnik PDF (`pdf_generator.py`),
  deterministyczny generator układu CV (`cv_generator.py`, ~2700 linii), asystent AI
  (`ai_assistant_service.py`), analiza układu (`layout_analysis.py`, ~2200 linii), uprawnienia
  (`entitlements.py`).
- **`backend/app/models/`** — `database.py` (silnik/sesja) i `models.py` (tabele ORM).
- **`backend/fonts/`** — rodziny czcionek TTF pakowane dla silnika PDF (te same, które
  frontend ładuje przez `@font-face`).
- **`frontend/src/hooks/useA4Elements.js`** — silnik płótna (elementy, strony, przeciąganie,
  cofnij/ponów).
- **`frontend/src/pages/PdfCanvas.jsx`** — powłoka edytora spinająca cały stan przez
  `PdfContext`.
- **`frontend/src/templates/`** — 24 definicje szablonów (tablice elementów) + rejestr
  `index.js`.
- **`frontend/src/utils/`** — czyste funkcje pomocnicze, każda z plikiem `*.test.js`.

---

## 5. Struktura bazy danych (szczegółowo)

Schemat zdefiniowany w SQLAlchemy w [models.py](backend/app/models/models.py). Tabele powstają
przy starcie w `init_db()` (z ponawianiem dla kapryśnego pierwszego handshake SSL na Render),
a lekka migracja dodaje kolumny wielostronicowe do istniejących wierszy.

### Relacje

```
users ──1:N──► images
  │  ╲
  │   ╲──1:N──► pdfs ──1:N──► pdf_elements ──0:1──► images (img_id)
  │
  ├──1:1──► bio_cv_drafts
  ├──1:1──► user_subscriptions ──N:1──► plans
  ├──1:N──► usage_counters   (unikalne per user+period_key)
  └──1:N──► payments

maintenance_markers   (osobna: jeden wiersz na jednorazową migrację)
```

### Tabele

- **`users`** — konta: `id`, `username` (unikalny, indeks), `email` (unikalny),
  `hashed_password` (bcrypt), `created_at`, `is_active`.
- **`images`** — przesłane obrazy: `id`, `filename`, `file_path` (lokalnie lub URL S3),
  `file_size`, `mime_type`, `uploaded_at`, `owner_id` → users.
- **`pdfs`** — jeden wiersz na zapisany dokument: `id`, `title`, `file_path` (nullable),
  `created_at`/`updated_at`, `owner_id` → users, `pages` (domyślnie 1), `page_width`/
  `page_height` (domyślnie 595/842 pt, A4 pion).
- **`pdf_elements`** — każdy element płótna (serce modelu danych): `id`, `pdf_id` → pdfs,
  `img_id` → images (nullable), `element_id` (nanoid, stabilny), `category`
  (`text`/`textarea`/`line`/`rectangle`/`circle`/`ellipse`/`connector`/`image`), `page`,
  `left`/`top`, `width`/`height` (VARCHAR), `content`, `fontSize`, `fontFamily`, `color`,
  `src`, `backgroundColor`, oraz `extra_properties` (JSON: `bold`, `italic`, `underline`,
  `align`, `lineHeight`, `letterSpacing`, `bulletList`, `autoHeight`, `zIndex`, `borderWidth`,
  `filled`, `arrow`, `source_id`, `target_id`, `locked`, `fixedToPage`, …).

  > **Dlaczego JSON `extra_properties`?** Model elementu jest bogatszy i szybciej się rozwija
  > niż stały zestaw kolumn. Flagi stylu i zachowania żyją w blobie JSON, więc nowe funkcje nie
  > wymagają migracji; stabilne pola geometrii/tożsamości pozostają kolumnami do zapytań.

- **`bio_cv_drafts`** — jeden wznawialny szkic kreatora na użytkownika: `id`, `owner_id` →
  users (unikalny), `cv_data` (JSON), `created_at`/`updated_at`.
- **`plans`** — katalog subskrypcji (Free/Standard/Premium), zasilany przy starcie: `slug`
  (PK), `name`, `max_projects` (NULL = bez limitu), `max_exports_per_month`,
  `max_ai_actions_per_month` (kredyty AI/mies.), `ai_assistant`, `extract_cv`, `template_tier`
  (`starter`/`all`), `stripe_price_id_monthly`, `is_active`.
- **`user_subscriptions`** — bieżący plan użytkownika: `user_id` (PK), `plan_slug` → plans,
  `status`, `current_period_start`/`_end`, `stripe_customer_id`/`_subscription_id`,
  `updated_at`.
- **`usage_counters`** — miesięczne liczniki (unikalne na `user_id`+`period_key`): `id`,
  `user_id`, `period_key` (`RRRR-MM`, UTC), `exports_count`, `ai_actions_count`.
- **`payments`** — księga przyszłych płatności Stripe: `id`, `user_id`, `provider`,
  `provider_ref`, `plan_slug`, `amount_cents`, `currency` (domyślnie `pln`), `status`, `raw`
  (JSON), `created_at`.
- **`maintenance_markers`** — rejestr jednorazowych migracji operacyjnych (`key` unikalny,
  `completed_at`).

---

## 6. Pierwsze kroki — samouczek

### Wymagania

- **Python 3.11+** i **Node 18+**
- (opcjonalnie) klucz **OpenAI API** do funkcji AI
- (opcjonalnie) **PostgreSQL** i **AWS S3** do konfiguracji zbliżonej do produkcji

### Krok 1 — Sklonuj projekt

```bash
git clone <adres-repozytorium> pdf-generator
cd pdf-generator
```

### Krok 2 — Backend: wirtualne środowisko i zależności

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### Krok 3 — Konfiguracja środowiska backendu

```bash
cp .env.example .env
```

Minimum do pracy lokalnej (SQLite, pliki lokalne, bez AI):

```dotenv
SECRET_KEY=zmień-na-długi-losowy-ciąg
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080          # 7 dni
DATABASE_URL=sqlite:///./pdfgenerator.db   # puste zmienne S3 = magazyn lokalny
CORS_ORIGINS=http://localhost:5173
# Opcjonalnie AI:
# API_GPT_KEY=sk-...
```

> Puste `S3_BUCKET_NAME` powoduje zapis PDF-ów do `static/generated/`, a obrazów do `uploads/`
> na dysku lokalnym (zobacz [config.py](backend/app/core/config.py)).

### Krok 4 — Uruchom backend

```bash
uvicorn app.main:app --reload --port 8000
```

Przy starcie `init_db()` tworzy tabele, uruchamia migrację wielostronicową i zasila plany
Free/Standard/Premium. Interaktywne API: <http://localhost:8000/docs>.

### Krok 5 — Frontend: instalacja i konfiguracja

```bash
cd ../frontend
npm install
cp .env.example .env.development
```

```dotenv
VITE_API_URL=http://localhost:8000
```

> Bez pliku `.env` [api.js](frontend/src/services/api.js) użyje wdrożonego backendu na Render,
> więc świeży klon i tak działa.

### Krok 6 — Uruchom frontend

```bash
npm run dev
```

Otwórz <http://localhost:5173>, załóż konto i trafisz na płótno.

### Krok 7 — Build produkcyjny

```bash
npm run build     # tworzy frontend/dist
```

Na produkcji proces FastAPI sam serwuje `frontend/dist`: [main.py](backend/app/main.py) montuje
`/assets` i dodaje trasę „catch-all” zwracającą `index.html` dla routingu klienckiego. Jedno
wdrożenie (np. Render) hostuje więc i API, i SPA.

---

## 7. Jak działa backend

- **Bootstrap** ([main.py](backend/app/main.py)) — przy starcie `init_db()` i czyszczenie
  legacy; handler wyjątków `AIServiceError` loguje kontekst, ale zwraca ogólny komunikat;
  montaż statyków i wszystkich routerów; CORS z `CORS_ORIGINS`; serwowanie SPA.
- **Konfiguracja** ([config.py](backend/app/core/config.py)) — CORS, S3 (obecność bucketa
  włącza `USE_S3`), klucz OpenAI, `ALLOW_UNPAID_PLAN_SELECTION`.
- **Autoryzacja** ([security.py](backend/app/core/security.py), [auth.py](backend/app/api/routes/auth.py))
  — JWT (python-jose, 7 dni), zależność `verify_token` na każdej chronionej trasie, bcrypt z
  bezpiecznym przycięciem do 72 bajtów.
- **Trwałość** ([database.py](backend/app/models/database.py)) — wybór SQLite/Postgres,
  `pool_pre_ping` dla Render; moduły `crud/` trzymają zapytania ORM poza routerami.
- **Bezpieczeństwo dokumentów** ([pdf.py](backend/app/api/routes/pdf.py)) — `_require_owned_pdf`
  zamyka lukę IDOR; lekki autozapis `save_elements` bez renderu; eksport z limitem i podpisanym
  URL.

---

## 8. Jak działa frontend

- **Routing i strażnik** — cztery trasy w [App.jsx](frontend/src/App.jsx);
  `ProtectedRoute` odsyła niezalogowanych do `/login`.
- **Silnik płótna** ([useA4Elements.js](frontend/src/hooks/useA4Elements.js)) — ~1900 linii:
  tworzenie elementów (każdy z `nanoid`), zaznaczanie i przesuwanie (pojedyncze i grupowe),
  wyrównywanie, duplikacja, zmiana rozmiaru, warstwy, wiele stron, widok dwóch stron, zoom
  25–300 % (tylko podgląd, nie wpływa na eksport), cofnij/ponów, reflow pól tekstowych zgodny z
  metrykami PDF.
- **Wspólny stan** ([PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx),
  [pdfgenerator-context.jsx](frontend/src/store/pdfgenerator-context.jsx)) — powłoka spina
  hooki i udostępnia wszystko przez jeden `PdfContext.Provider`. Wzajemnie wykluczające się
  `dialog`/`panel` (jedna nakładka naraz), szeregowy autozapis (kolejka obietnic zapobiega
  nadpisaniu nowszych danych) oraz podgląd przed zatwierdzeniem zmian AI.
- **Komunikacja z API** ([api.js](frontend/src/services/api.js)) — `ApiClient` opakowuje
  `fetch`, wstrzykuje token i normalizuje błędy, w tym strukturalny komunikat o limicie planu.
- **Szablony** ([templates/index.js](frontend/src/templates/index.js)) — 24 wpisy
  `{id, tier, name, industry, accent, elements}`; „wczytaj szablon” to podmiana `A4_Elements`.

---

## 9. Silnik renderowania PDF

Plik: [pdf_generator.py](backend/app/services/pdf_generator.py). Tutaj płótno staje się PDF-em,
rysowanym niskopoziomowym API `canvas` z ReportLab.

- **Odwrócenie współrzędnych** — przeglądarka ma początek w lewym górnym rogu (y w dół),
  ReportLab w lewym dolnym (y w górę). Każda metoda przelicza:
  `corrected_y = self.page_h - top - height`. Ta jedna linia sprawia, że eksport odpowiada
  ekranowi.
- **Rejestracja fontów** — `_register_ttf()` przepisuje wewnętrzną tablicę nazw TTF, bo
  ReportLab deduplikuje fonty po *wewnętrznej* nazwie pliku, a nie po nazwie z
  `registerFont()`. Bez tego warianty bold/italic kolidowałyby i renderowały się jako regular.
  Prawdziwe kroje bold/italic są rejestrowane jako rodziny (zamiast pochylania/pogrubiania
  imitowanego), a Helvetica/Courier są aliasowane na Inter, aby polskie znaki (ą ć ę ł ń ó ś ź ż)
  zawsze się renderowały.
- **Klasa `PDF_Generator`** — po jednej metodzie na kategorię elementu plus:
  `_wrap_textarea()` (zawijanie zgodne z przeglądarką, listy punktowane z wcięciem wiszącym),
  `renderTextarea()` (half-leading jak w CSS, wyrównanie lewo/środek/prawo/justowanie, przycięcie
  nadmiaru, auto-wysokość), `_connector_geometry()` (łącznik prostokątny ze strzałką) i
  `render_elements()` (grupowanie po stronach, po jednej stronie ReportLab).
- `build_pdf.py` → `build_pdf_to_buffer()` renderuje do bufora w pamięci (dla uploadu do S3).

---

## 10. Podsystem AI

### A) Import PDF → dane → wypełniony szablon

1. `POST /ai/extract_cv` przyjmuje PDF (≤10 MB) i sprawdza uprawnienie.
2. `extract_cv_data()` renderuje pierwsze 3 strony do PNG (150 DPI, PyMuPDF) i wysyła do
   **GPT-4o Vision** ze ścisłym schematem JSON; `response_format={"type":"json_object"}` wymusza
   poprawny JSON.
3. `POST /ai/fill_template` waliduje dane i wywołuje `generate_resume()`.
4. `cv_generator.py` (deterministyczny silnik ~2700 linii) buduje pełną tablicę elementów w
   stylu szablonu — liczba bloków dokładnie odpowiada CV, nic nie jest ucinane. **GPT nigdy nie
   wybiera współrzędnych** — model działa tylko na etapie ekstrakcji.

Kreator **bio** korzysta z tej samej ścieżki `fill_template`, ale dane pochodzą z
`bio_cv_drafts` (autozapis przez `GET/PUT/DELETE /ai/bio_cv_draft`).

### B) Pływający asystent — [ai_assistant_service.py](backend/app/services/ai_assistant_service.py)

`POST /ai/assistant` kieruje `action` do jednego handlera: `rating`, `design_rating`,
`position_rating` (z **wyszukiwaniem DuckDuckGo**), `grammar`, `language`, `improve`,
`ats_score`, `layout` (bez wywołania modelu) i `chat`.

**Bezpieczeństwo z założenia:** `_safe_result()` usuwa z poprawek GPT wszelkie pola pozycji —
model może dotknąć tylko `content`, `fontSize`, `fontFamily`, `color`, `bold`, `italic`,
`align`.

**Edycja w języku naturalnym (`chat`):** model najpierw ocenia `in_scope` (tylko tematy CV;
poza zakresem — grzeczna odmowa, brak zmian na płótnie). W zakresie może zwrócić operację
strukturalną, którą **deterministycznie** rozwiązuje [layout_analysis.py](backend/app/services/layout_analysis.py)
(to Python, nie GPT, liczy piksele i odrzuca ruch poza stronę lub na element zablokowany/tło):
`position_operation` (`shift`/`align`/`distribute`/`space`/`move_to_page`/`move_to_sidebar`),
`structure_operation` (`restructure_section`), `delete_operation` i `clone_operation`. Każda
operacja wraca jako **podgląd** do zatwierdzenia.

### Rozliczanie kosztów — [openai_pricing.py](backend/app/services/openai_pricing.py)

`usage_from_response()` przelicza tokeny na USD i szacunek PLN; `credits_for_cost()` zamienia
koszt na kredyty AI (1 kredyt = 0,05 PLN, min. 1 na wywołanie), a `charge_ai_credits()`
zwiększa miesięczny licznik.

---

## 11. Plany, uprawnienia i płatności

Zdefiniowane w [entitlements.py](backend/app/services/entitlements.py), udostępnione przez
[billing.py](backend/app/api/routes/billing.py).

| | Free | Standard | Premium |
|---|---|---|---|
| Projekty | 1 | 10 | bez limitu |
| Eksporty / mies. | 3 | 30 | bez limitu |
| Kredyty AI / mies. | 0 | 150 | 300 |
| Asystent AI | ✗ | ✓ | ✓ |
| Ekstrakcja CV | ✗ | ✓ | ✓ |
| Szablony | 8 startowych | 24 | 24 |
| Cena (PLN/mies.) | 0 | 29 | 49 |

- `bootstrap_billing()` przy starcie: zasila katalog, migruje `pro` → `premium` i dodaje
  subskrypcję Free każdemu użytkownikowi.
- Funkcje bramkujące (`assert_can_*`) rzucają `PlanLimitError` — 403 ze strukturalnym `detail`
  (`code`, `message`, `upgrade_required`), który steruje UI ulepszenia.
- **Miejsce na Stripe:** kolumny i ścieżki istnieją, ale śpią. `ALLOW_UNPAID_PLAN_SELECTION`
  (domyślnie `true`) pozwala aktywować plan płatny za darmo; ustawienie `false` sprawia, że
  `select-plan` zwraca `402 payment_required`.

---

## 12. Dokumentacja API

Wszystkie trasy poza `register`/`token` wymagają nagłówka `Authorization: Bearer <jwt>`.
Pełne tabele endpointów znajdziesz w [sekcji angielskiej](#12-api-reference) — ścieżki są
identyczne: `/auth`, `/pdf`, `/images`, `/ai`, `/billing`, `/events`.

---

## 13. Funkcje → mapa plików i linii

Zobacz szczegółową tabelę w [sekcji angielskiej](#13-features--file--line-map). Najważniejsze:

- Silnik PDF: [pdf_generator.py](backend/app/services/pdf_generator.py) (fonty 44–103, odwrócenie
  Y 117–139, zawijanie 314–373, render 401–528).
- Ekstrakcja CV: [ai_service.py](backend/app/services/ai_service.py):16–95.
- Generator układu CV: [cv_generator.py](backend/app/services/cv_generator.py):1–2765.
- Asystent AI: [ai_assistant_service.py](backend/app/services/ai_assistant_service.py) (dispatcher
  943–979, czat 639–922, prompty 230–614).
- Uprawnienia/limity: [entitlements.py](backend/app/services/entitlements.py):28–424.
- Silnik płótna: [useA4Elements.js](frontend/src/hooks/useA4Elements.js):31–1875.
- Powłoka edytora: [PdfCanvas.jsx](frontend/src/pages/PdfCanvas.jsx):38–745.
- Rejestr szablonów: [templates/index.js](frontend/src/templates/index.js):23–48.

---

## 14. Testy

Backend ma zestaw `pytest` w [backend/tests/](backend/tests/): uprawnienia i wybór planu,
rozliczanie kredytów AI, normalizacja danych CV, analiza układu, kształty/punktory/fonty
unicode w PDF, aktualizacje elementów, operacje klonowania i czyszczenie legacy.

```bash
cd backend
pytest
```

Frontend używa lekkich plików `*.test.js` obok czystych funkcji (`textareaReflow.test.js`,
`pageSpread.test.js`, `structureOperation.test.js`, `serialSaveQueue.test.js`,
`spacingGuides.test.js`).

---

## 15. Dalsza lektura

Ta sama lista źródeł co w [sekcji angielskiej](#15-further-reading-web-resources):

- FastAPI + JWT: [TestDriven.io](https://testdriven.io/blog/fastapi-jwt-auth/) ·
  [Better Stack](https://betterstack.com/community/guides/scaling-python/authentication-fastapi/)
- ReportLab: [User Guide (PDF)](https://www.reportlab.com/docs/reportlab-userguide.pdf) ·
  [Mouse vs Python](https://blog.pythonlibrary.org/2021/09/15/getting-started-with-reportlabs-canvas/)
- PyMuPDF: [Dokumentacja](https://pymupdf.readthedocs.io/en/latest/tutorial.html) ·
  [Artifex](https://artifex.com/blog/converting-pdfs-to-images-with-pymupdf-a-complete-guide)
- OpenAI Vision → JSON: [Microsoft Learn](https://learn.microsoft.com/en-us/samples/azure-samples/azure-openai-gpt-4-vision-pdf-extraction-sample/using-azure-openai-gpt-4o-to-extract-structured-json-data-from-pdf-documents)
- React (Context + hooki): [LogRocket](https://blog.logrocket.com/react-usereducer-hook-ultimate-guide/) ·
  [Vite + React SPA](https://dev.to/tak089/vite-for-react-spa-3do9)

---

*CV STUDIO — od pustej strony do PDF-a gotowego na rozmowę kwalifikacyjną.*
