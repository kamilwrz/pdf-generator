import test from "node:test";
import assert from "node:assert/strict";

import {
    CV_IMPORT_REQUEST_OPTIONS,
    cvImportStatusLabel,
} from "./cvImportRequest.js";

test("CV extraction waits four minutes without automatic retries", () => {
    assert.deepEqual(CV_IMPORT_REQUEST_OPTIONS, {
        timeoutMs: 240_000,
        retries: 0,
        retryOnTimeout: false,
    });
});

test("CV import history distinguishes active, successful, and failed snapshots", () => {
    assert.equal(cvImportStatusLabel("processing"), "Przetwarzanie…");
    assert.equal(cvImportStatusLabel("succeeded"), "Dane gotowe");
    assert.equal(cvImportStatusLabel("failed"), "Import nieudany");
});
