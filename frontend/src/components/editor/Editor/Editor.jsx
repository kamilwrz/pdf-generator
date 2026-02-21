import classes from "./Editor.module.css";
import { useEffect, useState, useRef } from "react";
import EditorControls from "../../common/EditorControls/EditorControls";
import { RiDeleteBin2Line } from "react-icons/ri";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";


export default function Editor() {

    const {A4_Elements, editElementValues, alignElement, deleteElement}= use(PdfContext);

    const selectedElement = A4_Elements.find(element => element.isSelected === true);
    const someElementSelected = A4_Elements.some(element => element.isSelected);

    const className = A4_Elements.some(element => element.isSelected)
        ? `${classes.editor} ${classes.editorOpen}`
        : `${classes.editor} ${classes.editorClose}`;

    const [shouldRender, setShouldRender] = useState(false);
    const [elementValues, setElementValues] = useState({
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
        category: selectedElement?.category
    });

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

    useEffect(() => {
        if (someElementSelected) {
            setShouldRender(true);
            setElementValues(prevState => {
                return {
                    ...prevState,
                    element_id: selectedElement.element_id,
                    content: selectedElement.content,
                    fontSize: selectedElement.fontSize,
                    color: selectedElement.color,
                    fontFamily: selectedElement.fontFamily,
                    width: selectedElement.width,
                    height: selectedElement.height,
                    category: selectedElement.category,
                    isSelected: selectedElement.isSelected
                }
            })
        }
    }, [someElementSelected, selectedElement])

    if (!shouldRender) {
        return null
    }

    else {

        return <aside className={className}>
            <form className={classes.editorForm}>
                {selectedElement?.category === "text" && <>
                    
                    <EditorControls labelText="Text Content" type="text" inputValue={elementValues.content} onChangeFn={(e) => handleChangeValues(e, "content")} />
                    <EditorControls labelText="Font Size" type="number" inputValue={elementValues.fontSize} onChangeFn={(e) => handleChangeValues(e, "fontSize")} />
                    <EditorControls labelText="Text Color" type="color" inputValue={elementValues.color} onChangeFn={(e) => handleChangeValues(e, "color")} />
                    <EditorControls labelText="Font Family" type="select" inputValue={elementValues.fontFamily} onChangeFn={(e) => handleChangeValues(e, "fontFamily")} isSelect={true} />
                </>}
                {selectedElement?.category === "line" && <>
                    
                    <EditorControls labelText="Height" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} />
                    <EditorControls labelText="Width" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                    <EditorControls labelText="Background Color" type="color" inputValue={elementValues.backgroundColor} onChangeFn={(e) => handleChangeValues(e, "backgroundColor")} />
                </>}

                {selectedElement?.category === "image" && <>
                    
                    <EditorControls labelText="Height" type="number" inputValue={elementValues.height} onChangeFn={(e) => handleChangeValues(e, "height")} isDisabled />
                    <EditorControls labelText="Width" type="number" inputValue={elementValues.width} onChangeFn={(e) => handleChangeValues(e, "width")} />
                </>}

                {selectedElement ? <>
                    <div className={classes.positionBtnsWrapper}>
                        <button type="button" onClick={() => alignElement(selectedElement.element_id, "LEFT", selectedElement.width, selectedElement.category)}>left</button>
                        <button type="button" onClick={() => alignElement(selectedElement.element_id, "CENTER", selectedElement.width, selectedElement.category)}>center</button>
                        <button type="button" onClick={() => alignElement(selectedElement.element_id, "RIGHT", selectedElement.width, selectedElement.category)}>right</button>
                    </div>
                    <button type="button" className={classes.btnDelete} onClick={() => deleteElement(selectedElement.element_id)}><RiDeleteBin2Line /></button>
                    <div className={classes.coordsText}><span>X: {Math.round(selectedElement?.left) + "px"}</span>
                        <span>Y: {Math.round(selectedElement?.top) + "px"}</span>
                    </div></>
                    : "Closing..."}
            </form>
        </aside>
    }
}
