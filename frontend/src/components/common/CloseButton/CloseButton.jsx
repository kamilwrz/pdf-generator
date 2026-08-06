import { IoMdClose } from "react-icons/io";
import classes from "./CloseButton.module.css";

// `radius` is an optional per-instance corner-radius override (mirrors
// DialogShell's own `radius` prop): applied inline only when provided, so
// callers that omit it keep the shared 6px radius from the stylesheet. The
// unified modal shell (DialogShell) passes a sharper radius; PanelShell and
// ToastStack keep the default rounder look for their own smaller surfaces.
export default function CloseButton({left, right, top, width, height, radius, clickHandler}) {
    return (
        <button
            type="button"
            className={classes.closeBtn}
            style={{
                left, top, right, width, height,
                ...(radius != null ? { borderRadius: radius } : {}),
            }}
            onClick={clickHandler}
        >
            <IoMdClose/>
        </button>
    )
}