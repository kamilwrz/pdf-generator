/**
 * Icon tile button for the left Sidebar tool rail.
 */
import classes from "./SidebarControls.module.css";

export default function SidebarControls({ icon, labelText, sidebarEvent, documents }) {
    return (
        <button
            type="button"
            className={classes.tile}
            onClick={sidebarEvent}
            aria-label={labelText}
            title={documents != null && documents !== false ? `${labelText}: ${documents}` : labelText}
        >
            <span className={classes.iconBox}>{icon}</span>
        </button>
    );
}
