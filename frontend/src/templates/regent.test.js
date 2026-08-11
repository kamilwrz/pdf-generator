import assert from "node:assert/strict";
import test from "node:test";

import { regentTemplate } from "./regent.js";

const WINE = "#733B43";
const RULE = "#D6CCC3";

test("Regent renders a personalized executive editorial system", () => {
    // Regent remains an image-free single column. The strong identity comes
    // from typography and vector primitives, so exports need no remote assets.
    assert.equal(regentTemplate.some((element) => element.category === "image"), false);
    assert.equal(regentTemplate.some((element) => element.category === "connector"), false);

    const name = regentTemplate.find((element) => element.content === "Jan Kowalski");
    assert.ok(name);
    assert.equal(name.fontFamily, "CormorantGaramond");
    assert.equal(name.fontSize, 33);
    assert.equal(name.flowRole, "masthead");

    // The seal is personalized and intentionally simpler than the previous
    // square/circle/ellipse diagram: one oval, one inner circle, and initials.
    assert.ok(regentTemplate.some((element) => element.id === "regent-seal"));
    assert.ok(regentTemplate.some((element) => element.id === "regent-signet"));
    const initials = regentTemplate.find((element) => element.id === "regent-initials");
    assert.equal(initials?.content, "JK");
    assert.equal(initials?.flowRole, "masthead");
    assert.equal(regentTemplate.some((element) => element.id === "regent-square"), false);

    const headings = regentTemplate.filter(
        (element) =>
            element.category === "text" &&
            element.flowRole === "section-chrome" &&
            !element.id,
    );
    assert.deepEqual(
        headings.map((element) => element.content),
        [
            "PODSUMOWANIE ZAWODOWE",
            "DOŚWIADCZENIE ZAWODOWE",
            "WYKSZTAŁCENIE",
            "UMIEJĘTNOŚCI",
            "JĘZYKI",
        ],
    );
    assert.ok(headings.every((element) => element.left === 96));

    // Every section uses the same dot + oxblood lead + pale continuation. This
    // gives the page a consistent scan rhythm while preserving packer metadata.
    const sectionChrome = regentTemplate.filter(
        (element) => element.flowRole === "section-chrome",
    );
    const markers = sectionChrome.filter((element) => element.category === "circle");
    const accentRules = sectionChrome.filter(
        (element) => element.category === "line" && element.backgroundColor === WINE,
    );
    const quietRules = sectionChrome.filter(
        (element) => element.category === "line" && element.backgroundColor === RULE,
    );
    assert.equal(markers.length, 5);
    assert.equal(accentRules.length, 5);
    assert.equal(quietRules.length, 5);
    assert.ok(markers.every((element) => element.filled === true));
    assert.ok(accentRules.every((element) => element.width === 44));
    assert.ok(quietRules.every((element) => element.left + element.width === 506));

    const bodyBlocks = regentTemplate.filter((element) => element.category === "textarea");
    assert.ok(bodyBlocks.length > 0);
    // Full-width body stays on the content column; languages use a 4-col grid
    // of narrower ``grid-member`` cells inside the same L…L+W band.
    assert.ok(bodyBlocks.every((element) => element.left >= 96 && element.left + element.width <= 506));
    const languageCells = bodyBlocks.filter((element) => element.flowRole === "grid-member");
    assert.ok(languageCells.length >= 3, "languages render as equal-width grid cells");
    // Body paragraphs stay at reading size; record meta rows sit a step smaller.
    assert.ok(bodyBlocks.every((element) => element.fontSize >= 8));
    assert.ok(bodyBlocks.some((element) => element.fontSize >= 9.5));
});
