/**
 * Single-line text edit surface helpers.
 *
 * Text uses one <p> for display and edit and does not render React children.
 * Content is written into the node imperatively. A two-page → one-page
 * edit-zoom remounts that <p> while `isEditing` is already true, so the
 * display-sync effect skips. A fresh node would stay empty unless it is
 * seeded from stored content — the same contract Textarea already follows
 * on edit enter.
 *
 * Blur during that remount is a view-transition side effect. Committing it
 * can serialize an empty detached node and also clear `isEditing`.
 */

import { sanitizeTextContent } from "./sanitizeTextContent.js";
import { hasRuns } from "./textRuns.js";
import { runsToHtml } from "./editableSerialize.js";

/**
 * Write authored content into a single-line edit node.
 *
 * @param {ParentNode|null|undefined} node
 * @param {string|null|undefined} content
 * @param {unknown} runs
 */
export function seedTextEditNode(node, content, runs) {
  if (!node) return;
  const next = sanitizeTextContent(content) ?? "";
  // Backspace can leave a <br> or empty formatting spans whose textContent
  // already equals "". Remove those children so CSS :empty guidance returns.
  if (!next) {
    node.textContent = "";
    return;
  }
  if (hasRuns(runs)) {
    const html = runsToHtml(next, runs);
    if (node.innerHTML !== html) {
      node.innerHTML = html;
    }
    return;
  }
  if (node.textContent !== next) {
    node.textContent = next;
  }
}

/**
 * Whether a text-element blur should finalize the edit.
 *
 * Ignore unmount blurs and the two-page spread remount. Those nodes are not
 * a user leaving the field; they are the old surface being replaced.
 *
 * @param {{
 *   node: Node|null|undefined,
 *   elementId: string,
 *   spreadTransitionId: string|boolean|null|undefined,
 * }} args
 * @returns {boolean}
 */
export function shouldCommitTextEditBlur({ node, elementId, spreadTransitionId }) {
  if (!node || !node.isConnected) return false;
  if (spreadTransitionId != null && spreadTransitionId !== false
      && spreadTransitionId === elementId) {
    return false;
  }
  return true;
}

/**
 * Track the visible text rectangle for the active Text edit-focus pseudo-box.
 *
 * A text node may span a whole column to support alignment. Range measures its
 * actual content, including inline styles, without changing that layout frame
 * or the native caret. Only DOM-only CSS properties are written; no document
 * geometry or export data changes. Empty/unmeasurable text uses the CSS fallback.
 *
 * @param {HTMLElement} node - Mounted single-line contentEditable surface.
 * @returns {() => void} Cancel tracking and remove the temporary properties.
 */
export function trackTextEditOutline(node) {
  const view = node.ownerDocument.defaultView;
  const range = node.ownerDocument.createRange();
  const properties = ["left", "top", "width", "height"].map((key) => `--text-edit-${key}`);
  let frame;
  let previous = "";

  function measure() {
    if (!node.isConnected) return;
    const canvas = node.closest("[data-page-canvas]");
    const canvasRect = canvas?.getBoundingClientRect();
    const scaleX = canvasRect?.width / canvas?.clientWidth;
    const scaleY = canvasRect?.height / canvas?.clientHeight;
    range.selectNodeContents(node);
    const ink = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const measurable = node.textContent && ink.width > 0 && ink.height > 0
      && scaleX > 0 && scaleY > 0 && Number.isFinite(scaleX) && Number.isFinite(scaleY);
    const values = measurable ? [
      (ink.left - box.left) / scaleX,
      (ink.top - box.top) / scaleY,
      ink.width / scaleX,
      ink.height / scaleY,
    ].map((value) => `${value.toFixed(3)}px`) : [];
    const signature = values.join(";");
    if (signature !== previous) {
      properties.forEach((property, index) => {
        if (values[index]) node.style.setProperty(property, values[index]);
        else node.style.removeProperty(property);
      });
      previous = signature;
    }
    // Track only the active edit. Native input, font loading and animated page
    // transforms can move glyphs without resizing the fixed-width paragraph.
    // Use the live page scale and avoid redundant style writes on idle frames.
    frame = view.requestAnimationFrame(measure);
  }
  measure();
  return () => {
    view.cancelAnimationFrame(frame);
    properties.forEach((property) => node.style.removeProperty(property));
  };
}
