import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Element-properties panel (CV STUDIO chrome). Text vs TextArea keep different
 * field sets. A zoom-aware settings cog appears to the left of the selection.
 * The user explicitly opens a contextual form; compact screens use a bounded
 * bottom sheet. Changing selection resets the form closed. All chrome is
 * portalled outside the document and never changes PDF geometry.
 *
 * While a text/textarea is contentEditable and the caret range is non-empty,
 * a second, fully independent floating bar ("Zaznaczenie") appears anchored
 * to the selected element on the canvas and exposes B/I/U and a native
 * colour input for inline runs. It is a separate portal with its own
 * mount/unmount animation — not a row inside the topbar panel — because it
 * needs to sit next to what the user is actually typing, not next to zoom.
 *
 * In template (structural) mode the bar hides controls that cannot affect the
 * selection (layout-owned X/Y / align / lock, all width/height size fields,
 * and z-index / Warstwa) and omits clone / delete — those actions use
 * section/record canvas affordances instead. Drag-resize handles are also
 * suppressed in template mode.
 */
import classes from "./Editor.module.css";
import canvasControls from "../../canvas/CanvasControls.module.css";
import { useEffect, useLayoutEffect, useState, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { RiDeleteBin2Line, RiFileCopyLine } from "react-icons/ri";
import { CiTextAlignLeft, CiTextAlignCenter, CiTextAlignRight, CiTextAlignJustify } from "react-icons/ci";
import {
  MdAlignHorizontalCenter,
  MdAlignHorizontalLeft,
  MdAlignHorizontalRight,
  MdFormatListBulleted,
  MdLock,
  MdLockOpen,
  MdClose,
  MdFormatLineSpacing,
  MdFormatSize,
  MdSettings,
} from "react-icons/md";
import { RxLetterSpacing, RxWidth, RxHeight, RxLayers } from "react-icons/rx";
import { TbArrowBigRightLines } from "react-icons/tb";
import { FiMinus, FiPlus } from "react-icons/fi";

import { useCanvasContext } from "../../../store/canvas-context";
import { useScopedAi } from "../../../store/scoped-ai-context";
import { motion as Motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  canCloneOrDeleteElements,
  canEditElementLayer,
  canEditElementPosition,
  canEditElementSizeField,
  canFreePositionElement,
  canResizeElement,
  canToggleElementLock,
} from "../../../utils/editorMode";
import {
  computeFloatingPanelPosition,
  unionRects,
} from "../../../utils/floatingPanelPosition";
import { CANVAS_FONT_STACKS } from "../../../utils/canvasFont";
import { pathCurvesForKind } from "../../../utils/freeformShapes";
import { elementToolbarPosition } from "../../../utils/elementToolbarPosition";
import { readCanvasZoom } from "../../../utils/readCanvasZoom";
import { structuralToolbarScreenLayoutSize } from "../../canvas/recordPlusSize";
import { insertInlineSkillSeparator } from "../../../utils/flatSectionLayout";
import { isInlineSkillsContentElement } from "../../../utils/skillsDisplayMode";
import {
  bulletRunsToEditableHtml,
  getSelectionOffsets,
  runsToHtml,
  serializeEditable,
  setSelectionOffsets,
} from "../../../utils/editableSerialize";
import {
  applyMark,
  hasRuns,
  rangeColor,
  rangeHasMark,
} from "../../../utils/textRuns";

const FONT_PREVIEW = CANVAS_FONT_STACKS;

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Times-Roman", label: "Times" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Courier", label: "Courier" },
  { value: "PlayfairDisplay", label: "Playfair" },
  { value: "CormorantGaramond", label: "Cormorant" },
  { value: "Lora", label: "Lora" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "JetBrainsMono", label: "JetBrains" },
];

const BULLET_PREFIX_PATTERN = /^\s*•[ \t]*/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const CATEGORY_LABELS = {
  get text() { return uiText("editor:inspector.textLower"); },
  get textarea() { return uiText("editor:editor.textField"); },
  get image() { return uiText("editor:editor.photo"); },
  get line() { return uiText("editor:editor.line"); },
  get rectangle() { return uiText("editor:editor.rectangle"); },
  get circle() { return uiText("editor:editor.circle"); },
  get ellipse() { return uiText("editor:editor.ellipse"); },
  get polygon() { return uiText("editor:editor.shape"); },
  get path() { return uiText("editor:editor.decorativeLine"); },
  get connector() { return uiText("editor:editor.connector"); },
};

const CATEGORY_PARAMETER_LABELS = {
  get text() { return uiText("editor:inspector.text"); },
  get textarea() { return uiText("editor:editor.textField2"); },
  get image() { return uiText("editor:editor.photo2"); },
  get line() { return uiText("editor:editor.line2"); },
  get rectangle() { return uiText("editor:editor.rectangle2"); },
  get circle() { return uiText("editor:editor.circle2"); },
  get ellipse() { return uiText("editor:inspector.ellipse"); },
  get polygon() { return uiText("editor:editor.shape2"); },
  get path() { return uiText("editor:editor.decorativeLine2"); },
  get connector() { return uiText("editor:editor.connector2"); },
};

function polishElementCount(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return uiText("editor:editor.elements2", { value0: (count) });
  return uiText("editor:editor.elements", { value0: (count) });
}

function canonicalBulletLine(line) {
  return `• ${line.replace(BULLET_PREFIX_PATTERN, "").trimStart()}`;
}

/** Native `<input type="color">` requires a 6-digit hex value. */
function toColorInputValue(value, fallback = "#000000") {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (HEX_COLOR_PATTERN.test(candidate)) return candidate;
  if (HEX_COLOR_PATTERN.test(fallback)) return fallback;
  return "#000000";
}

/** Return the live union rectangle for the selected canvas element IDs. */
function readSelectionAnchorRect(selectionKey) {
  const ids = selectionKey ? selectionKey.split("|").filter(Boolean) : [];
  const rects = ids.map((id) => {
    const node = document.getElementById(id);
    if (!node) return null;
    let rect = node.getBoundingClientRect();
    // PDF baseline text has a zero-height box. Anchor to its rendered glyphs.
    if (rect.height === 0 && node.textContent) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rect = range.getBoundingClientRect();
    }
    return { left: rect.left, top: rect.top, width: rect.width, height: Math.max(1, rect.height) };
  }).filter(Boolean);
  return unionRects(rects);
}

/**
 * Owns only presentation, keyed by selection to reset advanced controls closed.
 * The event boundary protects selection and edit zoom. Opening focuses the
 * nonmodal dialog; Escape/Close returns to the cog without trapping navigation.
 */
