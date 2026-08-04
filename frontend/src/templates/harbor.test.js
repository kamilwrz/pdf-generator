import assert from "node:assert/strict";
import test from "node:test";

import { harborTemplate } from "./harbor.js";

const ACCENT = "#17A2B8";
const PHOTO_BG = "#ECEEF1";
const MAIN_X = 44;
const SIDE_X = 364;

test("Harbor is a two-column layout with teal accent and diamond list widgets", () => {
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

    // ── Skills + languages + tools + education note: teal diamond bullets ────
    // 8 skills + 3 languages + 6 tools + 1 education description = 18
    const diamonds = harborTemplate.filter(
        (element) => element.category === "image" && element.src.includes("/iconic/harbor-accent/diamond"),
    );
    assert.equal(diamonds.length, 18);

    // ── Grey contact + meta icons come from the harbor theme (not accent) ────
    const greyIcons = harborTemplate.filter(
        (element) => element.category === "image" && element.src.includes("/iconic/harbor/"),
    );
    assert.ok(greyIcons.length >= 12, `expected >=12 grey icons, got ${greyIcons.length}`);
    assert.ok(greyIcons.every((element) => element.alignWithText !== undefined));

    // ── No leftover skill-pill rectangles or proficiency-dot circles ─────────
    assert.equal(
        harborTemplate.filter((element) => element.category === "rectangle").length,
        0,
    );
    assert.ok(
        harborTemplate.every(
            (element) => !(element.category === "circle" && element.width === 5),
        ),
        "proficiency dots should not appear in the starter",
    );

    // ── Circular photo placeholder (soft-grey filled disc) ───────────────────
    assert.ok(harborTemplate.some(
        (element) => element.category === "circle" && element.filled && element.backgroundColor === PHOTO_BG,
    ));

    // ── Teal accent reserved for role, companies, and the school line ────────
    const tealText = harborTemplate.filter(
        (element) => element.category === "text" && element.color === ACCENT,
    );
    assert.ok(tealText.length >= 4, `expected >=4 teal text runs, got ${tealText.length}`);

    // ── Education structure: bold diploma + distinguished school ─────────────
    const diploma = harborTemplate.find((element) => element.content === "Bachelor of Laws");
    const school = harborTemplate.find((element) => element.content === "EU Viadrina");
    assert.ok(diploma?.bold);
    assert.equal(school?.color, ACCENT);
});
