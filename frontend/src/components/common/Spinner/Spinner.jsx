import classes from "./Spinner.module.css";

// Full-screen loading state shown while a PDF is being generated. The mark is
// contextual: a document whose lines render in under a sweeping scan beam,
// wrapped in a rotating conic ring — on a frosted backdrop.
export default function Spinner({ loading = true }) {
    if (!loading) return null;
    return (
        <div className={classes.overlay} role="status" aria-live="polite" aria-label="Generowanie PDF">
            <div className={classes.card}>
                <div className={classes.stage}>
                    <span className={classes.ring} aria-hidden="true" />
                    <span className={classes.glow} aria-hidden="true" />
                    <span className={classes.page} aria-hidden="true">
                        <i className={classes.corner} />
                        <span className={classes.line} />
                        <span className={classes.line} />
                        <span className={classes.line} />
                        <span className={classes.line} />
                        <span className={classes.beam} />
                    </span>
                </div>
                <div className={classes.title}>
                    Generowanie PDF<span className={classes.dots} aria-hidden="true" />
                </div>
                <div className={classes.subtitle}>Układanie stron i renderowanie</div>
                <div className={classes.bar}><span /></div>
            </div>
        </div>
    );
}
