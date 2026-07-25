import classes from "./Editor.module.css";
import { useEffect, useState, useRef } from "react";
import EditorControls from "../../common/EditorControls/EditorControls";
import CloseButton from "../../common/CloseButton/CloseButton";
import { RiDeleteBin2Line } from "react-icons/ri";
import { RiFileCopyLine } from "react-icons/ri";
import { CiTextAlignLeft } from "react-icons/ci";
import { CiTextAlignCenter } from "react-icons/ci";
import { CiTextAlignRight } from "react-icons/ci";
import { CiTextAlignJustify } from "react-icons/ci";
import { MdFormatListBulleted } from "react-icons/md";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_LABELS = {
    text: "Tekst",
    textarea: "Pole tekstowe",
    line: "Linia",
    rectangle: "Prostokąt",
    circle: "Koło",
    ellipse: "Elipsa",
    image: "Obraz",
    connector: "Łącznik",
};

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
        moveElementWithBelow,
        moveSelectedElements,
    } = use(PdfContext);

    const selectedElements = A4_Elements.filter(element => element.isSelected);
    const selectedElement = selectedElements[0];
    const someElementSelected = selectedElements.length > 0;
    const isMultiSelection = selectedElements.length > 1;

    const [elementValues, setElementValues] = useState({});
    const [groupMoveValues, setGroupMoveValues] = useState({ x: "0", y: "0" });
    const groupMoveOffsetRef = useRef({ x: 0, y: 0 });
    const selectionKey = selectedElements.map((element) => element.element_id).join("|");
    // When on, changing Y pushes every element below the selected one by the
    // same delta, making proportional vertical space for more elements.
    const [pushBelow, setPushBelow] = useState(false);

    function handleChangeValues(e, identifier) {

        if (selectedElement.locked && (identifier === "left" || identifier === "top")) return;
        const value = ["fontSize", "height", "width", "lineHeight", "letterSpacing", "left", "top", "borderWidth"].includes(identifier) ? Number(e.target.value) : e.target.value;
        let valueObject = { [identifier]: value }

        if ((identifier === "width" || identifier === "height") && selectedElement.category === "circle") {
            valueObject = { width: value, height: value };
        } else if (identifier === "width" && selectedElement.category === "image") {
            const image = document.getElementById(selectedElement.element_id);
            const aspectRatio = image.naturalHeight / image.naturalWidth;
            const newHeight = Math.round(value * aspectRatio);
            valueObject = { height: newHeight, width: value };
        }
        if (identifier === "top" && pushBelow) {
            // Skip empty input so clearing the field doesn't scatter the page.
            if (e.target.value !== "") moveElementWithBelow(selectedElement.element_id, value);
        } else {
            editElementValues(valueObject, selectedElement.element_id);
        }
        setElementValues(prevData => {
            return { ...prevData, [identifier]: e.target.value };
        });
    }

    function toggleStyle(key) {
        editElementValues({ [key]: !selectedElement[key] }, selectedElement.element_id);
    }

    const supportsBulkField = (key) => selectedElements.every((element) =>
        Object.prototype.hasOwnProperty.call(element, key)
    );

    const bulkValue = (key) => selectedElements[0]?.[key] ?? "";

    const isBulkValueMixed = (key) => selectedElements.some((element) =>
        element[key] !== selectedElements[0]?.[key]
    );

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

        // Keep partially entered values such as "-" editable. A movement is
        // applied as soon as the value represents a real numeric offset.
        if (nextInputValue === "" || nextInputValue === "-") return;
        const nextOffset = Number(nextInputValue);
        if (!Number.isFinite(nextOffset)) return;

        const delta = nextOffset - groupMoveOffsetRef.current[axis];
        if (delta === 0) return;

        moveSelectedElements(axis === "x" ? delta : 0, axis === "y" ? delta : 0);
        groupMoveOffsetRef.current = {
            ...groupMoveOffsetRef.current,
            [axis]: nextOffset,
        };
    }

    // Inserts a canonical "• " prefix at the current line. Canonicalizing
    // removes indentation that would otherwise make one bullet body start
    // farther right than the rest in the canvas or exported PDF.
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

    // Toggles canonical bullets for every non-empty line. A bullet's marker
    // and one following space are the only prefix allowed, ensuring a shared
    // text start in both rendering paths.
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
        setA4_Elements(prevState => {
            return prevState.map((element) => (
                element.isSelected
                    ? { ...element, isSelected: false, isEditing: false }
                    : element
            ));
        });
    }

    useEffect(() => {
        setElementValues(prevState => {
            return {
                ...prevState,
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
                zIndex: selectedElement?.zIndex
            };
        });
    }, [someElementSelected, selectedElement])

    // Relative group offsets describe movement from the moment this collection
    // was selected, so a different selection always starts at zero.
    useEffect(() => {
        setGroupMoveValues({ x: "0", y: "0" });
        groupMoveOffsetRef.current = { x: 0, y: 0 };
    }, [selectionKey]);

    return <AnimatePresence>{someElementSelected && <motion.aside className={classes.editor}
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}>

        <form className={classes.editorForm}>
            <div className={classes.editorHeading}>
                <div className={classes.headingLeft}>
                    <span className={`${classes.headingIcon} ${isMultiSelection ? classes.headingIconMulti : ""}`}>
                        {isMultiSelection ? selectedElements.length : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5FA777" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></svg>
                        )}
                    </span>
                    <p>{isMultiSelection ? `Zaznaczono: ${selectedElements.length}` : selectedElement?.category ? `Element: ${CATEGORY_LABELS[selectedElement.category] ?? selectedElement.category}` : "Właściwości elementu"}</p>
                </div>
                <CloseButton clickHandler={handleCloseEditor} right={10} top={7} />
            </div>
            {isMultiSelection ? (
                <BulkEditor
                    selectedElements={selectedElements}
                    supportsField={supportsBulkField}
                    valueForField={bulkValue}
                    isValueMixed={isBulkValueMixed}
                    onChangeValue={handleBulkChangeValues}
                    onToggleStyle={toggleBulkStyle}
                    onSetAlign={setBulkAlign}
                    groupMoveValues={groupMoveValues}
                    onGroupMoveValueChange={handleGroupMoveValueChange}
                    onDuplicateSelected={duplicateSelectedElements}
                    onDeleteSelected={deleteSelectedElements}
                />
            ) : <>
            {selectedElement?.category === "text" && <>

                <EditorControls labelText="Treść tekstu" type="text" inputValue={elementValues.content} onChangeFn={(e) => handleChangeValues(e, "content")} />
                <div className={classes.elementSize}>
                    <EditorControls labelText="Rozmiar czcionki" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                    <EditorControls labelText="Kolor tekstu" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                </div>
                <EditorControls labelText="Rodzina czcionki" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
                <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
            </>}
            {selectedElement?.category === "textarea" && <>

                <button type="button" className={classes.editTextBtn} onClick={() => setTextareaEditing(selectedElement.element_id, true)}>Edytuj tekst</button>
                {/* Always mounted (never conditionally removed from the tree): if this
                    were `isEditing && <button>`, clicking a LATER sibling (e.g. the
                    hanging-indent checkbox below) blurs the textarea first, which flips
                    isEditing and removes this button in the same click — shifting every
                    sibling after it by one position and breaking that click's own
                    onChange under React's positional reconciliation. Disabling instead
                    of unmounting keeps sibling positions stable. */}
                <button
                    type="button"
                    className={classes.editTextBtn}
                    disabled={!selectedElement?.isEditing}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={insertBulletAtCurrentLine}
                ><MdFormatListBulleted />Wstaw punktor</button>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Rozmiar czcionki" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                    <EditorControls labelText="Kolor tekstu" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                </div>
                <EditorControls labelText="Rodzina czcionki" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
                <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
                <AlignToggles selectedElement={selectedElement} setAlign={setAlign} />
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={!!selectedElement?.bulletList} onChange={toggleBulletList} />
                    <span>Lista punktowana (• w każdej linii)</span>
                </label>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Wysokość linii" type="number" inputValue={elementValues.lineHeight} onChangeFn={(e) => handleChangeValues(e, "lineHeight")} />
                    <EditorControls labelText="Odstęp między literami" type="number" inputValue={elementValues.letterSpacing} onChangeFn={(e) => handleChangeValues(e, "letterSpacing")} />
                </div>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Szerokość" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                    <EditorControls
                        labelText={selectedElement.autoHeight ? "Wysokość (automatyczna)" : "Wysokość"}
                        type="number"
                        inputValue={elementValues.height}
                        onChangeFn={(e) => handleChangeValues(e, "height")}
                        isDisabled={!!selectedElement.autoHeight}
                    />
                </div>
            </>}
            {selectedElement?.category === "line" && <>
                <div className={classes.elementSize}>
                <EditorControls labelText="Wysokość" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                <EditorControls labelText="Szerokość" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                </div>
                <EditorControls labelText="Kolor tła" type="color" inputValue={elementValues.backgroundColor} onChangeFn={(e) => handleChangeValues(e, "backgroundColor")} />
            </>}
            {selectedElement?.category === "rectangle" && <>
                <div className={classes.elementSize}>
                <EditorControls labelText="Szerokość" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                <EditorControls labelText="Wysokość" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                </div>
                <div className={classes.elementSize}>
                <EditorControls labelText="Szerokość obramowania" type="number" inputValue={elementValues.borderWidth} onChangeFn={(e) => handleChangeValues(e, "borderWidth")} />
                <EditorControls labelText="Kolor obramowania" type="color" inputValue={elementValues.backgroundColor} onChangeFn={(e) => handleChangeValues(e, "backgroundColor")} />
                </div>
            </>}
            {(selectedElement?.category === "circle" || selectedElement?.category === "ellipse") && <>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Szerokość" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                    <EditorControls labelText="Wysokość" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                </div>
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={!!selectedElement.filled} onChange={() => toggleStyle("filled")} />
                    <span>Wypełniony kształt</span>
                </label>
                <div className={classes.elementSize}>
                    {!selectedElement.filled && (
                        <EditorControls labelText="Szerokość obramowania" type="number" inputValue={elementValues.borderWidth} onChangeFn={(e) => handleChangeValues(e, "borderWidth")} />
                    )}
                    <EditorControls
                        labelText={selectedElement.filled ? "Kolor wypełnienia" : "Kolor obramowania"}
                        type="color"
                        inputValue={elementValues.backgroundColor}
                        onChangeFn={(e) => handleChangeValues(e, "backgroundColor")}
                    />
                </div>
            </>}

            {selectedElement?.category === "image" && <>

                <div className={classes.elementSize}>
                    <EditorControls labelText="Wysokość" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} isDisabled />
                    <EditorControls labelText="Szerokość" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                </div>

            </>}

            {selectedElement?.category === "connector" && <>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Szerokość linii" type="number" inputValue={elementValues.borderWidth} onChangeFn={(e) => handleChangeValues(e, "borderWidth")} />
                    <EditorControls labelText="Kolor linii" type="color" inputValue={elementValues.backgroundColor} onChangeFn={(e) => handleChangeValues(e, "backgroundColor")} />
                </div>
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={!!selectedElement?.arrow} onChange={() => toggleStyle("arrow")} />
                    <span>Grot strzałki u celu</span>
                </label>
                <EditorControls labelText="Widoczność" type="number" inputValue={elementValues.zIndex} onChangeFn={(e) => handleChangeValues(e, "zIndex")} />
                <button type="button" className={classes.btnDelete} onClick={() => deleteElement(selectedElement.element_id)}>Usuń łącznik<RiDeleteBin2Line /></button>
            </>}

            <label className={classes.pushToggle}>
                <input type="checkbox" checked={!!selectedElement?.locked} onChange={() => toggleStyle("locked")} />
                <span>Zablokuj pozycję elementu</span>
            </label>
            {selectedElement?.category !== "connector" && <>
                <EditorControls labelText="Widoczność" type="number" inputValue={elementValues.zIndex} onChangeFn={(e) => handleChangeValues(e, "zIndex")} />

                <div className={classes.positionBtnsWrapper}>
                    <button type="button" disabled={!!selectedElement.locked} onClick={() => alignElement(selectedElement.element_id, "LEFT", selectedElement.width, selectedElement.category)}><CiTextAlignLeft /></button>
                    <button type="button" disabled={!!selectedElement.locked} onClick={() => alignElement(selectedElement.element_id, "CENTER", selectedElement.width, selectedElement.category)}><CiTextAlignCenter /></button>
                    <button type="button" disabled={!!selectedElement.locked} onClick={() => alignElement(selectedElement.element_id, "RIGHT", selectedElement.width, selectedElement.category)}><CiTextAlignRight /></button>
                </div>
                <div className={classes.elementSize}>
                    <EditorControls labelText="X (px)" type="number" inputValue={elementValues.left} onChangeFn={(e) => handleChangeValues(e, "left")} isDisabled={!!selectedElement.locked} />
                    <EditorControls labelText="Y (px)" type="number" inputValue={elementValues.top} onChangeFn={(e) => handleChangeValues(e, "top")} isDisabled={!!selectedElement.locked} />
                </div>
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={pushBelow} disabled={!!selectedElement.locked} onChange={(e) => setPushBelow(e.target.checked)} />
                    <span>Przesuwaj elementy poniżej przy zmianie Y</span>
                </label>
                <button type="button" className={classes.btnDuplicate} onClick={() => duplicateElement(selectedElement.element_id)}>Duplikuj element<RiFileCopyLine /></button>
                <button type="button" className={classes.btnDelete} onClick={() => deleteElement(selectedElement.element_id)}>Usuń element<RiDeleteBin2Line /></button>

            </>}
            </>}
        </form>
    </motion.aside>}</AnimatePresence>
}

