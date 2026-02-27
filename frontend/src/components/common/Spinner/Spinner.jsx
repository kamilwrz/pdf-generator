import { CircleLoader } from "react-spinners";
import classes from "./Spinner.module.css";

export default function Spinner({ loading = true }) {
    if (!loading) return null;
    return  <div  className={classes.spinnerWrapper}>
        <h2 className={classes.spinnerText}>Loading...</h2>
        <CircleLoader loading={true} size={50} color="#60a5fa" cssOverride />
    </div>
   
}