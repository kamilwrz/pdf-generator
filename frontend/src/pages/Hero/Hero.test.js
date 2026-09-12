import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPresentationSourceSync as readFileSync } from "../../../scripts/read-presentation-source.mjs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("keeps one main heading and makes the account and paid AI boundaries explicit", () => {
    const hero = source.slice(source.indexOf('<section id="top"'), source.indexOf('<section id="szablony"'));
    assert.equal((source.match(/<h1>/g) || []).length, 1);
    assert.match(hero, /Darmowa rejestracja jest potrzebna dopiero przy zapisie lub pobieraniu PDF/);
    assert.match(hero, /FREE_TEMPLATES.length/);
    assert.match(source, /Wywiad · Pro/);
    assert.doesNotMatch(hero, /100% ZA DARMO|zwiększy Twoje szanse|systemy ATS/);
  });

  it("preserves directed starts without buffering anonymous analytics", () => {
    assert.doesNotMatch(source, /queueGuestEvent|guestEvents/);
    assert.match(source, /const newCvUrl = "\/app\/new"/);
    assert.match(source, /getEditorPath\(\{ start: "new", template: selectedTemplateId \}\)/);
    assert.match(source, /buildStartUrl\("import", "free"\)/);
    assert.match(source, /getEditorPath\(\{ start: "demo" \}\)/);
    assert.match(source, /if \(start === "import"\)/);
    assert.match(source, /if \(getAccessToken\(\)\) return getEditorPath\(\{ start \}\)/);
  });

  it("uses canonical plan limits and distinguishes the static AI example", () => {
    assert.match(source, /FREE_PLAN_HIGHLIGHTS\.map/);
    assert.match(source, /PRO_PLAN_HIGHLIGHTS\.map/);
    assert.match(source, /Przykład rozmowy i jej efektu/);
    assert.match(source, /bez dopisywania osiągnięć/);
    assert.match(source, /Import nie kopiuje wyglądu oryginału/);
    assert.doesNotMatch(source, /href="#"/);
  });

  it("retains accessible gallery copies, native FAQ, anchors, and motion fallback", () => {
    assert.match(source, /aria-hidden=\{copy === 1 \? true : undefined\}/);
    assert.match(source, /tabIndex=\{copy === 1 \? -1 : undefined\}/);
    assert.match(source, /\{TEMPLATE_COUNT\}/);
    assert.equal((source.match(/<details(?: open)?>/g) || []).length, 5);
    for (const anchor of ["wywiad", "szablony", "privacy", "cennik", "final-cta-title"]) {
      assert.ok(source.includes('id="' + anchor + '"'));
    }
    assert.match(styles, /prefers-reduced-motion: reduce/);
    assert.match(styles, /\.templateMarqueeTrack\s*\{[^}]*animation: none;/s);
  });
});