function InspectorDisclosure({ visible, selectionKey, panelPosition, panelTitle, panelSubject, reduceMotion, children }) {
  useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef(null);
  const dialogRef = useRef(null);
  const focusOnOpenRef = useRef(false);
  const contentId = `element-inspector-content-${selectionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  useEffect(() => {
    if (!isOpen) return undefined;
    // Pointer opening leaves focus in the canvas. Intercept Escape there before
    // the editable node handles it; inside the dialog, nested controls retain
    // their normal event order and the local handler closes the settings.
    function closeFromCanvas(event) {
      if (event.key !== "Escape" || dialogRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleRef.current?.focus({ preventScroll: true });
      setIsOpen(false);
    }
    document.addEventListener("keydown", closeFromCanvas, true);
    return () => document.removeEventListener("keydown", closeFromCanvas, true);
  }, [isOpen]);
  useLayoutEffect(() => {
    // Pointer opening preserves the live text caret (including Skills actions).
    // Keyboard opening enters the dialog in normal Tab order.
    if (isOpen && focusOnOpenRef.current) {
      dialogRef.current?.focus({ preventScroll: true });
      focusOnOpenRef.current = false;
    }
    // A compact sheet must not cover the field being configured. Reveal it
    // above the sheet using viewport scroll only, never model coordinates.
    if (isOpen && (window.innerWidth <= 720 || panelPosition?.needsReveal)) {
      const anchor = readSelectionAnchorRect(selectionKey);
      const canvas = document.querySelector(".canvas-area");
      const sheetTop = window.innerWidth <= 720
        ? window.innerHeight - 8 - (dialogRef.current?.offsetHeight || 0)
        : panelPosition.panel.top;
      if (anchor && canvas && anchor.top + anchor.height > sheetTop - 16) {
        canvas.scrollTop += anchor.top + anchor.height - sheetTop + 16;
      }
    }
  }, [isOpen, selectionKey, panelPosition?.needsReveal, panelPosition?.panel.top]);
  function collapseInspector() {
    toggleRef.current?.focus({ preventScroll: true });
    setIsOpen(false);
  }
  function handleKeyDown(event) {
    if (event.key !== "Escape" || !isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    collapseInspector();
  }
  if (!visible || !panelPosition) return null;
  return (
    <div data-editor-control="element-settings" onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}>
      <button ref={toggleRef} type="button" className={`${canvasControls.surface} ${canvasControls.button} ${classes.inspectorToggle}`}
        style={{ ...panelPosition.trigger,
          "--canvas-control-size": `${panelPosition.controls.buttonSize}px`,
          "--canvas-control-icon": `${panelPosition.controls.iconSize}px`,
          visibility: panelPosition.visible || isOpen ? "visible" : "hidden" }}
        data-editor-inspector-state={isOpen ? undefined : "closed"}
        aria-expanded={isOpen} aria-controls={isOpen ? contentId : undefined} aria-haspopup="dialog"
        aria-label={uiText(isOpen ? "editor:inspector.collapse" : "editor:inspector.open", { subject: panelSubject })}
        data-tooltip={isOpen ? undefined : uiText("editor:inspector.settings")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          focusOnOpenRef.current = event.detail === 0;
          if (isOpen) collapseInspector();
          else setIsOpen(true);
        }}>
        <MdSettings aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <Motion.aside ref={dialogRef} id={contentId} tabIndex={-1}
            role="dialog" aria-modal="false" aria-label={uiText("editor:editor.settings", { value0: (panelSubject) })}
            className={`${classes.editor} ${classes.editorOpen}`}
            data-editor-inspector-state="open" style={panelPosition.panel}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}>
            <header className={classes.inspectorHeader}>
              <div className={classes.inspectorToggleCopy}>
                <span className={classes.eyebrow}>{uiText("editor:editor.elementSettings")}</span>
                <h2 className={classes.panelTitle}>{panelSubject}</h2>
              </div>
              <button type="button" className={classes.iconBtn}
                aria-label={uiText("editor:editor.closeElementSettings")} onClick={collapseInspector}>
                <MdClose aria-hidden="true" />
              </button>
            </header>
            <div className={classes.inspectorContent}>{children}</div>
            <footer className={classes.inspectorFooter}>
              <span className={classes.selectionHint} title={panelTitle}>{uiText("editor:editor.ctrlClickSelectMultiple")}</span>
              <span>{uiText("editor:editor.escClose")}</span>
            </footer>
          </Motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Editor() {
  useTranslation();
  const scopedAi = useScopedAi();
  const reduceMotion = useReducedMotion();
  const {
    A4_Elements,
    editElementValues,
    editSelectedElementValues,
    alignElement,
    deleteElement,
    duplicateElement,
    deleteSelectedElements,
    duplicateSelectedElements,
    moveSelectedElements,
    editorMode,
    zoom,
    isTwoPageView,
    currentPage,
  } = useCanvasContext();

  const selectedElements = A4_Elements.filter((element) => element.isSelected);
  const selectedElement = selectedElements[0];
  const someElementSelected = selectedElements.length > 0;
  const isMultiSelection = selectedElements.length > 1;
  const isSelectedInlineSkillsField = !isMultiSelection && isInlineSkillsContentElement(
    A4_Elements,
    selectedElement?.element_id,
  );
  // Hide no-op geometry / structure actions instead of showing disabled chrome.
  const showPositionFields = Boolean(
    selectedElement && canEditElementPosition(selectedElement, editorMode),
  );
  const showLockToggle = Boolean(
    selectedElement && canToggleElementLock(selectedElement, editorMode),
  );
  const allowCloneOrDelete = canCloneOrDeleteElements(editorMode);
  // Structural templates own stacking order — hide Warstwa so the Position
  // group is not left with a single useless control.
  const showLayerField = canEditElementLayer(editorMode);
  const showPositionGroup = showPositionFields || showLockToggle || showLayerField;
  const bulkAllowGroupMove = selectedElements.every((element) => (
    canEditElementPosition(element, editorMode)
  ));
  const bulkAllowLock = selectedElements.every((element) => (
    canToggleElementLock(element, editorMode)
  ));

  const [elementValues, setElementValues] = useState({});
  const [groupMoveValues, setGroupMoveValues] = useState({ x: "0", y: "0" });
  const groupMoveOffsetRef = useRef({ x: 0, y: 0 });
  const [panelPosition, setPanelPosition] = useState(null);
  // Non-collapsed caret range inside the editing text node. Selection marks
  // (B/I/U/colour) render in their own floating panel, anchored to the
  // selected element on canvas — independent of the element-settings panel
  // above, with its own mount/unmount animation.
  const [inlineSelection, setInlineSelection] = useState(null);
  const selectionPanelRef = useRef(null);
  const [selectionPanelPosition, setSelectionPanelPosition] = useState({ top: 0, left: 0 });
  const selectionKey = selectedElements.map((element) => element.element_id).sort().join("|");
  const selectionGeometryKey = selectedElements
    .map((element) => [
      element.element_id,
      element.page ?? 1,
      Math.round(Number(element.left) || 0),
      Math.round(Number(element.top) || 0),
      Math.round(Number(element.width) || 0),
      Math.round(Number(element.height) || 0),
    ].join(":"))
    .join("|");

  function handleChangeValues(e, identifier) {
    if (
      (identifier === "left" || identifier === "top")
      && (selectedElement.locked || !canFreePositionElement(selectedElement, editorMode))
    ) {
      return;
    }
    // Structural mode: width/height are layout-owned (same as drag-resize).
    if (
      (identifier === "width" || identifier === "height")
      && !canResizeElement(selectedElement, editorMode)
    ) {
      return;
    }
    const value = ["fontSize", "height", "width", "lineHeight", "letterSpacing", "left", "top", "borderWidth", "borderRadius", "zIndex"].includes(identifier)
      ? Number(e.target.value)
      : e.target.value;
    let valueObject = { [identifier]: value };

    if ((identifier === "width" || identifier === "height") && selectedElement.category === "circle") {
      valueObject = { width: value, height: value };
    } else if (identifier === "width" && selectedElement.category === "image") {
      const image = document.getElementById(selectedElement.element_id);
      const aspectRatio = image.naturalHeight / image.naturalWidth;
      const newHeight = Math.round(value * aspectRatio);
      valueObject = { height: newHeight, width: value };
    }
    editElementValues(valueObject, selectedElement.element_id);
    setElementValues((prevData) => ({ ...prevData, [identifier]: e.target.value }));
  }

  function toggleStyle(key) {
    editElementValues({ [key]: !selectedElement[key] }, selectedElement.element_id);
  }

  // Text formatting support is defined by the element category rather than
  // by keys already serialized on a particular document. Older templates and
  // generated elements may omit false/zero/default properties. Treating those
  // omissions as unsupported made valid bulk controls disappear. `lineHeight`
  // stays textarea-only because single-line `text` uses a fixed canvas line
  // box, while tracking and B/I/U are valid for both text-bearing categories.
  const TEXT_ELEMENT_CATEGORIES = new Set(["text", "textarea"]);
  const TEXT_STYLE_KEYS = new Set(["bold", "italic", "underline"]);
  const supportsBulkField = (key) => selectedElements.every((element) => (
    key === "lineHeight"
      ? element.category === "textarea"
      : (key === "letterSpacing" || TEXT_STYLE_KEYS.has(key))
        ? TEXT_ELEMENT_CATEGORIES.has(element.category)
        : Object.prototype.hasOwnProperty.call(element, key)
  ));
  const bulkValue = (key) => selectedElements[0]?.[key] ?? "";
  const isBulkValueMixed = (key) => selectedElements.some((element) => (
    element[key] !== selectedElements[0]?.[key]
  ));

  function handleBulkChangeValues(e, identifier) {
    const value = ["fontSize", "lineHeight", "letterSpacing", "borderWidth", "width", "height", "zIndex"].includes(identifier)
      ? Number(e.target.value)
      : e.target.value;
    editSelectedElementValues({ [identifier]: value });
    setElementValues((prevData) => ({ ...prevData, [identifier]: e.target.value }));
  }

  function toggleBulkStyle(key) {
    const allEnabled = selectedElements.every((element) => Boolean(element[key]));
    editSelectedElementValues({ [key]: !allEnabled });
  }

  function setBulkAlign(value) {
    editSelectedElementValues({ align: value });
  }

  function handleGroupMoveValueChange(e, axis) {
    const nextInputValue = e.target.value;
    setGroupMoveValues((previous) => ({ ...previous, [axis]: nextInputValue }));
    if (nextInputValue === "" || nextInputValue === "-") return;
    const nextOffset = Number(nextInputValue);
    if (!Number.isFinite(nextOffset)) return;
    const delta = nextOffset - groupMoveOffsetRef.current[axis];
    if (delta === 0) return;
    moveSelectedElements(axis === "x" ? delta : 0, axis === "y" ? delta : 0);
    groupMoveOffsetRef.current = { ...groupMoveOffsetRef.current, [axis]: nextOffset };
  }

  function insertSkillSeparatorAtCaret() {
    const el = document.getElementById(selectedElement.element_id);
    if (!el?.isContentEditable) return;

    // Read from the live edit surface — while editing, the DOM is authoritative
    // and React will not re-seed children from store updates.
    const serialized = serializeEditable(el);
    const selection = getSelectionOffsets(el);
    const edit = insertInlineSkillSeparator(
      serialized.content,
      serialized.runs,
      selection?.end ?? serialized.content.length,
    );
    if (!edit.changed) return;

    if (hasRuns(edit.runs)) {
      el.innerHTML = runsToHtml(edit.content, edit.runs);
    } else {
      el.textContent = edit.content;
    }
    setSelectionOffsets(el, edit.caret, edit.caret);
    // Let Textarea.commitEditable persist content/runs + remeasure height.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function toggleBulletList() {
    const turningOn = !selectedElement.bulletList;
    const content = selectedElement.content ?? "";
    const lines = content.split("\n");
    // When enabling bullets on a box that already has a blank paragraph,
    // treat lines above the first blank as intro/heading and only bullet the
    // listed points below — matches regular sections like "Języki" + items.
    const firstBlank = turningOn
      ? lines.findIndex((line) => line.trim() === "")
      : -1;
    const newContent = lines
      .map((line, index) => {
        if (!turningOn) return line.replace(BULLET_PREFIX_PATTERN, "");
        if (line.trim() === "") return line;
        if (firstBlank >= 0 && index < firstBlank) return line;
        return canonicalBulletLine(line);
      })
      .join("\n");
    editElementValues({ bulletList: turningOn, content: newContent }, selectedElement.element_id);
  }

  function setAlign(value) {
    editElementValues({ align: value }, selectedElement.element_id);
  }

  useEffect(() => {
    // The toolbar fields are editable drafts. Replacing the canvas selection
    // must synchronously reset the complete draft so values from the previous
    // element cannot be submitted to the newly selected element.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElementValues({
      element_id: selectedElement?.element_id,
      content: selectedElement?.content,
      color: selectedElement?.color,
      backgroundColor: selectedElement?.backgroundColor,
      fontSize: selectedElement?.fontSize,
      fontFamily: selectedElement?.fontFamily,
      lineHeight: selectedElement?.lineHeight,
      letterSpacing: selectedElement?.letterSpacing,
      left: selectedElement ? Math.round(selectedElement.left) : undefined,
      top: selectedElement ? Math.round(selectedElement.top) : undefined,
      width: selectedElement?.width,
      height: selectedElement?.height,
      borderWidth: selectedElement?.borderWidth,
      borderRadius: selectedElement?.borderRadius,
      filled: selectedElement?.filled,
      locked: selectedElement?.locked ?? false,
      category: selectedElement?.category,
      zIndex: selectedElement?.zIndex,
    });
  }, [someElementSelected, selectedElement]);

  useEffect(() => {
    // Group deltas are relative to the current selection; carrying them into
    // a different selection would move newly selected elements unexpectedly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroupMoveValues({ x: "0", y: "0" });
    groupMoveOffsetRef.current = { x: 0, y: 0 };
  }, [selectionKey]);

  // Track the live contentEditable selection so inline marks can be edited from
  // this panel. Collapsed carets clear the row; leaving edit mode clears it too.
  useEffect(() => {
    const editing = Boolean(selectedElement?.isEditing)
      && (selectedElement?.category === "text" || selectedElement?.category === "textarea")
      && !isMultiSelection;
    if (!editing) {
      // The browser selection no longer belongs to an editable canvas node,
      // so the contextual formatting toolbar must disappear immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInlineSelection(null);
      return undefined;
    }
    const elementId = selectedElement.element_id;
    const baseColor = selectedElement.color;

    function updateInlineSelection() {
      const node = document.getElementById(elementId);
      if (!node || typeof window === "undefined") {
        setInlineSelection(null);
        return;
      }
      const offsets = getSelectionOffsets(node);
      if (!offsets || offsets.start === offsets.end) {
        setInlineSelection(null);
        return;
      }
      const { content, runs } = serializeEditable(node);
      setInlineSelection({
        start: offsets.start,
        end: offsets.end,
        bold: rangeHasMark(content, runs, offsets.start, offsets.end, "bold"),
        italic: rangeHasMark(content, runs, offsets.start, offsets.end, "italic"),
        underline: rangeHasMark(content, runs, offsets.start, offsets.end, "underline"),
        color: toColorInputValue(
          rangeColor(content, runs, offsets.start, offsets.end),
          baseColor,
        ),
      });
    }

    const node = document.getElementById(elementId);
    let animationFrame = null;
    // Browser selection settles after the pointer/key event that created it.
    // Scheduling one frame later prevents a transient collapsed range from
    // hiding the toolbar before the final selected range is available.
    function scheduleInlineSelectionUpdate() {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateInlineSelection();
      });
    }

    document.addEventListener("selectionchange", scheduleInlineSelectionUpdate);
    node?.addEventListener("pointerup", scheduleInlineSelectionUpdate);
    node?.addEventListener("keyup", scheduleInlineSelectionUpdate);
    scheduleInlineSelectionUpdate();
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("selectionchange", scheduleInlineSelectionUpdate);
      node?.removeEventListener("pointerup", scheduleInlineSelectionUpdate);
      node?.removeEventListener("keyup", scheduleInlineSelectionUpdate);
    };
  }, [
    isMultiSelection,
    selectedElement?.category,
    selectedElement?.color,
    selectedElement?.element_id,
    selectedElement?.isEditing,
  ]);

  function applyInlineMark(mark, value) {
    if (!selectedElement?.isEditing) return;
    const node = document.getElementById(selectedElement.element_id);
    if (!node) return;
    // Re-read the DOM at apply time so concurrent typing is never lost.
    const { content, runs } = serializeEditable(node);
    const offsets = getSelectionOffsets(node);
    if (!offsets || offsets.start === offsets.end) return;

    let nextValue = value;
    if (mark !== "color") {
      nextValue = !rangeHasMark(content, runs, offsets.start, offsets.end, mark);
    }
    const nextRuns = applyMark(content, runs, offsets.start, offsets.end, mark, nextValue);
    node.innerHTML = selectedElement.category === "textarea" && selectedElement.bulletList
      ? bulletRunsToEditableHtml(content, nextRuns)
      : runsToHtml(content, nextRuns);
    setSelectionOffsets(node, offsets.start, offsets.end);
    editElementValues({ content, runs: nextRuns }, selectedElement.element_id);
    // Textarea remasures height from its own input handler.
    node.dispatchEvent(new Event("input", { bubbles: true }));
    setInlineSelection({
      start: offsets.start,
      end: offsets.end,
      bold: rangeHasMark(content, nextRuns, offsets.start, offsets.end, "bold"),
      italic: rangeHasMark(content, nextRuns, offsets.start, offsets.end, "italic"),
      underline: rangeHasMark(content, nextRuns, offsets.start, offsets.end, "underline"),
      color: toColorInputValue(
        rangeColor(content, nextRuns, offsets.start, offsets.end),
        selectedElement.color,
      ),
    });
  }

  // CSS edit-zoom and scroll recentering can move glyphs without resizing them.
  // One RAF owner measures the live selection, skips hidden tabs, and publishes
  // only changed positions. Cleanup cancels measurement for detached selections.
  useLayoutEffect(() => {
    if (!someElementSelected) return undefined;
    let frame;
    let triggerOffsetY = 0;
    function updatePosition() {
      if (!document.hidden) {
        const anchor = readSelectionAnchorRect(selectionKey);
        const canvas = document.querySelector(".canvas-area");
        if (anchor && canvas) {
          const rect = canvas.getBoundingClientRect();
          const sidebar = document.querySelector('[data-anchor="editor-sidebar"]')?.getBoundingClientRect();
          const topbar = document.querySelector('[data-anchor="editor-topbar"]')?.getBoundingClientRect();
          // Some toolbar anchors have zero-size boxes; their actual buttons
          // provide the occupied screen bounds, including portalled record tools.
          const obstacles = [...document.querySelectorAll('[data-editor-control="true"] button')]
            .filter((button) => button.getClientRects().length > 0)
            .map((button) => button.getBoundingClientRect());
          const selectedNode = selectionKey.split("|").map((id) => document.getElementById(id)).find(Boolean);
          const controls = structuralToolbarScreenLayoutSize(readCanvasZoom(selectedNode));
          const next = { ...elementToolbarPosition(anchor, {
            left: Math.max(0, rect.left, sidebar?.right || 0),
            top: Math.max(0, rect.top, topbar?.bottom || 0),
            right: Math.min(window.innerWidth, rect.left + canvas.clientWidth),
            bottom: Math.min(window.innerHeight, rect.top + canvas.clientHeight),
          }, { obstacles, triggerOffsetY, triggerSize: controls.buttonSize }), controls };
          triggerOffsetY = next.triggerOffsetY;
          setPanelPosition((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        }
      }
      frame = requestAnimationFrame(updatePosition);
    }
    updatePosition();
    return () => cancelAnimationFrame(frame);
  }, [someElementSelected, selectionKey]);

  // Selection-formatting remains a separate, content-sized surface anchored
  // to the selected canvas text. It must not inherit or alter the measured
  // geometry of the element-settings panel.
  useLayoutEffect(() => {
    if (!inlineSelection) return undefined;

    function updatePosition() {
      const panel = selectionPanelRef.current;
      const anchor = readSelectionAnchorRect(selectionKey);
      if (!panel || !anchor) return;
      const next = computeFloatingPanelPosition(
        anchor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        { gap: 24, padding: 8 },
      );
      setSelectionPanelPosition((previous) => (
        previous.top === next.top && previous.left === next.left
          ? previous
          : { top: next.top, left: next.left }
      ));
    }

    updatePosition();
    const panel = selectionPanelRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined" && panel
      ? new ResizeObserver(updatePosition)
      : null;
    if (resizeObserver && panel) resizeObserver.observe(panel);
    const canvasArea = document.querySelector(".canvas-area");
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    canvasArea?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      canvasArea?.removeEventListener("scroll", updatePosition);
    };
  }, [
    inlineSelection,
    selectionKey,
    selectionGeometryKey,
    zoom,
    isTwoPageView,
    currentPage,
  ]);

  const cat = selectedElement?.category;
  const panelTitle = isMultiSelection
    ? uiText("editor:editor.editing", { value0: (polishElementCount(selectedElements.length)) })
    : uiText("editor:editor.editing", { value0: (CATEGORY_LABELS[cat] || "element") });
  const panelSubject = isMultiSelection
    ? polishElementCount(selectedElements.length)
    : (CATEGORY_PARAMETER_LABELS[cat] || "Element");

  const panel = (
    <AnimatePresence>
      {someElementSelected && (
        <InspectorDisclosure
          key={selectionKey}
          visible={someElementSelected}
          selectionKey={selectionKey}
          panelPosition={panelPosition}
          panelTitle={panelTitle}
          panelSubject={panelSubject}
          reduceMotion={reduceMotion}
        >
          <form className={classes.bar} onSubmit={(event) => event.preventDefault()}>
            {isMultiSelection ? (
              <BulkToolbar
                count={selectedElements.length}
                supportsField={supportsBulkField}
                valueForField={bulkValue}
                isValueMixed={isBulkValueMixed}
                onChangeValue={handleBulkChangeValues}
                onToggleStyle={toggleBulkStyle}
                onSetAlign={setBulkAlign}
                groupMoveValues={groupMoveValues}
                onGroupMoveValueChange={handleGroupMoveValueChange}
                allowGroupMove={bulkAllowGroupMove}
                allowLock={bulkAllowLock}
                allowCloneOrDelete={allowCloneOrDelete}
                onDuplicateSelected={duplicateSelectedElements}
                onDeleteSelected={deleteSelectedElements}
              />
            ) : (
              <>
                {(cat === "text" || cat === "textarea") && (
                  <>
                    <Group label={uiText("editor:editor.typography")}>
                      <FontField
                        value={elementValues.fontFamily}
                        onChange={(e) => handleChangeValues(e, "fontFamily")}
                      />
                      <NumField
                        label={uiText("editor:editor.fontSize")}
                        icon={<MdFormatSize />}
                        value={elementValues.fontSize}
                        onChange={(e) => handleChangeValues(e, "fontSize")}
                        width={34}
                      />
                      <ColorField
                        label={uiText("editor:editor.textColour")}
                        value={elementValues.color}
                        onChange={(e) => handleChangeValues(e, "color")}
                      />
                      <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
                    </Group>
                    {cat === "textarea" && (
                      <>
                        <Sep />
                        <Group label={uiText("editor:editor.paragraph")}>
                          <AlignToggles
                            selectedElement={selectedElement}
                            setAlign={setAlign}
                          />
                          <IconBtn
                            label={uiText("editor:editor.bulletedList")}
                            active={!!selectedElement?.bulletList}
                            onClick={toggleBulletList}
                          >
                            <MdFormatListBulleted />
                          </IconBtn>
                          {isSelectedInlineSkillsField && (
                            <IconBtn
                              label={uiText("editor:editor.insertADotBetweenSkills")}
                              disabled={!selectedElement?.isEditing}
                              attention={!!selectedElement?.isEditing}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={insertSkillSeparatorAtCaret}
                            >
                              <span className={classes.skillSeparatorGlyph} aria-hidden="true">·</span>
                            </IconBtn>
                          )}
                        </Group>
                        <Sep />
                        <Group label={uiText("editor:editor.spacingAndSize")}>
                          <NumField
                            label={uiText("editor:editor.lineSpacing")}
                            icon={<MdFormatLineSpacing />}
                            value={elementValues.lineHeight}
                            onChange={(e) => handleChangeValues(e, "lineHeight")}
                            width={34}
                          />
                          <NumField
                            label={uiText("editor:editor.letterSpacing")}
                            icon={<RxLetterSpacing />}
                            value={elementValues.letterSpacing}
                            onChange={(e) => handleChangeValues(e, "letterSpacing")}
                            width={32}
                            step={0.1}
                          />
                          {canEditElementSizeField(selectedElement, "width", editorMode) && (
                            <NumField
                              label={uiText("editor:editor.width")}
                              icon={<RxWidth />}
                              value={elementValues.width}
                              onChange={(e) => handleChangeValues(e, "width")}
                              width={36}
                            />
                          )}
                          {canEditElementSizeField(selectedElement, "height", editorMode) && (
                            <NumField
                              label={uiText("editor:editor.height")}
                              icon={<RxHeight />}
                              value={elementValues.height}
                              onChange={(e) => handleChangeValues(e, "height")}
                              width={36}
                            />
                          )}
                        </Group>
                      </>
                    )}
                  </>
                )}

                {cat === "line" && (
                  <Group label={uiText("editor:editor.line2")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label={uiText("editor:editor.thickness")} icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={32} />
                    )}
                    <ColorField label={uiText("editor:editor.colour")} value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
                  </Group>
                )}

                {cat === "rectangle" && (
                  <Group label={uiText("editor:editor.shape2")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label={uiText("editor:editor.height")} icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label={uiText("editor:editor.filledShape")}
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label={uiText("editor:editor.border")} icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <NumField
                      label={uiText("editor:editor.cornerRadius")}
                      icon={<MdFormatSize />}
                      value={elementValues.borderRadius ?? 0}
                      onChange={(e) => handleChangeValues(e, "borderRadius")}
                      width={32}
                    />
                    <ColorField
                      label={selectedElement.filled ? uiText("editor:editor.fillColour") : uiText("editor:editor.borderColour")}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {(cat === "circle" || cat === "ellipse") && (
                  <Group label={uiText("editor:editor.shape2")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label={uiText("editor:editor.height")} icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label={uiText("editor:editor.filledShape")}
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label={uiText("editor:editor.border")} icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <ColorField
                      label={selectedElement.filled ? uiText("editor:editor.fillColour") : uiText("editor:editor.borderColour")}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {cat === "polygon" && (
                  <Group label={uiText("editor:editor.polygon")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label={uiText("editor:editor.height")} icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label={uiText("editor:editor.filledShape")}
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label={uiText("editor:editor.border")} icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <ColorField
                      label={selectedElement.filled ? uiText("editor:editor.fillColour") : uiText("editor:editor.borderColour")}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {cat === "path" && (
                  <Group label={uiText("editor:editor.bZierCurve")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label={uiText("editor:editor.height")} icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <NumField label={uiText("editor:editor.lineThickness")} icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    <ColorField label={uiText("editor:editor.lineColour")} value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
                    <IconBtn
                      label="Preset: fala"
                      active={selectedElement.pathKind === "wave"}
                      onClick={() => editElementValues(
                        { pathKind: "wave", curves: pathCurvesForKind("wave") },
                        selectedElement.element_id,
                      )}
                    >
                      ~
                    </IconBtn>
                    <IconBtn
                      label={uiText("editor:editor.presetArc")}
                      active={selectedElement.pathKind === "arc"}
                      onClick={() => editElementValues(
                        { pathKind: "arc", curves: pathCurvesForKind("arc") },
                        selectedElement.element_id,
                      )}
                    >
                      ⌒
                    </IconBtn>
                    <IconBtn
                      label="Preset: ozdobnik"
                      active={selectedElement.pathKind === "flourish"}
                      onClick={() => editElementValues(
                        { pathKind: "flourish", curves: pathCurvesForKind("flourish") },
                        selectedElement.element_id,
                      )}
                    >
                      ∿
                    </IconBtn>
                  </Group>
                )}

                {cat === "image" && (
                  <Group label={uiText("editor:editor.image")}>
                    {canEditElementSizeField(selectedElement, "width", editorMode) ? (
                      <NumField label={uiText("editor:editor.width")} icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    ) : (
                      <p className={classes.fieldHelp}>{uiText("editor:editor.thisImageSSizeIsSetBy")}</p>
                    )}
                  </Group>
                )}

                {cat === "connector" && (
                  <Group label={uiText("editor:editor.connector2")}>
                    <NumField label={uiText("editor:editor.lineThickness")} icon={<RxWidth />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    <ColorField label={uiText("editor:editor.lineColour")} value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
                    <IconBtn label={uiText("editor:editor.arrowhead")} active={!!selectedElement?.arrow} onClick={() => toggleStyle("arrow")}>
                      <TbArrowBigRightLines />
                    </IconBtn>
                    {showLayerField && (
                      <NumField label={uiText("editor:editor.layer")} icon={<RxLayers />} value={elementValues.zIndex} onChange={(e) => handleChangeValues(e, "zIndex")} width={28} />
                    )}
                  </Group>
                )}

                {cat !== "connector" && showPositionGroup && (
                  <>
                    <Sep />
                    <Group label={uiText("editor:editor.position")}>
                      {showLockToggle && (
                        <IconBtn
                          label={selectedElement?.locked ? uiText("editor:editor.unlockPosition") : uiText("editor:editor.lockPosition")}
                          active={!!selectedElement?.locked}
                          onClick={() => toggleStyle("locked")}
                        >
                          {selectedElement?.locked ? <MdLock /> : <MdLockOpen />}
                        </IconBtn>
                      )}
                      {showPositionFields && (
                        <>
                          <IconBtn
                            label={uiText("editor:editor.alignElementToTheLeftEdgeOf")}
                            onClick={() => alignElement(selectedElement.element_id, "LEFT", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalLeft />
                          </IconBtn>
                          <IconBtn
                            label={uiText("editor:editor.centreElementOnThePage")}
                            onClick={() => alignElement(selectedElement.element_id, "CENTER", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalCenter />
                          </IconBtn>
                          <IconBtn
                            label={uiText("editor:editor.alignElementToTheRightEdgeOf")}
                            onClick={() => alignElement(selectedElement.element_id, "RIGHT", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalRight />
                          </IconBtn>
                          <NumField
                            label={uiText("editor:editor.fromLeftEdge")}
                            icon={<span className={classes.axis}>X</span>}
                            value={elementValues.left}
                            onChange={(e) => handleChangeValues(e, "left")}
                            width={34}
                          />
                          <NumField
                            label={uiText("editor:editor.fromTopEdge")}
                            icon={<span className={classes.axis}>Y</span>}
                            value={elementValues.top}
                            onChange={(e) => handleChangeValues(e, "top")}
                            width={34}
                          />
                        </>
                      )}
                      {showLayerField && (
                        <NumField
                          label={uiText("editor:editor.stackingOrder")}
                          icon={<RxLayers />}
                          value={elementValues.zIndex}
                          onChange={(e) => handleChangeValues(e, "zIndex")}
                          width={28}
                        />
                      )}
                    </Group>
                  </>
                )}

                {allowCloneOrDelete && cat !== "connector" && (
                  <>
                    <Sep />
                    <Group label={uiText("editor:editor.actions")}>
                      <IconBtn label={uiText("editor:editor.duplicate")} onClick={() => duplicateElement(selectedElement.element_id)}>
                        <RiFileCopyLine />
                      </IconBtn>
                      <IconBtn label={uiText("ai:aiAssistant.delete")} danger onClick={() => deleteElement(selectedElement.element_id)}>
                        <RiDeleteBin2Line />
                      </IconBtn>
                    </Group>
                  </>
                )}

                {allowCloneOrDelete && cat === "connector" && (
                  <>
                    <Sep />
                    <Group label={uiText("editor:editor.actions")}>
                      <IconBtn label={uiText("editor:editor.deleteConnector")} danger onClick={() => deleteElement(selectedElement.element_id)}>
                        <RiDeleteBin2Line />
                      </IconBtn>
                    </Group>
                  </>
                )}

              </>
            )}
          </form>
        </InspectorDisclosure>
      )}
    </AnimatePresence>
  );

  // Independent floating panel for inline text-selection formatting (B/I/U +
  // colour). Anchored to the selected element on canvas, not the topbar —
  // see the module docstring for why this stays a separate portal instead of
  // a row inside `panel` above.
  const selectionPanel = (
    <AnimatePresence>
      {inlineSelection ? (
        <Motion.aside
          ref={selectionPanelRef}
          className={`${classes.editor} ${classes.selectionEditor}`}
          role="toolbar"
          aria-label={uiText("editor:editor.selectionFormatting")}
          style={{ top: selectionPanelPosition.top, left: selectionPanelPosition.left }}
          initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
          // Keep the contentEditable selection alive while using the panel.
          onMouseDown={(event) => event.preventDefault()}
        >
          <form className={classes.bar} onSubmit={(event) => event.preventDefault()}>
            <Group label={uiText("editor:editor.selectionStyle")}>
              <IconBtn
                label={uiText("editor:editor.boldSelection")}
                active={inlineSelection.bold}
                onClick={() => applyInlineMark("bold")}
              >
                <span className={classes.glyphBold}>B</span>
              </IconBtn>
              <IconBtn
                label={uiText("editor:editor.italicSelection")}
                active={inlineSelection.italic}
                onClick={() => applyInlineMark("italic")}
              >
                <span className={classes.glyphItalic}>I</span>
              </IconBtn>
              <IconBtn
                label={uiText("editor:editor.underlineSelection")}
                active={inlineSelection.underline}
                onClick={() => applyInlineMark("underline")}
              >
                <span className={classes.glyphUnderline}>U</span>
              </IconBtn>
              <ColorField
                label={uiText("editor:editor.selectionColour")}
                value={inlineSelection.color}
                onChange={(event) => applyInlineMark("color", event.target.value)}
              />
            </Group>
          </form>
        </Motion.aside>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined" || scopedAi?.isOpen) return null;
  return createPortal(
    <>
      {panel}
      {selectionPanel}
    </>,
    document.body,
  );
}

function Group({ children, label }) {
  useTranslation();
  return (
    <div className={classes.group} role="group" aria-label={label}>
      <span className={classes.groupLabel}>{label}</span>
      <div className={classes.groupControls}>{children}</div>
    </div>
  );
}

function Sep() {
  useTranslation();
  return <span className={classes.sep} aria-hidden="true" />;
}

function IconBtn({
  label, children, onClick, active, attention, disabled, danger, onMouseDown,
}) {
  useTranslation();
  return (
    <button
      type="button"
      className={`${classes.iconBtn} ${active ? classes.iconBtnActive : ""} ${attention ? classes.iconBtnAttention : ""} ${danger ? classes.iconBtnDanger : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}

function NumField({
  label, icon, value, onChange, width = 40, disabled, step,
}) {
  useTranslation();
  const amount = Number(step) || 1;
  const inputId = useId();

  function nudge(direction) {
    const current = Number(value);
    const next = (Number.isFinite(current) ? current : 0) + direction * amount;
    const precision = String(amount).includes(".") ? String(amount).split(".")[1].length : 0;
    onChange({ target: { value: precision ? next.toFixed(precision) : String(next) } });
  }

  return (
    <div className={classes.field}>
      <label className={classes.fieldLabel} htmlFor={inputId}>
        {icon ? <span className={classes.numIcon} aria-hidden="true">{icon}</span> : null}
        <span>{label}</span>
      </label>
      <div className={classes.numField}>
        <button type="button" onClick={() => nudge(-1)} disabled={disabled} aria-label={`Zmniejsz: ${label}`}>
          <FiMinus />
        </button>
        <input
          id={inputId}
          type="number"
          aria-label={label}
          value={value ?? ""}
          onChange={onChange}
          disabled={disabled}
          step={step}
          style={{ width }}
        />
        <button type="button" onClick={() => nudge(1)} disabled={disabled} aria-label={uiText("editor:editor.increase", { value0: (label) })}>
          <FiPlus />
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  useTranslation();
  return (
    <label className={classes.field}>
      <span className={classes.fieldLabel}>{label}</span>
      <span className={classes.colorField} title={label}>
        <input type="color" aria-label={label} value={value || "#000000"} onChange={onChange} />
        <span>{value || "#000000"}</span>
      </span>
    </label>
  );
}

function FontField({ value, onChange }) {
  useTranslation();
  const selectFont = FONT_PREVIEW[value] || undefined;
  return (
    <label className={classes.field}>
      <span className={classes.fieldLabel}>{uiText("editor:editor.fontFamily")}</span>
      <select
        className={classes.fontSelect}
        aria-label={uiText("editor:editor.fontFamily")}
        value={value || "Inter"}
        onChange={onChange}
        style={selectFont ? { fontFamily: selectFont } : undefined}
      >
        {FONT_OPTIONS.map(({ value: fontValue, label }) => (
          <option key={fontValue} value={fontValue} style={{ fontFamily: FONT_PREVIEW[fontValue] }}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StyleToggles({ selectedElement, toggleStyle }) {
  useTranslation();
  return (
    <>
      <IconBtn label={uiText("editor:editor.bold")} active={!!selectedElement?.bold} onClick={() => toggleStyle("bold")}>
        <span className={classes.glyphBold}>B</span>
      </IconBtn>
      <IconBtn label={uiText("editor:editor.italic")} active={!!selectedElement?.italic} onClick={() => toggleStyle("italic")}>
        <span className={classes.glyphItalic}>I</span>
      </IconBtn>
      <IconBtn label={uiText("editor:editor.underline")} active={!!selectedElement?.underline} onClick={() => toggleStyle("underline")}>
        <span className={classes.glyphUnderline}>U</span>
      </IconBtn>
    </>
  );
}

function AlignToggles({ selectedElement, setAlign }) {
  useTranslation();
  const current = selectedElement?.align || "left";
  return (
    <>
      <IconBtn label={uiText("editor:editor.alignLeft")} active={current === "left"} onClick={() => setAlign("left")}>
        <CiTextAlignLeft />
      </IconBtn>
      <IconBtn label={uiText("editor:editor.centre")} active={current === "center"} onClick={() => setAlign("center")}>
        <CiTextAlignCenter />
      </IconBtn>
      <IconBtn label={uiText("editor:editor.alignRight")} active={current === "right"} onClick={() => setAlign("right")}>
        <CiTextAlignRight />
      </IconBtn>
      <IconBtn label={uiText("editor:editor.justify")} active={current === "justify"} onClick={() => setAlign("justify")}>
        <CiTextAlignJustify />
      </IconBtn>
    </>
  );
}

function BulkToolbar({
  count,
  supportsField,
  valueForField,
  isValueMixed,
  onChangeValue,
  onToggleStyle,
  onSetAlign,
  groupMoveValues,
  onGroupMoveValueChange,
  allowGroupMove = true,
  allowLock = true,
  allowCloneOrDelete = true,
  onDuplicateSelected,
  onDeleteSelected,
}) {
  useTranslation();
  const hasTextStyle = ["bold", "italic", "underline"].every(supportsField);
  const showBulkPosition = allowGroupMove || (allowLock && supportsField("locked"));
  return (
    <>
      <span className={classes.bulkBadge} title={uiText("editor:editor.selected", { value0: (count) })}>{count}</span>
      {(supportsField("fontSize") || supportsField("color") || supportsField("fontFamily")) && (
        <>
          <Sep />
          <Group label={uiText("editor:editor.selectionTypography")}>
            {supportsField("fontFamily") && (
              <FontField
                value={valueForField("fontFamily")}
                onChange={(e) => onChangeValue(e, "fontFamily")}
              />
            )}
            {supportsField("fontSize") && (
              <NumField
                label={uiText("editor:editor.fontSize")}
                icon={<MdFormatSize />}
                value={valueForField("fontSize")}
                onChange={(e) => onChangeValue(e, "fontSize")}
                width={34}
              />
            )}
            {supportsField("color") && (
              <ColorField
                label={uiText("editor:editor.textColour")}
                value={valueForField("color")}
                onChange={(e) => onChangeValue(e, "color")}
              />
            )}
          </Group>
        </>
      )}
      {(supportsField("lineHeight") || supportsField("letterSpacing")) && (
        <>
          <Sep />
          <Group label={uiText("editor:editor.selectionSpacing")}>
            {supportsField("lineHeight") && (
              <NumField
                label={uiText("editor:editor.lineSpacing")}
                icon={<MdFormatLineSpacing />}
                value={isValueMixed("lineHeight") ? "" : valueForField("lineHeight")}
                onChange={(e) => onChangeValue(e, "lineHeight")}
                width={34}
              />
            )}
            {supportsField("letterSpacing") && (
              <NumField
                label={uiText("editor:editor.letterSpacing")}
                icon={<RxLetterSpacing />}
                value={isValueMixed("letterSpacing") ? "" : valueForField("letterSpacing")}
                onChange={(e) => onChangeValue(e, "letterSpacing")}
                width={32}
                step={0.1}
              />
            )}
          </Group>
        </>
      )}
      {hasTextStyle && (
        <>
          <Sep />
          <Group label={uiText("editor:editor.selectedTextStyle")}>
            <IconBtn
              label={uiText("editor:editor.bold")}
              active={!isValueMixed("bold") && !!valueForField("bold")}
              onClick={() => onToggleStyle("bold")}
            >
              <span className={classes.glyphBold}>B</span>
            </IconBtn>
            <IconBtn
              label={uiText("editor:editor.italic")}
              active={!isValueMixed("italic") && !!valueForField("italic")}
              onClick={() => onToggleStyle("italic")}
            >
              <span className={classes.glyphItalic}>I</span>
            </IconBtn>
            <IconBtn
              label={uiText("editor:editor.underline")}
              active={!isValueMixed("underline") && !!valueForField("underline")}
              onClick={() => onToggleStyle("underline")}
            >
              <span className={classes.glyphUnderline}>U</span>
            </IconBtn>
            {supportsField("align") && (
              <>
                <IconBtn label={uiText("editor:editor.left")} active={!isValueMixed("align") && valueForField("align") === "left"} onClick={() => onSetAlign("left")}><CiTextAlignLeft /></IconBtn>
                <IconBtn label={uiText("editor:editor.centre2")} active={!isValueMixed("align") && valueForField("align") === "center"} onClick={() => onSetAlign("center")}><CiTextAlignCenter /></IconBtn>
                <IconBtn label={uiText("editor:editor.right")} active={!isValueMixed("align") && valueForField("align") === "right"} onClick={() => onSetAlign("right")}><CiTextAlignRight /></IconBtn>
                <IconBtn label={uiText("editor:editor.justify")} active={!isValueMixed("align") && valueForField("align") === "justify"} onClick={() => onSetAlign("justify")}><CiTextAlignJustify /></IconBtn>
              </>
            )}
          </Group>
        </>
      )}
      {showBulkPosition && (
        <>
          <Sep />
          <Group label={uiText("editor:editor.selectionPosition")}>
            {allowGroupMove && (
              <>
                <NumField
                  label={uiText("editor:editor.moveSideways")}
                  icon={<span className={classes.axis}>X</span>}
                  value={groupMoveValues.x}
                  onChange={(e) => onGroupMoveValueChange(e, "x")}
                  width={34}
                />
                <NumField
                  label={uiText("editor:editor.moveUpOrDown")}
                  icon={<span className={classes.axis}>Y</span>}
                  value={groupMoveValues.y}
                  onChange={(e) => onGroupMoveValueChange(e, "y")}
                  width={34}
                />
              </>
            )}
            {allowLock && supportsField("locked") && (
              <IconBtn
                label={uiText("editor:editor.lockSelectedPositions")}
                active={!isValueMixed("locked") && !!valueForField("locked")}
                onClick={() => onToggleStyle("locked")}
              >
                {!isValueMixed("locked") && valueForField("locked") ? <MdLock /> : <MdLockOpen />}
              </IconBtn>
            )}
          </Group>
        </>
      )}
      {allowCloneOrDelete && (
        <Group label={uiText("editor:editor.selectionActions")}>
          <>
            <IconBtn label={uiText("editor:editor.duplicateSelected", { value0: (count) })} onClick={onDuplicateSelected}>
              <RiFileCopyLine />
            </IconBtn>
            <IconBtn label={uiText("editor:editor.deleteSelected", { value0: (count) })} danger onClick={onDeleteSelected}>
              <RiDeleteBin2Line />
            </IconBtn>
          </>
        </Group>
      )}
    </>
  );
}
