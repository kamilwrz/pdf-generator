import assert from "node:assert/strict";
import test from "node:test";

import { monumentTemplate } from "./monument.js";

test("Monument keeps its text hierarchy readable and monochrome", () => {
    const textElements = monumentTemplate.filter(
        (element) => (
            (element.category === "text" || element.category === "textarea")
            && element.width > 0
            && element.height > 0
        ),
    );
    const colors = new Set(
        monumentTemplate.flatMap((element) => (
            [element.color, element.backgroundColor].filter(Boolean)
        )),
    );

    assert.ok(textElements.length > 0);
    assert.ok(textElements.every((element) => element.fontSize >= 9));
    assert.ok([...colors].every((color) => (
        /^#[0-9A-F]{6}$/i.test(color)
        && color.slice(1, 3).toUpperCase() === color.slice(3, 5).toUpperCase()
        && color.slice(3, 5).toUpperCase() === color.slice(5, 7).toUpperCase()
    )));
    // Section title plates sit in the left rail; the generator emits one per
    // section rather than a single dedicated experience-frame id.
    assert.ok(monumentTemplate.some(
        (element) => (
            element.category === "rectangle"
            && element.left === 106
            && element.width === 251
            && element.height === 32
            && element.flowRole === "section-chrome"
        ),
    ));
    assert.ok(monumentTemplate.some(
        (element) => (
            element.category === "textarea"
            && element.top === 104
            && element.fontSize === 12.5
            && element.bold === true
        ),
    ));
    assert.ok(monumentTemplate.some(
        (element) => element.content === "DOŚWIADCZENIE ZAWODOWE" && element.fontSize === 12.5,
    ));
    // Ordinal badges must carry the decorative flag so they are never listed
    // as their own sections beside the real title.
    const ordinals = monumentTemplate.filter(
        (element) => element.isDecorativeChromeText === true,
    );
    assert.ok(ordinals.length >= 3);
    assert.ok(ordinals.every((element) => /^\d{2}$/.test(String(element.content || ""))));
    // Summary must match body copy size, not sit one step above it.
    const summary = monumentTemplate.find(
        (element) => (
            element.category === "textarea"
            && String(element.content || "").includes("Analityczka AML łącząca")
        ),
    );
    const body = monumentTemplate.find(
        (element) => element.category === "textarea" && element.bulletList,
    );
    assert.equal(summary?.fontSize, body?.fontSize);
    assert.equal(summary?.fontSize, 9);
    assert.deepEqual(
        monumentTemplate
            .filter((element) => element.color === "#FFFFFF" && element.fontSize === 11)
            .map((element) => element.content),
        ["01", "02", "03", "04", "05"],
    );
    const sectionFrames = monumentTemplate.filter(
        (element) => element.category === "rectangle" && element.left === 106,
    );
    assert.ok(sectionFrames.every(
        (element) => (
            element.left === 106
            && element.width === 251
            && element.height === 32
            && element.flowRole === "section-chrome"
        ),
    ));
    const mastheadRails = monumentTemplate.filter(
        (element) => element.category === "line" && [51, 529].includes(element.left),
    );
    assert.equal(mastheadRails.length, 2);
    assert.ok(mastheadRails.every(
        (element) => element.repeatOnContinuation === false,
    ));
    // The right masthead area is a 80×107 portrait slot with a black glyph.
    // The old decorative bars and "CV / 01" caption are intentionally removed.
    const photoFrame = monumentTemplate.find(
        (element) => element.id === "monument-masthead-frame",
    );
    assert.equal(photoFrame?.photoSlot, "frame");
    assert.equal(photoFrame?.photoShape, "ornament-frame");
    assert.equal(photoFrame?.fixedToPage, true);
    assert.deepEqual(
        [photoFrame?.left, photoFrame?.top, photoFrame?.width, photoFrame?.height],
        [425, 47, 80, 107],
    );
    const portraitGlyph = monumentTemplate.find(
        (element) => element.photoSlot === "glyph",
    );
    assert.equal(portraitGlyph?.src.includes("/template-assets/iconic/monument/portrait.png"), true);
    assert.equal(portraitGlyph?.width, 32);
    assert.equal(portraitGlyph?.alignWithText, false);
    assert.equal(monumentTemplate.some((element) => element.photoSlot === "ornament"), false);
    const contactIcons = monumentTemplate.filter(
        (element) => element.category === "image" && element.contactBandId === "monument-contact",
    );
    assert.ok(contactIcons.length >= 4);
    assert.ok(contactIcons.every((element) => element.src.includes("/template-assets/iconic/monument/")));
    assert.ok(contactIcons.every((element) => element.flowRole === "masthead"));
    assert.equal(
        monumentTemplate.some((element) => String(element.content || "").includes("CV /")),
        false,
    );
});
