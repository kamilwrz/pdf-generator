import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AddSectionModal.jsx", import.meta.url), "utf8");

test("describes record layouts by structure rather than blueprint domain", () => {
  assert.match(source, /title: "Wpis z dodatkowymi szczegółami"/);
  assert.match(source, /title: "Wpis z opisem"/);
  assert.match(source, /Nazwa, organizacja lub miejsce/);
  assert.doesNotMatch(source, /Jak wykształcenie|Jak doświadczenie/);
});
