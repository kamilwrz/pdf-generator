import assert from "node:assert/strict";
import test from "node:test";

import {
  getTemplateCollection,
  groupTemplatesByCollection,
  sortTemplatesByCollection,
} from "./templateCollections.js";

const FIXTURES = [
  { id: "volt", collection: "Iconic", industry: "Iconic · Ciemny sygnał" },
  { id: "words", collection: "Classic", industry: "Classic · Dokument Word" },
  { id: "ledger", collection: "Finanse", industry: "Finanse · Instytucjonalny" },
  { id: "moss", collection: "Sidebar", industry: "Sidebar · Botaniczna elegancja" },
  { id: "vector", collection: "IT", industry: "IT · Sieci i platformy" },
  { id: "signal", collection: "Banking", industry: "Banking · Ryzyko i treasury" },
  { id: "onyx", collection: "Darktheme", industry: "Darktheme · Rama dyplomatyczna" },
  { id: "monument", industry: "Classic · Monochromatyczny editorial" },
];

test("reads explicit collection, then industry prefix", () => {
  assert.equal(getTemplateCollection({ collection: "IT" }), "IT");
  assert.equal(
    getTemplateCollection({ industry: "Finanse · Instytucjonalny" }),
    "Finanse",
  );
});

test("groups templates into product-collection order", () => {
  const groups = groupTemplatesByCollection(FIXTURES);
  assert.deepEqual(
    groups.map((group) => group.collection),
    ["Finanse", "IT", "Classic", "Sidebar", "Banking", "Darktheme", "Iconic"],
  );
  const classic = groups.find((group) => group.collection === "Classic");
  assert.deepEqual(
    classic.templates.map((template) => template.id),
    ["words", "monument"],
  );
});

test("sort flattens collection order even when input is shuffled", () => {
  const sorted = sortTemplatesByCollection(FIXTURES);
  assert.deepEqual(
    sorted.map((template) => template.id),
    ["ledger", "vector", "words", "monument", "moss", "signal", "onyx", "volt"],
  );
});
