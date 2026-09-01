import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DOCUMENT_CONFLICT_MESSAGE,
  localizePdfPersistenceError,
  requirePdfRevision,
  resolveCreateAttempt,
} from "../utils/pdfPersistenceContract.js";

test("create retries reuse a key only for the same session snapshot", () => {
  let generated = 0;
  const keyFactory = () => `key-${++generated}`;
  const first = resolveCreateAttempt(null, "epoch-a\u0000snapshot", keyFactory);
  const retry = resolveCreateAttempt(first, "epoch-a\u0000snapshot", keyFactory);
  const edited = resolveCreateAttempt(retry, "epoch-a\u0000edited", keyFactory);
  const returnedToA = resolveCreateAttempt(edited, "epoch-b\u0000snapshot", keyFactory);

  assert.strictEqual(retry, first);
  assert.equal(retry.idempotencyKey, "key-1");
  assert.equal(edited.idempotencyKey, "key-2");
  assert.equal(returnedToA.idempotencyKey, "key-3");
});

test("server revisions are positive integers", () => {
  assert.equal(requirePdfRevision(4), 4);
  assert.equal(requirePdfRevision("5"), 5);
  assert.throws(() => requirePdfRevision(null), /brakuje jego rewizji/);
  assert.throws(() => requirePdfRevision(0), /brakuje jego rewizji/);
});

test("document conflicts use Polish recovery copy and retain metadata", () => {
  const backendError = Object.assign(new Error("backend copy"), {
    status: 409,
    code: "document_conflict",
    detail: { current_revision: 7 },
  });

  const localized = localizePdfPersistenceError(backendError);

  assert.equal(localized.message, DOCUMENT_CONFLICT_MESSAGE);
  assert.equal(localized.status, 409);
  assert.equal(localized.code, "document_conflict");
  assert.deepEqual(localized.detail, { current_revision: 7 });
});

test("persistence requests carry idempotency and optimistic revision fields", async () => {
  const source = await readFile(new URL("./usePdfExport.js", import.meta.url), "utf8");

  assert.match(source, /headers: \{ "Idempotency-Key": createAttempt\.idempotencyKey \}/);
  assert.match(source, /meta\.documentSessionKey/);
  assert.ok(
    (source.match(/expected_revision,/g) || []).length >= 2,
    "update and save-elements must send expected_revision",
  );
  assert.ok(
    (source.match(/handlePdfId\(data\.pdf_id.*\{ revision \}\)/g) || []).length >= 2,
    "successful persistence responses must update the server revision",
  );
  assert.match(source, /if \(didPersist\) setA4_Elements_deleted\(\[\]\)/);
});

test("PdfCanvas and saved-document hydration preserve the server revision contract", async () => {
  const [canvas, modal] = await Promise.all([
    readFile(new URL("../pages/PdfCanvas.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/modals/ModalPdfs/ModalPdfs.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(canvas, /expectedRevision: serverRevision/);
  assert.match(canvas, /documentSessionKey,/);
  assert.match(canvas, /responsePDF\?\.code === "document_conflict"/);
  assert.match(modal, /commitDocumentSnapshot\(\{/);
  assert.match(modal, /serverRevision: pdfCanvas\?\.revision \?\? null/);
  assert.match(modal, /\{ markClean: true \}/);
});
