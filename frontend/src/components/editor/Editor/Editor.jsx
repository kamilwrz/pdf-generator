import classes from "./Editor.module.css";
import { useEffect, useState, useRef } from "react";
import EditorControls from "../../common/EditorControls/EditorControls";
import { RiDeleteBin2Line } from "react-icons/ri";
import { CiTextAlignLeft } from "react-icons/ci";
import { CiTextAlignCenter } from "react-icons/ci";
import { CiTextAlignRight } from "react-icons/ci";

import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";
import { motion, AnimatePresence } from "framer-motion";


export default function Editor() {

    const { A4_Elements, editElementValues, alignElement, deleteElement, setA4_Elements } = use(PdfContext);

    let selectedElement = A4_Elements.find(element => element.isSelected === true);
    const someElementSelected = A4_Elements.some(element => element.isSelected);

    const [elementValues, setElementValues] = useState({});

    function handleChangeValues(e, identifier) {

        const value = (identifier === "fontSize" || identifier === "height" || identifier === "width") ? Number(e.target.value) : e.target.value;
        let valueObject = { [identifier]: value }

        if (identifier === "width" && selectedElement.category === "image") {
            const image = document.getElementById(selectedElement.element_id);
            const aspectRatio = image.naturalHeight / image.naturalWidth;
            const newHeight = Math.round(value * aspectRatio);
            valueObject = { height: newHeight, width: value };
        }
        editElementValues(valueObject, selectedElement.element_id);
        setElementValues(prevData => {
            return { ...prevData, [identifier]: e.target.value };
        });
    }

    function handleCloseEditor(){
        setA4_Elements(prevState => {
            const newState = prevState.map((element) => {
                if(element.isSelected){
                    return {...element, isSelected: false}
                }
                return {...element}
            })
            return newState;
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
                left: selectedElement?.left,
                top: selectedElement?.top,
                width: selectedElement?.width,
                height: selectedElement?.height,
                category: selectedElement?.category,
                zIndex: selectedElement?.zIndex
            };
        });
    }, [someElementSelected, selectedElement])

    return <AnimatePresence>{someElementSelected && <motion.aside className={classes.editor}
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 90 }}
        exit={{ opacity: 0, x: -50 }}
        transition={{ type: "spring", duration: 2 }}>

        <form className={classes.editorForm}>
            <div className={classes.editorHeading}>
                <p>Element properties</p>
                <button type="button" onClick={handleCloseEditor}>x</button>
            </div>
            {selectedElement?.category === "text" && <>

                <EditorControls labelText="Text Content" type="text" inputValue={elementValues.content} onChangeFn={(e) => handleChangeValues(e, "content")} />
                <EditorControls labelText="Font Size" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                <EditorControls labelText="Text Color" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                <EditorControls labelText="Font Family" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
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
                <div className={classes.coordsText}>
                    <label>Position:</label>
                    <div>
                        <span>X: {Math.round(selectedElement?.left) + "px"}</span>
                        <span>||</span>
                        <span>Y: {Math.round(selectedElement?.top) + "px"}</span>
                    </div>
                </div>
                <button type="button" className={classes.btnDelete} onClick={() => deleteElement(selectedElement.element_id)}>Remove Element<RiDeleteBin2Line /></button>

            </>
        </form>
    </motion.aside>}</AnimatePresence>
}

