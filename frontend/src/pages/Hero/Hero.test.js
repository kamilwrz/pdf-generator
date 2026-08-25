import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("leads with the structured A4 document promise", () => {
    assert.match(source, /Zmieniaj treść\./);
    assert.match(source, /Nie naprawiaj za każdym razem układu\./);
    assert.match(source, /Dokument, który reaguje na treść/);
    assert.match(source, /Podgląd nie jest przybliżeniem/);
  });

  it("describes AI as an explicit task tool and keeps product caveats", () => {
    assert.match(source, /Daj mu konkretne zadanie/);
    assert.match(source, /W wybranych szablonach zmienisz paletę/);
    assert.match(source, /Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym/);
  });

  it("preserves directed starts, analytics events, anchors, and dynamic template count", () => {
    for (const event of [
      "hero_wizard",
      "hero_import",
      "before_after_import",
      "templates_wizard",
      "pricing_free",
      "pricing_pro",
      "final_wizard",
      "final_import",
    ]) {
      assert.match(source, new RegExp(`event=\\"${event}\\"|queueGuestEvent\\(\\"${event}\\"\\)`));
    }

    assert.match(source, /buildStartUrl\("wizard", "free"\)/);
    assert.match(source, /buildStartUrl\("import", "free"\)/);
    assert.match(source, /\{TEMPLATE_COUNT\}/);
    assert.match(source, /id="jak-to-dziala"/);
    assert.match(source, /id="szablony"/);
    assert.match(source, /id="cennik"/);
  });

  it("features Linden as the primary hero document", () => {
    assert.match(source, /const heroFront = previewById\("linden"\)/);
    assert.doesNotMatch(source, /const heroFront = previewById\("portico"\)/);
  });
});
