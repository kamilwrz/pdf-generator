import { nanoid } from "nanoid";

export const DOCUMENT_CONFLICT_MESSAGE =
  "Dokument został zmieniony w innym oknie lub na innym urządzeniu. Otwórz najnowszą wersję z „Moich dokumentów” i ponów swoje zmiany.";

/** Return a backend revision suitable for optimistic-concurrency requests. */
export function requirePdfRevision(value) {
  const revision = Number(value);
  if (Number.isInteger(revision) && revision >= 1) return revision;
  const error = new Error(
    "Nie można bezpiecznie zapisać dokumentu, ponieważ brakuje jego rewizji. Otwórz dokument ponownie z „Moich dokumentów”.",
  );
  error.code = "missing_document_revision";
  throw error;
}

/** Map the backend concurrency contract to actionable Polish editor copy. */
export function localizePdfPersistenceError(error) {
  if (error?.status !== 409 || error?.code !== "document_conflict") return error;
  const localized = new Error(DOCUMENT_CONFLICT_MESSAGE);
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
