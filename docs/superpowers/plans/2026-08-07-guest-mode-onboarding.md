# Guest Mode Onboarding (Etap 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor use the CV editor (wizard, blank canvas, all 14 templates, a demo CV) with zero login and zero backend AI cost, and only ask for an account at the moment they try to save/export — reordering the funnel from `auth → value` to `value → auth`.

**Architecture:** `/pdfcanvas` becomes reachable without a JWT. Guest edits persist to `localStorage` via a new `guestDocument` util (mirroring the shape `usePdfExport` already sends to the backend). The two buttons that need a real backend-rendered PDF (`Zapisz PDF` / `Pobierz PDF`) are gated by presence of `localStorage.token`; when absent, a new `SaveGateModal` sends the visitor to `/register` or `/login` instead of firing the API call. On return with a valid token, `PdfCanvas` auto-claims the buffered guest document via the existing `createPdf` call. PDF import (`POST /ai/extract_cv`) stays exactly as gated as it is today — it costs OpenAI money and Etap 1 explicitly does not touch entitlements/billing.

**Tech Stack:** React 19 (existing hooks/context architecture, no new dependencies), FastAPI/Pydantic (one `Literal` widened on an existing endpoint), Node built-in test runner (`node --test`, no jsdom) for frontend units, Python `unittest` for backend.

## Global Constraints

- No changes to `entitlements.py`, `billing.py`, `pdf_generator.py`, or the `plans` table (spec §5).
- No watermarking, no import-gating changes, no Stripe, no Google OAuth, no CV Score (spec §5).
- PDF import (`start=import` CTA, `AiCvPanel`) stays behind registration exactly as today — copy-only tweaks at most, no routing change (spec §4.5).
- Every new guest code path must make **zero** backend calls until the visitor has a JWT (spec §4.1–§4.3). Where an existing component makes an unconditional authenticated call on mount/open, it must be guarded, not left to fail with a raw 401.
- Follow existing patterns: `DialogShell` for new modals, the `dialog` state-machine string-discriminant pattern in `PdfCanvas.jsx`, `useToasts`/`pushToast` for confirmations, Node's built-in test runner under `frontend/src/utils/*.test.js` (no jsdom — DOM-heavy container components in this codebase are verified by hand in the browser, not unit-tested; see Task 15).
- Never write a stray `event_type` string to `POST /events/log` that Pydantic will reject — the backend enum is the source of truth (Task 1 first).

---

### Task 1: Widen the `/events/log` event vocabulary for guest funnel events

**Files:**
- Modify: `backend/app/api/routes/events.py:24`
- Test: `backend/tests/test_events_log.py`

**Interfaces:**
- Produces: `EventLogRequest.event_type` now accepts, in addition to the existing `"template_picked"` / `"template_dismissed"`: `"landing_cta_clicked"`, `"guest_editor_opened"`, `"guest_demo_loaded"`, `"guest_first_edit"`, `"save_gate_shown"`, `"register_completed"`, `"guest_doc_claimed"`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_events_log.py`, inside `EventsLogTests`, right after `test_dismissed_event_without_template_id_is_accepted`:

```python
    def test_guest_funnel_event_types_are_accepted(self):
        app.dependency_overrides[verify_token] = _fake_verify_token
        app.dependency_overrides[get_db] = _fake_get_db

        for event_type in (
            "landing_cta_clicked",
            "guest_editor_opened",
            "guest_demo_loaded",
            "guest_first_edit",
            "save_gate_shown",
            "register_completed",
            "guest_doc_claimed",
        ):
            with self.subTest(event_type=event_type):
                response = self.client.post(
                    "/events/log",
                    json={"event_type": event_type},
                    headers={"Authorization": "Bearer fake"},
                )
                self.assertEqual(response.status_code, 200)
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `python -m unittest tests.test_events_log.EventsLogTests.test_guest_funnel_event_types_are_accepted -v`
Expected: FAIL with `assertEqual(422, 200)` for every subtest (Pydantic rejects the unknown `event_type`).

- [ ] **Step 3: Widen the Literal**

In `backend/app/api/routes/events.py`, replace:

```python
class EventLogRequest(BaseModel):
    """Allowed template-picker events only — keeps the metric vocabulary small."""

    event_type: Literal["template_picked", "template_dismissed"]
    template_id: str | None = None
```

with:

```python
class EventLogRequest(BaseModel):
    """Allowed product-metric events only — keeps the metric vocabulary small.

    Guest-funnel events (landing_cta_clicked .. guest_doc_claimed) are queued
    client-side while anonymous (see frontend/src/utils/guestEvents.js) and
    flushed through this same authenticated endpoint once the visitor has a
    JWT — this endpoint itself never accepts unauthenticated requests.
    """

    event_type: Literal[
        "template_picked",
        "template_dismissed",
        "landing_cta_clicked",
        "guest_editor_opened",
        "guest_demo_loaded",
        "guest_first_edit",
        "save_gate_shown",
        "register_completed",
        "guest_doc_claimed",
    ]
    template_id: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_events_log -v`
Expected: all tests PASS, including the new `test_guest_funnel_event_types_are_accepted`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/events.py backend/tests/test_events_log.py
git commit -m "feat: widen events/log vocabulary for guest onboarding funnel"
```

---

### Task 2: `guestDocument.js` — localStorage persistence for an unsaved canvas

**Files:**
- Create: `frontend/src/utils/guestDocument.js`
- Test: `frontend/src/utils/guestDocument.test.js`

**Interfaces:**
- Produces: `saveGuestDocument(snapshot)`, `loadGuestDocument()`, `clearGuestDocument()`, `hasGuestDocument()`. `snapshot` shape: `{ elements: Array, deletedIds: Array<string>, title: string, pageCount: number, editorMode: string, templateId: string|null, spacingPx: object|null, isDemoContent: boolean, updatedAt: number }`. `loadGuestDocument()` returns that same shape or `null`. Consumed by Task 6 (autosave), Task 10 (save-gate), Task 11 (claim), Task 12 (demo flag).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  saveGuestDocument,
  loadGuestDocument,
  clearGuestDocument,
  hasGuestDocument,
} from "./guestDocument.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("saveGuestDocument then loadGuestDocument round-trips the snapshot", () => {
  globalThis.localStorage = fakeLocalStorage();
  const snapshot = {
    elements: [{ element_id: "a", category: "text", content: "hi" }],
    deletedIds: [],
    title: "Moje CV",
    pageCount: 1,
    editorMode: "template",
    templateId: "ledger",
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1234,
  };

  saveGuestDocument(snapshot);
  const loaded = loadGuestDocument();

  assert.deepEqual(loaded, snapshot);
});

test("loadGuestDocument returns null when nothing was saved", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(loadGuestDocument(), null);
});

test("loadGuestDocument returns null for corrupted JSON instead of throwing", () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem("cvstudio.guest.doc", "{not json");
  assert.equal(loadGuestDocument(), null);
});

test("clearGuestDocument removes the stored snapshot", () => {
  globalThis.localStorage = fakeLocalStorage();
  saveGuestDocument({
    elements: [{ element_id: "a", category: "text" }],
    deletedIds: [],
    title: "x",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1,
  });
  clearGuestDocument();
  assert.equal(loadGuestDocument(), null);
});

test("hasGuestDocument is true only when there is at least one non-deleted element", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(hasGuestDocument(), false);

  saveGuestDocument({
    elements: [],
    deletedIds: [],
    title: "",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 1,
  });
  assert.equal(hasGuestDocument(), false);

  saveGuestDocument({
    elements: [{ element_id: "a", category: "text", content: "hi" }],
    deletedIds: [],
    title: "",
    pageCount: 1,
    editorMode: "freeform",
    templateId: null,
    spacingPx: null,
    isDemoContent: false,
    updatedAt: 2,
  });
  assert.equal(hasGuestDocument(), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `node --import ./scripts/register-hook.mjs --test src/utils/guestDocument.test.js`
Expected: FAIL — `guestDocument.js` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```js
/**
 * Client-side persistence for a canvas that has not been saved to the backend
 * yet — the guest-mode counterpart to the elements the backend stores per
 * `Pdf`/`PdfElements` row. Guests edit fully client-side (no account, no
 * OpenAI cost); this is the only place that state lives until they register
 * and the document is claimed (see PdfCanvas's claim effect).
 */

