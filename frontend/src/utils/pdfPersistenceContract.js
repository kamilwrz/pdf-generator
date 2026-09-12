import { t as uiText } from "../i18n/index.js";
import { nanoid } from "nanoid";

export const DOCUMENT_CONFLICT_MESSAGE =
  uiText("editor:pdfPersistenceContract.theDocumentWasChangedInAnotherWindow");

/** Return a backend revision suitable for optimistic-concurrency requests. */
export function requirePdfRevision(value) {
  const revision = Number(value);
  if (Number.isInteger(revision) && revision >= 1) return revision;
  const error = new Error(
    uiText("editor:pdfPersistenceContract.theDocumentCannotBeSavedSafelyBecause"),
  );
  error.code = "missing_document_revision";
  throw error;
}

/** Map the backend concurrency contract to actionable UI-language editor copy. */
export function localizePdfPersistenceError(error) {
  if (error?.status !== 409 || error?.code !== "document_conflict") return error;
  const localized = new Error();
  localized.messageKey = "editor:pdfPersistenceContract.theDocumentWasChangedInAnotherWindow";
  Object.defineProperty(localized, "message", { get: () => uiText(localized.messageKey), configurable: true });
  localized.status = error.status;
  localized.code = error.code;
  localized.detail = error.detail;
  return localized;
}

/** Generate a bounded idempotency key for one logical create operation. */
export function createPdfIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || nanoid();
}

/**
 * Reuse the key only for the exact same snapshot in the same document epoch.
 * This covers a manual retry after an uncertain network result while ensuring
 * an A→B→A session switch cannot replay A's earlier create into the new A.
 */
export function resolveCreateAttempt(previousAttempt, fingerprint, keyFactory = createPdfIdempotencyKey) {
  if (previousAttempt?.fingerprint === fingerprint) return previousAttempt;
  return { fingerprint, idempotencyKey: keyFactory() };
}
