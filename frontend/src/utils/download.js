/**
 * Browser file-download helpers for PDF export.
 *
 * The editor never navigates to the S3 URL directly in a way that could race
 * against a shared download slot — callers fetch a blob for the specific
 * `pdf_id`, then trigger a one-shot download with that file's own title.
 */

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
