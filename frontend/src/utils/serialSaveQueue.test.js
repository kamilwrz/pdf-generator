import assert from "node:assert/strict";
import test from "node:test";

import { createSerialSaveQueue } from "./serialSaveQueue.js";

test("serializes saves so a newer draft is the final persisted write", async () => {
    const queue = createSerialSaveQueue();
    const saved = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });

    const olderSave = queue.enqueue(async () => {
        await firstGate;
        saved.push("older");
    });
    const newerSave = queue.enqueue(async () => {
        saved.push("newer");
    });

    releaseFirst();
    await Promise.all([olderSave, newerSave]);

    assert.deepEqual(saved, ["older", "newer"]);
});

test("continues with later saves after a failed request", async () => {
    const queue = createSerialSaveQueue();
    const saved = [];

    await assert.rejects(queue.enqueue(async () => {
        throw new Error("temporary failure");
    }));
    await queue.enqueue(async () => {
        saved.push("newer");
    });

    assert.deepEqual(saved, ["newer"]);
});
