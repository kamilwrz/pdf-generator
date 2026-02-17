import { useEffect, useState } from "react";
import classes from "./DZContainer.module.css";
import Dropzone from "./Dropzone";
import { PdfContext } from "../../../store/pdfgenerator-context";
import { use } from "react";

export default function DZContainer(){

    const { isDropzone } = use(PdfContext)

    const [shouldRender, setShouldRender] = useState(false);
   // console.log(isDropzone)
    useEffect(() => {
        if(isDropzone){
            setShouldRender(true);
        }
    }, [isDropzone])

    if(!shouldRender){
        return null
    }
    else{

    return <section className={`${classes.DZContainer} ${isDropzone ? classes.DZContainerShow : classes.DZContainerHide}`}>
        <Dropzone></Dropzone>
    </section>
    }
}