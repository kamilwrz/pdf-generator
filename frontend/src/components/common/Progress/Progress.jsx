import classes from "./Progress.module.css";

export default function Progress({value, max}){
    return <progress max={max} value={value} className={classes.progress}></progress>
}