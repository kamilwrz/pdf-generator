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


export default function Editor() {

    const { A4_Elements, editElementValues, alignElement, deleteElement, duplicateElement, setA4_Elements, setTextareaEditing, moveElementWithBelow } = use(PdfContext);

    let selectedElement = A4_Elements.find(element => element.isSelected === true);
    const someElementSelected = A4_Elements.some(element => element.isSelected);

    const [elementValues, setElementValues] = useState({});
    // When on, changing Y pushes every element below the selected one by the
    // same delta, making proportional vertical space for more elements.
    const [pushBelow, setPushBelow] = useState(false);

    function handleChangeValues(e, identifier) {

        const value = ["fontSize", "height", "width", "lineHeight", "letterSpacing", "left", "top"].includes(identifier) ? Number(e.target.value) : e.target.value;
        let valueObject = { [identifier]: value }

        if (identifier === "width" && selectedElement.category === "image") {
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

    // Inserts "• " at the start of whichever line the cursor is currently on,
    // reading straight from the live <textarea> DOM node (same pattern as
    // handleAlignElements reading clientWidth). No-ops if that line already
    // has a bullet. Restores focus + cursor position afterwards so typing
    // can continue uninterrupted.
    function insertBulletAtCurrentLine() {
        const el = document.getElementById(selectedElement.element_id);
        if (!el || typeof el.selectionStart !== "number") return;

        const start = el.selectionStart;
        const value = el.value;
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = value.indexOf("\n", start);
        const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
        if (line.trimStart().startsWith("•")) return;

        const newValue = value.slice(0, lineStart) + "• " + value.slice(lineStart);
        editElementValues({ content: newValue }, selectedElement.element_id);

        const cursorPos = start + 2;
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(cursorPos, cursorPos);
        });
    }

    function setAlign(value) {
        editElementValues({ align: value }, selectedElement.element_id);
    }

    function handleCloseEditor(elementId) {
        setA4_Elements(prevState => {
            const newState = prevState.map((element) => {
                if(elementId === element.element_id){
                    return { ...element, isSelected: false }
                }
                else{
                    return element
                }

            })
            return newState
        })
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
                category: selectedElement?.category,
                zIndex: selectedElement?.zIndex
            };
        });
    }, [someElementSelected, selectedElement])

    return <AnimatePresence>{someElementSelected && <motion.aside className={classes.editor}
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}>

        <form className={classes.editorForm}>
            <div className={classes.editorHeading}>
                <div className={classes.headingLeft}>
                    <span className={classes.headingIcon}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5FA777" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></svg>
                    </span>
                    <p>{selectedElement?.category ? `${selectedElement.category.charAt(0).toUpperCase()}${selectedElement.category.slice(1)} element` : "Element properties"}</p>
                </div>
                <CloseButton clickHandler={() => handleCloseEditor(elementValues?.element_id)} right={10}/>
            </div>
            {selectedElement?.category === "text" && <>

                <EditorControls labelText="Text Content" type="text" inputValue={elementValues.content} onChangeFn={(e) => handleChangeValues(e, "content")} />
                <EditorControls labelText="Font Size" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                <EditorControls labelText="Text Color" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                <EditorControls labelText="Font Family" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
                <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
            </>}
            {selectedElement?.category === "textarea" && <>

                <button type="button" className={classes.editTextBtn} onClick={() => setTextareaEditing(selectedElement.element_id, true)}>Edit text</button>
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
                ><MdFormatListBulleted />Insert bullet</button>
                <EditorControls labelText="Font Size" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                <EditorControls labelText="Text Color" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                <EditorControls labelText="Font Family" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
                <StyleToggles selectedElement={selectedElement} toggleStyle={toggleStyle} />
                <AlignToggles selectedElement={selectedElement} setAlign={setAlign} />
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={!!selectedElement?.bulletList} onChange={() => toggleStyle("bulletList")} />
                    <span>Hanging indent for bullet (•) lines</span>
                </label>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Line Height" type="number" inputValue={elementValues.lineHeight} onChangeFn={(e) => handleChangeValues(e, "lineHeight")} />
                    <EditorControls labelText="Letter Spacing" type="number" inputValue={elementValues.letterSpacing} onChangeFn={(e) => handleChangeValues(e, "letterSpacing")} />
                </div>
                <div className={classes.elementSize}>
                    <EditorControls labelText="Width" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                    <EditorControls labelText="Height" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                </div>
            </>}
            {selectedElement?.category === "line" && <>
                <div className={classes.elementSize}>
                <EditorControls labelText="Height" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                <EditorControls labelText="Width" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                </div>
                <EditorControls labelText="Background Color" type="color" inputValue={elementValues.backgroundColor} onChangeFn={(e) => handleChangeValues(e, "backgroundColor")} />
            </>}

            {selectedElement?.category === "image" && <>

                <div className={classes.elementSize}>
                    <EditorControls labelText="Height" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} isDisabled />
                    <EditorControls labelText="Width" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                </div>

            </>}

            <>
                <EditorControls labelText="Visibility" type="number" inputValue={elementValues.zIndex} onChangeFn={(e) => handleChangeValues(e, "zIndex")} />

                <div className={classes.positionBtnsWrapper}>
                    <button type="button" onClick={() => alignElement(selectedElement.element_id, "LEFT", selectedElement.width, selectedElement.category)}><CiTextAlignLeft /></button>
                    <button type="button" onClick={() => alignElement(selectedElement.element_id, "CENTER", selectedElement.width, selectedElement.category)}><CiTextAlignCenter /></button>
                    <button type="button" onClick={() => alignElement(selectedElement.element_id, "RIGHT", selectedElement.width, selectedElement.category)}><CiTextAlignRight /></button>
                </div>
                <div className={classes.elementSize}>
                    <EditorControls labelText="X (px)" type="number" inputValue={elementValues.left} onChangeFn={(e) => handleChangeValues(e, "left")} />
                    <EditorControls labelText="Y (px)" type="number" inputValue={elementValues.top} onChangeFn={(e) => handleChangeValues(e, "top")} />
                </div>
                <label className={classes.pushToggle}>
                    <input type="checkbox" checked={pushBelow} onChange={(e) => setPushBelow(e.target.checked)} />
                    <span>Push elements below when moving Y</span>
                </label>
                <button type="button" className={classes.btnDuplicate} onClick={() => duplicateElement(selectedElement.element_id)}>Duplicate element<RiFileCopyLine /></button>
                <button type="button" className={classes.btnDelete} onClick={() => deleteElement(selectedElement.element_id)}>Remove Element<RiDeleteBin2Line /></button>

            </>
        </form>
    </motion.aside>}</AnimatePresence>
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
            {btn("left", CiTextAlignLeft, "Align left")}
            {btn("center", CiTextAlignCenter, "Align center")}
            {btn("right", CiTextAlignRight, "Align right")}
            {btn("justify", CiTextAlignJustify, "Justify")}
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
                aria-label="Bold"
            >B</button>
            <button
                type="button"
                className={selectedElement?.italic ? classes.styleActive : ""}
                style={{ fontStyle: "italic" }}
                onClick={() => toggleStyle("italic")}
                aria-label="Italic"
            >I</button>
            <button
                type="button"
                className={selectedElement?.underline ? classes.styleActive : ""}
                style={{ textDecoration: "underline" }}
                onClick={() => toggleStyle("underline")}
                aria-label="Underline"
            >U</button>
        </div>
    );
}

