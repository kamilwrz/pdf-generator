import assert from "node:assert/strict";
import test from "node:test";
import {
  OPERATION_PROGRESS_STAGE_MIN_MS,
  nextOperationProgressStageAt,
  operationProgressDismissAt,
} from "./operationProgressTiming.js";

test("fast operations expose every progress stage for the longer reading time", () => {
  const startedAt = 1_000;
  const middleAt = nextOperationProgressStageAt(startedAt, 1_050);
  const finalAt = nextOperationProgressStageAt(middleAt, 1_100);

  assert.equal(OPERATION_PROGRESS_STAGE_MIN_MS, 1_200);
  assert.equal(middleAt, 2_200);
  assert.equal(finalAt, 3_400);
  assert.equal(operationProgressDismissAt(finalAt), 4_600);
});

test("slow operation boundaries are never overtaken by the presentation timer", () => {
  const middleAt = nextOperationProgressStageAt(1_000, 2_400);
  const finalAt = nextOperationProgressStageAt(middleAt, 5_000);

  assert.equal(middleAt, 2_400);
  assert.equal(finalAt, 5_000);
  assert.equal(operationProgressDismissAt(finalAt), 6_200);
});
