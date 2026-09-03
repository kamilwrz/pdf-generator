import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRequiredCvNameElement, hasRequiredCvName } from "./requiredCvName.js";

describe("required CV name", () => {
  it("rejects an untouched starter placeholder", () => {
    const elements = [{ element_id: "name", category: "text", mastheadRole: "name", content: "", placeholder: "Imię i nazwisko" }];
    assert.equal(hasRequiredCvName(elements), false);
    assert.equal(findRequiredCvNameElement(elements)?.element_id, "name");
  });

  it("accepts authored name content", () => {
    assert.equal(hasRequiredCvName([{ category: "textarea", mastheadRole: "name", content: "Ada Lovelace" }]), true);
  });

  it("keeps legacy freeform documents without a semantic name target saveable", () => {
    assert.equal(hasRequiredCvName([{ category: "text", content: "Dowolny tekst" }]), true);
  });
});
