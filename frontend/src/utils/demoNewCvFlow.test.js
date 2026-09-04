import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const canvasUrl = new URL("../pages/PdfCanvas.jsx", import.meta.url);

describe("demo new-CV flow integration", () => {
  it("treats demo elements as product content instead of an active user document", async () => {
    const source = await readFile(canvasUrl, "utf8");

    assert.match(source, /hasActiveDocument=\{A4_Elements\.length > 0 && !isDemoContent\}/);
    assert.match(source, /allowUnconfirmedReplacement=\{isDemoContent\}/);
  });
});
