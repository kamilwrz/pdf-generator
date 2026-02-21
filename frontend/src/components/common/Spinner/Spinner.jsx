import { CircleLoader } from "react-spinners";
import classes from "./Spinner.module.css";

export default function Spinner({ loading = true }) {
    if (!loading) return null;
    return  <div  className={classes.spinnerWrapper}>
        <p className={classes.spinnerText}>Is loading...</p>
        <CircleLoader loading={true} size={150} color="#60a5fa" cssOverride={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}} />
    </div>
   
}