function BulkEditor({
    selectedElements,
    supportsField,
    valueForField,
    isValueMixed,
    onChangeValue,
    onToggleStyle,
    onSetAlign,
    groupMoveValues,
    onGroupMoveValueChange,
    onDuplicateSelected,
    onDeleteSelected,
}) {
    const hasTypography = supportsField("fontSize") || supportsField("color");
    const hasTextStyle = ["bold", "italic", "underline"].every(supportsField);
    const hasBorder = supportsField("borderWidth") || supportsField("backgroundColor");
    const canEditSize = ["width", "height"].every(supportsField)
        && !selectedElements.some((element) => element.category === "image");
    const editableFields = [
        "fontSize", "color", "fontFamily", "bold", "italic", "underline",
        "align", "lineHeight", "letterSpacing", "width", "height",
        "backgroundColor", "borderWidth", "filled", "locked", "zIndex",
    ];
    const hasMixedValues = editableFields
        .filter(supportsField)
        .some(isValueMixed);

    return (
        <div className={classes.bulkPanel}>
            <p className={classes.bulkDescription}>
                Zmiany w tym panelu zostaną zastosowane do wszystkich {selectedElements.length} zaznaczonych elementów.
            </p>
            {hasMixedValues && (
                <p className={classes.bulkHint}>
                    Część wartości jest różna — kolejna zmiana ujednolici ją w całym zaznaczeniu.
                </p>
            )}
            <div className={classes.groupMove}>
                <p className={classes.groupMoveTitle}>Przesuń całą grupę</p>
                <div className={classes.elementSize}>
                    <EditorControls
                        labelText="X o (px)"
                        type="number"
                        inputValue={groupMoveValues.x}
                        onChangeFn={(e) => onGroupMoveValueChange(e, "x")}
                    />
                    <EditorControls
                        labelText="Y o (px)"
                        type="number"
                        inputValue={groupMoveValues.y}
                        onChangeFn={(e) => onGroupMoveValueChange(e, "y")}
                    />
                </div>
            </div>
            {hasTypography && (
                <div className={classes.elementSize}>
                    {supportsField("fontSize") && (
                        <EditorControls
                            labelText="Rozmiar czcionki"
                            type="number"
                            inputValue={valueForField("fontSize")}
                            onChangeFn={(e) => onChangeValue(e, "fontSize")}
                        />
                    )}
                    {supportsField("color") && (
                        <EditorControls
                            labelText="Kolor tekstu"
                            type="color"
                            inputValue={valueForField("color")}
                            onChangeFn={(e) => onChangeValue(e, "color")}
                        />
                    )}
                </div>
            )}
            {supportsField("fontFamily") && (
                <EditorControls
                    labelText="Rodzina czcionki"
                    type="select"
                    inputValue={valueForField("fontFamily")}
                    onChangeFn={(e) => onChangeValue(e, "fontFamily")}
                    isSelect
                />
            )}
            {hasTextStyle && (
                <BulkStyleToggles
                    selectedElements={selectedElements}
                    onToggleStyle={onToggleStyle}
                />
            )}
            {supportsField("align") && (
                <BulkAlignToggles
                    value={isValueMixed("align") ? undefined : valueForField("align")}
                    onSetAlign={onSetAlign}
                />
            )}
            {(supportsField("lineHeight") || supportsField("letterSpacing")) && (
                <div className={classes.elementSize}>
                    {supportsField("lineHeight") && (
                        <EditorControls
                            labelText="Wysokość linii"
                            type="number"
                            inputValue={valueForField("lineHeight")}
                            onChangeFn={(e) => onChangeValue(e, "lineHeight")}
                        />
                    )}
                    {supportsField("letterSpacing") && (
                        <EditorControls
                            labelText="Odstęp między literami"
                            type="number"
                            inputValue={valueForField("letterSpacing")}
                            onChangeFn={(e) => onChangeValue(e, "letterSpacing")}
                        />
                    )}
                </div>
            )}
            {canEditSize && (
                <div className={classes.elementSize}>
                    <EditorControls
                        labelText="Szerokość"
                        type="number"
                        inputValue={valueForField("width")}
                        onChangeFn={(e) => onChangeValue(e, "width")}
                    />
                    <EditorControls
                        labelText="Wysokość"
                        type="number"
                        inputValue={valueForField("height")}
                        onChangeFn={(e) => onChangeValue(e, "height")}
                    />
                </div>
            )}
            {hasBorder && (
                <div className={classes.elementSize}>
                    {supportsField("borderWidth") && (
                        <EditorControls
                            labelText="Szerokość obramowania"
                            type="number"
                            inputValue={valueForField("borderWidth")}
                            onChangeFn={(e) => onChangeValue(e, "borderWidth")}
                        />
                    )}
                    {supportsField("backgroundColor") && (
                        <EditorControls
                            labelText="Kolor obramowania"
                            type="color"
                            inputValue={valueForField("backgroundColor")}
                            onChangeFn={(e) => onChangeValue(e, "backgroundColor")}
                        />
                    )}
                </div>
            )}
            {supportsField("filled") && (
                <label className={classes.pushToggle}>
                    <input
                        type="checkbox"
                        checked={!isValueMixed("filled") && !!valueForField("filled")}
                        onChange={() => onToggleStyle("filled")}
                    />
                    <span>Wypełnione kształty</span>
                </label>
            )}
            {supportsField("locked") && (
                <label className={classes.pushToggle}>
                    <input
                        type="checkbox"
                        checked={!isValueMixed("locked") && !!valueForField("locked")}
                        onChange={() => onToggleStyle("locked")}
                    />
                    <span>Zablokuj pozycję zaznaczonych</span>
                </label>
            )}
            {supportsField("zIndex") && (
                <EditorControls
                    labelText="Widoczność"
                    type="number"
                    inputValue={valueForField("zIndex")}
                    onChangeFn={(e) => onChangeValue(e, "zIndex")}
                />
            )}
            <button type="button" className={classes.btnDuplicate} onClick={onDuplicateSelected}>
                Duplikuj zaznaczone ({selectedElements.length})<RiFileCopyLine />
            </button>
            <button type="button" className={classes.btnDelete} onClick={onDeleteSelected}>
                Usuń zaznaczone ({selectedElements.length})<RiDeleteBin2Line />
            </button>
        </div>
    );
}

