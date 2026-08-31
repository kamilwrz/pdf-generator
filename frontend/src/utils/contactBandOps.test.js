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

test("addition accepts a channel the CV never generated (github / website)", () => {
  // The descriptor's `order` is only [phone, email, location] (generation-time),
  // but the wizard supports GitHub/website too. The manager keys off the canonical
  // channel order, so a never-generated channel can still be added and derives its
  // icon from an existing band icon in the same theme.
  let n = 0;
  const { elements } = applyChannelAddition(doc(), "b1", "github", undefined, measure, () => `new-${n++}`);
  const added = elements.filter((e) => e.contactChannel === "github");
  assert.equal(added.length, 2);
  const icon = added.find((e) => e.category === "image");
  const label = added.find((e) => e.category === "text");
  assert.ok(icon && String(icon.src).includes("/harbor/github.png"));
  assert.equal(label.content, channelName("github"));
});

test("addition inserts a channel into its canonical slot, not at the end", () => {
  // github belongs between linkedin and location; with only phone/email/location
  // active it lands after email and before location.
  let n = 0;
  const { elements } = applyChannelAddition(doc(), "b1", "github", undefined, measure, () => `new-${n++}`);
  const github = elements.find((e) => e.contactChannel === "github" && e.category === "text");
  const email = elements.find((e) => e.contactChannel === "email" && e.category === "text");
  // Same single row here, so canonical order shows as left-to-right position.
  assert.ok(github.left > email.left, "github placed after email");
});

