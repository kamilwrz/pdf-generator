import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const legacyContextPath = join(sourceRoot, "store", "pdfgenerator-context.jsx");

function collectProductionSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionSources(absolutePath);
    if (!entry.isFile()) return [];
    if (![".js", ".jsx"].includes(extname(entry.name))) return [];
    if (/\.(?:test|runtime\.test)\.(?:js|jsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

test("production editor code depends only on focused contexts", () => {
  const violations = collectProductionSources(sourceRoot)
    .filter((file) => /PdfContext|pdfgenerator-context/.test(readFileSync(file, "utf8")))
    .map((file) => relative(sourceRoot, file).replaceAll("\\", "/"));

  assert.deepEqual(
    violations,
    [],
    `Legacy PdfContext references remain in: ${violations.join(", ")}`,
  );
  assert.equal(
    existsSync(legacyContextPath),
    false,
    "The legacy pdfgenerator-context.jsx module must stay deleted",
  );
});
