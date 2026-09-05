/** DOM adapter for the single contentEditable surface owned by Textarea. */
import { getSelectionOffsets, runsToHtml, serializeEditable, setSelectionOffsets } from "./editableSerialize.js";
import { compositeMetadataParts, METADATA_SEPARATOR } from "./compositeMetadata.js";
import { sliceRuns } from "./textRuns.js";

const slots = (node) => [...node.querySelectorAll(":scope > [data-metadata-slot]")];

/**
 * Mark the empty insertion slot for its visual caret, without adding characters.
 * Chromium paints a native caret after generated placeholder content (or hides
 * it on subsequent clicks). Only that empty caret is replaced; authored text
 * retains native selection, caret movement, and composition behavior.
 */
export function syncMetadataCaret(node) {
  const selection = node.ownerDocument.getSelection();
  const children = slots(node);
  const boundary = getSelectionOffsets(node);
  let offset = 0;
  let active = null;
  if (node.ownerDocument.activeElement === node && selection?.isCollapsed && boundary) {
    const anchor = selection.anchorNode;
    active = children.find((slot) => slot === anchor || slot.contains(anchor));
    // History restoration and arrow keys can anchor at a root/separator
    // boundary. Resolve an empty slot by its serialized offset in that case.
    if (!active) active = children.find((slot) => {
      const length = serializeEditable(slot).content.length;
      const matches = !length && boundary.start === offset;
      offset += length + METADATA_SEPARATOR.length;
      return matches;
    });
  }
  const empty = active && !serializeEditable(active).content;
  children.forEach((slot) => {
    slot.toggleAttribute("data-metadata-caret", Boolean(empty && slot === active));
  });
  node.toggleAttribute("data-metadata-empty-caret", Boolean(empty));
}

/** Seed only on edit entry or structural edits; normal typing keeps native DOM/IME. */
export function seedCompositeMetadata(node, content, runs, hints) {
  node.replaceChildren();
  compositeMetadataParts(content, hints.length).forEach((part, index) => {
    if (index) {
      const separator = node.ownerDocument.createElement("span");
      separator.dataset.metadataSeparator = "true";
      separator.contentEditable = "false";
      separator.textContent = METADATA_SEPARATOR;
      node.append(separator);
    }
    const slot = node.ownerDocument.createElement("span");
    slot.dataset.metadataSlot = String(index);
    slot.dataset.hint = hints[index];
    slot.dataset.empty = String(!part.text);
    slot.innerHTML = runsToHtml(part.text, sliceRuns(runs, part.start, part.start + part.text.length));
    node.append(slot);
  });
}

