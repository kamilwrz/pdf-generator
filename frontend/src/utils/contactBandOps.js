/**
 * Contact-band add/remove transforms (pure).
 *
 * These transform the canvas element array when the user adds, removes, or
 * edits a contact channel. Most bands own a fixed template zone:
 *
 *   1. Recompute the band with the new channel set via `layoutContactBand`.
 *   2. Reposition the band's icon/label pairs to the new placements.
 *   3. Preserve non-band geometry unless the descriptor opts into a growing
 *      multiline stack; that stack moves its divider and repacks body records.
 *   4. Reconcile continuation-page chrome.
 *
 * The band-anchor element (flowRole "masthead-anchor") carries the descriptor
 * and is never shifted or repositioned; it stays put.
 */
import { layoutContactBand } from "./contactBandLayout.js";
import { reconcileDocumentPages } from "./structureOperation.js";
import { listDocumentSections, packDocumentSections } from "./sectionStructure.js";
import {
  channelName,
  contactChannelPlaceholder,
  CHANNEL_ORDER,
} from "./contactChannelNames.js";

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

// Channel -> text used for horizontal placement. Empty guided fields include
// whitespace-only values: Chromium can leave a <br> after deletion, serialized
// as "\n", and older drafts can retain spaces. Text displays the placeholder
// for these values on blur, so layout must reserve the same guidance width.
// Only the emptiness check trims; authored spacing and stored content stay intact.
function channelLabels(elements, bandId) {
  const labels = {};
  for (const el of elements) {
    if (el.contactBandId === bandId && el.contactChannel && ["text", "textarea"].includes(el.category)) {
      const content = String(el.content ?? "");
      labels[el.contactChannel] = content.trim() ? content : String(el.placeholder || "");
    }
  }
  return labels;
}

// Build the ordered items the layout engine measures. `itemsFor` is used for
// PLACEMENT MATH ONLY — it never sets element content. A label without content
// reserves its editor placeholder width (or the channel name as a final
// fallback), so the following chip never overlaps visible guidance. Once the
// user types, the real content is measured instead.
function itemsFor(channels, labels) {
  return channels.map((channel) => ({
    channel,
    label: labels[channel] ? labels[channel] : channelName(channel),
  }));
}

