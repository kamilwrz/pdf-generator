/**
 * Persistent banner shown while the canvas holds the guest-mode Regent starter
 * (loaded via ?start=demo). Both actions clear demo mode: one starts a real
 * document from scratch, the other opens the wizard so the visitor keeps the
 * "already in the editor" momentum instead of bouncing back to the landing
 * page.
 */
import classes from "./DemoBanner.module.css";

export default function DemoBanner({ onUseOwnData, onStartBlank }) {
  return (
    <div className={classes.banner}>
      <span className={classes.text}>To jest szablon Regent.</span>
      <button type="button" className={classes.link} onClick={onUseOwnData}>
        Użyj własnych danych
      </button>
      <span className={classes.sep}>·</span>
      <button type="button" className={classes.link} onClick={onStartBlank}>
        Zacznij od zera
      </button>
    </div>
  );
}
