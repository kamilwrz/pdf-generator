import assert from "node:assert/strict";
import test from "node:test";

import { meridianTemplate } from "./meridian.js";
import { regentTemplate } from "./regent.js";
import { cadenzaTemplate } from "./cadenza.js";

const EDITORIAL_TEMPLATES = [
    ["Regent", regentTemplate],
    ["Meridian", meridianTemplate],
    ["Cadenza", cadenzaTemplate],
];

/**
 * Resolve the invisible descriptor that lets the editor re-layout contacts.
 * The test uses the descriptor's own metrics so generator and starter spacing
 * cannot silently drift apart.
 */
function contactDescriptor(elements) {
    return elements.find((element) => element.contactBand)?.contactBand;
}

for (const [name, elements] of EDITORIAL_TEMPLATES) {
    test(`${name} keeps a safe divider below its reserved contact rows`, () => {
        const descriptor = contactDescriptor(elements);
        assert.ok(descriptor);

        const divider = elements.find(
            (element) => element.category === "line" && element.flowRole === "masthead",
        );
        assert.ok(divider);

        const reservedSecondRowTop =
            descriptor.anchor.startY + descriptor.metrics.lineStep;
        assert.equal(divider.top, reservedSecondRowTop + 24);

        const icons = elements.filter(
            (element) =>
                element.category === "image"
                && element.contactBandId === descriptor.id,
        );
        assert.ok(icons.length > 0);
        assert.ok(
            icons.every((icon) => icon.top + icon.height <= divider.top - 12),
            `${name} contact icons must retain at least 12pt before the divider`,
        );
    });
}
