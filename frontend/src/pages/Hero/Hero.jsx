import { Link } from "react-router-dom";
import ButtonHero from "../../components/common/ButtonHero/ButtonHero";
import classes from "./Hero.module.css";

export default function Hero() {
    return (
        <div className={classes.container}>
            <h1 className={classes.mainHeading}>Create Professional <span className={classes.pdf}>PDFs</span> in Minutes</h1>
            <h2 className={classes.subHeading}>Drag, drop, and design. No design skills required.</h2>
            <p className={classes.description}>Build beautiful PDFs with our intuitive visual editor. Add text, images, and shapes with a simple drag-and-drop interface. Customize fonts, colors, and layouts—then export to PDF instantly.</p>

            <div className={classes.wrapperBtns}>
                <ButtonHero><Link to="/login">Login</Link></ButtonHero>
                <ButtonHero><Link to="/register">Register</Link></ButtonHero>
            </div>
        </div>
    )
}