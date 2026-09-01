import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import {
  collectStaticManifestFiles,
  findManifestEntryKeys,
} from "../src/utils/bundleBudgetGraph.js";

const KIB = 1024;
const limits = {
  landing: 200 * KIB,
  editor: 500 * KIB,
  feature: 300 * KIB,
};

const distDir = new URL("../dist/", import.meta.url);
const assetsDir = new URL("assets/", distDir);
const indexHtml = await readFile(new URL("index.html", distDir));
const manifest = JSON.parse(
  await readFile(new URL(".vite/manifest.json", distDir), "utf8"),
);
const assetNames = await readdir(assetsDir);

async function gzipBytes(name) {
  const contents = await readFile(new URL(name, assetsDir));
  return gzipSync(contents).byteLength;
}

const sizes = new Map();
for (const name of assetNames) {
  sizes.set(name, await gzipBytes(name));
}

// Vite's application entry key is currently `index.html`; selecting the sole
// `isEntry` record keeps the gate correct if the HTML input is renamed and
// fails closed if the build ever gains multiple synchronous entry points.
const entryPredicate = (_key, entry) => entry.isEntry === true;
const landingKeys = findManifestEntryKeys(manifest, [
  entryPredicate,
  (key, entry) => entry.isDynamicEntry === true
    && (key.endsWith("/Hero/Hero.jsx") || entry.name === "Hero"),
]);
const editorKeys = findManifestEntryKeys(manifest, [
  entryPredicate,
  (key, entry) => entry.isDynamicEntry === true
    && (key.endsWith("/PdfCanvas.jsx") || entry.name === "PdfCanvas"),
]);
const landingAssets = collectStaticManifestFiles(manifest, landingKeys);
const editorAssets = collectStaticManifestFiles(manifest, editorKeys);

function totalFor(names) {
  return [...names].reduce((total, emittedPath) => {
    const name = emittedPath.replace(/^assets\//, "");
    const bytes = sizes.get(name);
    if (bytes === undefined) {
      throw new Error(`Manifest asset ${emittedPath} is missing from dist/assets.`);
    }
    return total + bytes;
  }, 0);
}

const landingBytes = gzipSync(indexHtml).byteLength + totalFor(landingAssets);
const editorBytes = gzipSync(indexHtml).byteLength + totalFor(editorAssets);
const featureSizes = [...sizes.entries()]
  .filter(([name]) => name.endsWith(".js"));
const violations = [];

if (landingBytes > limits.landing) {
  violations.push(`landing ${landingBytes} > ${limits.landing}`);
}
if (editorBytes > limits.editor) {
  violations.push(`editor sync ${editorBytes} > ${limits.editor}`);
}

for (const [name, bytes] of featureSizes) {
  if (bytes > limits.feature) {
    violations.push(`feature ${name} ${bytes} > ${limits.feature}`);
  }
}

const formatKib = (bytes) => `${(bytes / KIB).toFixed(2)} KiB gzip`;
process.stdout.write([
  `Landing: ${formatKib(landingBytes)} / ${formatKib(limits.landing)}`,
  `Editor sync: ${formatKib(editorBytes)} / ${formatKib(limits.editor)}`,
  `Largest feature: ${formatKib(Math.max(0, ...featureSizes.map(([, bytes]) => bytes)))} / ${formatKib(limits.feature)}`,
].join("\n") + "\n");

if (violations.length) {
  throw new Error(`Bundle budget exceeded:\n${violations.join("\n")}`);
}
