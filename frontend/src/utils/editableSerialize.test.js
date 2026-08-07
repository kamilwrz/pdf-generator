import test from "node:test";
import assert from "node:assert/strict";

import { serializeEditable, runsToHtml } from "./editableSerialize.js";

// Minimal DOM stand-ins so the serializer can be tested under plain Node (the
// project's test runner has no jsdom). Only the properties the serializer reads
// are implemented: nodeType, nodeValue, nodeName, childNodes, getAttribute.
function textNode(value) {
  return { nodeType: 3, nodeValue: value };
}

function element(nodeName, children = [], attrs = {}) {
  return {
    nodeType: 1,
    nodeName,
    childNodes: children,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    style: attrs.style || {},
  };
}

function root(children) {
  return { nodeType: 1, nodeName: "DIV", childNodes: children };
}

test("serializeEditable reads a data-* styled span into a run", () => {
  const node = root([
    textNode("Analiza "),
    element("SPAN", [textNode("KYC")], { "data-bold": "true", "data-color": "#ff0000" }),
    textNode(" oraz AML"),
  ]);
  const { content, runs } = serializeEditable(node);
  assert.equal(content, "Analiza KYC oraz AML");
  assert.deepEqual(runs, [{ start: 8, end: 11, bold: true, color: "#ff0000" }]);
});

test("serializeEditable folds <br> and block boundaries to newlines", () => {
  const node = root([
    textNode("Line one"),
    element("BR"),
    element("DIV", [textNode("Line two")]),
  ]);
  const { content } = serializeEditable(node);
  assert.equal(content, "Line one\nLine two");
});

test("serializeEditable drops control chars while keeping run offsets aligned", () => {
  const nul = String.fromCharCode(0);
  const node = root([
    textNode(`a${nul}b`), // the NUL between a and b is dropped
    element("SPAN", [textNode("XY")], { "data-italic": "true" }),
  ]);
  const { content, runs } = serializeEditable(node);
  assert.equal(content, "abXY");
  assert.deepEqual(runs, [{ start: 2, end: 4, italic: true }]);
});

test("serializeEditable recognises pasted <strong>/<em> tags", () => {
  const node = root([
    element("STRONG", [textNode("Bold")]),
    textNode(" "),
    element("EM", [textNode("Italic")]),
  ]);
  const { runs } = serializeEditable(node);
  assert.deepEqual(runs, [
    { start: 0, end: 4, bold: true },
    { start: 5, end: 11, italic: true },
  ]);
});

test("runsToHtml emits the data-* attributes the serializer reads back", () => {
  const html = runsToHtml("Analiza KYC", [{ start: 8, end: 11, bold: true }]);
  assert.match(html, /Analiza /);
  assert.match(html, /data-bold="true"/);
  assert.match(html, />KYC</);
});
