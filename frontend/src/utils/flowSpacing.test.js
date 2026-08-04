import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FLOW_SPACING,
  isDefaultFlowSpacing,
  normalizeFlowSpacing,
} from "./flowSpacing.js";

describe("normalizeFlowSpacing", () => {
  it("fills missing keys from defaults", () => {
    assert.deepEqual(normalizeFlowSpacing({ section: 40 }), {
      ...DEFAULT_FLOW_SPACING,
      section: 40,
    });
  });

  it("clamps out-of-range values", () => {
    const next = normalizeFlowSpacing({ stack: -3, record: 999 });
    assert.equal(next.stack, 0);
    assert.equal(next.record, 80);
  });

  it("detects defaults", () => {
    assert.equal(isDefaultFlowSpacing(null), true);
    assert.equal(isDefaultFlowSpacing({ section: 21 }), true);
    assert.equal(isDefaultFlowSpacing({ section: 30 }), false);
  });
});
