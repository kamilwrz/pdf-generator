import test from "node:test";
import assert from "node:assert/strict";
import {
  activeChannels,
  applyChannelRemoval,
  applyChannelAddition,
  applyChannelRelayout,
} from "./contactBandOps.js";
import { channelName } from "./contactChannelNames.js";

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

test("addition without a provided label seeds the channel display name for editing", () => {
  const removed = applyChannelRemoval(doc(), "b1", "location", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "location", undefined, measure, () => `new-${n++}`);
  const label = elements.find((e) => e.contactChannel === "location" && e.category === "text");
  // Seeded with real content (not empty) so it behaves like any editable label,
  // and flagged to select-all on entry so the first keystroke replaces it.
  assert.equal(label.content, channelName("location"));
  assert.equal(label.selectAllOnEdit, true);
});

test("relayout re-spaces following chips after the edited label grows", () => {
  // Simulate a live edit: phone label is now much longer than at layout time.
  const edited = doc().map((e) =>
    e.element_id === "ph-l" ? { ...e, content: "+48 111 222 333 444" } : e,
  );
  const { elements } = applyChannelRelayout(edited, "b1", measure, () => "id");
  const phoneLabel = elements.find((e) => e.element_id === "ph-l");
  const emailIcon = elements.find((e) => e.element_id === "em-i");
  // The email chip starts one full phone-advance right of the phone icon, so
  // the inter-item gap stays constant regardless of the new text length.
  const phoneAdvance = 16 + measure("+48 111 222 333 444") + 14;
  assert.equal(emailIcon.left, phoneLabel.left - 16 + phoneAdvance);
});

test("empty added label reserves display-name width so the next chip does not overlap", () => {
  const base = [
    { element_id: "anchor", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "b1", contactBand: descriptor, top: 0, left: 0, page: 1 },
    { element_id: "ph-i", category: "image", contactBandId: "b1", contactChannel: "phone",
      left: 44, top: 104, page: 1, src: "http://x/iconic/harbor/phone.png", width: 11, height: 11, flowRole: "masthead" },
    { element_id: "ph-l", category: "text", contactBandId: "b1", contactChannel: "phone",
      content: "111", left: 60, top: 104, page: 1, flowRole: "masthead" },
    { element_id: "lo-i", category: "image", contactBandId: "b1", contactChannel: "location",
      left: 200, top: 104, page: 1, src: "http://x/iconic/harbor/location.png", width: 11, height: 11, flowRole: "masthead" },
    { element_id: "lo-l", category: "text", contactBandId: "b1", contactChannel: "location",
      content: "Wwa", left: 216, top: 104, page: 1, flowRole: "masthead" },
  ];
  let n = 0;
  const { elements } = applyChannelAddition(base, "b1", "email", "", measure, () => `new-${n++}`);
  const emailIcon = elements.find((e) => e.contactChannel === "email" && e.category === "image");
  const locIcon = elements.find((e) => e.element_id === "lo-i");
  // location sits a full email advance (iconGap + display-name width + itemPad)
  // right of the email icon — the empty label still reserves placeholder width.
  const emailAdvance = 16 + measure(channelName("email")) + 14;
  assert.equal(locIcon.left, emailIcon.left + emailAdvance);
});

test("addition opens the new label in edit mode with a placeholder", () => {
  const removed = applyChannelRemoval(doc(), "b1", "email", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "email", "", measure, () => `new-${n++}`);
  const label = elements.find((e) => e.contactChannel === "email" && e.category === "text");
  assert.equal(label.isEditing, true);
  assert.equal(label.isSelected, true);
  assert.equal(label.placeholder, channelName("email"));
  // The edited label is the sole active element.
  assert.equal(elements.filter((e) => e.isEditing).length, 1);
});
