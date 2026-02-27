import { IoMdClose } from "react-icons/io";
import classes from "./CloseButton.module.css";

export default function CloseButton({left, right, top, clickHandler}) {
    return (
        <button type="button" className={classes.closeBtn} style={{left:left, top:top, right:right}} onClick={clickHandler}>
            <IoMdClose/>
        </button>
    )
}