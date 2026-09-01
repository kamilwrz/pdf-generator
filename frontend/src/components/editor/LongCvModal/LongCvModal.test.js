import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalUrl = new URL("./LongCvModal.jsx", import.meta.url);

test("modal is reached only after deterministic spacing and typography S fail", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /mniejsze odstępy i rozmiar tekstu S/);
  assert.doesNotMatch(source, /variant|emergency|Maksymalnie zacieśnij|onForceTighten/);
});

test("the fallback routes to AI shortening with Pro-gated copy", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /onRequestAiShorten/);
  assert.match(source, /Skróć treść z AI/);
  assert.match(source, /Odblokuj skracanie AI w Pro/);
  assert.match(source, /canUseAi/);
});

test("copy leads with the honest titles and uses the target label helper", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /Trzeba skrócić treść/);
  assert.match(source, /formatFitTargetLabel/);
});
