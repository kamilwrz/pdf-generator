import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  bulletRunsToEditableHtml,
  createTextareaEnterEdit,
  serializeEditable,
  runsToHtml,
  setSelectionOffsets,
} from "./editableSerialize.js";

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

test("serializeEditable does not double lines when block wrappers coexist with newline text", () => {
  // Reproduces the contentEditable pollution that inflated textarea height: the
  // browser wraps lines in <div> blocks but leaves the original "\n" text nodes
  // in place. Serialization must collapse each boundary to a single "\n".
  const node = root([
    element("DIV", [textNode("Line1")]),
    textNode("\n"),
    element("DIV", [textNode("Line2")]),
    textNode("\n"),
    element("DIV", [textNode("Line3")]),
  ]);
  const { content } = serializeEditable(node);
  assert.equal(content, "Line1\nLine2\nLine3");
});

test("serializeEditable preserves consecutive explicit empty paragraphs", () => {
  const node = root([
    element("DIV", [textNode("Line1")], { "data-editable-paragraph": "plain" }),
    element("DIV", [], { "data-editable-paragraph": "plain" }),
    element("DIV", [], { "data-editable-paragraph": "plain" }),
    element("DIV", [textNode("Line2")], { "data-editable-paragraph": "plain" }),
  ]);
  const { content } = serializeEditable(node);
  assert.equal(content, "Line1\n\n\nLine2");
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

test("bullet edit HTML gives the Monument training copy a dedicated marker column", () => {
  const content = (
    "• W trakcie (bezpłatnie): Cisco Networking Academy (Junior "
    + "Cybersecurity Analyst), Fortinet NSE 1-3."
  );
  const html = bulletRunsToEditableHtml(content, []);

  assert.match(html, /data-editable-paragraph="bullet"/);
  assert.match(html, /data-editable-bullet-marker="true">• <\/span>/);
  assert.match(
    html,
    /data-editable-bullet-body="true">W trakcie .*Fortinet NSE 1-3\.<\/span>/,
  );
  assert.equal(html.includes("<div data-editable-paragraph=\"plain\">"), false);
});

test("bullet edit HTML keeps plain rows full-width and slices inline runs per paragraph", () => {
  const content = "Nagłówek\n\n• Analiza KYC";
  const start = content.indexOf("KYC");
  const html = bulletRunsToEditableHtml(content, [
    { start, end: start + 3, bold: true },
  ]);

  assert.equal((html.match(/data-editable-paragraph="plain"/g) || []).length, 2);
  assert.equal((html.match(/data-editable-paragraph="bullet"/g) || []).length, 1);
  assert.match(html, /data-bold="true"[^>]*>KYC<\/span>/);
});

test("Enter after a filled bullet creates a new editable bullet", () => {
  const edit = createTextareaEnterEdit({
    content: "• First item",
    runs: [],
    selection: { start: 12, end: 12 },
    bulletList: true,
  });

  assert.equal(edit.content, "• First item\n• ");
  assert.equal(edit.caret, edit.content.length);
});

test("Enter on an empty bullet exits the list into a persistent blank paragraph", () => {
  const content = "• First\n• ";
  const exited = createTextareaEnterEdit({
    content,
    runs: [],
    selection: { start: content.length, end: content.length },
    bulletList: true,
  });
  assert.equal(exited.content, "• First\n");
  assert.equal(exited.caret, exited.content.length);

  const blankLine = createTextareaEnterEdit({
    content: exited.content,
    runs: exited.runs,
    selection: { start: exited.caret, end: exited.caret },
    bulletList: true,
  });
  assert.equal(blankLine.content, "• First\n\n");
  assert.equal(blankLine.caret, blankLine.content.length);
});

test("Enter inside a styled bullet keeps the split suffix run aligned", () => {
  const edit = createTextareaEnterEdit({
    content: "• AlphaBeta",
    runs: [{ start: 7, end: 11, bold: true }],
    selection: { start: 7, end: 7 },
    bulletList: true,
  });

  assert.equal(edit.content, "• Alpha\n• Beta");
  assert.deepEqual(edit.runs, [{ start: 10, end: 14, bold: true }]);
  assert.equal(edit.caret, 10);
});

test("selection restoration targets the empty paragraph after a newline", () => {
  const first = element("DIV", [textNode("First")]);
  const second = element("DIV");
  const editable = root([first, second]);
  first.parentNode = editable;
  second.parentNode = editable;

  let restoredStart = null;
  let restoredEnd = null;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = {
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
  };
  globalThis.document = {
    createRange: () => ({
      setStart(node, offset) {
        restoredStart = { node, offset };
      },
      setEnd(node, offset) {
        restoredEnd = { node, offset };
      },
    }),
  };

  try {
    setSelectionOffsets(editable, 6, 6);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }

  assert.deepEqual(restoredStart, { node: second, offset: 0 });
  assert.deepEqual(restoredEnd, { node: second, offset: 0 });
});

test("selection after a bullet marker targets the body column", () => {
  const markerText = textNode("• ");
  const marker = element("SPAN", [markerText], {
    "data-editable-bullet-marker": "true",
  });
  const body = element("SPAN", [], { "data-editable-bullet-body": "true" });
  const paragraph = element("DIV", [marker, body], {
    "data-editable-paragraph": "bullet",
  });
  const editable = root([paragraph]);
  markerText.parentNode = marker;
  marker.parentNode = paragraph;
  body.parentNode = paragraph;
  paragraph.parentNode = editable;

  let restoredStart = null;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = {
    getSelection: () => ({
      removeAllRanges() {},
      addRange() {},
    }),
  };
  globalThis.document = {
    createRange: () => ({
      setStart(node, offset) {
        restoredStart = { node, offset };
      },
      setEnd() {},
    }),
  };

  try {
    setSelectionOffsets(editable, 2, 2);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }

  assert.deepEqual(restoredStart, { node: body, offset: 0 });
});

test("Textarea wires bullet edit paragraphs to the same CSS grid as display mode", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../components/canvas/Textarea/Textarea.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/canvas/Textarea/Textarea.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /node\.innerHTML = bulletRunsToEditableHtml\(seeded,/);
  assert.match(source, /createTextareaEnterEdit\(\{/);
  assert.match(source, /measureEditableContentHeight\([\s\S]*\{ bulletList: !!bulletList \}/);
  assert.match(
    css,
    /\.bulletLine,\s*\.editing \[data-editable-paragraph="bullet"\][\s\S]*grid-template-columns: max-content minmax\(0, 1fr\)/,
  );
});
