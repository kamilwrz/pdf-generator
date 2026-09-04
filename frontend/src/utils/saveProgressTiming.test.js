import assert from "node:assert/strict";
import test from "node:test";
import {
  SAVE_PROGRESS_STAGE_MIN_MS,
  nextSaveProgressStageAt,
  saveProgressDismissAt,
} from "./saveProgressTiming.js";

test("fast saves expose every progress stage for the minimum reading time", () => {
  const startedAt = 1_000;
  const persistAt = nextSaveProgressStageAt(startedAt, 1_050);
  const confirmAt = nextSaveProgressStageAt(persistAt, 1_100);

  assert.equal(SAVE_PROGRESS_STAGE_MIN_MS, 800);
  assert.equal(persistAt, 1_800);
  assert.equal(confirmAt, 2_600);
  assert.equal(saveProgressDismissAt(confirmAt), 3_400);
});

test("slow operation boundaries are never overtaken by the presentation timer", () => {
  const persistAt = nextSaveProgressStageAt(1_000, 2_400);
  const confirmAt = nextSaveProgressStageAt(persistAt, 5_000);

  assert.equal(persistAt, 2_400);
  assert.equal(confirmAt, 5_000);
  assert.equal(saveProgressDismissAt(confirmAt), 5_800);
});
