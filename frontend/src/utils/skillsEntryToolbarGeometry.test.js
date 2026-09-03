import assert from "node:assert/strict";
import test from "node:test";
import { compactInlineToolbarLayoutSize } from "../components/canvas/recordPlusSize.js";
import { resolveSkillsEntryToolbarTop } from "./skillsEntryToolbarGeometry.js";

test("centres inline and bullet plus controls on the textarea bottom edge", () => {
  const layout = compactInlineToolbarLayoutSize(1);
  const expectedTop = 100 - (layout.buttonSize / 2 + layout.gap + layout.borderWidth);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    mode: "inline",
    formOpen: false,
    zoom: 1,
    layout,
  }), expectedTop);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    mode: "bullet",
    formOpen: false,
    zoom: 1,
    layout,
  }), expectedTop);
});

test("keeps an 8px chip gap and an 18px open-form gap at every zoom", () => {
  const layout = compactInlineToolbarLayoutSize(2);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    mode: "chips",
    formOpen: false,
    zoom: 2,
    layout,
  }), 104);
  assert.equal(resolveSkillsEntryToolbarTop({
    bottom: 100,
    mode: "chips",
    formOpen: true,
    zoom: 2,
    layout,
  }), 109);
});
