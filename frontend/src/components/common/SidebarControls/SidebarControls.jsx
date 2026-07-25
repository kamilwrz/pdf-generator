import classes from "./SidebarControls.module.css";

export default function SidebarControls({ icon, labelText, sidebarEvent, documents }) {
    return (
        <button type="button" className={classes.tile} onClick={sidebarEvent}>
            <span className={classes.iconBox}>{icon}</span>
            <span className={classes.label}>{labelText}</span>
            {documents != null && documents !== false ? <span className={classes.documentsCount}>{documents}</span> : null}
        </button>
    );
}
