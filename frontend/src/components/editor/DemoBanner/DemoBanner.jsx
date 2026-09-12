import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Persistent product-demo banner shown while the canvas holds the guest-mode
 * Linden starter (loaded via ?start=demo). Demo mode intentionally exposes
 * Linden only; template selection becomes available in the full editor after
 * the visitor creates an account.
 */
import classes from "./DemoBanner.module.css";

export default function DemoBanner({ onUseOwnData }) {
  useTranslation();
  return (
    <div className={classes.banner} role="status">
      <div className={classes.message}>
        <span className={classes.eyebrow}>{uiText("editor:demoBanner.tryCvStudio")}</span>
        <span className={classes.text}>{uiText("editor:demoBanner.editTheSampleCvInLindenAnd")}</span>
      </div>
      <div className={classes.actions}>
        <button type="button" className={classes.primary} onClick={onUseOwnData}>{uiText("editor:demoBanner.createMyACv")}</button>
      </div>
    </div>
  );
}
