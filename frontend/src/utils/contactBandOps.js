/**
 * Contact-band add/remove transforms (pure).
 *
 * These mutate the canvas element array when the user adds or removes a contact
 * channel, keeping the band laid out and the document reflowed. The reflow rule
 * was validated by the Task-4 spike:
 *
 *   1. Recompute the band with the new channel set via `layoutContactBand`.
 *   2. Reposition the band's icon/label pairs to the new placements.
 *   3. Shift every NON-band element whose `top >= oldBottomY` by the band's
 *      height delta (Δ = newBottomY - oldBottomY) — this moves the header rule
 *      and the first section, and everything after them.
 *   4. Re-paginate with `reconcileDocumentPages`.
 *
 * The band-anchor element (flowRole "masthead-anchor") carries the descriptor
 * and is never shifted or repositioned; it stays put.
 */
import { layoutContactBand } from "./contactBandLayout.js";
import { reconcileDocumentPages } from "./structureOperation.js";
import { channelName } from "./contactChannelNames.js";

function bandDescriptor(elements, bandId) {
  const anchor = elements.find(
    (el) => el.contactBandId === bandId && el.flowRole === "masthead-anchor",
  );
  return anchor?.contactBand ?? null;
}

function bandPage(elements, bandId) {
  const any = elements.find((el) => el.contactBandId === bandId && el.contactChannel);
  return any?.page ?? 1;
}

/**
 * Channels currently present in the band, in the descriptor's canonical order.
 * @returns {string[]}
 */
export function activeChannels(elements, bandId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return [];
  const present = new Set(
    elements
      .filter((el) => el.contactBandId === bandId && el.contactChannel)
      .map((el) => el.contactChannel),
  );
  return descriptor.order.filter((channel) => present.has(channel));
}

// channel -> current label text, read from the label (text) element of each pair.
function channelLabels(elements, bandId) {
  const labels = {};
  for (const el of elements) {
    if (el.contactBandId === bandId && el.contactChannel && el.category === "text") {
      labels[el.contactChannel] = el.content ?? "";
    }
  }
  return labels;
}

// Build the ordered items the layout engine measures. `itemsFor` is used for
// PLACEMENT MATH ONLY — it never sets element content. An empty label reserves
// the width of its display name (the same text the placeholder ::before shows in
// Text.jsx), so the following chip does not overlap a just-added, still-empty
// channel. Once the user types, the real content is measured instead.
function itemsFor(channels, labels) {
  return channels.map((channel) => ({
    channel,
    label: labels[channel] ? labels[channel] : channelName(channel),
  }));
}

// Reposition band pairs to the new placements; shift downstream flow by Δ.
function reposition(el, bandId, placementByChannel, oldBottomY, delta) {
  if (el.contactBandId === bandId && el.contactChannel) {
    const placement = placementByChannel.get(el.contactChannel);
    if (!placement) return el;
    return el.category === "image"
      ? { ...el, left: placement.iconLeft, top: placement.iconTop }
      : { ...el, left: placement.labelLeft, top: placement.labelTop };
  }
  // The band anchor (band id but no channel) never moves.
  if (el.contactBandId === bandId) return el;
  if (typeof el.top === "number" && el.top >= oldBottomY) {
    return { ...el, top: el.top + delta };
  }
  return el;
}

// Derive a new channel's icon URL from an existing band icon (swap the trailing
// "<name>.png"), falling back to the descriptor theme when the band has no icon
// left to copy from (rare: re-adding into a fully emptied band).
function deriveIconSrc(elements, bandId, descriptor, channel) {
  const anyIcon = elements.find(
    (el) => el.contactBandId === bandId && el.category === "image" && el.src,
  );
  if (anyIcon) {
    return String(anyIcon.src).replace(/[^/]+\.png(\?.*)?$/, `${channel}.png`);
  }
  return `/template-assets/iconic/${descriptor.icon.theme}/${channel}.png`;
}

