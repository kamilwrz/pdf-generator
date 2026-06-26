import classes from "./Spinner.module.css";

export default function Spinner({ loading = true }) {
    if (!loading) return null;
    return (
        <div className={classes.spinnerWrapper}>
            <div className={classes.ring}>
                <div className={classes.track} />
                <div className={classes.arc} />
                <div className={classes.center}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                </div>
            </div>
            <div className={classes.title}>Generating your PDF…</div>
            <div className={classes.subtitle}>This usually takes just a few seconds</div>
            <div className={classes.bar}><span /></div>
        </div>
    );
}
