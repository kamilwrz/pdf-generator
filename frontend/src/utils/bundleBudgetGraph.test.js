import assert from "node:assert/strict";
import test from "node:test";

import {
  collectStaticManifestFiles,
  findManifestEntryKeys,
} from "./bundleBudgetGraph.js";

test("bundle budgets include every transitive static import without pulling lazy routes", () => {
  const manifest = {
    "index.html": {
      file: "assets/index.js",
      isEntry: true,
      imports: ["_shared.js"],
      dynamicImports: ["src/pages/Hero/Hero.jsx"],
      css: ["assets/index.css"],
    },
    "_shared.js": {
      file: "assets/shared.js",
      imports: ["_runtime.js"],
    },
    "_runtime.js": { file: "assets/runtime.js" },
    "src/pages/Hero/Hero.jsx": {
      file: "assets/Hero.js",
      isDynamicEntry: true,
      name: "Hero",
      imports: ["_shared.js", "_hero-copy.js"],
      dynamicImports: ["src/pages/PdfCanvas.jsx"],
      css: ["assets/Hero.css"],
    },
    "_hero-copy.js": { file: "assets/hero-copy.js" },
    "_PdfCanvas.js": {
      file: "assets/PdfCanvas.js",
      isDynamicEntry: true,
      name: "PdfCanvas",
    },
  };

  const entryKeys = findManifestEntryKeys(manifest, [
    (_key, entry) => entry.isEntry,
    (key, entry) => entry.isDynamicEntry
      && (key.endsWith("/Hero/Hero.jsx") || entry.name === "Hero"),
  ]);

  assert.deepEqual(entryKeys, ["index.html", "src/pages/Hero/Hero.jsx"]);
  assert.deepEqual(
    [...collectStaticManifestFiles(manifest, entryKeys)].sort(),
    [
      "assets/Hero.css",
      "assets/Hero.js",
      "assets/hero-copy.js",
      "assets/index.css",
      "assets/index.js",
      "assets/runtime.js",
      "assets/shared.js",
    ],
  );
});

test("bundle entry discovery fails instead of silently undercounting a missing route", () => {
  assert.throws(
    () => findManifestEntryKeys(
      { "index.html": { file: "assets/index.js", isEntry: true } },
      [
        (_key, entry) => entry.isEntry,
        (key) => key.includes("PdfCanvas"),
      ],
    ),
    /Unable to locate bundle-budget entry 2/,
  );
});
