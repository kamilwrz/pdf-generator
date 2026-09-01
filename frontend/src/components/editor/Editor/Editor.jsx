/**
 * Element-properties panel (CV STUDIO chrome). Text vs TextArea keep different
 * field sets. The inspector occupies the quiet top-left workspace between the
 * tool rail and the A4 sheet: its top follows the live topbar, its bottom
 * follows the divider above “Moje dokumenty”, and its width stays at the
 * compact 308px footprint for canvas zoom up to 200%. Above 200% it may narrow
 * to keep a 15px breathing space before the enlarged page. It mounts/unmounts
 * with a short directional transition and becomes an overlay drawer when the
 * viewport is too narrow for usable controls.
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
import { useEffect, useLayoutEffect, useState, useRef } from "react";
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
} from "react-icons/md";
import { RxLetterSpacing, RxWidth, RxHeight, RxLayers } from "react-icons/rx";
import { TbArrowBigRightLines } from "react-icons/tb";
import { FiMinus, FiPlus } from "react-icons/fi";

import { useCanvasContext } from "../../../store/canvas-context";
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
import { resolveEditorInspectorWidth } from "../../../utils/editorInspectorWidth";
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
  normalizeRuns,
  rangeColor,
  rangeHasMark,
  runsToPerChar,
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
const PANEL_A4_GAP_PX = 15;
const PANEL_MIN_WIDTH_PX = 120;
const PANEL_VIEWPORT_GUTTER_PX = 8;

const CATEGORY_LABELS = {
  text: "tekst",
  textarea: "pole tekstowe",
  image: "zdjęcie",
  line: "linię",
  rectangle: "prostokąt",
  circle: "koło",
  ellipse: "elipsę",
  polygon: "kształt",
  path: "ozdobną linię",
  connector: "łącznik",
};

function polishElementCount(count) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} elementy`;
  return `${count} elementów`;
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
  const rects = ids
    .map((id) => document.getElementById(id)?.getBoundingClientRect())
    .filter(Boolean)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }));
  return unionRects(rects);
}

export default function Editor() {
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
    setA4_Elements,
    requestEditZoomRestore,
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
  const panelRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 0,
    width: PANEL_MIN_WIDTH_PX,
    height: 320,
  });
  // Non-collapsed caret range inside the editing text node. Selection marks
  // (B/I/U/colour) render in their own floating panel, anchored to the
  // selected element on canvas — independent of the topbar-docked panel
  // above, with its own mount/unmount animation.
  const [inlineSelection, setInlineSelection] = useState(null);
  const selectionPanelRef = useRef(null);
  const [selectionPanelPosition, setSelectionPanelPosition] = useState({ top: 0, left: 0 });
  const selectionKey = selectedElements.map((element) => element.element_id).join("|");
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

  function insertBulletAtCurrentLine() {
    const el = document.getElementById(selectedElement.element_id);
    if (!el?.isContentEditable) return;

    // Read from the live edit surface — while editing, the DOM is authoritative
    // and React will not re-seed children from store updates.
    const serialized = serializeEditable(el);
    const content = serialized.content;
    const selection = getSelectionOffsets(el);
    const caret = selection?.start ?? content.length;
    const lineStart = content.lastIndexOf("\n", caret - 1) + 1;
    const lineEndIdx = content.indexOf("\n", caret);
    const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
    const line = content.slice(lineStart, lineEnd);
    if (line.trimStart().startsWith("•")) return;

    // Locate the body start after any existing bullet prefix / leading spaces
    // so inline runs stay aligned when "• " is prepended.
    const withoutBullet = line.replace(BULLET_PREFIX_PATTERN, "");
    const leadWs = (withoutBullet.match(/^\s*/) || [""])[0].length;
    const bodyStart = lineStart + (line.length - withoutBullet.length) + leadWs;
    const newLine = canonicalBulletLine(line);
    const newContent = content.slice(0, lineStart) + newLine + content.slice(lineEnd);

    // Rebuild runs: bullet marker is unstyled; body keeps its previous marks.
    const perChar = runsToPerChar(content, serialized.runs);
    const nextPerChar = [
      ...perChar.slice(0, lineStart),
      null,
      null,
      ...perChar.slice(bodyStart, lineEnd),
      ...perChar.slice(lineEnd),
    ];
    const rawRuns = [];
    for (let i = 0; i < nextPerChar.length; i += 1) {
      const marks = nextPerChar[i];
      if (!marks) continue;
      rawRuns.push({ start: i, end: i + 1, ...marks });
    }
    const nextRuns = normalizeRuns(newContent, rawRuns);

    if (selectedElement.bulletList) {
      el.innerHTML = bulletRunsToEditableHtml(newContent, nextRuns);
    } else if (hasRuns(nextRuns)) {
      el.innerHTML = runsToHtml(newContent, nextRuns);
    } else {
      el.textContent = newContent;
    }
    const cursorPos = lineStart + 2 + Math.max(0, caret - bodyStart);
    setSelectionOffsets(el, cursorPos, cursorPos);
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

  function handleCloseEditor() {
    // Closing the properties panel is an explicit end-edit action. Unlike a
    // toolbar interaction, it should return the temporary 200% text-edit zoom.
    requestEditZoomRestore();
    setA4_Elements((prevState) => prevState.map((element) => (
      element.isSelected
        ? { ...element, isSelected: false, isEditing: false }
        : element
    )));
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

  // The inspector is part of the workspace grid, not a tooltip. Read live DOM
  // geometry because text editing animates the page to 200% and recentres its
  // scroll position. At 200% and below the inspector deliberately keeps the
  // compact width shown in the reference UI; only a larger zoom may narrow it
  // against the A4 edge. Resize/transition/scroll listeners still keep that
  // high-zoom collision boundary current.
  useLayoutEffect(() => {
    if (!someElementSelected) return undefined;

    function updatePosition() {
      const sidebar = document.querySelector('[data-anchor="editor-sidebar"]');
      const topbar = document.querySelector('[data-anchor="editor-topbar"]');
      const documentsDivider = document.querySelector('[data-anchor="sidebar-documents-divider"]');
      const canvasArea = document.querySelector(".canvas-area");
      const visiblePage = document.querySelector(`[data-page-canvas="${currentPage}"]`)
        || document.querySelector("[data-page-canvas]");
      if (!sidebar || !topbar || !documentsDivider || !canvasArea || !visiblePage) return;

      const sidebarRect = sidebar.getBoundingClientRect();
      const topbarRect = topbar.getBoundingClientRect();
      const dividerRect = documentsDivider.getBoundingClientRect();
      const canvasRect = canvasArea.getBoundingClientRect();
      const pageRect = visiblePage.getBoundingClientRect();
      const left = Math.round(sidebarRect.right);
      const top = Math.round(topbarRect.bottom);
      const exactDockWidth = Math.floor(pageRect.left - PANEL_A4_GAP_PX - left);
      const availableWidth = Math.max(0, Math.floor(canvasRect.right - left - PANEL_VIEWPORT_GUTTER_PX));
      const width = resolveEditorInspectorWidth({
        zoom,
        exactDockWidth,
        availableWidth,
        minimumWidth: PANEL_MIN_WIDTH_PX,
      });
      const exactDockHeight = Math.floor(dividerRect.top - top);
      // Template/demo rails contain far fewer tools, so their documents rule
      // can sit directly under the topbar. In that state the freeform-sized
      // dock does not exist; use a viewport-contained drawer instead of
      // crushing the form to a few pixels. A full freeform rail keeps the
      // exact divider height requested by the workspace grid.
      const height = exactDockHeight >= 280
        ? exactDockHeight
        : Math.min(460, Math.max(320, window.innerHeight - top - 16));
      setPanelPosition((previous) => (
        previous.top === top
          && previous.left === left
          && previous.width === width
          && previous.height === height
          ? previous
          : { top, left, width, height }
      ));
    }

    updatePosition();
    const observedNodes = [
      document.querySelector('[data-anchor="editor-sidebar"]'),
      document.querySelector('[data-anchor="editor-topbar"]'),
      document.querySelector('[data-anchor="sidebar-documents-divider"]'),
      document.querySelector(".canvas-area"),
      document.querySelector(`[data-page-canvas="${currentPage}"]`) || document.querySelector("[data-page-canvas]"),
    ].filter(Boolean);
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePosition)
      : null;
    observedNodes.forEach((node) => resizeObserver?.observe(node));
    const canvasArea = document.querySelector(".canvas-area");
    const page = document.querySelector(`[data-page-canvas="${currentPage}"]`) || document.querySelector("[data-page-canvas]");
    window.addEventListener("resize", updatePosition);
    canvasArea?.addEventListener("scroll", updatePosition, { passive: true });
    page?.addEventListener("transitionend", updatePosition);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      canvasArea?.removeEventListener("scroll", updatePosition);
      page?.removeEventListener("transitionend", updatePosition);
    };
  }, [someElementSelected, selectionKey, zoom, currentPage, isTwoPageView]);

  // Selection-formatting remains a separate, content-sized surface anchored
  // to the selected canvas text. It must not inherit or alter the measured
  // geometry of the top-left workspace inspector.
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
    ? `Edytujesz ${polishElementCount(selectedElements.length)}`
    : `Edytujesz ${CATEGORY_LABELS[cat] || "element"}`;

  const panel = (
    <AnimatePresence>
      {someElementSelected && (
        <Motion.aside
          ref={panelRef}
          className={classes.editor}
          aria-labelledby="element-inspector-title"
          style={panelPosition}
          initial={reduceMotion ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -18 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={classes.panelHeader}>
            <div>
              <span className={classes.eyebrow}>Ustawienia elementu</span>
              <h2 id="element-inspector-title">{panelTitle}</h2>
            </div>
            <IconBtn label="Zamknij panel edycji" onClick={handleCloseEditor}>
              <MdClose />
            </IconBtn>
          </div>
          <div className={classes.selectionTip}>
            <span className={classes.tipKeys}>Ctrl + lewy przycisk myszy</span>
            <span>zaznacza wiele elementów</span>
          </div>
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
                    <Group label="Typografia">
                      <FontField
                        value={elementValues.fontFamily}
                        onChange={(e) => handleChangeValues(e, "fontFamily")}
                      />
                      <NumField
                        label="Rozmiar czcionki"
                        icon={<MdFormatSize />}
                        value={elementValues.fontSize}
                        onChange={(e) => handleChangeValues(e, "fontSize")}
                        width={34}
                      />
                      <ColorField
                        label="Kolor tekstu"
                        value={elementValues.color}
                        onChange={(e) => handleChangeValues(e, "color")}
                      />
                      <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
                    </Group>
                    {cat === "textarea" && (
                      <>
                        <Sep />
                        <Group label="Akapit">
                          <AlignToggles
                            selectedElement={selectedElement}
                            setAlign={setAlign}
                          />
                          <IconBtn
                            label="Lista punktowana"
                            active={!!selectedElement?.bulletList}
                            onClick={toggleBulletList}
                          >
                            <MdFormatListBulleted />
                          </IconBtn>
                          <IconBtn
                            label="Wstaw punktor w bieżącej linii"
                            disabled={!selectedElement?.isEditing}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={insertBulletAtCurrentLine}
                          >
                            <span className={classes.insertBullet}>＋•</span>
                          </IconBtn>
                        </Group>
                        <Sep />
                        <Group label="Odstępy i rozmiar">
                          <NumField
                            label="Odstęp między wierszami"
                            icon={<MdFormatLineSpacing />}
                            value={elementValues.lineHeight}
                            onChange={(e) => handleChangeValues(e, "lineHeight")}
                            width={34}
                          />
                          <NumField
                            label="Odstęp między znakami"
                            icon={<RxLetterSpacing />}
                            value={elementValues.letterSpacing}
                            onChange={(e) => handleChangeValues(e, "letterSpacing")}
                            width={32}
                            step={0.1}
                          />
                          {canEditElementSizeField(selectedElement, "width", editorMode) && (
                            <NumField
                              label="Szerokość"
                              icon={<RxWidth />}
                              value={elementValues.width}
                              onChange={(e) => handleChangeValues(e, "width")}
                              width={36}
                            />
                          )}
                          {canEditElementSizeField(selectedElement, "height", editorMode) && (
                            <NumField
                              label="Wysokość"
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
                  <Group label="Linia">
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label="Grubość" icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={32} />
                    )}
                    <ColorField label="Kolor" value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
                  </Group>
                )}

                {cat === "rectangle" && (
                  <Group label="Kształt">
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label="Wysokość" icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label="Wypełniony kształt"
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label="Obramowanie" icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <NumField
                      label="Zaokrąglenie narożników"
                      icon={<MdFormatSize />}
                      value={elementValues.borderRadius ?? 0}
                      onChange={(e) => handleChangeValues(e, "borderRadius")}
                      width={32}
                    />
                    <ColorField
                      label={selectedElement.filled ? "Kolor wypełnienia" : "Kolor obramowania"}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {(cat === "circle" || cat === "ellipse") && (
                  <Group label="Kształt">
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label="Wysokość" icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label="Wypełniony kształt"
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label="Obramowanie" icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <ColorField
                      label={selectedElement.filled ? "Kolor wypełnienia" : "Kolor obramowania"}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {cat === "polygon" && (
                  <Group label="Wielokąt">
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label="Wysokość" icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <IconBtn
                      label="Wypełniony kształt"
                      active={!!selectedElement.filled}
                      onClick={() => toggleStyle("filled")}
                    >
                      ●
                    </IconBtn>
                    {!selectedElement.filled && (
                      <NumField label="Obramowanie" icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    )}
                    <ColorField
                      label={selectedElement.filled ? "Kolor wypełnienia" : "Kolor obramowania"}
                      value={elementValues.backgroundColor}
                      onChange={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                  </Group>
                )}

                {cat === "path" && (
                  <Group label="Krzywa Béziera">
                    {canEditElementSizeField(selectedElement, "width", editorMode) && (
                      <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                    )}
                    {canEditElementSizeField(selectedElement, "height", editorMode) && (
                      <NumField label="Wysokość" icon={<RxHeight />} value={elementValues.height} onChange={(e) => handleChangeValues(e, "height")} width={36} />
                    )}
                    <NumField label="Grubość linii" icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    <ColorField label="Kolor linii" value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
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
                      label="Preset: łuk"
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

                {cat === "image" && canEditElementSizeField(selectedElement, "width", editorMode) && (
                  <Group label="Obraz">
                    <NumField label="Szerokość" icon={<RxWidth />} value={elementValues.width} onChange={(e) => handleChangeValues(e, "width")} width={36} />
                  </Group>
                )}

                {cat === "connector" && (
                  <Group label="Łącznik">
                    <NumField label="Grubość linii" icon={<RxWidth />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    <ColorField label="Kolor linii" value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
                    <IconBtn label="Grot strzałki" active={!!selectedElement?.arrow} onClick={() => toggleStyle("arrow")}>
                      <TbArrowBigRightLines />
                    </IconBtn>
                    {showLayerField && (
                      <NumField label="Warstwa" icon={<RxLayers />} value={elementValues.zIndex} onChange={(e) => handleChangeValues(e, "zIndex")} width={28} />
                    )}
                  </Group>
                )}

                {cat !== "connector" && showPositionGroup && (
                  <>
                    <Sep />
                    <Group label="Pozycja">
                      {showLockToggle && (
                        <IconBtn
                          label={selectedElement?.locked ? "Odblokuj pozycję" : "Zablokuj pozycję"}
                          active={!!selectedElement?.locked}
                          onClick={() => toggleStyle("locked")}
                        >
                          {selectedElement?.locked ? <MdLock /> : <MdLockOpen />}
                        </IconBtn>
                      )}
                      {showPositionFields && (
                        <>
                          <IconBtn
                            label="Wyrównaj element do lewej krawędzi strony"
                            onClick={() => alignElement(selectedElement.element_id, "LEFT", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalLeft />
                          </IconBtn>
                          <IconBtn
                            label="Wyśrodkuj element na stronie"
                            onClick={() => alignElement(selectedElement.element_id, "CENTER", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalCenter />
                          </IconBtn>
                          <IconBtn
                            label="Wyrównaj element do prawej krawędzi strony"
                            onClick={() => alignElement(selectedElement.element_id, "RIGHT", selectedElement.width, selectedElement.category)}
                          >
                            <MdAlignHorizontalRight />
                          </IconBtn>
                          <NumField
                            label="Od lewej krawędzi"
                            icon={<span className={classes.axis}>X</span>}
                            value={elementValues.left}
                            onChange={(e) => handleChangeValues(e, "left")}
                            width={34}
                          />
                          <NumField
                            label="Od górnej krawędzi"
                            icon={<span className={classes.axis}>Y</span>}
                            value={elementValues.top}
                            onChange={(e) => handleChangeValues(e, "top")}
                            width={34}
                          />
                        </>
                      )}
                      {showLayerField && (
                        <NumField
                          label="Kolejność na stronie"
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
                    <Group label="Akcje">
                      <IconBtn label="Duplikuj" onClick={() => duplicateElement(selectedElement.element_id)}>
                        <RiFileCopyLine />
                      </IconBtn>
                      <IconBtn label="Usuń" danger onClick={() => deleteElement(selectedElement.element_id)}>
                        <RiDeleteBin2Line />
                      </IconBtn>
                    </Group>
                  </>
                )}

                {allowCloneOrDelete && cat === "connector" && (
                  <>
                    <Sep />
                    <Group label="Akcje">
                      <IconBtn label="Usuń łącznik" danger onClick={() => deleteElement(selectedElement.element_id)}>
                        <RiDeleteBin2Line />
                      </IconBtn>
                    </Group>
                  </>
                )}

              </>
            )}
          </form>
        </Motion.aside>
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
          aria-label="Formatowanie zaznaczenia"
          style={{ top: selectionPanelPosition.top, left: selectionPanelPosition.left }}
          initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}
          // Keep the contentEditable selection alive while using the panel.
          onMouseDown={(event) => event.preventDefault()}
        >
          <form className={classes.bar} onSubmit={(event) => event.preventDefault()}>
            <Group label="Styl zaznaczenia">
              <IconBtn
                label="Pogrubienie zaznaczenia"
                active={inlineSelection.bold}
                onClick={() => applyInlineMark("bold")}
              >
                <span className={classes.glyphBold}>B</span>
              </IconBtn>
              <IconBtn
                label="Kursywa zaznaczenia"
                active={inlineSelection.italic}
                onClick={() => applyInlineMark("italic")}
              >
                <span className={classes.glyphItalic}>I</span>
              </IconBtn>
              <IconBtn
                label="Podkreślenie zaznaczenia"
                active={inlineSelection.underline}
                onClick={() => applyInlineMark("underline")}
              >
                <span className={classes.glyphUnderline}>U</span>
              </IconBtn>
              <ColorField
                label="Kolor zaznaczenia"
                value={inlineSelection.color}
                onChange={(event) => applyInlineMark("color", event.target.value)}
              />
            </Group>
          </form>
        </Motion.aside>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {panel}
      {selectionPanel}
    </>,
    document.body,
  );
}

function Group({ children, label }) {
  return (
    <div className={classes.group} role="group" aria-label={label}>
      <span className={classes.groupLabel}>{label}</span>
      <div className={classes.groupControls}>{children}</div>
    </div>
  );
}

function Sep() {
  return <span className={classes.sep} aria-hidden="true" />;
}

function IconBtn({
  label, children, onClick, active, disabled, danger, onMouseDown,
}) {
  return (
    <button
      type="button"
      className={`${classes.iconBtn} ${active ? classes.iconBtnActive : ""} ${danger ? classes.iconBtnDanger : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
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
  const amount = Number(step) || 1;

  function nudge(direction) {
    const current = Number(value);
    const next = (Number.isFinite(current) ? current : 0) + direction * amount;
    const precision = String(amount).includes(".") ? String(amount).split(".")[1].length : 0;
    onChange({ target: { value: precision ? next.toFixed(precision) : String(next) } });
  }

  return (
    <div className={classes.field}>
      <label className={classes.fieldLabel}>
        {icon ? <span className={classes.numIcon} aria-hidden="true">{icon}</span> : null}
        <span>{label}</span>
      </label>
      <div className={classes.numField}>
        <button type="button" onClick={() => nudge(-1)} disabled={disabled} aria-label={`Zmniejsz: ${label}`}>
          <FiMinus />
        </button>
        <input
          type="number"
          aria-label={label}
          value={value ?? ""}
          onChange={onChange}
          disabled={disabled}
          step={step}
          style={{ width }}
        />
        <button type="button" onClick={() => nudge(1)} disabled={disabled} aria-label={`Zwiększ: ${label}`}>
          <FiPlus />
        </button>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
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
  const selectFont = FONT_PREVIEW[value] || undefined;
  return (
    <label className={classes.field}>
      <span className={classes.fieldLabel}>Krój pisma</span>
      <select
        className={classes.fontSelect}
        aria-label="Krój pisma"
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
  return (
    <>
      <IconBtn label="Pogrubienie" active={!!selectedElement?.bold} onClick={() => toggleStyle("bold")}>
        <span className={classes.glyphBold}>B</span>
      </IconBtn>
      <IconBtn label="Kursywa" active={!!selectedElement?.italic} onClick={() => toggleStyle("italic")}>
        <span className={classes.glyphItalic}>I</span>
      </IconBtn>
      <IconBtn label="Podkreślenie" active={!!selectedElement?.underline} onClick={() => toggleStyle("underline")}>
        <span className={classes.glyphUnderline}>U</span>
      </IconBtn>
    </>
  );
}

function AlignToggles({ selectedElement, setAlign }) {
  const current = selectedElement?.align || "left";
  return (
    <>
      <IconBtn label="Wyrównaj do lewej" active={current === "left"} onClick={() => setAlign("left")}>
        <CiTextAlignLeft />
      </IconBtn>
      <IconBtn label="Wyśrodkuj" active={current === "center"} onClick={() => setAlign("center")}>
        <CiTextAlignCenter />
      </IconBtn>
      <IconBtn label="Wyrównaj do prawej" active={current === "right"} onClick={() => setAlign("right")}>
        <CiTextAlignRight />
      </IconBtn>
      <IconBtn label="Wyjustuj" active={current === "justify"} onClick={() => setAlign("justify")}>
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
  const hasTextStyle = ["bold", "italic", "underline"].every(supportsField);
  const showBulkPosition = allowGroupMove || (allowLock && supportsField("locked"));
  return (
    <>
      <span className={classes.bulkBadge} title={`${count} zaznaczonych`}>{count}</span>
      {(supportsField("fontSize") || supportsField("color") || supportsField("fontFamily")) && (
        <>
          <Sep />
          <Group label="Typografia zaznaczenia">
            {supportsField("fontFamily") && (
              <FontField
                value={valueForField("fontFamily")}
                onChange={(e) => onChangeValue(e, "fontFamily")}
              />
            )}
            {supportsField("fontSize") && (
              <NumField
                label="Rozmiar czcionki"
                icon={<MdFormatSize />}
                value={valueForField("fontSize")}
                onChange={(e) => onChangeValue(e, "fontSize")}
                width={34}
              />
            )}
            {supportsField("color") && (
              <ColorField
                label="Kolor tekstu"
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
          <Group label="Odstępy zaznaczenia">
            {supportsField("lineHeight") && (
              <NumField
                label="Odstęp między wierszami"
                icon={<MdFormatLineSpacing />}
                value={isValueMixed("lineHeight") ? "" : valueForField("lineHeight")}
                onChange={(e) => onChangeValue(e, "lineHeight")}
                width={34}
              />
            )}
            {supportsField("letterSpacing") && (
              <NumField
                label="Odstęp między znakami"
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
          <Group label="Styl tekstu zaznaczenia">
            <IconBtn
              label="Pogrubienie"
              active={!isValueMixed("bold") && !!valueForField("bold")}
              onClick={() => onToggleStyle("bold")}
            >
              <span className={classes.glyphBold}>B</span>
            </IconBtn>
            <IconBtn
              label="Kursywa"
              active={!isValueMixed("italic") && !!valueForField("italic")}
              onClick={() => onToggleStyle("italic")}
            >
              <span className={classes.glyphItalic}>I</span>
            </IconBtn>
            <IconBtn
              label="Podkreślenie"
              active={!isValueMixed("underline") && !!valueForField("underline")}
              onClick={() => onToggleStyle("underline")}
            >
              <span className={classes.glyphUnderline}>U</span>
            </IconBtn>
            {supportsField("align") && (
              <>
                <IconBtn label="Do lewej" active={!isValueMixed("align") && valueForField("align") === "left"} onClick={() => onSetAlign("left")}><CiTextAlignLeft /></IconBtn>
                <IconBtn label="Środek" active={!isValueMixed("align") && valueForField("align") === "center"} onClick={() => onSetAlign("center")}><CiTextAlignCenter /></IconBtn>
                <IconBtn label="Do prawej" active={!isValueMixed("align") && valueForField("align") === "right"} onClick={() => onSetAlign("right")}><CiTextAlignRight /></IconBtn>
                <IconBtn label="Wyjustuj" active={!isValueMixed("align") && valueForField("align") === "justify"} onClick={() => onSetAlign("justify")}><CiTextAlignJustify /></IconBtn>
              </>
            )}
          </Group>
        </>
      )}
      {showBulkPosition && (
        <>
          <Sep />
          <Group label="Pozycja zaznaczenia">
            {allowGroupMove && (
              <>
                <NumField
                  label="Przesuń w bok"
                  icon={<span className={classes.axis}>X</span>}
                  value={groupMoveValues.x}
                  onChange={(e) => onGroupMoveValueChange(e, "x")}
                  width={34}
                />
                <NumField
                  label="Przesuń w górę lub w dół"
                  icon={<span className={classes.axis}>Y</span>}
                  value={groupMoveValues.y}
                  onChange={(e) => onGroupMoveValueChange(e, "y")}
                  width={34}
                />
              </>
            )}
            {allowLock && supportsField("locked") && (
              <IconBtn
                label="Zablokuj pozycję zaznaczonych"
                active={!isValueMixed("locked") && !!valueForField("locked")}
                onClick={() => onToggleStyle("locked")}
              >
                {!isValueMixed("locked") && valueForField("locked") ? <MdLock /> : <MdLockOpen />}
              </IconBtn>
            )}
          </Group>
        </>
      )}
      <Sep />
      <Group label="Akcje zaznaczenia">
        {allowCloneOrDelete && (
          <>
            <IconBtn label={`Duplikuj zaznaczone (${count})`} onClick={onDuplicateSelected}>
              <RiFileCopyLine />
            </IconBtn>
            <IconBtn label={`Usuń zaznaczone (${count})`} danger onClick={onDeleteSelected}>
              <RiDeleteBin2Line />
            </IconBtn>
          </>
        )}
      </Group>
    </>
  );
}
