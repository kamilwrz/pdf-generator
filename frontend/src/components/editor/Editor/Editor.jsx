/**
 * Compact horizontal floating toolbar above the current selection
 * (Enhancv-style form, CV STUDIO chrome). Icon-first controls; Text vs
 * TextArea keep different field sets. Positioned via selection DOM bboxes.
 *
 * In template (structural) mode the bar hides controls that cannot affect the
 * selection (layout-owned X/Y / align / lock, all width/height size fields)
 * and omits clone / delete — those actions use section/record canvas
 * affordances instead. Drag-resize handles are also suppressed in template mode.
 */
import classes from "./Editor.module.css";
import { useEffect, useLayoutEffect, useState, useRef, use } from "react";
import { createPortal } from "react-dom";
import { RiDeleteBin2Line, RiFileCopyLine } from "react-icons/ri";
import { CiTextAlignLeft, CiTextAlignCenter, CiTextAlignRight, CiTextAlignJustify } from "react-icons/ci";
import {
  MdAlignHorizontalCenter,
  MdAlignHorizontalLeft,
  MdAlignHorizontalRight,
  MdFormatListBulleted,
  MdEdit,
  MdLock,
  MdLockOpen,
  MdClose,
  MdFormatLineSpacing,
  MdFormatSize,
} from "react-icons/md";
import { RxLetterSpacing, RxWidth, RxHeight, RxLayers } from "react-icons/rx";
import { TbArrowBigRightLines } from "react-icons/tb";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  canCloneOrDeleteElements,
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

function canonicalBulletLine(line) {
  return `• ${line.replace(BULLET_PREFIX_PATTERN, "").trimStart()}`;
}

