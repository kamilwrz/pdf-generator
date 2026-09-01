import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("../components/ai/AiCvPanel/AiCvPanel.jsx", import.meta.url);

test("CV import keeps one idempotency key for the logical file attempt", async () => {
    const source = await readFile(panelUrl, "utf8");

    assert.match(source, /importIdempotencyKeyRef/);
    assert.match(source, /globalThis\.crypto\?\.randomUUID\?\.\(\) \|\| nanoid\(\)/);
    assert.match(source, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
    assert.match(source, /err\?\.name === "AbortError"/);
    assert.match(source, /\["ai_request_in_progress", "ai_operation_active"\]/);
    assert.match(source, /importIdempotencyKeyRef\.current = null/);
});
