import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("keeps one main heading and makes the account and paid AI boundaries explicit", () => {
    const hero = source.slice(source.indexOf('<section id="top"'), source.indexOf('<section id="szablony"'));
    assert.equal((source.match(/<h1>/g) || []).length, 1);
    assert.match(hero, /Do zapisu i pobrania założysz darmowe konto/);
    assert.match(hero, /AI w planie Pro/);
    assert.doesNotMatch(hero, /100% ZA DARMO|zwiększy Twoje szanse|systemy ATS/);
  });

  it("preserves directed starts and attributes the final CTA to its supported event", () => {
    for (const event of ["hero_new_cv", "hero_import", "hero_demo", "templates_new_cv", "pricing_free", "pricing_pro", "final_wizard"]) {
      assert.ok(source.includes('event="' + event + '"') || source.includes('queueGuestEvent("' + event + '")'));
    }
    assert.match(source, /buildStartUrl\("new", "free"\)/);
    assert.match(source, /buildStartUrl\("import", "free"\)/);
    assert.match(source, /getEditorPath\(\{ start: "demo" \}\)/);
    assert.match(source, /if \(start === "import"\)/);
    assert.match(source, /if \(getAccessToken\(\)\) return getEditorPath\(\{ start \}\)/);
  });

  it("uses canonical plan limits and distinguishes the static AI example", () => {
    assert.match(source, /FREE_PLAN_HIGHLIGHTS\.map/);
    assert.match(source, /PRO_PLAN_HIGHLIGHTS\.map/);
    assert.match(source, /aria-label="Przykład poprawy stylu z AI w Pro"/);
    assert.match(source, /wygląd oryginału nie jest kopiowany/);
    assert.doesNotMatch(source, /href="#"/);
  });

  it("retains accessible gallery copies, native FAQ, anchors, and motion fallback", () => {
    assert.match(source, /aria-hidden=\{copy === 1 \? true : undefined\}/);
    assert.match(source, /tabIndex=\{copy === 1 \? -1 : undefined\}/);
    assert.match(source, /\{TEMPLATE_COUNT\}/);
    assert.equal((source.match(/<details(?: open)?>/g) || []).length, 4);
    for (const anchor of ["szablony", "privacy", "cennik", "final-cta-title"]) {
      assert.ok(source.includes('id="' + anchor + '"'));
    }
    assert.match(styles, /prefers-reduced-motion: reduce/);
    assert.match(styles, /\.templateMarqueeTrack\s*\{[^}]*animation: none;/s);
  });
});
