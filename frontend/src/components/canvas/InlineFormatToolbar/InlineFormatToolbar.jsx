/**
 * Floating inline-format toolbar for text / textarea editing.
 *
 * Appears only while a text element is in edit mode AND the user has a
 * non-collapsed selection — selecting text does nothing without this toolbar,
 * so the whole feature is additive and never changes existing UX. Bold, italic,
 * underline and a small colour palette toggle marks on the current selection.
 *
 * The editing node's DOM is the source of truth: on each action the node is
 * serialized to `{ content, runs }`, the mark is applied over the selection's
 * character offsets, the node is re-seeded from the new runs, and the selection
 * is restored. The committed `{ content, runs }` flows back through `onApply`.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classes from "./InlineFormatToolbar.module.css";
import {
  serializeEditable,
  getSelectionOffsets,
  setSelectionOffsets,
  runsToHtml,
} from "../../../utils/editableSerialize";
import { applyMark, rangeHasMark } from "../../../utils/textRuns";

// A compact palette that covers the common CV accent needs. The first entry is
// the default body colour so a user can also revert a coloured span.
const PALETTE = ["#1A2433", "#2F5F8F", "#B8954A", "#059669", "#C0563F", "#5A86B5"];

function activeMarks(content, runs, start, end) {
  return {
    bold: rangeHasMark(content, runs, start, end, "bold"),
    italic: rangeHasMark(content, runs, start, end, "italic"),
    underline: rangeHasMark(content, runs, start, end, "underline"),
  };
}

export default function InlineFormatToolbar({ nodeRef, isEditing, onApply }) {
  const [state, setState] = useState(null);
  const barRef = useRef(null);

  // Track the selection inside the editing node. `selectionchange` is a
  // document-level event, so it is only subscribed while this element edits.
  useEffect(() => {
    if (!isEditing) {
      setState(null);
      return undefined;
    }
    function update() {
      const node = nodeRef.current;
      if (!node || typeof window === "undefined") {
        setState(null);
        return;
      }
      const offsets = getSelectionOffsets(node);
      if (!offsets || offsets.start === offsets.end) {
        setState(null);
        return;
      }
      const selection = window.getSelection();
      let rect = null;
      try {
        rect = selection.getRangeAt(0).getBoundingClientRect();
      } catch {
        rect = null;
      }
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setState(null);
        return;
      }
      const { content, runs } = serializeEditable(node);
      setState({ rect, offsets, active: activeMarks(content, runs, offsets.start, offsets.end) });
    }
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [isEditing, nodeRef]);

  if (!state || typeof document === "undefined") return null;

  function apply(mark, value) {
    const node = nodeRef.current;
    if (!node) return;
    // Re-read the DOM at apply time so concurrent typing is never lost.
    const { content, runs } = serializeEditable(node);
    const offsets = getSelectionOffsets(node);
    if (!offsets || offsets.start === offsets.end) return;

    let nextValue = value;
    if (mark !== "color") {
      // B/I/U toggle: add the mark unless every selected char already has it.
      nextValue = !rangeHasMark(content, runs, offsets.start, offsets.end, mark);
    }
    const nextRuns = applyMark(content, runs, offsets.start, offsets.end, mark, nextValue);

    node.innerHTML = runsToHtml(content, nextRuns);
    setSelectionOffsets(node, offsets.start, offsets.end);
    onApply(content, nextRuns);
    setState((prev) => (prev
      ? { ...prev, active: activeMarks(content, nextRuns, offsets.start, offsets.end) }
      : prev));
  }

  // Position above the selection; clamp to the viewport top edge.
  const top = Math.max(8, state.rect.top - 44);
  const left = Math.max(8, state.rect.left);

  return createPortal(
    <div
      ref={barRef}
      className={classes.toolbar}
      style={{ top, left }}
      // Keep the selection alive: mousedown on the bar must not blur the editor.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className={state.active.bold ? classes.active : undefined}
        onClick={() => apply("bold")}
        aria-label="Pogrubienie"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className={state.active.italic ? classes.active : undefined}
        onClick={() => apply("italic")}
        aria-label="Kursywa"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={state.active.underline ? classes.active : undefined}
        onClick={() => apply("underline")}
        aria-label="Podkreślenie"
      >
        <u>U</u>
      </button>
      <span className={classes.divider} />
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={classes.swatch}
          style={{ background: color }}
          onClick={() => apply("color", color)}
          aria-label={`Kolor ${color}`}
        />
      ))}
    </div>,
    document.body,
  );
}
