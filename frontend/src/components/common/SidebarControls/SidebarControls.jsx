import classes from "./SidebarControls.module.css";

export default function SidebarControls({icon, labelText, sidebarEvent, documents}){
    return(
        <div className={classes.controls}>
          <button onClick={sidebarEvent} className={classes.icons} >{icon}</button>
          <label>{labelText}</label>
          {documents ? <label className={classes.documentsCount}>{documents}</label> : ""}
        </div>
    )
}