const STORAGE_KEY = "cvstudio.guest.doc";

/**
 * @param {{
 *   elements: object[],
 *   deletedIds: string[],
 *   title: string,
 *   pageCount: number,
 *   editorMode: string,
 *   templateId: string|null,
 *   spacingPx: object|null,
 *   isDemoContent: boolean,
 *   updatedAt: number,
 * }} snapshot
 */
export function saveGuestDocument(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage can be full or unavailable (private browsing); guest editing
    // still works in-memory for the current tab, it just won't survive a
    // reload. Not worth surfacing to the user for a best-effort cache.
  }
}

/** @returns {object|null} The last saved snapshot, or null if none/corrupt. */
export function loadGuestDocument() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGuestDocument() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op: if removal fails, the next saveGuestDocument overwrites anyway.
  }
}

/** True when there is a saved snapshot with at least one live element. */
export function hasGuestDocument() {
  const doc = loadGuestDocument();
  return Boolean(doc && Array.isArray(doc.elements) && doc.elements.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/guestDocument.test.js`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/guestDocument.js frontend/src/utils/guestDocument.test.js
git commit -m "feat: add guestDocument localStorage persistence util"
```

---

### Task 3: `guestEvents.js` — localStorage buffer for anonymous funnel events

**Files:**
- Create: `frontend/src/utils/guestEvents.js`
- Test: `frontend/src/utils/guestEvents.test.js`

**Interfaces:**
- Produces: `queueGuestEvent(eventType)`, `loadGuestEvents()` (returns `Array<{eventType: string, ts: number}>`), `clearGuestEvents()`. Consumed by Task 6, 8, 9, 10, 11, 12, 14 (queueing) and Task 11 (flush at claim time).

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { queueGuestEvent, loadGuestEvents, clearGuestEvents } from "./guestEvents.js";

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("queueGuestEvent appends to the buffer with a timestamp", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("guest_editor_opened");
  const events = loadGuestEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "guest_editor_opened");
  assert.equal(typeof events[0].ts, "number");
});

test("queueGuestEvent accumulates multiple events in order", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("guest_editor_opened");
  queueGuestEvent("guest_first_edit");
  const events = loadGuestEvents();
  assert.deepEqual(events.map((e) => e.eventType), ["guest_editor_opened", "guest_first_edit"]);
});

test("loadGuestEvents returns an empty array when nothing was queued", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.deepEqual(loadGuestEvents(), []);
});

test("loadGuestEvents returns an empty array for corrupted JSON instead of throwing", () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem("cvstudio.guest.events", "{not json");
  assert.deepEqual(loadGuestEvents(), []);
});

test("clearGuestEvents empties the buffer", () => {
  globalThis.localStorage = fakeLocalStorage();
  queueGuestEvent("save_gate_shown");
  clearGuestEvents();
  assert.deepEqual(loadGuestEvents(), []);
});

