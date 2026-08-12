import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EDITOR_MODE_FREEFORM,
  EDITOR_MODE_TEMPLATE,
  canCloneOrDeleteElements,
  canEditElementLayer,
  canEditElementPosition,
  canEditElementSizeField,
  canFreePositionElement,
  canResizeElement,
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
    assert.equal(inferEditorMode([], "nimbus"), EDITOR_MODE_TEMPLATE);
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

  it("allows user gallery photos in template mode", () => {
    const image = { category: "image", src: "/images/1/content" };
    assert.equal(canFreePositionElement(image, EDITOR_MODE_TEMPLATE), true);
  });

  it("blocks fitted profile-photo slots in template mode", () => {
    const fitted = {
      category: "image",
      src: "/images/1/content",
      photoSlot: "image",
      id: "profile-photo",
    };
    assert.equal(canFreePositionElement(fitted, EDITOR_MODE_TEMPLATE), false);
  });

  it("blocks untagged template icons and accent artwork in template mode", () => {
    const contactIcon = {
      category: "image",
      src: "/template-assets/iconic/harbor/phone.png",
      alignWithText: true,
    };
    const accentArt = {
      category: "image",
      src: "/template-assets/nimbus-finance-accent.png",
    };
    const legacyIconic = {
      category: "image",
      src: "https://api.example/template-assets/iconic/nova/email.png",
    };
    assert.equal(canFreePositionElement(contactIcon, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(accentArt, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(legacyIconic, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(contactIcon, EDITOR_MODE_FREEFORM), true);
  });

  it("blocks untagged generator shapes in template mode", () => {
    const rule = { category: "line", left: 48, top: 144, width: 499, height: 1 };
    const frame = { category: "rectangle", left: 416, top: 24, width: 122, height: 126 };
    const disc = { category: "circle", left: 493, top: 36, width: 58, height: 58 };
    assert.equal(canFreePositionElement(rule, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(frame, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(disc, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canFreePositionElement(rule, EDITOR_MODE_FREEFORM), true);
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

  it("hides the layer (zIndex) field only in template mode", () => {
    assert.equal(canEditElementLayer(EDITOR_MODE_TEMPLATE), false);
    assert.equal(canEditElementLayer(EDITOR_MODE_FREEFORM), true);
  });

  it("disables drag-resize and size fields in template mode", () => {
    const image = { category: "image", src: "/images/1/content" };
    const box = { category: "textarea", autoHeight: true, flowRole: "content" };
    assert.equal(canResizeElement(image, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canResizeElement(box, EDITOR_MODE_TEMPLATE), false);
    assert.equal(canResizeElement(image, EDITOR_MODE_FREEFORM), true);
    assert.equal(canEditElementSizeField(image, "width", EDITOR_MODE_TEMPLATE), false);
    assert.equal(canEditElementSizeField(box, "width", EDITOR_MODE_TEMPLATE), false);
  });

  it("hides auto-height and image proportional height fields in freeform", () => {
    assert.equal(
      canEditElementSizeField({ category: "textarea", autoHeight: true }, "height", EDITOR_MODE_FREEFORM),
      false,
    );
    assert.equal(
      canEditElementSizeField({ category: "textarea", autoHeight: true }, "width", EDITOR_MODE_FREEFORM),
      true,
    );
    assert.equal(
      canEditElementSizeField({ category: "image" }, "height", EDITOR_MODE_FREEFORM),
      false,
    );
    assert.equal(
      canEditElementSizeField({ category: "image" }, "width", EDITOR_MODE_FREEFORM),
      true,
    );
  });
});
