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
