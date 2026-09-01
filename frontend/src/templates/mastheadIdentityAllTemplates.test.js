import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TEST_TEMPLATES as TEMPLATES } from "./testTemplatePacks.js";
import { listMastheadBands } from "../utils/mastheadBands.js";
import { applyTitleToggle } from "../utils/mastheadIdentityOps.js";
import { materializeElementSpecs } from "../utils/materializeElementSpecs.js";

const RESTORED_STYLE_FIELDS = [
  "category",
  "left",
  "width",
  "height",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "color",
  "letterSpacing",
  "align",
  "textTransform",
  "zIndex",
];

const RESTORED_BOOLEAN_STYLE_FIELDS = [
  "bold",
  "italic",
  "underline",
  "autoHeight",
  "preserveInitialLayout",
  "bulletList",
];

const RESTORED_DECORATION_FIELDS = [
  "category",
  "left",
  "top",
  "width",
  "height",
  "backgroundColor",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "filled",
  "zIndex",
  "page",
  "flowRole",
  "titleDecoration",
];

/**
 * Verify the shared masthead-title contract against every public starter.
 *
 * The add control reconstructs a title from metadata rather than copying a
 * template-specific React component. A registry-wide round trip protects the
 * exact authored box and type style whenever a generator is added or changed.
 */
describe("all template starters expose a reversible masthead title", () => {
  it("covers the complete public template registry", () => {
    assert.deepEqual(
      TEMPLATES.map((template) => template.id).sort(),
      [
        "atrium",
        "aurelia",
        "cadenza",
        "linden",
        "meridian",
        "monument",
        "regent",
        "slate",
        "sterling",
        "vellum",
      ],
    );
  });

  for (const template of TEMPLATES) {
    it(`${template.id} hides and restores its job-position field`, () => {
      let nextId = 0;
      const createId = (prefix = "element") => `${prefix}-${nextId += 1}`;
      const source = materializeElementSpecs(template.elements, createId);
      const sourceBands = listMastheadBands(source);

      assert.equal(sourceBands.length, 1, `${template.id}: expected one identity band`);
      assert.equal(sourceBands[0].titlePresent, true, `${template.id}: starter title missing`);

      const bandId = sourceBands[0].bandId;
      const originalTitle = source.find((element) => (
        element.mastheadBandId === bandId && element.mastheadRole === "title"
      ));
      assert.ok(originalTitle, `${template.id}: tagged title missing`);

      const hidden = applyTitleToggle(source, bandId, createId).elements;
      const hiddenBands = listMastheadBands(hidden);
      assert.equal(hiddenBands.length, 1, `${template.id}: identity band disappeared`);
      assert.equal(hiddenBands[0].titlePresent, false, `${template.id}: title was not hidden`);
      assert.equal(
        hidden.some((element) => (
          element.mastheadBandId === bandId && element.mastheadRole === "title-decoration"
        )),
        false,
        `${template.id}: hidden title left an orphan decoration`,
      );

      // Static starters contain demo copy. Clearing only the retained spec
      // reproduces the real `cv_data.title === ""` path exercised by the plus
      // control without maintaining a second set of generated fixtures.
      const hiddenWithEmptySpec = hidden.map((element) => {
        if (element.flowRole !== "masthead-anchor" || element.mastheadBandId !== bandId) {
          return element;
        }
        const identity = element.mastheadIdentity;
        return {
          ...element,
          mastheadIdentity: {
            ...identity,
            title: {
              ...identity.title,
              spec: { ...identity.title.spec, content: "" },
            },
          },
        };
      });

      const restored = applyTitleToggle(hiddenWithEmptySpec, bandId, createId).elements;
      const restoredBands = listMastheadBands(restored);
      assert.equal(restoredBands.length, 1, `${template.id}: restored band missing`);
      assert.equal(restoredBands[0].titlePresent, true, `${template.id}: title was not restored`);

      const restoredTitle = restored.find((element) => (
        element.mastheadBandId === bandId && element.mastheadRole === "title"
      ));
      assert.ok(restoredTitle, `${template.id}: restored title element missing`);
      assert.equal(restoredTitle.content, "", `${template.id}: added field must start empty`);
      for (const field of RESTORED_STYLE_FIELDS) {
        assert.deepEqual(
          restoredTitle[field],
          originalTitle[field],
          `${template.id}: restored ${field} drifted`,
        );
      }
      for (const field of RESTORED_BOOLEAN_STYLE_FIELDS) {
        assert.equal(
          Boolean(restoredTitle[field]),
          Boolean(originalTitle[field]),
          `${template.id}: restored ${field} drifted`,
        );
      }
      const originalDecorations = source.filter((element) => (
        element.mastheadBandId === bandId && element.mastheadRole === "title-decoration"
      ));
      const restoredDecorations = restored.filter((element) => (
        element.mastheadBandId === bandId && element.mastheadRole === "title-decoration"
      ));
      assert.equal(
        restoredDecorations.length,
        originalDecorations.length,
        `${template.id}: restored decoration count drifted`,
      );
      for (const [index, originalDecoration] of originalDecorations.entries()) {
        for (const field of RESTORED_DECORATION_FIELDS) {
          assert.deepEqual(
            restoredDecorations[index][field],
            originalDecoration[field],
            `${template.id}: restored decoration ${field} drifted`,
          );
        }
      }

      const hiddenAgain = applyTitleToggle(restored, bandId, createId).elements;
      assert.equal(
        hiddenAgain.some((element) => (
          element.mastheadBandId === bandId
          && ["title", "title-decoration"].includes(element.mastheadRole)
        )),
        false,
        `${template.id}: empty title did not hide cleanly`,
      );
    });
  }
});
