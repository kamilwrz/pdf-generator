import test from "node:test";
import assert from "node:assert/strict";
import { activeChannels, applyChannelRemoval, applyChannelAddition } from "./contactBandOps.js";

const measure = (t) => t.length * 5;

const descriptor = {
  id: "b1",
  mode: "wrapping",
  anchor: { startX: 44, startY: 104, rightLimit: 551 },
  text: { fontFamily: "Inter", fontSizePt: 8.4, colorHex: "#3A3A3A" },
  icon: { sizePt: 11, theme: "harbor" },
  metrics: { iconGap: 16, itemPad: 14, lineStep: 16, charWidth: 5.2 },
  order: ["phone", "email", "location"],
  downstream: { sectionStartOffsetPt: 42 },
};

function doc() {
  return [
    { element_id: "anchor", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "b1", contactBand: descriptor, top: 0, left: 0, page: 1 },
    { element_id: "ph-i", category: "image", contactBandId: "b1", contactChannel: "phone",
      left: 44, top: 104, page: 1, src: "http://x/template-assets/iconic/harbor/phone.png",
      width: 11, height: 11, flowRole: "masthead" },
    { element_id: "ph-l", category: "text", contactBandId: "b1", contactChannel: "phone",
      content: "+48 111", left: 60, top: 104, page: 1, flowRole: "masthead" },
    { element_id: "em-i", category: "image", contactBandId: "b1", contactChannel: "email",
      left: 130, top: 104, page: 1, src: "http://x/template-assets/iconic/harbor/email.png",
      width: 11, height: 11, flowRole: "masthead" },
    { element_id: "em-l", category: "text", contactBandId: "b1", contactChannel: "email",
      content: "a@b.pl", left: 146, top: 104, page: 1, flowRole: "masthead" },
    { element_id: "rule", category: "line", flowRole: "masthead", top: 126, left: 44, page: 1 },
    { element_id: "head", category: "text", content: "DOŚWIADCZENIE", top: 146, left: 44, page: 1 },
  ];
}

test("activeChannels reads channels present, in descriptor order", () => {
  assert.deepEqual(activeChannels(doc(), "b1"), ["phone", "email"]);
});

test("removal drops both elements of the channel", () => {
  const { elements } = applyChannelRemoval(doc(), "b1", "phone", measure, () => "id");
  assert.equal(elements.some((e) => e.contactChannel === "phone"), false);
  assert.equal(elements.some((e) => e.contactChannel === "email"), true);
  // The anchor + downstream rule/heading survive.
  assert.ok(elements.some((e) => e.element_id === "anchor"));
  assert.ok(elements.some((e) => e.element_id === "rule"));
});

test("addition inserts an icon+label pair with the band theme icon", () => {
  const removed = applyChannelRemoval(doc(), "b1", "email", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "email", "a@b.pl", measure, () => `new-${n++}`);
  const added = elements.filter((e) => e.contactChannel === "email");
  assert.equal(added.length, 2);
  const icon = added.find((e) => e.category === "image");
  const label = added.find((e) => e.category === "text");
  assert.ok(icon && String(icon.src).includes("/harbor/email.png"));
  assert.equal(label.content, "a@b.pl");
});

test("addition without a provided label seeds an empty editable label", () => {
  const removed = applyChannelRemoval(doc(), "b1", "location", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "location", undefined, measure, () => `new-${n++}`);
  const label = elements.find((e) => e.contactChannel === "location" && e.category === "text");
  assert.equal(typeof label.content, "string");
});
