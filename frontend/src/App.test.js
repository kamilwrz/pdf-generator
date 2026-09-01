import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./App.jsx", import.meta.url);

test("top-level routes are lazy and share a branded error element", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const PdfCanvas = lazy\(\(\) => import\('\.\/pages\/PdfCanvas'\)\)/);
  assert.match(source, /const Hero = lazy\(\(\) => import\('\.\/pages\/Hero\/Hero'\)\)/);
  assert.match(source, /<Suspense fallback=/);
  assert.ok(
    (source.match(/errorElement: <RouteErrorPage \/>/g) || []).length >= 5,
    "every public route should render the branded error state",
  );
});