// Reposition contact-band members inside the zone without changing its lower
// boundary or any non-band element below it.
function reposition(el, bandId, placementByChannel) {
  if (el.contactBandId === bandId && el.contactChannel) {
    const placement = placementByChannel.get(el.contactChannel);
    if (!placement) return el;
    if (el.category === "image") {
      return {
        ...el, left: placement.iconLeft, top: placement.iconTop,
        ...(placement.iconSize == null ? {} : {
          width: placement.iconSize, height: placement.iconSize,
          alignWithText: placement.alignWithText,
        }),
      };
    }
    if (el.category === "rectangle") {
      // Chip background pill: move AND resize to the recomputed width.
      // Non-chip placements have no rect fields, but no rectangle band element
      // exists in those modes, so this branch is only reached in chip mode.
      return {
        ...el,
        left: placement.rectLeft, top: placement.rectTop,
        width: placement.rectWidth,
      };
    }
    // text label
    return {
      ...el, left: placement.labelLeft, top: placement.labelTop,
      ...(placement.labelWidth == null ? {} : {
        width: placement.labelWidth, height: placement.labelHeight,
        lineHeight: placement.lineHeight,
      }),
    };
  }
  // The contact zone is a fixed part of every template masthead. Only its own
  // members may move; section starts and decorative chrome below it keep their
  // authored Y coordinates when optional channels are added or removed.
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

// Copy the chip pill style from an existing band rectangle so a re-added chip
// matches the originals exactly, including `filled` and any border radius. Falls
// back to the descriptor's chip color with the default outline shape when the
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

function relayoutAndReconcile(elements, bandId, descriptor, nextItems, measure, createId) {
  const newBand = layoutContactBand(descriptor, nextItems, measure);
  const placementByChannel = new Map(newBand.placements.map((p) => [p.channel, p]));
  let next = elements.map((el) =>
    reposition(el, bandId, placementByChannel),
  );
  if (descriptor.flow) {
    const { dividerId, dividerGap, bodyGap, minimumRows, minimumBodyTop } = descriptor.flow;
    const reservedTop = descriptor.anchor.startY + (minimumRows - 1) * descriptor.metrics.lineStep;
    const dividerTop = Math.max(reservedTop, newBand.bottomY) + dividerGap;
    const flowStart = Math.max(minimumBodyTop, dividerTop + bodyGap);
    const anchor = elements.find((el) => el.contactBand?.id === bandId);
    next = next.map((el) => {
      if (el.id === dividerId) return { ...el, top: dividerTop };
      if (el === anchor) return {
        ...el, contactBand: { ...descriptor, flow: { ...descriptor.flow, bodyTop: flowStart } },
      };
      return el;
    });
    // Only opt-in multiline bands can change the body origin. Pack complete
    // sections from the new floor, preserving authored rhythm and record
    // ownership across page breaks. Same-height keystrokes never touch body.
    if (Math.abs(flowStart - Number(descriptor.flow.bodyTop)) > 0.01) {
      const sections = listDocumentSections(elements);
      next = packDocumentSections(next, sections.map((section) => section.headingId), 842, {
        membershipReference: elements, spacing: descriptor.flow.spacing,
      });
    }
  }
  const reconciled = reconcileDocumentPages(next, createId, { collapseEmpty: true });
  return { elements: reconciled.elements, pageCount: reconciled.pageCount };
}

/**
 * Re-lay a band from its current label contents (called live while a label is
 * edited). Fixed bands move only their members; opt-in multiline stacks also
 * repack body sections when their height changes. Content, runs, and edit
 * state are untouched so the caret in the edited node is undisturbed.
 */
export function applyChannelRelayout(elements, bandId, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const channels = activeChannels(elements, bandId);
  const labels = channelLabels(elements, bandId);
  const items = itemsFor(channels, labels);
  return relayoutAndReconcile(elements, bandId, descriptor, items, measure, createId);
}

/**
 * Remove a channel and re-lay only the remaining contact-band members.
 */
export function applyChannelRemoval(elements, bandId, channel, measure, createId) {
  const descriptor = bandDescriptor(elements, bandId);
  if (!descriptor) return { elements };
  const oldChannels = activeChannels(elements, bandId);
  if (!oldChannels.includes(channel)) return { elements };
  const labels = channelLabels(elements, bandId);
  const nextChannels = oldChannels.filter((c) => c !== channel);
  // Drop the removed pair before repositioning the remaining band members.
  const kept = elements.filter(
    (el) => !(el.contactBandId === bandId && el.contactChannel === channel),
  );
  return relayoutAndReconcile(
    kept, bandId, descriptor,
    itemsFor(nextChannels, labels),
    measure, createId,
  );
}

/**
 * Add an inactive channel and re-lay only the contact-band members.
 * `label` is optional authored text. When it is absent, the label stays empty
 * and exposes channel-specific editor guidance that is omitted from PDF output.
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
  const provided = (label ?? "").toString();
  const placeholder = contactChannelPlaceholder(channel);
  // The placeholder CSS supplies both visible guidance and a stable hit area
  // for an empty line-height:0 text node. Keeping it out of `content` prevents
  // an untouched “LinkedIn”/“GitHub” label from becoming authored CV data.
  const seed = provided.trim() ? provided : "";
  // Build the new channel sequence in canonical order so the added channel lands
  // in its natural slot (e.g. github between linkedin and location), regardless
  // of the descriptor's generation-time order.
  const nextChannels = CHANNEL_ORDER.filter(
    (c) => oldChannels.includes(c) || c === channel,
  );
  const nextLabels = { ...labels, [channel]: seed || placeholder };

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
    // Multiline stacks carry a geometric centre; other bands retain the
    // backend's optical baseline alignment when a channel is re-added.
    zIndex: 3, page, flowRole: "masthead",
    alignWithText: placement.alignWithText ?? true,
    contactChannel: channel, contactBandId: bandId,
  };
  const labelEl = {
    element_id: createId("label"),
    category: descriptor.mode === "bounded-stack" ? "textarea" : "text", content: seed,
    left: placement.labelLeft, top: placement.labelTop,
    fontSize: descriptor.text.fontSizePt, fontFamily: descriptor.text.fontFamily,
    color: descriptor.text.colorHex,
    zIndex: 3, page, flowRole: "masthead",
    contactChannel: channel, contactBandId: bandId,
    placeholder,
    starterPlaceholder: !seed.trim(),
    cvDataBindings: [{ path: [channel], placeholder }],
    ...(descriptor.mode === "bounded-stack" ? {
      width: placement.labelWidth, height: placement.labelHeight,
      lineHeight: placement.lineHeight, autoHeight: false, align: "left",
      appearanceTypographyRole: "contact",
    } : {}),
  };
  // Chip channels are a triple: a background pill (rectangle) behind the
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
    itemsFor(nextChannels, nextLabels),
    measure, createId,
  );
}
