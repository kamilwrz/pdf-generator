import { Link } from "react-router-dom";
import classes from "./Hero.module.css";

export default function Hero() {
    return (
        <div className={classes.page}>
            <div className={classes.blob} aria-hidden="true" />

            {/* ---- Nav ---- */}
            <nav className={classes.nav}>
                <div className={classes.brand}>
                    <span className={classes.brandMark}><img src="/kompoza-logo.png" alt="" /></span>
                    <span className={classes.brandName}>Kompoza</span>
                </div>
                <div className={classes.navLinks}>
                    <a className={classes.navLink}>Funkcje</a>
                    <a className={classes.navLink}>Cennik</a>
                    <Link to="/login" className={classes.navLink}>Zaloguj się</Link>
                    <Link to="/register" className={classes.navCta}>Rozpocznij za darmo</Link>
                </div>
            </nav>

            {/* ---- Hero body ---- */}
            <div className={classes.hero}>
                <div className={classes.heroCopy}>
                    <div className={classes.badge}>
                        <span className={classes.badgeDot}><span /></span>
                        <span>Bez umiejętności projektowania</span>
                    </div>
                    <h1 className={classes.heading}>
                        Twórz <span className={classes.accentWord}>piękne</span> PDF-y w kilka minut.
                    </h1>
                    <p className={classes.subheading}>
                        Przeciągaj, upuszczaj i projektuj. Dodawaj tekst, obrazy i kształty na przyjaznym
                        wizualnym płótnie — a potem natychmiast eksportuj dopracowany PDF.
                    </p>
                    <div className={classes.ctaRow}>
                        <Link to="/register" className={classes.primaryCta}>
                            Zacznij projektować
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                        </Link>
                        <Link to="/login" className={classes.secondaryCta}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                            Zobacz demo
                        </Link>
                    </div>
                    <div className={classes.social}>
                        <div className={classes.avatars}>
                            <span style={{ background: "#8FB0DB" }} />
                            <span style={{ background: "#E8A6A0" }} />
                            <span style={{ background: "#A9C5B0" }} />
                        </div>
                        <span className={classes.socialText}>Ponad 12 000 twórców nas poleca</span>
                    </div>
                </div>

                {/* ---- Product preview ---- */}
                <div className={classes.preview}>
                    <div className={classes.window}>
                        <div className={classes.windowBar}>
                            <span className={classes.dot} style={{ background: "#E8A6A0" }} />
                            <span className={classes.dot} style={{ background: "#9DB6D8" }} />
                            <span className={classes.dot} style={{ background: "#A9C5B0" }} />
                            <span className={classes.windowFile}>gala-w-ogrodzie.pdf</span>
                        </div>
                        <div className={classes.windowBody}>
                            <div className={classes.windowRail}>
                                <span className={classes.railActive} />
                                <span className={classes.railItem} />
                                <span className={classes.railItem} />
                                <span className={classes.railItem} />
                            </div>
                            <div className={classes.windowCanvas}>
                                <div className={classes.miniPage}>
                                    <div className={classes.miniBanner} />
                                    <div className={classes.miniLine} style={{ width: "70%" }} />
                                    <div className={classes.miniLineSm} style={{ width: "50%" }} />
                                    <div className={classes.miniBar} style={{ width: "100%" }} />
                                    <div className={classes.miniBar} style={{ width: "92%" }} />
                                    <div className={classes.miniBar} style={{ width: "96%" }} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={classes.floatCard}>
                        <span className={classes.floatIcon}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FA777" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                        <div>
                            <div className={classes.floatTitle}>PDF wyeksportowany</div>
                            <div className={classes.floatSub}>w 1,4 sekundy</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
