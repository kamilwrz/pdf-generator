import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  resolveBrowserTextLayouts,
  resolveTextareaBrowserLines,
} from "./browserTextLayout.js";

test("browser text layout is a no-op when no DOM is available", async () => {
  const elements = [{
    element_id: "body",
    category: "textarea",
    content: "Ala ma kota",
    width: 152,
  }];

  const result = await resolveBrowserTextLayouts(elements, null);

  assert.equal(result, elements);
  assert.equal(result[0].resolvedLines, undefined);
});

test("an unavailable primary font fails closed to backend wrapping", async () => {
  const elements = [{
    category: "textarea",
    element_id: "copy",
    width: 152,
    content: "Tekst",
    fontFamily: "Montserrat",
  }];
  const documentRef = {
    body: {},
    fonts: {
      load: async () => [],
      ready: Promise.resolve(),
    },
    createElement() {
      throw new Error("measurement must not run for an unavailable font");
    },
  };

  const result = await resolveBrowserTextLayouts(elements, documentRef);

  assert.equal(result[0], elements[0]);
  assert.equal(result[0].resolvedLines, undefined);
});

test("font readiness includes every bold and italic inline-run variant", async () => {
  const requested = [];
  const elements = [{
    category: "textarea",
    element_id: "styled-copy",
    width: 0,
    content: "ABC",
    fontFamily: "Montserrat",
    runs: [
      { start: 0, end: 2, bold: true },
      { start: 1, end: 3, italic: true },
    ],
  }];
  const documentRef = {
    body: {},
    fonts: {
      load: async (descriptor) => {
        requested.push(descriptor);
        return [{}];
      },
      ready: Promise.resolve(),
    },
  };

  await resolveBrowserTextLayouts(elements, documentRef);

  assert.deepEqual(
    requested.map((descriptor) => descriptor.split(" ").slice(0, 2).join(" ")).sort(),
    ["italic 400", "italic 700", "normal 400", "normal 700"],
  );
});

test("supplementary-plane RTL scripts stay on the backend fallback", () => {
  const documentRef = {
    body: {},
    createElement() {
      throw new Error("RTL content must be rejected before mirror creation");
    },
  };

  const result = resolveTextareaBrowserLines({
    category: "textarea",
    width: 152,
    // U+1E900 ADLAM CAPITAL LETTER ALIF has strong right-to-left direction.
    content: "\u{1E900}",
  }, documentRef);

  assert.equal(result, null);
});

test("every PDF-rendering request resolves browser lines before serialization", async () => {
  const source = await readFile(
    new URL("../hooks/usePdfExport.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /resolveBrowserTextLayouts\(sorted\)/);
  assert.match(source, /root: renderRoot/g);
  assert.equal((source.match(/resolveBrowserTextLayouts\(sorted\)/g) || []).length, 3);
});
