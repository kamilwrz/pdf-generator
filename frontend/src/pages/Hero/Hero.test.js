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
    assert.match(styles, /@media \(max-width: 1024px\)\s*\{[\s\S]*?\.hero\s*\{[^}]*grid-template-columns:\s*1fr;/);
  });

  it("communicates import transformation, AI support, and the planned Free export promise", () => {
    assert.match(source, /Wgraj stare CV\./);
    assert.match(source, /szablonu premium/);
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

  it("cycles Linden, Sterling, and Vellum without the retired static hero stack", () => {
    assert.match(source, /const HERO_SHOWCASE_IDS = \["linden", "sterling", "vellum"\];/);
    assert.match(source, /const HERO_SHOWCASE = HERO_SHOWCASE_IDS\.map\(previewById\);/);
    assert.match(source, /const HERO_SHOWCASE_DELAYS = \["0s", "-10s", "-5s"\];/);
    assert.doesNotMatch(source, /const heroFront|const heroBack|classes\.heroCountLabel|classes\.visualOrbit|classes\.heroDocFront|classes\.heroDocBack/);
    assert.doesNotMatch(styles, /\.heroCountLabel\b|\.visualOrbit\b|\.heroDocFront\b|\.heroDocBack\b/);
  });

  it("runs a controllable infinite proof-sheet animation with a reduced-motion fallback", () => {
    assert.match(styles, /@keyframes heroTemplateCycle[\s\S]*?translate3d/);
    assert.match(styles, /\.heroDocument\s*\{[^}]*animation:\s*heroTemplateCycle 15s[^;]*infinite;/s);
    assert.match(styles, /\.heroSequence::after\s*\{[^}]*animation:\s*heroSequenceProgress 15s linear infinite;/s);
    assert.match(source, /aria-pressed=\{isHeroShowcasePaused\}/);
    assert.match(styles, /\.heroVisualPaused \.heroDocument,[\s\S]*?animation-play-state:\s*paused;/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.heroDocument\s*\{[^}]*animation:\s*none;/s);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.heroMotionToggle\s*\{[^}]*display:\s*none;/s);
  });
});
