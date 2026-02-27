import classes from "./DropzoneContainer.module.css";
import Dropzone from "./Dropzone";
import { motion } from "framer-motion";
import CloseButton from "../../common/CloseButton/CloseButton";
import { use } from "react";
import { PdfContext } from "../../../store/pdfgenerator-context";


export default function DropzoneContainer() {

    const {showDropzone} = use(PdfContext)

    return <motion.section
        className={classes.dropzoneContainer}
        initial={{ opacity: 0, x: -320 }}
        animate={{ opacity: 1, x: 320 }}
        exit={{ opacity: 0, x: -320 }}
        transition={{type: "spring", duration:2, ease: [0, 0.71, 0.2, 1.01]}}>
            <CloseButton clickHandler={showDropzone} right={30} top={20}/>
        <Dropzone></Dropzone>
    </motion.section>

}
