import assert from "node:assert/strict";
import test from "node:test";
import { compactInlineToolbarLayoutSize } from "../components/canvas/recordPlusSize.js";
import { resolveSkillsEntryToolbarTop } from "./skillsEntryToolbarGeometry.js";

test("centres inline and bullet plus controls on the textarea bottom edge", () => {
  const layout = compactInlineToolbarLayoutSize(1);
  const expectedTop = 100 - (layout.buttonSize / 2 + layout.gap + layout.borderWidth);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    formOpen: false,
    zoom: 1,
    layout,
  }), expectedTop);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    formOpen: false,
    zoom: 1,
    layout,
  }), expectedTop);
});

test("centres the chip plus on its content edge and keeps the 18px form gap", () => {
  const layout = compactInlineToolbarLayoutSize(2);
  const expectedTop = 100 - (layout.buttonSize / 2 + layout.gap + layout.borderWidth);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    formOpen: false,
    zoom: 2,
    layout,
  }), expectedTop);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    formOpen: true,
    zoom: 2,
    layout,
  }), 109);
});
