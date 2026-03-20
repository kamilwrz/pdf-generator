import classes from "./Textarea.module.css";
import { useRef } from "react";
import { nanoid } from "nanoid";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";


export default function Textarea() {

    const txtarea = useRef();

    const {setA4_Elements} = use(PdfContext);

    const fontSize = 14;
    const fontFamily = "Inter";
    const color = "#000000";
    const startLeft = 0;
    const startTop = (fontSize + 1) / 2;
    const lineHeight = fontSize*1.2;

    function claculateText(txt) {
        const lines = txt.current.value.split("\n").filter(line => line.trim() !== "");
        const newTextElements = lines.map((line, index) => ({
            element_id: nanoid(),
            content: line.trim(),
            fontSize,
            fontFamily,
            color,
            left: startLeft,
            top: startTop + index * lineHeight,
            isSelected: false,
            isMove: false,
            category: "text",
            zIndex: 3,
        }));

        setA4_Elements(prev => [...prev, ...newTextElements]);
        txt.current.value ="";
    }
    
    console.log(txtarea)
    return <textarea className={classes.textarea} ref={txtarea} onClick={() => claculateText(txtarea)}></textarea>
}