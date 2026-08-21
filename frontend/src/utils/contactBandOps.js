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
import { channelName, CHANNEL_ORDER } from "./contactChannelNames.js";

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
 * Channels currently present in the band, in the canonical channel order.
 *
 * Ordering keys off `CHANNEL_ORDER` (the wizard's full set) rather than the
 * descriptor's generation-time `order`, so a channel added after generation
 * (e.g. github) sorts into its canonical slot. The canonical order matches the
 * generator sequence, so channels placed at generation keep their positions.
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
  return CHANNEL_ORDER.filter((channel) => present.has(channel));
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
//
// `bandPageNo` guards the downstream shift to the band's own page. `top` is
// page-relative, so without the guard a continuation-page element whose
// page-relative `top` happens to exceed the band's `oldBottomY` would be
// shifted as if it sat below the band — crushing/overlapping page-2+ content on
// every add/remove. The band is a single-page masthead row; its height delta
// only reflows that page.
//
// `fixedToPage` chrome (e.g. Slate's locked photo cluster — corner accent
// marks and base bar sit well below the masthead's top and can fall below the
// band's `oldBottomY` once a label grows) is masthead furniture, not flowing
// body content, and must stay put regardless of the band's height. This
// mirrors the same guard `shiftBelow` (mastheadIdentityOps.js) already applies
// for the title show/hide reflow; `reposition` was missing it.
function reposition(el, bandId, placementByChannel, oldBottomY, delta, bandPageNo) {
  if (el.contactBandId === bandId && el.contactChannel) {
    const placement = placementByChannel.get(el.contactChannel);
    if (!placement) return el;
    if (el.category === "image") {
      return { ...el, left: placement.iconLeft, top: placement.iconTop };
    }
    if (el.category === "rectangle") {
      // Chip (Volt) background pill: move AND resize to the recomputed width.
      // Non-chip placements have no rect fields, but no rectangle band element
      // exists in those modes, so this branch is only reached in chip mode.
      return {
        ...el,
        left: placement.rectLeft, top: placement.rectTop,
        width: placement.rectWidth,
      };
    }
    // text label
    return { ...el, left: placement.labelLeft, top: placement.labelTop };
  }
  // The band anchor (band id but no channel) never moves.
  if (el.contactBandId === bandId) return el;
  if (el.fixedToPage) return el;
  const page = Math.max(1, Math.trunc(Number(el.page) || 1));
  if (page === bandPageNo && typeof el.top === "number" && el.top >= oldBottomY) {
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

// Copy the chip (Volt) pill style from an existing band rectangle so a re-added
// chip matches the originals exactly — including `filled` (Volt chips are
// outline-only: backgroundColor is the border colour) and any borderRadius. Falls
// back to the descriptor's chipColor with Volt's default outline shape when the
// band has no rectangle left to copy from (re-adding into a fully emptied band).
function deriveChipStyle(elements, bandId, descriptor) {
  const anyRect = elements.find(
    (el) => el.contactBandId === bandId && el.category === "rectangle",
  );
  if (anyRect) {
    return {
      backgroundColor: anyRect.backgroundColor,
      filled: anyRect.filled ?? false,
      borderWidth: anyRect.borderWidth ?? 1,
      borderRadius: anyRect.borderRadius ?? null,
    };
  }
  return {
    backgroundColor: descriptor.chipColor ?? "#EEEEEE",
    filled: false,
    borderWidth: 1,
    borderRadius: null,
  };
}

function relayoutAndReconcile(elements, bandId, descriptor, oldItems, nextItems, measure, createId) {
  const oldBand = layoutContactBand(descriptor, oldItems, measure);
  const newBand = layoutContactBand(descriptor, nextItems, measure);
  const delta = newBand.bottomY - oldBand.bottomY;
  const bandPageNo = bandPage(elements, bandId);
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  const next = elements.map((el) =>
    reposition(el, bandId, placementByChannel, oldBand.bottomY, delta, bandPageNo),
  );
  const reconciled = reconcileDocumentPages(next, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

// Current bottom row of the band, read from live chip positions. Used as the
// "before" baseline for a live edit, where the prior layout is not available.
//
// This must be measured on the SAME reference line as `layoutContactBand().
// bottomY`, which is the TOP of the last row. In `chip` mode the pill rectangle
// sits at the row top, while the icon/label are nudged `(chipH - fontSize)/2`
// below it for vertical centering — so reading the max element top would return
// the label top, a constant offset below the true row top. That mismatch made
// every horizontal-only edit produce a small negative delta and march downstream
// content upward on each keystroke. Prefer the rectangle top when the band has
// pill backgrounds (chip mode); otherwise (wrapping/stacked/centered) the icon
// and label already sit at the row top, so their top is the correct reference.
function currentBandBottom(elements, bandId) {
  let bottom = null;
  let rectBottom = null;
  for (const el of elements) {
    if (el.contactBandId === bandId && el.contactChannel && typeof el.top === "number") {
      bottom = bottom == null ? el.top : Math.max(bottom, el.top);
      if (el.category === "rectangle") {
        rectBottom = rectBottom == null ? el.top : Math.max(rectBottom, el.top);
      }
    }
  }
  return rectBottom != null ? rectBottom : bottom;
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
  const bandPageNo = bandPage(elements, bandId);
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  const next = elements.map((el) =>
    reposition(el, bandId, placementByChannel, oldBottom ?? 0, delta, bandPageNo),
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
  // Accept any channel the wizard supports (canonical order), not only the ones
  // the CV was generated with, so github/website can be added to an existing band.
  if (!CHANNEL_ORDER.includes(channel)) return { elements };
  const oldChannels = activeChannels(elements, bandId);
  if (oldChannels.includes(channel)) return { elements };

  const labels = channelLabels(elements, bandId);
  // Seed the label with real content: the caller's value, or the channel display
  // name when none is given. A non-empty label behaves like any other editable
  // text (an empty contentEditable is unreliable to focus/click into), and the
  // `selectAllOnEdit` flag below makes the first keystroke replace the seed.
  const provided = (label ?? "").toString();
  const seed = provided || channelName(channel);
  // Build the new channel sequence in canonical order so the added channel lands
  // in its natural slot (e.g. github between linkedin and location), regardless
  // of the descriptor's generation-time order.
  const nextChannels = CHANNEL_ORDER.filter(
    (c) => oldChannels.includes(c) || c === channel,
  );
  const nextLabels = { ...labels, [channel]: seed };

  // Compute the new placement for the added channel so the created elements
  // start in the right spot (the subsequent relayout confirms every position).
  const newBand = layoutContactBand(descriptor, itemsFor(nextChannels, nextLabels), measure);
  const placement = newBand.placements.find((p) => p.channel === channel);
  const page = bandPage(elements, bandId);
  const isChip = descriptor.mode === "chip";
  const iconEl = {
    element_id: createId("icon"),
    category: "image",
    src: deriveIconSrc(elements, bandId, descriptor, channel),
    left: placement.iconLeft, top: placement.iconTop,
    width: descriptor.icon.sizePt, height: descriptor.icon.sizePt,
    // Match the backend `_icon`/`_icon_beside` output for every mode: the glyph
    // is vertically centred against the label's CSS top (alignWithText), so a
    // re-added icon lands exactly where the generator's icons do.
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
    // Seed with the channel display name so the label has real, clickable glyphs
    // (canvas text uses line-height:0, so an EMPTY single-line label collapses to
    // zero height and cannot be clicked into). The user clicks it to edit via the
    // same proven path as every other text element; `placeholder` still supplies a
    // hint + hit area if the value is later cleared. Deliberately NOT auto-edited:
    // mounting an element already `isEditing:true` is an unreliable focus path.
    placeholder: channelName(channel),
  };
  // Chip (Volt) channels are a triple: a background pill (rectangle) behind the
  // icon + label. Create it too so the new channel matches the drawn shape; the
  // subsequent relayout confirms every position/size.
  const extras = [];
  if (isChip) {
    const chipStyle = deriveChipStyle(elements, bandId, descriptor);
    extras.push({
      element_id: createId("chip"),
      category: "rectangle",
      left: placement.rectLeft, top: placement.rectTop,
      width: placement.rectWidth, height: descriptor.metrics.chipH,
      backgroundColor: chipStyle.backgroundColor,
      filled: chipStyle.filled, borderWidth: chipStyle.borderWidth,
      borderRadius: chipStyle.borderRadius,
      zIndex: 1, page, flowRole: "masthead",
      contactChannel: channel, contactBandId: bandId,
    });
  }
  const withNew = [...elements, ...extras, iconEl, labelEl];
  return relayoutAndReconcile(
    withNew, bandId, descriptor,
    itemsFor(oldChannels, labels), itemsFor(nextChannels, nextLabels),
    measure, createId,
  );
}
