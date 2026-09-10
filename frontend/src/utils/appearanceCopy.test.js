import test from "node:test";
import assert from "node:assert/strict";

import { ATRIUM_PALETTES } from "./atriumAppearance.js";
import { AURELIA_PALETTES } from "./aureliaAppearance.js";
import { CADENZA_PALETTES } from "./cadenzaAppearance.js";
import { LINDEN_PALETTES } from "./lindenAppearance.js";
import { MERIDIAN_PALETTES } from "./meridianAppearance.js";
import { MONUMENT_PALETTES } from "./monumentAppearance.js";
import { REGENT_PALETTES } from "./regentAppearance.js";
import { SLATE_PALETTES } from "./slateAppearance.js";
import { STERLING_PALETTES } from "./sterlingAppearance.js";
import { VELLUM_PALETTES } from "./vellumAppearance.js";

const PALETTE_GROUPS = [
  ATRIUM_PALETTES,
  AURELIA_PALETTES,
  CADENZA_PALETTES,
  LINDEN_PALETTES,
  MERIDIAN_PALETTES,
  MONUMENT_PALETTES,
  REGENT_PALETTES,
  SLATE_PALETTES,
  STERLING_PALETTES,
  VELLUM_PALETTES,
];

test("appearance taglines describe visible colours instead of abstract personalities", () => {
  for (const palettes of PALETTE_GROUPS) {
    assert.equal(palettes.length, 6);
    for (const palette of palettes) {
      assert.ok(palette.tagline.length >= 20, `${palette.id} needs a useful tagline`);
      assert.doesNotMatch(
        palette.tagline,
        /editorial|redakcyj|autorytet|ceremonial|szlachetn|dyplomatycz|strategiczn|architektoniczn|instytucjonaln|kolekcjonersk|technologiczn/i,
      );
    }
  }
});
