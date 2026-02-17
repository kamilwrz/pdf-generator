import classes from "./ButtonHero.module.css";

export default function ButtonHero({children}){
    return <button className={classes.btnHero}>{children}</button>
}