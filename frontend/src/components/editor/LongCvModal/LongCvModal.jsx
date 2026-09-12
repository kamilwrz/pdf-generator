import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * AI fallback for a deterministic page-fit failure.
 *
 * PdfCanvas opens this modal only after both the spacing ladder and the real
 * template typography preset `S` fail to reach the target. The presenter never
 * offers AI while a local layout-only solution remains available.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import { formatFitTargetLabel } from "../../../utils/fitToPages.js";
import classes from "./LongCvModal.module.css";

/**
 * @param {{
 *   open: boolean,
 *   targetPages: number,
 *   canUseAi: boolean,
 *   onRequestAiShorten: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function LongCvModal({
  open,
  targetPages,
  canUseAi,
  onRequestAiShorten,
  onClose,
}) {
  useTranslation();
  if (!open) return null;

  const targetLabel = formatFitTargetLabel(targetPages ?? 1);
  const aiLabel = canUseAi ? uiText("editor:longCvModal.shortenContentWithAi") : uiText("editor:longCvModal.unlockAiShorteningWithPro");

  const actions = (
    <>
      <button type="button" className={classes.ghost} onClick={onClose}>{uiText("editor:longCvModal.notNow")}</button>
      <button type="button" className={classes.primary} onClick={onRequestAiShorten}>
        {aiLabel}
      </button>
    </>
  );

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={520}
      title={uiText("editor:longCvModal.theContentNeedsShortening")}
      footer={<div className={classes.actions}>{actions}</div>}
    >
      <div className={classes.body}>
        <p className={classes.lead}>{uiText("editor:longCvModal.automaticFittingTriedSmallerSpacingAndText")} {targetLabel}. {canUseAi
            ? uiText("editor:longCvModal.weCanSuggestPassagesToShortenWithout")
            : uiText("editor:longCvModal.youCanShortenThemYourselfOrUnlock")}
        </p>
      </div>
    </DialogShell>
  );
}
