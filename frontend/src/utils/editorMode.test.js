import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  canCloneOrDeleteElements,
  canEditElementPosition,
  canEditElementSizeField,
  canFreePositionElement,
  canToggleElementLock,
  inferEditorMode,
  normalizeEditorMode,
} from "./editorMode.js";

describe("normalizeEditorMode", () => {
  it("accepts template and defaults everything else to freeform", () => {
    assert.equal(normalizeEditorMode("template"), EDITOR_MODE_TEMPLATE);
    assert.equal(normalizeEditorMode("freeform"), EDITOR_MODE_FREEFORM);
    assert.equal(normalizeEditorMode(null), EDITOR_MODE_FREEFORM);
    assert.equal(normalizeEditorMode("other"), EDITOR_MODE_FREEFORM);
  });
});

describe("inferEditorMode", () => {
  it("uses templateId when present", () => {
    assert.equal(inferEditorMode([], "kernel"), EDITOR_MODE_TEMPLATE);
  });

  it("infers template from flow metadata density", () => {
    const elements = [
      { flowRole: "section-chrome", category: "text" },
      { flowRole: "content", autoHeight: true, category: "textarea" },
      { preserveInitialLayout: true, category: "textarea" },
      { category: "rectangle", fixedToPage: true },
    ];
    assert.equal(inferEditorMode(elements), EDITOR_MODE_TEMPLATE);
  });

  it("infers freeform for plain authored shapes", () => {
    const elements = [
      { category: "text", content: "Hello" },
      { category: "rectangle" },
      { category: "image", src: "/uploads/x.png" },
    ];
    assert.equal(inferEditorMode(elements), EDITOR_MODE_FREEFORM);
  });
});

describe("canFreePositionElement", () => {
  it("blocks template flow content and allows freeform", () => {
    const content = { category: "textarea", flowRole: "content", autoHeight: true };
    assert.equal(canFreePositionElement(content, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(content, EDITOR_MODE_FREEFORM), true);
  });

  it("blocks masthead decorations in template mode", () => {
    const signet = { category: "circle", flowRole: "masthead", width: 25, height: 25 };
    assert.equal(canFreePositionElement(signet, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(signet, EDITOR_MODE_FREEFORM), true);
  });

  it("allows untagged images in template mode", () => {
    const image = { category: "image", src: "/images/1/content" };
    assert.equal(canFreePositionElement(image, EDITOR_MODE_TEMPLATE), true);
  });

  it("never allows locked or fixed chrome", () => {
    assert.equal(
      canFreePositionElement({ category: "rectangle", fixedToPage: true }, EDITOR_MODE_FREEFORM),
      false,
    );
    assert.equal(
      canFreePositionElement({ category: "text", locked: true }, EDITOR_MODE_FREEFORM),
      false,
    );
  });
});

describe("inspector field gates", () => {
  it("hides position controls for layout-owned template content", () => {
    const content = { category: "textarea", flowRole: "content", autoHeight: true };
    assert.equal(canEditElementPosition(content, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canToggleElementLock(content, EDITOR_MODE_TEMPLATE), false);
  });

  it("keeps lock toggle for freeform locked text so the user can unlock", () => {
    const locked = { category: "text", locked: true };
    assert.equal(canEditElementPosition(locked, EDITOR_MODE_FREEFORM), false);
    assert.equal(canToggleElementLock(locked, EDITOR_MODE_FREEFORM), true);
  });

  it("disables clone/delete only in template mode", () => {
    assert.equal(canCloneOrDeleteElements(EDITOR_MODE_TEMPLATE), false);
    assert.equal(canCloneOrDeleteElements(EDITOR_MODE_FREEFORM), true);
  });

  it("hides auto-height and image proportional height fields", () => {
    assert.equal(
      canEditElementSizeField({ category: "textarea", autoHeight: true }, "height"),
      false,
    );
    assert.equal(
      canEditElementSizeField({ category: "textarea", autoHeight: true }, "width"),
      true,
    );
    assert.equal(
      canEditElementSizeField({ category: "image" }, "height"),
      false,
    );
    assert.equal(
      canEditElementSizeField({ category: "image" }, "width"),
      true,
    );
  });
});
