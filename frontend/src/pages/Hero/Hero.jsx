import { Link } from "react-router-dom";
import classes from "./Hero.module.css";

const FileIcon = ({ size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
    </svg>
);

export default function Hero() {
    return (
        <div className={classes.page}>
            <div className={classes.blob} aria-hidden="true" />

            {/* ---- Nav ---- */}
            <nav className={classes.nav}>
                <div className={classes.brand}>
                    <span className={classes.brandMark}><FileIcon /></span>
                    <span className={classes.brandName}>PDF Canvas</span>
                </div>
                <div className={classes.navLinks}>
                    <a className={classes.navLink}>Features</a>
                    <a className={classes.navLink}>Pricing</a>
                    <Link to="/login" className={classes.navLink}>Log in</Link>
                    <Link to="/register" className={classes.navCta}>Get started free</Link>
                </div>
            </nav>

            {/* ---- Hero body ---- */}
            <div className={classes.hero}>
                <div className={classes.heroCopy}>
                    <div className={classes.badge}>
                        <span className={classes.badgeDot}><span /></span>
                        <span>No design skills required</span>
                    </div>
                    <h1 className={classes.heading}>
                        Make <span className={classes.accentWord}>beautiful</span> PDFs in minutes.
                    </h1>
                    <p className={classes.subheading}>
                        Drag, drop and design. Add text, images and shapes on a friendly visual
                        canvas — then export a polished PDF instantly.
                    </p>
                    <div className={classes.ctaRow}>
                        <Link to="/register" className={classes.primaryCta}>
                            Start designing
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                        </Link>
                        <Link to="/login" className={classes.secondaryCta}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                            Watch demo
                        </Link>
                    </div>
                    <div className={classes.social}>
                        <div className={classes.avatars}>
                            <span style={{ background: "#8FB0DB" }} />
                            <span style={{ background: "#E8A6A0" }} />
                            <span style={{ background: "#A9C5B0" }} />
                        </div>
                        <span className={classes.socialText}>Loved by 12,000+ makers</span>
                    </div>
                </div>

                {/* ---- Product preview ---- */}
                <div className={classes.preview}>
                    <div className={classes.window}>
                        <div className={classes.windowBar}>
                            <span className={classes.dot} style={{ background: "#E8A6A0" }} />
                            <span className={classes.dot} style={{ background: "#9DB6D8" }} />
                            <span className={classes.dot} style={{ background: "#A9C5B0" }} />
                            <span className={classes.windowFile}>garden-gala.pdf</span>
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
                            <div className={classes.floatTitle}>PDF exported</div>
                            <div className={classes.floatSub}>in 1.4 seconds</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