/** Focus an empty hint at its actual insertion point, retaining all other slots. */
export function focusMetadataSlot(node, index, end = false) {
  const slot = slots(node)[index];
  if (!slot) return;
  node.focus({ preventScroll: true });
  const offset = end ? serializeEditable(slot).content.length : 0;
  setSelectionOffsets(slot, offset, offset);
  syncMetadataCaret(node);
  // At the editor's 280% edit zoom, another slot may be outside the compact
  // canvas viewport. Reveal the visual hint because the browser cannot scroll
  // to a zero-length native range on its own.
  slot.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Read authored text and inline marks; CSS hints never enter serialization. */
export function readCompositeMetadata(node) {
  const payload = serializeEditable(node);
  const values = slots(node).map((slot) => serializeEditable(slot).content);
  return values.length > 0 && values.every((value) => !value.trim())
    ? { content: "", runs: [] }
    : payload;
}

/** Restore hints after deletion without rebuilding a composing or styled slot. */
export function refreshCompositeMetadata(node, hints) {
  const payload = serializeEditable(node);
  const children = slots(node);
  const expected = children.map((slot) => serializeEditable(slot).content).join(METADATA_SEPARATOR);
  if (children.length !== hints.length || payload.content !== expected) {
    // Browsers may insert at the root boundary of an empty inline span. Move
    // that real text into its slot and restore the same serialized caret.
    const selection = getSelectionOffsets(node);
    seedCompositeMetadata(node, payload.content, payload.runs, hints);
    if (selection) setSelectionOffsets(node, selection.start, selection.end);
  }
  slots(node).forEach((slot) => {
    const empty = !serializeEditable(slot).content;
    slot.dataset.empty = String(empty);
    // Chromium leaves <br> after deleting the final character. It is not an
    // authored paragraph in this metadata row and must not displace the hint.
    if (empty && slot.childNodes.length) {
      const selected = slot.contains(node.ownerDocument.getSelection()?.anchorNode);
      slot.replaceChildren();
      if (selected) setSelectionOffsets(slot, 0, 0);
    }
  });
  syncMetadataCaret(node);
}

/** Replace a selection across slots without removing structural separators. */
export function replaceMetadataSelection(node, text, hints) {
  const selection = getSelectionOffsets(node);
  if (!selection) return;
  const children = slots(node);
  const parts = children.map((slot) => serializeEditable(slot));
  let offset = 0;
  const lastSlot = hints.length - 1;
  let insertionSlot = lastSlot;
  let insertionOffset = 0;
  let found = false;
  const updated = parts.map((part, index) => {
    const start = offset;
    const end = start + part.content.length;
    offset = end + METADATA_SEPARATOR.length;
    const from = Math.max(0, Math.min(part.content.length, selection.start - start));
    const to = Math.max(from, Math.min(part.content.length, selection.end - start));
    if (!found && selection.start <= end) {
      insertionSlot = index;
      insertionOffset = from;
      found = true;
    }
    return {
      content: part.content.slice(0, from) + part.content.slice(to),
      runs: [
        ...sliceRuns(part.runs, 0, from),
        ...sliceRuns(part.runs, to, part.content.length).map((run) => ({
          ...run, start: run.start + from, end: run.end + from,
        })),
      ],
    };
  });
  // Pasting a full metadata row can populate subsequent slots. Extra dots in
  // the final slot become plain spacing so the declared slot count stays fixed.
  const inserts = String(text).replace(/[\r\n]+/g, " ").split(/\s*·\s*/);
  let caretSlot = insertionSlot;
  let caretOffset = insertionOffset;
  inserts.forEach((insert, index) => {
    const slotIndex = Math.min(insertionSlot + index, lastSlot);
    const part = updated[slotIndex];
    const position = index === 0 ? insertionOffset : part.content.length;
    const value = index > lastSlot - insertionSlot ? ` ${insert}` : insert;
    part.runs = part.runs.map((run) => ({
      ...run,
      start: run.start >= position ? run.start + value.length : run.start,
      end: run.end > position ? run.end + value.length : run.end,
    }));
    part.content = part.content.slice(0, position) + value + part.content.slice(position);
    caretSlot = slotIndex;
    caretOffset = position + value.length;
  });
  let length = 0;
  const runs = updated.flatMap((part) => {
    const shifted = part.runs.map((run) => ({ ...run, start: run.start + length, end: run.end + length }));
    length += part.content.length + METADATA_SEPARATOR.length;
    return shifted;
  });
  seedCompositeMetadata(node, updated.map((part) => part.content).join(METADATA_SEPARATOR), runs, hints);
  const target = slots(node)[caretSlot];
  setSelectionOffsets(target, caretOffset, caretOffset);
  syncMetadataCaret(node);
}

/** Protect dot boundaries, including mobile deletion and multi-slot selection. */
export function guardCompositeMetadataInput(event, node, hints) {
  if (event.isComposing) return false;
  if (!event.inputType?.startsWith("insert") && !event.inputType?.startsWith("delete")) return false;
  const selection = getSelectionOffsets(node);
  if (!selection) return false;
  const children = slots(node);
  let start = 0;
  const ranges = children.map((slot) => {
    const range = { start, end: start + serializeEditable(slot).content.length };
    start = range.end + METADATA_SEPARATOR.length;
    return range;
  });
  const within = ranges.findIndex((range) => selection.start >= range.start && selection.end <= range.end);
  const deleting = event.inputType?.startsWith("delete");
  const crosses = within < 0;
  const backward = event.inputType?.endsWith("Backward");
  const atBoundary = deleting && selection.start === selection.end && within >= 0
    && (backward ? selection.start === ranges[within].start : selection.end === ranges[within].end);
  if (atBoundary) {
    event.preventDefault();
    focusMetadataSlot(node, Math.max(0, Math.min(hints.length - 1, within + (backward ? -1 : 1))), backward);
    return true;
  }
  if (crosses || String(event.data || "").includes("·") || event.inputType === "insertParagraph") {
    event.preventDefault();
    replaceMetadataSelection(node, deleting ? "" : (event.data ?? event.dataTransfer?.getData("text/plain") ?? ""), hints);
    return true;
  }
  return false;
}