test("addition without a provided label seeds the channel display name for editing", () => {
  const removed = applyChannelRemoval(doc(), "b1", "location", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "location", undefined, measure, () => `new-${n++}`);
  const label = elements.find((e) => e.contactChannel === "location" && e.category === "text");
  // Seeded with real content (not empty) so it has clickable glyphs and edits
  // like any other label. Not auto-edited — the user clicks it to edit.
  assert.equal(label.content, channelName("location"));
  assert.equal(label.placeholder, channelName("location"));
  assert.ok(!label.isEditing);
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

test("addition creates a plain filled label (no auto-edit) with a placeholder", () => {
  const removed = applyChannelRemoval(doc(), "b1", "email", measure, () => "id").elements;
  let n = 0;
  const { elements } = applyChannelAddition(removed, "b1", "email", "", measure, () => `new-${n++}`);
  const label = elements.find((e) => e.contactChannel === "email" && e.category === "text");
  assert.equal(label.content, channelName("email"));
  assert.equal(label.placeholder, channelName("email"));
  // Not auto-edited: mounting an element already isEditing is an unreliable
  // focus path; the user edits through the shared template single-click flow.
  assert.ok(!label.isEditing);
  assert.equal(elements.filter((e) => e.isEditing).length, 0);
});

test("adding a wrapping contact keeps content below the reserved zone fixed", () => {
  // Optional contacts may rearrange within the masthead, but the authored
  // contact-zone boundary must not move body content on any page.
  const base = [
    ...doc(),
    { element_id: "p2head", category: "text", content: "EDUCATION", left: 44, top: 130, page: 2 },
    { element_id: "p2body", category: "textarea", content: "…", left: 44, top: 160, width: 400, page: 2 },
  ];
  let n = 0;
  const { elements } = applyChannelAddition(base, "b1", "github", undefined, measure, () => `new-${n++}`);
  const g = (id) => elements.find((e) => e.element_id === id);
  assert.equal(g("rule").top, 126);
  assert.equal(g("head").top, 146);
  assert.equal(g("p2head").top, 130);
  assert.equal(g("p2head").page, 2);
  assert.equal(g("p2body").top, 160);
});

test("a growing contact label moves neither body content nor masthead chrome", () => {
  const withChrome = [
    ...doc(),
    {
      element_id: "ornament", category: "line", top: 110, left: 33,
      width: 112, height: 4, fixedToPage: true, locked: true, page: 1,
    },
  ];
  const edited = withChrome.map((el) => (
    el.element_id === "ph-l" ? { ...el, content: "j".repeat(200) } : el
  ));
  const { elements } = applyChannelRelayout(edited, "b1", measure, () => "new-id");
  const ornament = elements.find((e) => e.element_id === "ornament");
  const head = elements.find((e) => e.element_id === "head");
  assert.equal(head.top, 146);
  assert.equal(ornament.top, 110);
});

test("removing a contact keeps the following section at its authored Y", () => {
  const { elements } = applyChannelRemoval(doc(), "b1", "email", measure, () => "id");
  assert.equal(elements.find((e) => e.element_id === "rule").top, 126);
  assert.equal(elements.find((e) => e.element_id === "head").top, 146);
});

// ── Chip mode: rect + icon + label triple per channel ──────────────────────
const chipDescriptor = {
  id: "vb", mode: "chip",
  anchor: { startX: 48, startY: 108, rightLimit: 547 },
  text: { fontFamily: "JetBrains Mono", fontSizePt: 7.8, colorHex: "#333" },
  icon: { sizePt: 15, theme: "test-chip" },
  metrics: { chipH: 20, iconSize: 15, padLeft: 6, labelOffset: 27,
    widthBase: 28, widthPerChar: 5.2, minWidth: 120, maxWidth: 168,
    chipGap: 8, lineStep: 28, charWidth: 5.2 },
  chipColor: "#EEEEEE",
  order: ["phone", "email"],
};

function chipDoc() {
  return [
    { element_id: "a", category: "text", content: "", flowRole: "masthead-anchor",
      contactBandId: "vb", contactBand: chipDescriptor, top: 0, left: 0, page: 1 },
    { element_id: "ph-r", category: "rectangle", contactBandId: "vb", contactChannel: "phone",
      left: 48, top: 108, width: 120, height: 20, page: 1, flowRole: "masthead",
      backgroundColor: "#1A2030", filled: false, borderWidth: 1, borderRadius: null },
    { element_id: "ph-i", category: "image", contactBandId: "vb", contactChannel: "phone",
      left: 54, top: 114, width: 15, height: 15, page: 1, src: "x/test-chip/phone.png", flowRole: "masthead" },
    { element_id: "ph-l", category: "text", contactBandId: "vb", contactChannel: "phone",
      content: "+48 111", left: 75, top: 114, page: 1, flowRole: "masthead" },
    { element_id: "head", category: "text", content: "H", top: 200, left: 48, page: 1 },
  ];
}

test("chip relayout moves + resizes the rect with its icon/label", () => {
  const edited = chipDoc().map((e) =>
    e.element_id === "ph-l" ? { ...e, content: "+48 111 222 333 444 555" } : e,
  );
  const { elements } = applyChannelRelayout(edited, "vb", (t) => t.length * 5, () => "id");
  const rect = elements.find((e) => e.element_id === "ph-r");
  const expected = Math.max(120, Math.min(168, 28 + "+48 111 222 333 444 555".length * 5.2));
  assert.equal(rect.width, expected);
  assert.equal(rect.left, 48);
});

test("chip relayout leaves downstream flow put when the row count is unchanged", () => {
  // Regression: chip icon/label sit `(chipH - fontSize)/2` below the row top for
  // vertical centering, but layoutContactBand's bottomY is the row top. A stale
  // `currentBandBottom` that read the label top made every horizontal-only edit
  // yield a negative delta, marching downstream content up by that offset on each
  // keystroke (the chip masthead crept over the summary). A same-row edit must move
  // nothing below the band.
  const edited = chipDoc().map((e) =>
    e.element_id === "ph-l" ? { ...e, content: "+48 111 222" } : e,
  );
  const { elements } = applyChannelRelayout(edited, "vb", (t) => t.length * 5, () => "id");
  assert.equal(elements.find((e) => e.element_id === "head").top, 200);
});

test("chip addition creates a rect + icon + label triple for the channel", () => {
  let n = 0;
  const { elements } = applyChannelAddition(chipDoc(), "vb", "email", "", (t) => t.length * 5, () => `new-${n++}`);
  const added = elements.filter((e) => e.contactChannel === "email");
  assert.equal(added.length, 3);
  const rect = added.find((e) => e.category === "rectangle");
  const icon = added.find((e) => e.category === "image");
  assert.ok(rect && icon && added.some((e) => e.category === "text"));
  // The re-added chip must copy the existing chip's pill style (outline, not a
  // solid fill) and the icon must align with text like the generator's icons.
  assert.equal(rect.backgroundColor, "#1A2030");
  assert.equal(rect.filled, false);
  assert.equal(icon.alignWithText, true);
});
