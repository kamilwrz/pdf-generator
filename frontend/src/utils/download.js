/**
 * Browser file-download helpers for PDF export.
 *
 * Downloads go through the authenticated API as binary (`httpRequestBlob`) so
 * the browser never needs to `fetch` a cross-origin S3 URL (that path failed
 * with opaque "Failed to fetch" whenever the bucket lacked CORS for the React
 * origin). Each call is scoped to one `pdf_id` — no shared download slot.
 */

import { ApiClient, ENDPOINTS } from "../services/api";

/**
 * Trigger a file download for an object URL (or same-origin href).
 *
 * @param {string} href - Object URL from `URL.createObjectURL` (or direct link).
 * @param {string} [filename] - Suggested download name (e.g. `CV_1.pdf`).
 */
export function triggerBlobDownload(href, filename) {
  if (!href) return;
  const anchor = document.createElement("a");
  anchor.href = href;
  if (filename) anchor.download = filename;
  anchor.rel = "noopener";
  // Append briefly so browsers that ignore detached-node clicks still fire.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Fetch one owned PDF from `POST /pdf/download_pdf` and return a one-shot
 * object URL plus the server-suggested filename.
 *
 * @param {number|string} pdfId - Document id to export.
 * @param {{ fallbackTitle?: string }} [options]
 * @returns {Promise<{ blob: string, title: string }>}
 */
export async function fetchOwnedPdfDownload(pdfId, options = {}) {
  if (pdfId == null) {
    throw new Error("Brak identyfikatora dokumentu do pobrania.");
  }
  const api = new ApiClient({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  const { blob, filename } = await api.httpRequestBlob(
    ENDPOINTS.PDF.DOWNLOAD,
    "POST",
    JSON.stringify(pdfId),
    "Błąd pobierania",
  );
  const urlBlob = URL.createObjectURL(blob);
  // Keep the object URL alive long enough for the toast "Pobierz PDF" action.
  window.setTimeout(() => URL.revokeObjectURL(urlBlob), 60_000);
  const title = filename || options.fallbackTitle || "cv.pdf";
  return { blob: urlBlob, title };
}
