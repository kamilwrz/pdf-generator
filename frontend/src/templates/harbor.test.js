import assert from "node:assert/strict";
import test from "node:test";

import { harborTemplate } from "./harbor.js";

const ACCENT = "#17A2B8";
const PILL = "#CBD0D6";
const PHOTO_BG = "#ECEEF1";
const MAIN_X = 44;
const SIDE_X = 364;

test("Harbor is a two-column layout with teal accent and sidebar widgets", () => {
    // ── Two columns: content anchored at both the main and sidebar origins ───
    assert.ok(harborTemplate.some((element) => element.left === MAIN_X), "no main-column content");
    assert.ok(harborTemplate.some((element) => element.left === SIDE_X), "no sidebar content");

    // ── Polish section headings only (also guarded globally) ─────────────────
    const labels = harborTemplate
        .filter((element) => element.category === "text")
        .map((element) => element.content);
    for (const label of [
        "PODSUMOWANIE", "DOŚWIADCZENIE", "EDUKACJA",
        "UMIEJĘTNOŚCI", "JĘZYKI", "SYSTEMY I NARZĘDZIA",
    ]) {
        assert.ok(labels.includes(label), `missing heading ${label}`);
    }

    // ── Skill pills: rounded, grey-bordered rectangles, one per skill ────────
    const pills = harborTemplate.filter(
        (element) => element.category === "rectangle" && element.borderRadius > 0,
    );
    assert.equal(pills.length, 8);
    assert.ok(pills.every((element) => element.backgroundColor === PILL));

    // ── Tools list: teal diamond bullets ────────────────────────────────────
    const diamonds = harborTemplate.filter(
        (element) => element.category === "image" && element.src.includes("/iconic/harbor-accent/diamond"),
    );
    assert.equal(diamonds.length, 6);

    // ── Grey contact + meta icons come from the harbor theme (not accent) ────
    const greyIcons = harborTemplate.filter(
        (element) => element.category === "image" && element.src.includes("/iconic/harbor/"),
    );
    assert.ok(greyIcons.length >= 12, `expected >=12 grey icons, got ${greyIcons.length}`);
    assert.ok(greyIcons.every((element) => element.alignWithText !== undefined));

    // ── Language proficiency dots: filled teal for level, outline grey rest ──
    const dots = harborTemplate.filter(
        (element) => element.category === "circle" && element.width === 5,
    );
    const filledDots = dots.filter((element) => element.filled && element.backgroundColor === ACCENT);
    const emptyDots = dots.filter((element) => !element.filled && element.backgroundColor === PILL);
    assert.equal(filledDots.length, 13); // 5 + 4 + 4 across three languages
    assert.equal(emptyDots.length, 2);

    // ── Circular photo placeholder (soft-grey filled disc) ───────────────────
    assert.ok(harborTemplate.some(
        (element) => element.category === "circle" && element.filled && element.backgroundColor === PHOTO_BG,
    ));

    // ── Teal accent reserved for role, companies, and the school line ────────
    const tealText = harborTemplate.filter(
        (element) => element.category === "text" && element.color === ACCENT,
    );
    assert.ok(tealText.length >= 4, `expected >=4 teal text runs, got ${tealText.length}`);
});