test("the buffer is capped so it cannot grow unbounded on an abandoned tab", () => {
  globalThis.localStorage = fakeLocalStorage();
  for (let i = 0; i < 100; i += 1) queueGuestEvent("guest_first_edit");
  assert.ok(loadGuestEvents().length <= 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/guestEvents.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
/**
 * Buffer for product-metric events fired while the visitor has no account
 * yet. `POST /events/log` requires a JWT (it's the sole signal gating go/
 * no-go monetization decisions — see backend/app/api/routes/events.py), so
 * anonymous events cannot be sent directly. They queue here and are flushed
 * through the normal authenticated `logEvent` once a token exists (see
 * PdfCanvas's claim effect, which runs right after registration/login).
 */

const STORAGE_KEY = "cvstudio.guest.events";
const MAX_BUFFERED_EVENTS = 50;

export function queueGuestEvent(eventType) {
  try {
    const events = loadGuestEvents();
    events.push({ eventType, ts: Date.now() });
    // Drop the oldest entries first — the most recent funnel steps are the
    // ones worth keeping if the tab sat open long enough to overflow.
    const trimmed = events.slice(-MAX_BUFFERED_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Best-effort telemetry; never let a storage failure affect the UI.
  }
}

/** @returns {Array<{eventType: string, ts: number}>} */
export function loadGuestEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearGuestEvents() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./scripts/register-hook.mjs --test src/utils/guestEvents.test.js`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/guestEvents.js frontend/src/utils/guestEvents.test.js
git commit -m "feat: add guestEvents localStorage buffer for anonymous funnel telemetry"
```

---

### Task 4: Demo CV template data

**Files:**
- Create: `frontend/src/templates/demoCv.js`

**Interfaces:**
- Produces: `export const demoCvTemplate` — an array of element specs in the exact shape `frontend/src/templates/ledger.js` exports (consumed by `materializeElementSpecs`/`handleLoadTemplate`). Consumed by Task 12.

No test file: existing simple single-column templates (`ledger.js`) have no companion test in this codebase — only templates with extra structural invariants (sidebars, icon counts) do (`harbor.test.js`, `tessera.test.js`, etc.). Verified visually in Task 15.

- [ ] **Step 1: Write the implementation**

```js
import { block, bulleted, line, text } from "./helpers";

// Guest-mode demo CV: a realistic, fully fictional single-column document a
// visitor can click around with zero account and zero backend cost. Uses the
// same element-spec shape and helpers as every real starter template
// (frontend/src/templates/ledger.js is the closest structural reference), so
// it flows through the exact same handleLoadTemplate/materializeElementSpecs
// path — no special-cased rendering anywhere in the canvas.
const INK = "#1F2933";
const MUTED = "#5A6472";
const ACCENT = "#2E5E86";
const RULE = "#C7D2DA";
const SANS = "Inter";

export const demoCvTemplate = [
    text("ANNA KOWALSKA", 24, SANS, INK, 52, 48, 2),
    text("MENEDŻERKA PRODUKTU", 11, SANS, ACCENT, 52, 80, 2),
    text("anna.kowalska@email.com  ·  +48 600 000 000  ·  Warszawa", 9, SANS, MUTED, 52, 100, 2),

    line(52, 128, 490, 1, RULE, 1),

    text("PODSUMOWANIE", 9, SANS, ACCENT, 52, 146, 2),
    block(
        "Menedżerka produktu z 6-letnim doświadczeniem w tworzeniu narzędzi B2B. Łączę badania użytkowników z pracą zespołów inżynieryjnych, żeby dowozić funkcje, które realnie skracają czas pracy klientów.",
        52, 164, 490, 44, 10, 15, INK, SANS,
    ),

    text("DOŚWIADCZENIE", 9, SANS, ACCENT, 52, 232, 2),
    line(52, 248, 490, 1, RULE, 1),
    { ...text("Senior Product Manager  /  Nordic Software", 11, SANS, INK, 52, 264, 2), bold: true },
    text("2022 – obecnie  ·  Warszawa", 9, SANS, MUTED, 52, 281, 2),
    bulleted(block(
        "• Wprowadziła nowy moduł raportowania, który zwiększył retencję klientów enterprise o 14%.\n• Zbudowała proces odkrywania produktowego łączący wywiady z klientami i dane z telemetrii.\n• Poprowadziła zespół 5 inżynierów przez migrację na nową architekturę mikroserwisów.",
        52, 300, 490, 56, 9.6, 13.5, INK, SANS,
    )),
    { ...text("Product Manager  /  Baltic Apps", 11, SANS, INK, 52, 380, 2), bold: true },
    text("2019 – 2022  ·  Gdańsk", 9, SANS, MUTED, 52, 397, 2),
    bulleted(block(
        "• Odpowiadała za roadmapę aplikacji mobilnej z ponad 200 tys. aktywnych użytkowników.\n• Wprowadziła cykliczne testy A/B, które podniosły konwersję rejestracji o 9%.",
        52, 416, 490, 40, 9.6, 13.5, INK, SANS,
    )),

    text("WYKSZTAŁCENIE", 9, SANS, ACCENT, 52, 480, 2),
    line(52, 496, 490, 1, RULE, 1),
    { ...text("Magister Zarządzania", 10.5, SANS, INK, 52, 512, 2), bold: true },
    text("Uniwersytet Warszawski  ·  Warszawa", 9.5, SANS, INK, 52, 529, 2),
    text("2015 – 2019", 9, SANS, MUTED, 52, 545, 2),

    text("UMIEJĘTNOŚCI", 9, SANS, ACCENT, 52, 578, 2),
    line(52, 594, 490, 1, RULE, 1),
    block(
        "Discovery produktowy  ·  Roadmapping  ·  SQL  ·  Figma  ·  A/B testing  ·  Praca z zespołami inżynieryjnymi",
        52, 610, 490, 28, 9.3, 13, INK, SANS,
    ),
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/templates/demoCv.js
git commit -m "feat: add demo CV template data for guest-mode preview"
```

---

### Task 5: Unlock `/pdfcanvas` for guests

**Files:**
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/ProtectedRoute.jsx` (dead code — its only caller is removed by this task; verified no other import exists)

**Interfaces:**
- Produces: `/pdfcanvas` renders `<PdfCanvas />` directly with no auth wrapper. `PdfCanvas` itself becomes responsible for guest-vs-authenticated behavior starting in Task 6.

- [ ] **Step 1: Edit `App.jsx`**

In `frontend/src/App.jsx`, replace:

```jsx
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ProtectedRoute from "./ProtectedRoute";
import PdfCanvas from './pages/PdfCanvas';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';

const router = createBrowserRouter([
  { path: "/pdfcanvas", element: <ProtectedRoute><PdfCanvas /></ProtectedRoute> },
  { path: "/register", element: <Register /> },
  { path: "/login", element: <Login /> },
  { path: "/", element: <Hero /> },
])
```

with:

```jsx
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import PdfCanvas from './pages/PdfCanvas';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';

const router = createBrowserRouter([
  { path: "/pdfcanvas", element: <PdfCanvas /> },
  { path: "/register", element: <Register /> },
  { path: "/login", element: <Login /> },
  { path: "/", element: <Hero /> },
])
```

Also update the file's header comment (currently says "Protected: the A4 editor at `/pdfcanvas` (requires a JWT in localStorage)"):

```jsx
/**
 * Top-level router for CV Studio.
 *
 * Public: landing (`/`), login, register, and the A4 editor at `/pdfcanvas`.
 * `/pdfcanvas` works without a JWT (guest mode) — PdfCanvas itself branches
 * on `localStorage.token` presence for anything that needs the backend.
 */
```

- [ ] **Step 2: Delete the now-dead `ProtectedRoute.jsx`**

```bash
git rm frontend/src/ProtectedRoute.jsx
```

- [ ] **Step 3: Verify no other reference remains**

Run (from repo root): `grep -rn "ProtectedRoute" frontend/src`
Expected: no output (the import in `App.jsx` was just removed, and it was the only caller).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: allow /pdfcanvas without authentication (guest mode entry point)"
```

---

### Task 6: Guard the token-verify effect against guest visits

**Files:**
- Modify: `frontend/src/pages/PdfCanvas.jsx:349-361`

**Interfaces:**
- Consumes: nothing new.
- Produces: the mount effect that calls `GET /auth/verify-token/{token}` now only runs when `localStorage.getItem("token")` is present.

This is the fix for the concrete redirect-loop risk found during planning: today this effect fires unconditionally, and with no token it requests `.../verify-token/null`, gets a 401, and calls `navigate("/")` — which would make every guest visit to `/pdfcanvas` immediately bounce back to the landing page the instant Task 5 lands, unless this is fixed first.

- [ ] **Step 1: Edit the effect**

In `frontend/src/pages/PdfCanvas.jsx`, replace:

```jsx
  // A single-page app does not naturally revisit a protected route while a
  // user edits a document. Revalidate the token at most once per 30 seconds
  // of pointer activity and return to the landing page if it has expired.
  const lastActivityCheckRef = useRef(0);
  const throttledHandleIsActive = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityCheckRef.current >= 30000) {
      lastActivityCheckRef.current = now;
      setIsActive(active => !active);
    }
  }, []);

  useEffect(() => {

    const api = new ApiClient();
    api.httpRequest(ENDPOINTS.AUTH.TOKEN + localStorage.getItem("token"), "GET", null, "Weryfikacja tokenu nie powiodła się!").
      catch((error) => {
        console.log(error);
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("token");
          navigate("/");
        }
      })

  }, [checkActivity, navigate])
```

with:

```jsx
  // A single-page app does not naturally revisit a protected route while a
  // user edits a document. Revalidate the token at most once per 30 seconds
  // of pointer activity and return to the landing page if it has expired.
  const lastActivityCheckRef = useRef(0);
  const throttledHandleIsActive = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityCheckRef.current >= 30000) {
      lastActivityCheckRef.current = now;
      setIsActive(active => !active);
    }
  }, []);

  // Guests (no token) are the default state here now, not an expired
  // session — skip verification entirely so a guest visit never triggers
  // the 401 branch below and bounces back to "/".
  useEffect(() => {
    if (!localStorage.getItem("token")) return;

    const api = new ApiClient();
    api.httpRequest(ENDPOINTS.AUTH.TOKEN + localStorage.getItem("token"), "GET", null, "Weryfikacja tokenu nie powiodła się!").
      catch((error) => {
        console.log(error);
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("token");
          navigate("/");
        }
      })

  }, [checkActivity, navigate])
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/PdfCanvas.jsx
git commit -m "fix: skip token verification for guest visits to /pdfcanvas"
```

(No automated test: this component has no existing test file, consistent with this codebase's pattern of hand-verifying container/page components in the browser rather than jsdom-mocking them — see Task 15, which explicitly re-confirms this fix by loading `/pdfcanvas` with no token and checking there is no redirect and no console 401.)

---

### Task 7: Guest autosave to localStorage

**Files:**
- Modify: `frontend/src/pages/PdfCanvas.jsx` (new effect, placed directly after the existing authenticated autosave effect ending at line 499)

**Interfaces:**
- Consumes: `saveGuestDocument` from `frontend/src/utils/guestDocument.js` (Task 2), `queueGuestEvent` from `frontend/src/utils/guestEvents.js` (Task 3).
- Produces: guest edits are persisted to `localStorage` ~2s after they settle, mirroring the authenticated autosave's debounce. Fires `guest_editor_opened` once per mount when there is no token, and `guest_first_edit` once per session the first time a guest's elements actually change.

- [ ] **Step 1: Add the imports**

In `frontend/src/pages/PdfCanvas.jsx`, add near the other util imports (after the `logEvent` import):

```jsx
import { logEvent } from '../services/eventLog';
import { saveGuestDocument } from '../utils/guestDocument';
import { queueGuestEvent } from '../utils/guestEvents';
```

- [ ] **Step 2: Add the guest autosave effect**

Insert directly after the existing authenticated autosave effect (the one ending `}, [A4_Elements, A4_Elements_deleted, activeTemplateId, editorMode, enqueueAutosave, flowSpacing, isPdfLoading, pageCount, pageSize, pdfId])` around line 499):

```jsx
  // Guest-mode autosave: no token yet, so persist to localStorage instead of
  // the backend (which would 401). Same 2s settle debounce as the
  // authenticated path above, but writes via guestDocument instead of
  // calling saveElements. Skipped once a real pdfId exists — from that point
  // the authenticated effect above is the source of truth.
  const guestFirstEditLoggedRef = useRef(false);
  const guestEditorOpenedLoggedRef = useRef(false);
  useEffect(() => {
    if (localStorage.getItem("token") || pdfId != null) return undefined;

    if (!guestEditorOpenedLoggedRef.current) {
      guestEditorOpenedLoggedRef.current = true;
      queueGuestEvent("guest_editor_opened");
    }

    const hasContent = A4_Elements.some(
      (el) => !(el.category === "text" || el.category === "textarea") || (el.content || "").trim() !== ""
    );
    if (!hasContent) return undefined;

    const timer = setTimeout(() => {
      saveGuestDocument({
        elements: A4_Elements,
        deletedIds: A4_Elements_deleted.map((el) => el.element_id),
        title: titleRef.current?.value || "",
        pageCount,
        editorMode,
        templateId: activeTemplateId,
        spacingPx: flowSpacing,
        isDemoContent: isDemoContentRef.current,
        updatedAt: Date.now(),
      });
      if (!guestFirstEditLoggedRef.current) {
        guestFirstEditLoggedRef.current = true;
        queueGuestEvent("guest_first_edit");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    A4_Elements,
    A4_Elements_deleted,
    activeTemplateId,
    editorMode,
    flowSpacing,
    pageCount,
    pdfId,
    titleRef,
  ]);
```

Note: `isDemoContentRef` is introduced by Task 12 (demo CV wiring) — for this task, add the ref here as a placeholder that always reads `false` so the file compiles standalone; Task 12 will populate it:

```jsx
  const isDemoContentRef = useRef(false);
```

Place this `useRef` declaration directly above the new effect from Step 2.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PdfCanvas.jsx
git commit -m "feat: persist guest canvas edits to localStorage"
```

(Verified manually in Task 15 — no jsdom in this project's test runner, and no existing PdfCanvas test file to extend; the pure persistence logic this effect calls is already unit-tested in Task 2.)

---

### Task 8: Skip `Moje dokumenty` fetch-on-mount for guests

**Files:**
- Modify: `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx:211-237`

**Interfaces:**
- Produces: `GET /pdf/fetch_pdfs` is no longer fired when there is no token; `pdfsLoaded` still becomes `true` immediately so the existing template-first onboarding auto-open gate (in `PdfCanvas.jsx`) keeps working for guests exactly as it does for authenticated users with zero saved PDFs.

- [ ] **Step 1: Edit the mount effect**

In `frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx`, replace:

```jsx
    useEffect(() => {
        // Must fetch on mount regardless of isModalPdfs (not just when the
        // dialog is open) — pdfsLoaded/PDFs.length here is what the
        // template-first onboarding auto-open effect in PdfCanvas.jsx waits
        // on. Gating this fetch on isModalPdfs (as a first pass at this
        // rewrite did) silently broke that onboarding flow: pdfsLoaded would
        // never become true until the user manually opened "Moje dokumenty".
        // Only the loading-skeleton UI is scoped to the dialog being open.
        if (isModalPdfs) setLoading(true);
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                setPDFs(data);
                setPdfsLoaded(true);
                }).
            catch((error) => {
                // The backend signals "no PDFs yet" as a 404 rather than an
                // empty 200 array — that's the real empty state, not a fetch
                // failure, so it renders the empty-state UI below instead of
                // the error banner.
                if (error?.status === 404) setPDFs([]);
                else setError(error);
                setPdfsLoaded(true);
            }).
            finally(() => setLoading(false));


    }, [isModalPdfs, PDFdownloadData])
```

with:

```jsx
    useEffect(() => {
        // Guests have no saved documents yet by definition — skip the
        // request entirely (it would 401) and report the same "loaded,
        // empty" state an authenticated user with zero PDFs gets, so the
        // template-first onboarding auto-open gate in PdfCanvas.jsx still
        // works without waiting on a call that can never succeed.
        if (!localStorage.getItem("token")) {
            setPDFs([]);
            setPdfsLoaded(true);
            return;
        }

        // Must fetch on mount regardless of isModalPdfs (not just when the
        // dialog is open) — pdfsLoaded/PDFs.length here is what the
        // template-first onboarding auto-open effect in PdfCanvas.jsx waits
        // on. Gating this fetch on isModalPdfs (as a first pass at this
        // rewrite did) silently broke that onboarding flow: pdfsLoaded would
        // never become true until the user manually opened "Moje dokumenty".
        // Only the loading-skeleton UI is scoped to the dialog being open.
        if (isModalPdfs) setLoading(true);
        api.httpRequest(ENDPOINTS.PDF.FETCH, "GET", null, "Nie udało się pobrać listy PDF!").
            then((data) => {
                setPDFs(data);
                setPdfsLoaded(true);
                }).
            catch((error) => {
                // The backend signals "no PDFs yet" as a 404 rather than an
                // empty 200 array — that's the real empty state, not a fetch
                // failure, so it renders the empty-state UI below instead of
                // the error banner.
                if (error?.status === 404) setPDFs([]);
                else setError(error);
                setPdfsLoaded(true);
            }).
            finally(() => setLoading(false));


    }, [isModalPdfs, PDFdownloadData])
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/modals/ModalPdfs/ModalPdfs.jsx
git commit -m "fix: skip 'Moje dokumenty' fetch for guests instead of 401ing"
```

---

### Task 9: Make the bio wizard genuinely usable without an account

**Files:**
- Modify: `frontend/src/components/ai/BioCvModal/BioCvModal.jsx`

**Interfaces:**
- Produces: opening the wizard as a guest no longer fires `GET /ai/bio_cv_draft` (which 401s and shows a persistent "Nie udało się pobrać szkicu." error banner); typing as a guest no longer fires `PUT /ai/bio_cv_draft` on every debounced change (which would 401 on every keystroke). Guests get a normal, empty, fully-interactive wizard that simply doesn't persist a draft server-side until they have an account — draft state lives in the wizard's own React state exactly as it does today between keystrokes, it just isn't mirrored to the backend.

This was found during planning, not in the original design conversation: the wizard's draft-persistence effects (open-time GET, debounced PUT) are unconditional today, so routing `start=wizard` to guest mode without this fix would make the wizard look broken (a permanent red error banner, one failed network call every 650ms of typing) rather than smooth.

- [ ] **Step 1: Guard the open-time draft fetch**

In `frontend/src/components/ai/BioCvModal/BioCvModal.jsx`, replace:

```jsx
    useEffect(() => {
        if (!isBioCvModal) {
            readyRef.current = false;
            setIsReady(false);
            return undefined;
        }

        let active = true;
        setIsLoading(true);
        setSaveError(null);
        setStepError(null);
        setStep(0);
        setProfile(createEmptyBioCvData());

        api.httpRequest(ENDPOINTS.AI.BIO_CV_DRAFT, "GET", null, "Nie udało się pobrać szkicu.")
            .then((response) => {
                if (!active) return;
                setProfile(normalizeBioCvData(response?.cv_data));
                readyRef.current = true;
                setIsReady(true);
            })
            .catch((error) => {
                if (!active) return;
                setSaveError(error.message || "Nie udało się pobrać szkicu.");
                readyRef.current = true;
                setIsReady(true);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [api, isBioCvModal]);
```

with:

```jsx
    useEffect(() => {
        if (!isBioCvModal) {
            readyRef.current = false;
            setIsReady(false);
            return undefined;
        }

        let active = true;
        setIsLoading(true);
        setSaveError(null);
        setStepError(null);
        setStep(0);
        setProfile(createEmptyBioCvData());

        // Guests have no account yet, so there is no draft to restore — and
        // no draft endpoint to call. Start from the empty profile already
        // set above and let the wizard become interactive immediately;
        // saveDraft() below independently no-ops for guests, so nothing
        // tries to persist this session until an account exists.
        if (!localStorage.getItem("token")) {
            readyRef.current = true;
            setIsReady(true);
            setIsLoading(false);
            return () => {
                active = false;
            };
        }

        api.httpRequest(ENDPOINTS.AI.BIO_CV_DRAFT, "GET", null, "Nie udało się pobrać szkicu.")
            .then((response) => {
                if (!active) return;
                setProfile(normalizeBioCvData(response?.cv_data));
                readyRef.current = true;
                setIsReady(true);
            })
            .catch((error) => {
                if (!active) return;
                setSaveError(error.message || "Nie udało się pobrać szkicu.");
                readyRef.current = true;
                setIsReady(true);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [api, isBioCvModal]);
```

- [ ] **Step 2: Guard `saveDraft`**

Replace:

```jsx
    const saveDraft = useCallback(async (data = profileRef.current, { silent = false } = {}) => {
        if (!readyRef.current) return Promise.resolve();
        const payload = buildBioCvPayload(data);

        return saveQueueRef.current.enqueue(async () => {
            if (!silent) setSaveError(null);
            try {
                await api.httpRequest(
                    ENDPOINTS.AI.BIO_CV_DRAFT,
                    "PUT",
                    JSON.stringify({ cv_data: payload }),
                    "Nie udało się zapisać szkicu.",
                );
            } catch (error) {
                setSaveError(error.message || "Nie udało się zapisać szkicu.");
            }
        });
    }, [api]);
```

with:

```jsx
    const saveDraft = useCallback(async (data = profileRef.current, { silent = false } = {}) => {
        if (!readyRef.current) return Promise.resolve();
        // Guests have nowhere to persist a draft yet — the wizard's own
        // React state (`profile`) is the only copy until they register, at
        // which point they go through the normal fill flow, not this draft
        // endpoint. Skip silently; do not surface an error for an expected,
        // permanent state.
        if (!localStorage.getItem("token")) return Promise.resolve();
        const payload = buildBioCvPayload(data);

        return saveQueueRef.current.enqueue(async () => {
            if (!silent) setSaveError(null);
            try {
                await api.httpRequest(
                    ENDPOINTS.AI.BIO_CV_DRAFT,
                    "PUT",
                    JSON.stringify({ cv_data: payload }),
                    "Nie udało się zapisać szkicu.",
                );
            } catch (error) {
                setSaveError(error.message || "Nie udało się zapisać szkicu.");
            }
        });
    }, [api]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ai/BioCvModal/BioCvModal.jsx
git commit -m "fix: make the bio wizard usable without an account (skip draft persistence for guests)"
```

(Verified manually in Task 15: open the wizard with no token, type in several fields, confirm no error banner appears and no failed network requests fire.)

---

### Task 10: `SaveGateModal` — ask for an account only when the guest tries to save

**Files:**
- Create: `frontend/src/components/editor/SaveGateModal/SaveGateModal.jsx`
- Create: `frontend/src/components/editor/SaveGateModal/SaveGateModal.module.css`
- Modify: `frontend/src/pages/PdfCanvas.jsx` (dialog state machine + `ctxValue.createPdf`)

**Interfaces:**
- Consumes: `queueGuestEvent` (Task 3), `DialogShell` (existing), `dialog`/`setDialog` state machine (existing).
- Produces: `dialog === 'saveGate'` is a new state in the machine; `ctxValue.createPdf` passed to `Topbar` becomes `handleSaveClick` — same call signature `Topbar` already uses (`onClick={createPdf}`, no args), so `Topbar.jsx` itself needs no changes.

- [ ] **Step 1: Create the modal component**

```jsx
/**
 * Shown when a guest (no account) clicks "Zapisz PDF". Explains that their
 * work is already on the canvas and offers to create an account or sign in
 * — after which PdfCanvas's claim effect saves the document automatically
 * and re-enables "Pobierz PDF" without the visitor re-entering anything.
 */
import { useNavigate } from "react-router-dom";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./SaveGateModal.module.css";

export default function SaveGateModal({ open, onCancel }) {
  const navigate = useNavigate();

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title="Nie zgub swojej pracy"
      subtitle="Utwórz darmowe konto, aby zapisać CV i pobrać gotowy PDF"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>
            Anuluj
          </button>
          <button
            type="button"
            className={classes.ghost}
            onClick={() => navigate("/login")}
          >
            Mam już konto
          </button>
          <button
            type="button"
            className={classes.primary}
            onClick={() => navigate("/register")}
          >
            Utwórz konto
          </button>
        </div>
      )}
    >
      <p className={classes.copy}>
        Twoje CV jest już na płótnie. Po utworzeniu konta zapiszemy je
        automatycznie i wrócisz dokładnie do tego samego dokumentu.
      </p>
    </DialogShell>
  );
}
```

- [ ] **Step 2: Create the CSS module**

```css
.copy {
  margin: 0 0 10px;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #40423b;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.ghost,
.primary {
  border-radius: 8px;
  padding: 9px 14px;
  font-size: 0.9rem;
  cursor: pointer;
}

.ghost {
  border: 1px solid rgba(22, 23, 18, 0.18);
  background: transparent;
}

.primary {
  border: 0;
  background: #dc6743;
  color: #fff;
  font-weight: 600;
}
```

- [ ] **Step 3: Wire the dialog state and guest-aware save handler into `PdfCanvas.jsx`**

Add the import near the other dialog component imports:

```jsx
import SaveGateModal from '../components/editor/SaveGateModal/SaveGateModal';
```

Add a derived boolean next to the other `is*` dialog flags (after `const isUnlockFreeformModal = dialog === 'unlockFreeform';`):

```jsx
  const isSaveGateModal = dialog === 'saveGate';
```

Add the guest-aware handler directly after `createPdfWithElements` is defined:

```jsx
  // Guests have no backend document to create yet — show the save-gate
  // instead of firing the API call, which would 401. Authenticated users
  // are unaffected: same createPdfWithElements() call as before this change.
  const handleSaveClick = useCallback(() => {
    if (!localStorage.getItem("token")) {
      queueGuestEvent("save_gate_shown");
      setDialog('saveGate');
      return;
    }
    createPdfWithElements();
  }, [createPdfWithElements]);
```

In the `ctxValue` object, replace:

```jsx
    createPdf: createPdfWithElements,
```

with:

```jsx
    createPdf: handleSaveClick,
```

And in `ctxValue`'s dependency array, replace `createPdfWithElements` with `handleSaveClick` (it already includes `createPdfWithElements` as a dependency internally, so this is a like-for-like swap — the array entry `createPdfWithElements` becomes `handleSaveClick`).

Add the modal render just after `<UnlockFreeformModal .../>` in the JSX:

```jsx
              <SaveGateModal
                open={isSaveGateModal}
                onCancel={() => setDialog(null)}
              />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/editor/SaveGateModal frontend/src/pages/PdfCanvas.jsx
git commit -m "feat: add SaveGateModal — ask for an account only when a guest tries to save"
```

(Verified manually in Task 15: as a guest with unsaved edits, click "Zapisz PDF" and confirm the modal appears instead of a network call/error.)

---

### Task 11: Claim the guest document after registration/login

**Files:**
- Modify: `frontend/src/pages/PdfCanvas.jsx` (new claim effect)
- Modify: `frontend/src/pages/Register/Register.jsx` (queue `register_completed`)

**Interfaces:**
- Consumes: `loadGuestDocument`, `clearGuestDocument` (Task 2), `loadGuestEvents`, `clearGuestEvents`, `queueGuestEvent` (Task 3), `createPdf`/`setA4_Elements`/`hydrateDocumentMode`/`resetHistory`/`setPageCount`/`setCurrentPage` (all already exist on `PdfCanvas`/`usePdfExport`), `logEvent` (existing).
- Produces: on any `PdfCanvas` mount where a token exists AND an unclaimed guest document exists, the document is created on the backend via the existing `createPdf`, the canvas is repainted with it, and a success toast confirms it. This covers both the direct save-gate → register/login → back-at-`/pdfcanvas` round trip, and simply refreshing the page later with a token already present.

Note on why this does not reuse `handleLoadTemplate`/`handleLoadAiElements`: both of those call `materializeElementSpecs`, which **always generates fresh `element_id`s** and only remaps connector `source_id`/`target_id` via a symbolic `spec.id` field that raw canvas elements (as opposed to template specs) do not carry — running an already-materialized guest document back through it would silently break every connector. The claim effect instead sets `A4_Elements` directly and uses `hydrateDocumentMode` (the same primitive `ModalPdfs.showPDF` already uses to restore `editorMode`/`templateId`/`spacingPx` for a reopened saved document) — no re-materialization.

- [ ] **Step 1: Add the claim effect to `PdfCanvas.jsx`**

Add near the other mount effects (after the guest autosave effect from Task 7):

```jsx
  // Claim a buffered guest document once a JWT exists — covers both the
  // save-gate's register/login round trip and simply reloading the page
  // with a token already present and a leftover guest doc (e.g. the browser
  // was closed mid-edit before registering). Runs once per mount; guarded so
  // a stray second render cannot double-claim.
  const claimAttemptedRef = useRef(false);
  useEffect(() => {
    if (claimAttemptedRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const guestDoc = loadGuestDocument();
    if (!guestDoc || !Array.isArray(guestDoc.elements) || guestDoc.elements.length === 0) return;

    claimAttemptedRef.current = true;

    // Flush anything queued while anonymous — including this claim, queued
    // just below — through the normal authenticated event log.
    queueGuestEvent("guest_doc_claimed");
    const buffered = loadGuestEvents();
    buffered.forEach((event) => logEvent(event.eventType));
    clearGuestEvents();

    setA4_Elements(guestDoc.elements);
    setA4_Elements_deleted([]);
    resetHistory();
    hydrateDocumentMode(guestDoc.elements, {
      editorMode: guestDoc.editorMode,
      templateId: guestDoc.templateId,
      spacingPx: guestDoc.spacingPx,
    });
    setPageCount(guestDoc.pageCount || 1);
    setCurrentPage(1);
    if (titleRef.current && guestDoc.title) {
      titleRef.current.value = guestDoc.title;
    }

    createPdf(guestDoc.elements, titleRef, guestDoc.pageCount || 1, pageSize, {
      editorMode: guestDoc.editorMode,
      templateId: guestDoc.templateId,
      flowSpacing: guestDoc.spacingPx,
    });
    clearGuestDocument();

    pushToast({
      title: "CV zapisane",
      msg: "Twój dokument został zapisany na koncie.",
      variant: "success",
    });
  }, [
    createPdf,
    hydrateDocumentMode,
    pageSize,
    pushToast,
    resetHistory,
    setA4_Elements,
    setA4_Elements_deleted,
    setCurrentPage,
    setPageCount,
    titleRef,
  ]);
```

Add the two new imports this effect needs (combine with Task 7's imports if implementing in order):

```jsx
import { loadGuestDocument, clearGuestDocument } from '../utils/guestDocument';
import { loadGuestEvents, clearGuestEvents } from '../utils/guestEvents';
```

- [ ] **Step 2: Queue `register_completed` in `Register.jsx`**

In `frontend/src/pages/Register/Register.jsx`, add the import:

```jsx
import { queueGuestEvent } from "../../utils/guestEvents";
```

In `handleSubmit`, right after the successful registration call (before `navigate(loginPath, { replace: true })`):

```jsx
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            queueGuestEvent("register_completed");
            // Preserve the landing-page choice through account creation so the
            // first authenticated screen opens the import panel or CV wizard.
            const loginPath = startIntent ? `/login?start=${startIntent}` : "/login";
            navigate(loginPath, { replace: true });
```

(This only adds the one `queueGuestEvent` line — the rest of `handleSubmit` is unchanged; shown with surrounding context so the insertion point is unambiguous.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PdfCanvas.jsx frontend/src/pages/Register/Register.jsx
git commit -m "feat: claim buffered guest document and flush funnel events after registration/login"
```

(Verified manually in Task 15 as the capstone of the full guest journey: edit as guest → save-gate → register → login → land back in editor with the same content, a "CV zapisane" toast, and Pobierz PDF enabled.)

---

### Task 12: Demo CV entry point

**Files:**
- Create: `frontend/src/components/editor/DemoBanner/DemoBanner.jsx`
- Create: `frontend/src/components/editor/DemoBanner/DemoBanner.module.css`
- Modify: `frontend/src/pages/PdfCanvas.jsx`

**Interfaces:**
- Consumes: `demoCvTemplate` (Task 4), `handleLoadTemplate` (existing), `queueGuestEvent` (Task 3).
- Produces: `?start=demo` loads the demo CV with zero dialogs and shows a persistent top banner; clicking either banner action clears demo mode.

- [ ] **Step 1: Create the banner component**

```jsx
/**
 * Persistent banner shown while the canvas holds the guest-mode demo CV
 * (loaded via ?start=demo). Both actions clear demo mode: one starts a real
 * document from scratch, the other opens the wizard so the visitor keeps the
 * "already in the editor" momentum instead of bouncing back to the landing
 * page.
 */
import classes from "./DemoBanner.module.css";

export default function DemoBanner({ onUseOwnData, onStartBlank }) {
  return (
    <div className={classes.banner}>
      <span className={classes.text}>To jest przykładowe CV.</span>
      <button type="button" className={classes.link} onClick={onUseOwnData}>
        Użyj własnych danych
      </button>
      <span className={classes.sep}>·</span>
      <button type="button" className={classes.link} onClick={onStartBlank}>
        Zacznij od zera
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create the CSS module**

```css
.banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff3e6;
  border-bottom: 1px solid #f0c896;
  font-size: 0.85rem;
  color: #6b4a1f;
}

.text {
  font-weight: 500;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: #dc6743;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}

.sep {
  color: #d8b98a;
}
```

- [ ] **Step 3: Wire `start=demo` into `PdfCanvas.jsx`**

Add the imports:

```jsx
import DemoBanner from '../components/editor/DemoBanner/DemoBanner';
import { demoCvTemplate } from '../templates/demoCv';
```

Extend `initialStartIntentRef` to recognize `"demo"` — replace:

```jsx
  const initialStartIntentRef = useRef(
    startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      ? startIntent
      : null,
  );
```

with:

```jsx
  const initialStartIntentRef = useRef(
    startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      || startIntent === "demo"
      ? startIntent
      : null,
  );
```

Add a demo-mode flag (near the other `useState`s at the top of the component, alongside `isDemoContentRef` moved here from Task 7's placeholder — replace the Task 7 placeholder `const isDemoContentRef = useRef(false);` with the state-backed version below):

```jsx
  const [isDemoContent, setIsDemoContent] = useState(startIntent === "demo");
  const isDemoContentRef = useRef(isDemoContent);
  isDemoContentRef.current = isDemoContent;
```

Load the demo document once on mount when `start=demo` (add near the other `initialStartIntentRef.current === "..."` effects, e.g. right after the blank-start effect):

```jsx
  // Demo path: load the canned CV once, no dialog, so the visitor lands
  // directly on an editable document instead of a template picker.
  const demoStartAppliedRef = useRef(false);
  useEffect(() => {
    if (initialStartIntentRef.current !== "demo" || demoStartAppliedRef.current) return;
    demoStartAppliedRef.current = true;
    handleLoadTemplate(demoCvTemplate, "Przykładowe CV", null);
    setIsDemoContent(true);
    queueGuestEvent("guest_demo_loaded");
    markTemplatesModalSeen();
  }, [handleLoadTemplate, markTemplatesModalSeen]);
```

Exclude `"demo"` from the default template-picker auto-open gate — replace:

```jsx
    if (
      startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
    ) {
      return;
    }
```

with:

```jsx
    if (
      startIntent === "import"
      || startIntent === "wizard"
      || startIntent === "templates"
      || startIntent === "blank"
      || startIntent === "demo"
    ) {
      return;
    }
```

Add the banner actions and render it above the canvas. Add the handlers near `handleClearA4`'s existing usages:

```jsx
  const handleDemoUseOwnData = useCallback(() => {
    setIsDemoContent(false);
    setDialog('bioCv');
  }, []);

  const handleDemoStartBlank = useCallback(() => {
    setIsDemoContent(false);
    setEditorMode(EDITOR_MODE_FREEFORM);
    setActiveTemplateId(null);
    handleClearA4();
  }, [handleClearA4, setActiveTemplateId, setEditorMode]);
```

Render the banner directly above `<Topbar titleRef={titleRef} />` inside `<div className="right-pane">`:

```jsx
              <div className="right-pane">
                {isDemoContent ? (
                  <DemoBanner onUseOwnData={handleDemoUseOwnData} onStartBlank={handleDemoStartBlank} />
                ) : null}
                <Topbar titleRef={titleRef} />
```

- [ ] **Step 4: Remove the Task 7 placeholder note**

Confirm the `isDemoContentRef` declared in Task 7 as a standalone placeholder no longer exists as a duplicate — this task's Step 3 replaces it with the state-backed version. There should be exactly one `isDemoContentRef` declaration in the file after this task.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/DemoBanner frontend/src/pages/PdfCanvas.jsx
git commit -m "feat: add demo CV entry point for guest-mode preview"
```

---

### Task 13: Remove plan selection from registration

**Files:**
- Modify: `frontend/src/pages/Register/Register.jsx`
- Delete: `frontend/src/pages/Register/PlanSelector.jsx`
- Delete: `frontend/src/pages/Register/PlanSelector.module.css`

**Interfaces:**
- Produces: every new account registers on the `free` plan (already the backend default — `UserCreateRequest.plan: str = "free"` in `backend/app/schemas/user_schema.py:26` — no backend change needed). `PlanSelector` becomes unreferenced dead code (its only two importers were `PlanSelector.jsx` itself and `Register.jsx`).

- [ ] **Step 1: Edit `Register.jsx`**

Remove the import:

```jsx
import PlanSelector, { PLAN_SLUGS } from "./PlanSelector";
```

Remove the plan-selection state and query-param handling — replace:

```jsx
    const [searchParams] = useSearchParams();
    const initialPlan = PLAN_SLUGS.includes(searchParams.get("plan"))
        ? searchParams.get("plan")
        : "free";
    const startIntent = ["import", "wizard", "templates", "blank"].includes(searchParams.get("start"))
        ? searchParams.get("start")
        : null;
    const [plan, setPlan] = useState(initialPlan);
```

with:

```jsx
    const [searchParams] = useSearchParams();
    const startIntent = ["import", "wizard", "templates", "blank"].includes(searchParams.get("start"))
        ? searchParams.get("start")
        : null;
```

Remove `plan` from the registration request body — replace:

```jsx
            await api.httpRequest(
                ENDPOINTS.AUTH.REGISTER,
                "POST",
                JSON.stringify({ username, email, password, plan }),
```

with:

```jsx
            await api.httpRequest(
                ENDPOINTS.AUTH.REGISTER,
                "POST",
                JSON.stringify({ username, email, password }),
```

Remove the plan-selector UI block — delete:

```jsx
                    <div className={classes.control}>
                        <label>Plan</label>
                        <PlanSelector value={plan} onChange={setPlan} classes={planClasses} disabled={isLoading} />
                    </div>
```

Remove the now-unused `planClasses` import:

```jsx
import planClasses from "./PlanSelector.module.css";
```

Update the sub-heading copy that referenced changing plans later — replace:

```jsx
                    <p className={classes.subHeading}>Zacznij bez karty. Plan możesz zmienić później.</p>
```

with:

```jsx
                    <p className={classes.subHeading}>Zacznij bez karty i bez zobowiązań.</p>
```

- [ ] **Step 2: Delete the dead files**

```bash
git rm frontend/src/pages/Register/PlanSelector.jsx frontend/src/pages/Register/PlanSelector.module.css
```

- [ ] **Step 3: Verify no other reference remains**

Run: `grep -rn "PlanSelector\|PLAN_SLUGS" frontend/src`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Register/Register.jsx
git commit -m "feat: remove plan selection from registration (always Free by default)"
```

---

### Task 14: Landing page — guest-first CTAs

**Files:**
- Modify: `frontend/src/pages/Hero/Hero.jsx`

**Interfaces:**
- Produces: the "Tworzę CV" (wizard), "Projektuj od zera" (blank), and "Wybierz szablon" (templates) CTAs go straight to `/pdfcanvas?start=...` regardless of auth state; "Importuj CV"/"Wgraj moje CV" (import) is unchanged — still routes unauthenticated visitors to `/register?start=import&plan=standard` first, because import calls paid OpenAI and Etap 1 does not add the account+free-import accounting that would make opening it safe (spec §4.5). A new "Zobacz edytor" link loads the demo CV. This is a copy/CTA-routing change only — no broader visual redesign of Hero.jsx (spec §5).

- [ ] **Step 1: Make `buildStartUrl` per-intent aware**

Replace:

```jsx
function buildStartUrl(start, plan) {
    const registered = Boolean(window.localStorage.getItem("token"));
    if (registered) return `/pdfcanvas?start=${start}`;

    return `/register?start=${start}&plan=${plan}`;
}
```

with:

```jsx
// "import" costs a paid OpenAI call (POST /ai/extract_cv) and stays gated
// behind registration — Etap 1 deliberately does not open it to anonymous
// visitors (see docs/superpowers/specs/2026-08-07-onboarding-monetization-design.md
// §4.5). Every other start intent is frontend-only / zero-cost, so it goes
// straight into guest mode regardless of auth state.
function buildStartUrl(start, plan) {
    if (start === "import") {
        const registered = Boolean(window.localStorage.getItem("token"));
        if (registered) return `/pdfcanvas?start=${start}`;
        return `/register?start=${start}&plan=${plan}`;
    }
    return `/pdfcanvas?start=${start}`;
}
```

- [ ] **Step 2: Log the CTA click**

Add the import:

```jsx
import { queueGuestEvent } from "../../utils/guestEvents";
```

In `StartButton`, log on click for non-import starts (import already goes through the existing, unaffected authenticated-metrics path once the visitor has an account):

```jsx
function StartButton({ start, plan, children, secondary = false }) {
    return (
        <Link
            to={buildStartUrl(start, plan)}
            className={secondary ? classes.buttonSecondary : classes.buttonPrimary}
            onClick={() => {
                if (start !== "import") queueGuestEvent("landing_cta_clicked");
            }}
        >
            {children}
            <ArrowIcon />
        </Link>
    );
}
```

- [ ] **Step 3: Add the demo entry point and "no account" sub-copy**

In the hero copy block, replace:

```jsx
                    <div className={classes.heroActions}>
                        <Link className={classes.buttonPrimary} to={importUrl}>Wgraj moje CV<ArrowIcon /></Link>
                        <Link className={classes.buttonSecondary} to={wizardUrl}>Stwórz CV od początku<ArrowIcon /></Link>
                    </div>
                    <p className={classes.heroNote}>
                        <span>01</span> Bez przepisywania danych. <span>02</span> Pełna kontrola nad dokumentem.
                    </p>
```

with:

```jsx
                    <div className={classes.heroActions}>
                        <Link className={classes.buttonPrimary} to={importUrl}>Wgraj moje CV<ArrowIcon /></Link>
                        <Link
                            className={classes.buttonSecondary}
                            to={wizardUrl}
                            onClick={() => queueGuestEvent("landing_cta_clicked")}
                        >
                            Stwórz CV od początku<ArrowIcon />
                        </Link>
                    </div>
                    <p className={classes.heroNote}>
                        Bez karty • Zacznij bez konta •{" "}
                        <Link
                            to="/pdfcanvas?start=demo"
                            onClick={() => queueGuestEvent("landing_cta_clicked")}
                        >
                            Zobacz edytor
                        </Link>
                    </p>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Hero/Hero.jsx
git commit -m "feat: route landing CTAs into guest mode (except import, which stays account-gated)"
```

---

### Task 15: End-to-end manual verification of the guest journey

**Files:** none (verification only)

No unit/integration test framework in this repo exercises full-page React flows (no jsdom, no Playwright/Testing Library dependency — confirmed in `frontend/package.json` and `frontend/scripts/run-tests.mjs` during planning). This task follows the same browser-based verification approach already used earlier in this project's history for DOM-behavior bugs: run the frontend dev server, drive it with the `browse` skill (or by hand), and confirm each step of the funnel actually works end-to-end — this is the load-bearing check for Tasks 5, 6, 7, 8, 9, 10, 11, 12, 14, none of which have per-file unit tests of their own.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Guest can reach the editor with no redirect loop**

Clear `localStorage`. Navigate to `/pdfcanvas` directly.
Expected: the editor renders (no redirect to `/`), no console error from `/auth/verify-token/null`, no console error from `/pdf/fetch_pdfs`.

- [ ] **Step 3: Demo CV loads and the banner works**

Navigate to `/pdfcanvas?start=demo`.
Expected: the demo CV renders immediately (no template picker), the demo banner is visible. Click "Zacznij od zera": banner disappears, canvas clears. Reload `/pdfcanvas?start=demo` again, click "Użyj własnych danych": banner disappears, the bio wizard dialog opens.

- [ ] **Step 4: Wizard works with no account and no console errors**

Navigate to `/pdfcanvas?start=wizard` with no token. Type into several fields across two steps.
Expected: no red error banner in the wizard, no failed `bio_cv_draft` network requests in the browser's network tab.

- [ ] **Step 5: Guest edits persist to localStorage**

From a blank or demo document, edit some text. Wait 3 seconds. Inspect `localStorage.getItem("cvstudio.guest.doc")`.
Expected: a JSON blob containing the edited element content.

- [ ] **Step 6: Save-gate appears instead of a failed API call**

With unsaved guest content on the canvas, click "Zapisz PDF" in the Topbar.
Expected: the "Nie zgub swojej pracy" modal appears; no `POST /pdf/create_pdf` request fires (check the network tab).

- [ ] **Step 7: Full claim round trip**

From the save-gate modal, click "Utwórz konto", register a new test account, then log in when prompted.
Expected: back at `/pdfcanvas`, the canvas shows the same content that was on it before registering, a "CV zapisane" toast appears, "Pobierz PDF" is now enabled, and `localStorage.getItem("cvstudio.guest.doc")` is `null`.

- [ ] **Step 8: Registration has no plan selector**

Navigate to `/register` directly (fresh, no guest doc).
Expected: no "Plan" field/radio group is rendered; the form only asks for username, e-mail, password.

- [ ] **Step 9: Import still requires an account**

With no token, click "Wgraj moje CV" on the landing page.
Expected: navigates to `/register?start=import&plan=standard` (not `/pdfcanvas`) — unchanged from before this plan.

- [ ] **Step 10: Run both automated suites once more as a final gate**

```bash
cd backend && python -m unittest discover -s tests
cd frontend && npm test
```

Expected: all tests pass (the new ones from Tasks 1–3, plus every pre-existing test unaffected by this plan's changes).

- [ ] **Step 11: Report results**

No commit for this task (verification only). If any step fails, return to the relevant task, fix, and re-run this task from Step 1.
