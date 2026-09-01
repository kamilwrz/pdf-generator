import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL(
  "../components/ai/AiCvPanel/AiCvPanel.jsx",
  import.meta.url,
);

test("deleting import data requires an inline, filename-scoped confirmation", async () => {
  const source = await readFile(panelUrl, "utf8");

  assert.match(source, /setConfirmDeleteImportId\(snapshot\.id\)/);
  assert.match(source, /Potwierdź usunięcie danych z pliku/);
  assert.match(source, /"Usuwanie…" : "Usuń trwale"/);
  assert.match(source, />\s*Anuluj\s*</);
});
