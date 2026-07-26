import assert from "node:assert/strict";
import test from "node:test";

import { selectCvTemplates } from "./cvTemplateSelection.js";

test("keeps templates selectable after category metadata is removed", () => {
    const templates = [
        { id: "ledger", pageSize: "a4-portrait" },
        { id: "vector", pageSize: "a4-portrait" },
    ];

    assert.equal(selectCvTemplates(templates), templates);
    assert.equal(selectCvTemplates(templates).length, 2);
});
