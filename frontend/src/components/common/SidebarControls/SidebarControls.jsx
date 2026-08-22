/**
 * Icon tile button for the left Sidebar tool rail. `badge` renders a small
 * attention dot (used by "Układ CV" when the CV can be fit onto fewer pages).
 */
import classes from "./SidebarControls.module.css";

export default function SidebarControls({ icon, labelText, sidebarEvent, documents, badge = false }) {
    return (
        <button
            type="button"
            className={classes.tile}
            onClick={sidebarEvent}
            aria-label={labelText}
            title={documents != null && documents !== false ? `${labelText}: ${documents}` : labelText}
        >
            <span className={classes.iconBox}>{icon}</span>
            {badge ? <span className={classes.badge} aria-hidden="true" /> : null}
        </button>
    );
}
