import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldShowStartChooser } from "./startChooser.js";

const freshEmptyDoc = {
  elementsCount: 0,
  isDemoContent: false,
  isPdfLoading: false,
  pdfId: null,
  dismissed: false,
};

describe("shouldShowStartChooser", () => {
  it("shows for a fresh, empty, unsaved document (post-login landing)", () => {
    assert.equal(shouldShowStartChooser(freshEmptyDoc), true);
  });

  it("hides once the canvas has any elements (wizard/import filled it)", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, elementsCount: 12 }),
      false,
    );
  });

  it("hides over the guest demo CV so the DemoBanner flow owns that state", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, isDemoContent: true }),
      false,
    );
  });

  it("hides while wizard data is being converted into the authenticated CV", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, conversionPending: true }),
      false,
    );
  });

  it("hides while a document is loading or saving", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, isPdfLoading: true }),
      false,
    );
  });

  it("hides for a saved document even when the user has emptied it mid-session", () => {
    // A persisted pdfId means the document is not brand-new; deleting all of
    // its content must not re-trigger onboarding.
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, pdfId: 42 }),
      false,
    );
  });

  it("hides after the user chose to start from a blank page", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, dismissed: true }),
      false,
    );
  });

  it("treats a missing/undefined elements count as empty", () => {
    assert.equal(
      shouldShowStartChooser({ ...freshEmptyDoc, elementsCount: undefined }),
      true,
    );
  });
});
