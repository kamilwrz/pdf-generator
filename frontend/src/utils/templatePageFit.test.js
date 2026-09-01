import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  findFitAcrossTypography,
  supportsSmallTypographyFit,
} from "./templatePageFit.js";

const BASELINE = { stack: 4, record: 10, section: 21, after_rule: 8 };
const FLOOR = { stack: 2, record: 2, section: 10, after_rule: 2 };
const regular = [{ element_id: "regular", page: 2, top: 0, height: 10 }];
const small = [{ element_id: "small", page: 2, top: 0, height: 10, compactType: true }];
const templateRegistrySource = readFileSync(new URL("../templates/index.js", import.meta.url), "utf8");
const publicTemplateIds = [...templateRegistrySource.matchAll(/\{ id: "([^"]+)"/g)]
  .map((match) => match[1]);

function packAt({ regularThreshold, smallThreshold }) {
  return (elements, spacing) => {
    const usesSmallType = elements.some((element) => element.compactType);
    const threshold = usesSmallType ? smallThreshold : regularThreshold;
    const page = spacing.section <= threshold ? 1 : 2;
    return [{ element_id: usesSmallType ? "small-result" : "regular-result", page, top: 0, height: 10 }];
  };
}

describe("findFitAcrossTypography", () => {
  it("covers every public template with an explicit S transaction", () => {
    assert.ok(publicTemplateIds.length > 0);
    for (const templateId of publicTemplateIds) {
      assert.equal(
        supportsSmallTypographyFit(templateId),
        true,
        `${templateId} must register its typography layout before release`,
      );
    }
  });

  it("keeps the current typography when ordinary spacing fits cleanly", () => {
    const result = findFitAcrossTypography({
      elements: regular,
      smallElements: small,
      loosest: BASELINE,
      tightest: FLOOR,
      targetPages: 1,
      packFn: packAt({ regularThreshold: 18, smallThreshold: 21 }),
    });

    assert.equal(result.fits, true);
    assert.equal(result.typographyPreset, null);
    assert.equal(result.attemptedSmallTypography, false);
  });

  it("uses preset S before AI when current typography cannot reach one page", () => {
    const result = findFitAcrossTypography({
      elements: regular,
      smallElements: small,
      loosest: BASELINE,
      tightest: FLOOR,
      targetPages: 1,
      packFn: packAt({ regularThreshold: 5, smallThreshold: 16 }),
    });

    assert.equal(result.fits, true);
    assert.equal(result.pageCount, 1);
    assert.equal(result.typographyPreset, "S");
    assert.equal(result.attemptedSmallTypography, true);
    assert.ok(result.spacing.section <= 16);
    assert.ok(result.spacing.section > FLOOR.section);
  });

  it("prefers S with readable spacing over an emergency floor-only fit", () => {
    const result = findFitAcrossTypography({
      elements: regular,
      smallElements: small,
      loosest: BASELINE,
      tightest: FLOOR,
      targetPages: 1,
      packFn: packAt({ regularThreshold: 10, smallThreshold: 18 }),
    });

    assert.equal(result.fits, true);
    assert.equal(result.typographyPreset, "S");
    assert.notEqual(result.tier, "emergency");
  });

  it("reports failure only after both typography candidates miss the target", () => {
    const result = findFitAcrossTypography({
      elements: regular,
      smallElements: small,
      loosest: BASELINE,
      tightest: FLOOR,
      targetPages: 1,
      packFn: packAt({ regularThreshold: 5, smallThreshold: 5 }),
    });

    assert.equal(result.fits, false);
    assert.equal(result.tier, "impossible");
    assert.equal(result.attemptedSmallTypography, true);
    assert.equal(result.typographyPreset, null);
  });
});
