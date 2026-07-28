import assert from "node:assert/strict";
import test from "node:test";

import { selectCvTemplates } from "./cvTemplateSelection.js";

test("keeps templates selectable after category metadata is removed", () => {
    const templates = [
        { id: "ledger" },
        { id: "vector" },
    ];

    assert.equal(selectCvTemplates(templates), templates);
    assert.equal(selectCvTemplates(templates).length, 2);
});
