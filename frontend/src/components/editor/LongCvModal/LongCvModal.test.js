import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalUrl = new URL("./LongCvModal.jsx", import.meta.url);

test("modal is a two-variant page-fit decision (emergency | impossible)", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /variant/);
  assert.match(source, /"emergency"/);
  assert.match(source, /"impossible"/);
  // The old multi-step spacing dance is gone.
  assert.doesNotMatch(source, /intro-spacing|result-success|result-still|onApplyCompact/);
});

test("emergency variant offers Maksymalnie zacieśnij; impossible does not", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /Maksymalnie zacieśnij/);
  assert.match(source, /onForceTighten/);
  // Guarded so it only renders in the emergency branch.
  assert.match(source, /variant === "emergency"/);
});

test("both variants route to AI shortening with Pro-gated copy", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /onRequestAiShorten/);
  assert.match(source, /Skróć treść z AI/);
  assert.match(source, /Odblokuj skracanie AI w Pro/);
  assert.match(source, /canUseAi/);
});

test("copy leads with the honest titles and uses the target label helper", async () => {
  const source = await readFile(modalUrl, "utf8");
  assert.match(source, /Zmieścimy na/);          // emergency title
  assert.match(source, /Trzeba skrócić treść/);  // impossible title
  assert.match(source, /formatFitTargetLabel/);
});
