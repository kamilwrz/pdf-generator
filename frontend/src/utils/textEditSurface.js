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
