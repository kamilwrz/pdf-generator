/**
 * Icon tile button for the left Sidebar tool rail.
 *
 * The compact rail keeps its existing footprint, but every tile now exposes a
 * fast visual label on hover/focus. Panel-opening tiles can also communicate
 * their selected state through `active` without changing their click workflow.
 * `badge` renders a small attention dot when a panel needs attention.
 */
import classes from "./SidebarControls.module.css";
import { useId } from "react";

export default function SidebarControls({
    icon,
    labelText,
    tooltipText = labelText,
    sidebarEvent,
    documents,
    badge = false,
    active,
}) {
    const tooltipId = useId();
    const descriptiveLabel = documents != null && documents !== false
        ? `${tooltipText}: ${documents}`
        : tooltipText;

    return (
        <button
            type="button"
            className={`${classes.tile} ${active ? classes.tileActive : ""}`}
            onClick={sidebarEvent}
            aria-label={labelText}
            aria-describedby={tooltipId}
            aria-pressed={active == null ? undefined : active}
        >
            <span className={classes.iconBox}>{icon}</span>
            {badge ? <span className={classes.badge} aria-hidden="true" /> : null}
            <span id={tooltipId} className={classes.tooltip} role="tooltip">{descriptiveLabel}</span>
        </button>
    );
}
