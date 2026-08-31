import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("leads with the recruitment outcome and explains how the product supports it", () => {
    assert.match(source, /Pokaż, dlaczego warto/);
    assert.match(source, /zaprosić Cię/);
    assert.match(source, /profesjonalne CV dopasowane/);
    assert.match(source, /bez zmyślania faktów/);
    assert.match(source, /Dokument, który reaguje na treść/);
    assert.match(source, /Podgląd nie jest przybliżeniem/);
  });

  it("keeps the highlighted hero heading in independent non-overlapping blocks", () => {
    assert.match(styles, /\.hero h1\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
    assert.match(styles, /\.hero h1 > span,[\s\S]*?\.hero h1 > em\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /\.hero h1 em\s*\{[^}]*display:\s*block;[^}]*line-height:\s*1;/s);
    assert.match(styles, /\.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 660px\);[^}]*place-content:\s*center;/s);
  });

  it("keeps AI support and the planned Free export promise", () => {
    assert.match(source, /AI pomaga dopasować CV do oferty/);
    assert.match(source, /PDF bez znaku wodnego w planie Free/);
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

  it("renders one centered white hero without the retired animated showcase", () => {
    assert.doesNotMatch(source, /HERO_SHOWCASE|isHeroShowcasePaused|Wgraj stare CV\.|szablonu premium/);
    assert.doesNotMatch(styles, /heroVisual|heroSequence|heroMotionToggle|heroDocument|heroChip|heroTemplateCycle|heroSequenceProgress/);
    assert.doesNotMatch(styles, /\.hero::before|\.hero::after/);
  });
});
