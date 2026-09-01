import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL(
  "../components/ai/AiCvPanel/AiCvPanel.jsx",
  import.meta.url,
);

test("import history identifies rows by the source filename, never a database id", async () => {
  const source = await readFile(panelUrl, "utf8");

  assert.match(source, /snapshot\.filename \|\| "Import CV"/);
  assert.doesNotMatch(source, /Import #\{snapshot\.id\}/);
});
