import { IoMdClose } from "react-icons/io";
import classes from "./CloseButton.module.css";

// `radius` remains available for compact embedded surfaces such as toasts. All
// variants share the same visible focus treatment and accessible default name.
export default function CloseButton({left, right, top, width, height, radius, clickHandler, ariaLabel = "Zamknij"}) {
    return (
        <button
            type="button"
            className={classes.closeBtn}
            style={{
                left, top, right, width, height,
                ...(radius != null ? { borderRadius: radius } : {}),
            }}
            onClick={clickHandler}
            aria-label={ariaLabel}
            title={ariaLabel}
        >
            <IoMdClose aria-hidden="true" />
        </button>
    )
}
