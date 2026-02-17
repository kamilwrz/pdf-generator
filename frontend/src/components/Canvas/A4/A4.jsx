import classes from "./A4.module.css";
import { forwardRef } from "react";


export default forwardRef(function A4({width, height, children}, ref){
    
    return <div ref={ref} id="A4" className={classes.A4} style={{width:width, height:height}}>
       {children}
    </div>
})