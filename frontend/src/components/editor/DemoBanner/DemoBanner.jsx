/**
 * Persistent product-demo banner shown while the canvas holds the guest-mode
 * Linden starter (loaded via ?start=demo). Demo mode intentionally exposes
 * Linden only; template selection becomes available in the full editor after
 * the visitor creates an account.
 */
import classes from "./DemoBanner.module.css";

export default function DemoBanner({ onUseOwnData }) {
  return (
    <div className={classes.banner} role="status">
      <div className={classes.message}>
        <span className={classes.eyebrow}>Wypróbuj CV Studio</span>
        <span className={classes.text}>
          Edytuj przykładowe CV w Linden i sprawdź, jak układ A4 reaguje na Twoją treść.
        </span>
      </div>
      <div className={classes.actions}>
        <button type="button" className={classes.primary} onClick={onUseOwnData}>
          Utwórz moje CV na A4
        </button>
      </div>
    </div>
  );
}