function BulkStyleToggles({ selectedElements, onToggleStyle }) {
    const isActive = (key) => selectedElements.every((element) => Boolean(element[key]));
    const btn = (key, label, content, style) => (
        <button
            type="button"
            className={isActive(key) ? classes.styleActive : ""}
            style={style}
            onClick={() => onToggleStyle(key)}
            aria-label={label}
        >{content}</button>
    );

    return (
        <div className={classes.styleRow}>
            {btn("bold", "Pogrubienie", "B", { fontWeight: 800 })}
            {btn("italic", "Kursywa", "I", { fontStyle: "italic" })}
            {btn("underline", "Podkreślenie", "U", { textDecoration: "underline" })}
        </div>
    );
}

function BulkAlignToggles({ value, onSetAlign }) {
    const btn = (alignment, Icon, label) => (
        <button
            type="button"
            className={value === alignment ? classes.styleActive : ""}
            onClick={() => onSetAlign(alignment)}
            aria-label={label}
        ><Icon /></button>
    );

    return (
        <div className={classes.styleRow}>
            {btn("left", CiTextAlignLeft, "Wyrównaj tekst do lewej")}
            {btn("center", CiTextAlignCenter, "Wyśrodkuj tekst")}
            {btn("right", CiTextAlignRight, "Wyrównaj tekst do prawej")}
            {btn("justify", CiTextAlignJustify, "Wyjustuj tekst")}
        </div>
    );
}