function relayoutAndReconcile(elements, bandId, descriptor, oldItems, nextItems, measure, createId) {
  const oldBand = layoutContactBand(descriptor, oldItems, measure);
  const newBand = layoutContactBand(descriptor, nextItems, measure);
  const delta = newBand.bottomY - oldBand.bottomY;
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  const next = elements.map((el) =>
    reposition(el, bandId, placementByChannel, oldBand.bottomY, delta),
  );
  const reconciled = reconcileDocumentPages(next, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

// Current bottom row of the band, read from live chip positions. Used as the
// "before" baseline for a live edit, where the prior layout is not available.
function currentBandBottom(elements, bandId) {
  let bottom = null;
  for (const el of elements) {
    if (el.contactBandId === bandId && el.contactChannel && typeof el.top === "number") {
      bottom = bottom == null ? el.top : Math.max(bottom, el.top);
    }
  }
  return bottom;
}

/**
 * Re-lay a band from its current label contents (called live while a label is
 * edited) and shift downstream flow by the height delta. Positions only — never
 * touches content, runs, or edit state, so the caret in the edited node is
 * undisturbed.
 */
export function applyChannelRelayout(elements, bandId, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const channels = activeChannels(elements, bandId);
  if (!channels.length) return { elements };
  const labels = channelLabels(elements, bandId);
  const items = itemsFor(channels, labels);
  const oldBottom = currentBandBottom(elements, bandId);
  const newBand = layoutContactBand(descriptor, items, measure);
  const delta = oldBottom == null ? 0 : newBand.bottomY - oldBottom;
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  const next = elements.map((el) =>
    reposition(el, bandId, placementByChannel, oldBottom ?? 0, delta),
  );
  const reconciled = reconcileDocumentPages(next, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

/**
 * Remove a channel (icon + label) and reflow the band + document.
 */
export function applyChannelRemoval(elements, bandId, channel, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const oldChannels = activeChannels(elements, bandId);
  if (!oldChannels.includes(channel)) return { elements };
  const labels = channelLabels(elements, bandId);
  const nextChannels = oldChannels.filter((c) => c !== channel);
  // Drop the removed pair BEFORE repositioning; oldItems still includes it so
  // the delta reflects the height the band actually had before removal.
  const kept = elements.filter(
    (el) => !(el.contactBandId === bandId && el.contactChannel === channel),
  );
  return relayoutAndReconcile(
    kept, bandId, descriptor,
    itemsFor(oldChannels, labels), itemsFor(nextChannels, labels),
    measure, createId,
  );
}

/**
 * Add an inactive channel (icon + label) and reflow the band + document.
 * `label` is the seed text; when omitted the label starts empty for the user
 * to type.
 */
export function applyChannelAddition(elements, bandId, channel, label, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  if (!descriptor.order.includes(channel)) return { elements };
  const oldChannels = activeChannels(elements, bandId);
  if (oldChannels.includes(channel)) return { elements };

  const labels = channelLabels(elements, bandId);
  // Seed the label with real content: the caller's value, or the channel display
  // name when none is given. A non-empty label behaves like any other editable
  // text (an empty contentEditable is unreliable to focus/click into), and the
  // `selectAllOnEdit` flag below makes the first keystroke replace the seed.
  const provided = (label ?? "").toString();
  const seed = provided || channelName(channel);
  const nextChannels = descriptor.order.filter(
    (c) => oldChannels.includes(c) || c === channel,
  );
  const nextLabels = { ...labels, [channel]: seed };

  // Compute the new placement for the added channel so the created elements
  // start in the right spot (the subsequent relayout confirms every position).
  const newBand = layoutContactBand(descriptor, itemsFor(nextChannels, nextLabels), measure);
  const placement = newBand.placements.find((p) => p.channel === channel);
  const page = bandPage(elements, bandId);
  const iconEl = {
    element_id: createId("icon"),
    category: "image",
    src: deriveIconSrc(elements, bandId, descriptor, channel),
    left: placement.iconLeft, top: placement.iconTop,
    width: descriptor.icon.sizePt, height: descriptor.icon.sizePt,
    zIndex: 3, page, flowRole: "masthead", alignWithText: true,
    contactChannel: channel, contactBandId: bandId,
  };
  const labelEl = {
    element_id: createId("label"),
    category: "text", content: seed,
    left: placement.labelLeft, top: placement.labelTop,
    fontSize: descriptor.text.fontSizePt, fontFamily: descriptor.text.fontFamily,
    color: descriptor.text.colorHex,
    zIndex: 3, page, flowRole: "masthead",
    contactChannel: channel, contactBandId: bandId,
    // Open the new label in edit mode with its seed text selected, so the caret
    // is ready and the first keystroke overwrites the placeholder-style seed.
    // `placeholder` still gives the label a hint + hit area if the user clears it.
    isEditing: true, isSelected: true, selectAllOnEdit: true,
    placeholder: channelName(channel),
  };
  const withNew = [...elements, iconEl, labelEl];
  const result = relayoutAndReconcile(
    withNew, bandId, descriptor,
    itemsFor(oldChannels, labels), itemsFor(nextChannels, nextLabels),
    measure, createId,
  );
  // Make the new label the sole active element: clear edit/selection on every
  // other text/textarea, mirroring `handleSetTextareaEditing`'s semantics so a
  // prior selection cannot stay active while the user types the new channel.
  const newLabelId = labelEl.element_id;
  const elementsOut = result.elements.map((el) => {
    if (el.element_id === newLabelId) return el;
    if (el.category === "text" || el.category === "textarea") {
      return el.isEditing || el.isSelected ? { ...el, isEditing: false, isSelected: false } : el;
    }
    return el;
  });
  return { elements: elementsOut, pageCount: result.pageCount };
}
