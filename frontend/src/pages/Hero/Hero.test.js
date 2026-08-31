import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("leads with the recruitment outcome and explains how the product supports it", () => {
    assert.match(source, /Stwórz CV,/);
    assert.match(source, /które prowadzi/);
    assert.match(source, /do rozmowy\./);
    assert.match(source, /Wgraj stare CV lub zacznij od zera/);
    assert.match(source, /profesjonalny dokument gotowy do/);
    assert.match(source, /Szablony, nie klatki/);
    assert.match(source, /Gotowe CV za 0 zł/);
  });

  it("keeps the highlighted hero heading in independent non-overlapping blocks", () => {
    assert.match(styles, /\.hero h1\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
    assert.match(styles, /\.hero h1 > span,[\s\S]*?\.hero h1 > em\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /\.hero h1 em\s*\{[^}]*display:\s*block;[^}]*line-height:\s*1;/s);
    assert.match(styles, /\.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 960px\);[^}]*place-content:\s*center;/s);
    assert.match(styles, /\.heroCopy\s*\{[^}]*max-width:\s*960px;[^}]*text-align:\s*center;/s);
    assert.match(styles, /\.hero h1\s*\{[^}]*align-items:\s*center;[^}]*max-width:\s*960px;[^}]*text-align:\s*center;/s);
    assert.match(styles, /\.heroActions\s*\{[^}]*justify-content:\s*center;/s);
  });

  it("keeps the concise hero benefit labels", () => {
    assert.match(source, /ZA DARMO/);
    assert.match(source, /CZYSTY PDF/);
    assert.match(source, /INTELIGENTNY LAYOUT/);
  });

  it("keeps the retained template, privacy, pricing, and FAQ caveats", () => {
    assert.match(source, /Twoje dokumenty nie są publiczne/);
    assert.match(source, /Twoja treść pozostaje/);
    assert.match(source, /Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym/);
  });

  it("renders only sections 01, 05, 09, 10, and 11 before the footer", () => {
    assert.deepEqual(
      [...source.matchAll(/<section\b[\s\S]*?data-section-index="(\d{2})"[\s\S]*?<\/section>/g)]
        .map((match) => match[1]),
      ["01", "05", "09", "10", "11"],
    );
    assert.equal((source.match(/<section\b/g) || []).length, 5);
    assert.equal((source.match(/<footer\b/g) || []).length, 1);
    assert.doesNotMatch(source, /before_after_import|id="jak-to-dziala"|final_wizard|final_import/);
  });

  it("preserves retained directed starts, analytics events, anchors, and dynamic template count", () => {
    for (const event of [
      "hero_wizard",
      "hero_import",
      "templates_wizard",
      "pricing_free",
      "pricing_pro",
    ]) {
      assert.match(source, new RegExp(`event=\\"${event}\\"|queueGuestEvent\\(\\"${event}\\"\\)`));
    }

    assert.match(source, /buildStartUrl\("wizard", "free"\)/);
    assert.match(source, /buildStartUrl\("import", "free"\)/);
    assert.match(source, /\{TEMPLATE_COUNT\}/);
    assert.match(source, /id="szablony"/);
    assert.match(source, /id="privacy"/);
    assert.match(source, /id="cennik"/);
  });

  it("renders one centered hero with a subdued editorial background image", () => {
    assert.match(source, /women-job-call\.png/);
    assert.match(styles, /\.heroMedia::after\s*\{[^}]*background:\s*var\(--paper\);[^}]*opacity:\s*\.82;/s);
    assert.doesNotMatch(source, /HERO_SHOWCASE|isHeroShowcasePaused|Wgraj stare CV\.|szablonu premium/);
    assert.doesNotMatch(styles, /heroVisual|heroSequence|heroMotionToggle|heroDocument|heroChip|heroTemplateCycle|heroSequenceProgress/);
    assert.doesNotMatch(styles, /\.hero::before|\.hero::after/);
  });
});