export default function Editor() {
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
    setTextareaEditing,
    moveSelectedElements,
    editorMode,
    zoom,
    isTwoPageView,
    currentPage,
  } = use(PdfContext);

  const selectedElements = A4_Elements.filter((element) => element.isSelected);
  const selectedElement = selectedElements[0];
  const someElementSelected = selectedElements.length > 0;
  const isMultiSelection = selectedElements.length > 1;
  const positionLocked = Boolean(
    selectedElement?.locked
    || (selectedElement && !canFreePositionElement(selectedElement, editorMode)),
  );
  // Hide no-op geometry / structure actions instead of showing disabled chrome.
  const showPositionFields = Boolean(
    selectedElement && canEditElementPosition(selectedElement, editorMode),
  );
  const showLockToggle = Boolean(
    selectedElement && canToggleElementLock(selectedElement, editorMode),
  );
  const allowCloneOrDelete = canCloneOrDeleteElements(editorMode);
  const showPositionGroup = showPositionFields || showLockToggle || Boolean(selectedElement);
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
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
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
    const value = ["fontSize", "height", "width", "lineHeight", "letterSpacing", "left", "top", "borderWidth", "zIndex"].includes(identifier)
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

  const supportsBulkField = (key) => selectedElements.every((element) => (
    Object.prototype.hasOwnProperty.call(element, key)
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
    if (!el || typeof el.selectionStart !== "number") return;
    const start = el.selectionStart;
    const value = el.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", start);
    const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
    if (line.trimStart().startsWith("•")) return;
    const leadingWhitespace = line.match(/^\s*/)[0].length;
    const newLine = canonicalBulletLine(line);
    const newValue = value.slice(0, lineStart) + newLine + value.slice(lineStart + line.length);
    editElementValues({ content: newValue }, selectedElement.element_id);
    const cursorPos = lineStart + 2 + Math.max(0, start - lineStart - leadingWhitespace);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function toggleBulletList() {
    const turningOn = !selectedElement.bulletList;
    const content = selectedElement.content ?? "";
    const newContent = content
      .split("\n")
      .map((line) => {
        if (turningOn) {
          if (line.trim() === "") return line;
          return canonicalBulletLine(line);
        }
        return line.replace(BULLET_PREFIX_PATTERN, "");
      })
      .join("\n");
    editElementValues({ bulletList: turningOn, content: newContent }, selectedElement.element_id);
  }

  function setAlign(value) {
    editElementValues({ align: value }, selectedElement.element_id);
  }

  function handleCloseEditor() {
    setA4_Elements((prevState) => prevState.map((element) => (
      element.isSelected
        ? { ...element, isSelected: false, isEditing: false }
        : element
    )));
  }

  useEffect(() => {
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
      filled: selectedElement?.filled,
      locked: selectedElement?.locked ?? false,
      category: selectedElement?.category,
      zIndex: selectedElement?.zIndex,
    });
  }, [someElementSelected, selectedElement]);

  useEffect(() => {
    setGroupMoveValues({ x: "0", y: "0" });
    groupMoveOffsetRef.current = { x: 0, y: 0 };
  }, [selectionKey]);

  useLayoutEffect(() => {
    if (!someElementSelected) return undefined;

    function readAnchorRect() {
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

    function updatePosition() {
      const panel = panelRef.current;
      const anchor = readAnchorRect();
      if (!panel || !anchor) return;
      const next = computeFloatingPanelPosition(
        anchor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        { gap: 14, padding: 8 },
      );
      setPanelPosition((previous) => (
        previous.top === next.top && previous.left === next.left
          ? previous
          : { top: next.top, left: next.left }
      ));
    }

    updatePosition();
    const panel = panelRef.current;
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
    someElementSelected,
    selectionKey,
    selectionGeometryKey,
    zoom,
    isTwoPageView,
    currentPage,
  ]);

  const cat = selectedElement?.category;

  const panel = (
    <AnimatePresence>
      {someElementSelected && (
        <motion.aside
          ref={panelRef}
          className={classes.editor}
          role="toolbar"
          aria-label="Właściwości elementu"
          style={{ top: panelPosition.top, left: panelPosition.left }}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
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
                onClose={handleCloseEditor}
              />
            ) : (
              <>
                {(cat === "text" || cat === "textarea") && (
                  <>
                    <Group label="Treść">
                      <IconBtn
                        label="Edytuj tekst"
                        onClick={() => setTextareaEditing(selectedElement.element_id, true)}
                      >
                        <MdEdit />
                      </IconBtn>
                    </Group>
                    <Sep />
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
                            label="Wysokość linii"
                            icon={<MdFormatLineSpacing />}
                            value={elementValues.lineHeight}
                            onChange={(e) => handleChangeValues(e, "lineHeight")}
                            width={34}
                          />
                          <NumField
                            label="Odstęp między literami"
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
                    <NumField label="Obramowanie" icon={<MdFormatSize />} value={elementValues.borderWidth} onChange={(e) => handleChangeValues(e, "borderWidth")} width={32} />
                    <ColorField label="Kolor obramowania" value={elementValues.backgroundColor} onChange={(e) => handleChangeValues(e, "backgroundColor")} />
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
                    <NumField label="Warstwa" icon={<RxLayers />} value={elementValues.zIndex} onChange={(e) => handleChangeValues(e, "zIndex")} width={28} />
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
                            label="X (px)"
                            icon={<span className={classes.axis}>X</span>}
                            value={elementValues.left}
                            onChange={(e) => handleChangeValues(e, "left")}
                            width={34}
                          />
                          <NumField
                            label="Y (px)"
                            icon={<span className={classes.axis}>Y</span>}
                            value={elementValues.top}
                            onChange={(e) => handleChangeValues(e, "top")}
                            width={34}
                          />
                        </>
                      )}
                      <NumField
                        label="Warstwa"
                        icon={<RxLayers />}
                        value={elementValues.zIndex}
                        onChange={(e) => handleChangeValues(e, "zIndex")}
                        width={28}
                      />
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

                <Sep />
                <IconBtn label="Zamknij" onClick={handleCloseEditor}>
                  <MdClose />
                </IconBtn>
              </>
            )}
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.body);
}

function Group({ children, label }) {
  return (
    <div className={classes.group} role="group" aria-label={label}>
      {children}
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
  return (
    <label className={classes.numField} title={label}>
      {icon ? <span className={classes.numIcon} aria-hidden="true">{icon}</span> : null}
      <input
        type="number"
        aria-label={label}
        value={value ?? ""}
        onChange={onChange}
        disabled={disabled}
        step={step}
        style={{ width }}
      />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className={classes.colorField} title={label}>
      <input type="color" aria-label={label} value={value || "#000000"} onChange={onChange} />
    </label>
  );
}

function FontField({ value, onChange }) {
  const selectFont = FONT_PREVIEW[value] || undefined;
  return (
    <select
      className={classes.fontSelect}
      aria-label="Rodzina czcionki"
      title="Rodzina czcionki"
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
  onClose,
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
                  label="Przesuń grupę X"
                  icon={<span className={classes.axis}>X</span>}
                  value={groupMoveValues.x}
                  onChange={(e) => onGroupMoveValueChange(e, "x")}
                  width={34}
                />
                <NumField
                  label="Przesuń grupę Y"
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
        <IconBtn label="Zamknij" onClick={onClose}>
          <MdClose />
        </IconBtn>
      </Group>
    </>
  );
}
