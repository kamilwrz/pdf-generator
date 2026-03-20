import { IoMdClose } from "react-icons/io";
import classes from "./CloseButton.module.css";

export default function CloseButton({left, right, top, width, height, clickHandler}) {
    return (
        <button type="button" className={classes.closeBtn} style={{left:left, top:top, right:right, width:width, height:height}} onClick={clickHandler}>
            <IoMdClose/>
        </button>
    )
}