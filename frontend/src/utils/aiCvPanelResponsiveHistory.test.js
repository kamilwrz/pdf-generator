import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL(
  "../components/ai/AiCvPanel/AiCvPanel.module.css",
  import.meta.url,
);

test("import history preserves readable filenames and usable actions on compact screens", async () => {
  const source = await readFile(stylesUrl, "utf8");

  assert.match(source, /\.historyItem\s*>\s*div:first-child\s*{[^}]*min-width:\s*0;/s);
  assert.match(source, /\.guidedLink\s*{[^}]*min-height:\s*36px;/s);
  assert.match(source, /\.deleteImport\s*{[^}]*min-height:\s*36px;/s);
  assert.match(source, /\.reExtract\s*{[^}]*min-height:\s*36px;/s);
  assert.match(source, /@media\s*\(max-width:\s*768px\)[\s\S]*\.historyItem[\s\S]*flex-direction:\s*column;/);
});
