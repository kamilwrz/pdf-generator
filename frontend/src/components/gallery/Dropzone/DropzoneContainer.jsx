import classes from "./DropzoneContainer.module.css";
import Dropzone from "./Dropzone";
import { motion } from "framer-motion";


export default function DropzoneContainer() {

    return <motion.section
        className={classes.dropzoneContainer}
        initial={{ opacity: 0, x: -320 }}
        animate={{ opacity: 1, x: 320 }}
        exit={{ opacity: 0, x: -320 }}
        transition={{type: "spring", duration:2, ease: [0, 0.71, 0.2, 1.01]}}>
        <Dropzone></Dropzone>
    </motion.section>

}
