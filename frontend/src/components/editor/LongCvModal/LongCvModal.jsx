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
  if (!open) return null;

  const targetLabel = formatFitTargetLabel(targetPages ?? 1);
  const aiLabel = canUseAi ? "Skróć treść z AI" : "Odblokuj skracanie AI w Pro";

  const actions = (
    <>
      <button type="button" className={classes.ghost} onClick={onClose}>
        Nie teraz
      </button>
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
      title="Trzeba skrócić treść"
      footer={<div className={classes.actions}>{actions}</div>}
    >
      <div className={classes.body}>
        <p className={classes.lead}>
          Automatyczne dopasowanie sprawdziło mniejsze odstępy i rozmiar tekstu S,
          ale CV nadal nie mieści się na {targetLabel}. {canUseAi
            ? "Możemy wskazać fragmenty do skrócenia, bez zmiany faktów."
            : "Możesz skrócić je ręcznie albo odblokować skracanie AI w planie Pro."}
        </p>
      </div>
    </DialogShell>
  );
}
