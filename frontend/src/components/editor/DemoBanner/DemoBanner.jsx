/**
 * Persistent product-demo banner shown while the canvas holds the guest-mode
 * Regent starter (loaded via ?start=demo). The primary action opens the wizard
 * in place; demo mode remains active until a real document replaces the
 * starter, so cancelling the wizard does not discard the demonstration.
 */
import classes from "./DemoBanner.module.css";

export default function DemoBanner({ onUseOwnData }) {
  return (
    <div className={classes.banner} role="status">
      <div className={classes.message}>
        <span className={classes.eyebrow}>Wypróbuj CV Studio</span>
        <span className={classes.text}>
          Kliknij dowolny tekst, zmień układ albo wybierz inny szablon.
        </span>
      </div>
      <div className={classes.actions}>
        <button type="button" className={classes.primary} onClick={onUseOwnData}>
          Stwórz moje CV
        </button>
      </div>
    </div>
  );
}