function AlignToggles({ selectedElement, setAlign }) {
    const current = selectedElement?.align || "left";
    const btn = (value, Icon, label) => (
        <button
            type="button"
            className={current === value ? classes.styleActive : ""}
            onClick={() => setAlign(value)}
            aria-label={label}
        ><Icon /></button>
    );
    return (
        <div className={classes.styleRow}>
            {btn("left", CiTextAlignLeft, "Wyrównaj do lewej")}
            {btn("center", CiTextAlignCenter, "Wyśrodkuj")}
            {btn("right", CiTextAlignRight, "Wyrównaj do prawej")}
            {btn("justify", CiTextAlignJustify, "Wyjustuj")}
        </div>
    );
}

function StyleToggles({ selectedElement, toggleStyle }) {
    return (
        <div className={classes.styleRow}>
            <button
                type="button"
                className={selectedElement?.bold ? classes.styleActive : ""}
                style={{ fontWeight: 800 }}
                onClick={() => toggleStyle("bold")}
                aria-label="Pogrubienie"
            >B</button>
            <button
                type="button"
                className={selectedElement?.italic ? classes.styleActive : ""}
                style={{ fontStyle: "italic" }}
                onClick={() => toggleStyle("italic")}
                aria-label="Kursywa"
            >I</button>
            <button
                type="button"
                className={selectedElement?.underline ? classes.styleActive : ""}
                style={{ textDecoration: "underline" }}
                onClick={() => toggleStyle("underline")}
                aria-label="Podkreślenie"
            >U</button>
        </div>
    );
}

