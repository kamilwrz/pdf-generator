/**
 * Page-fit decision modal. Reached only when spacing alone cannot cleanly fit
 * the CV on its target page count — the SectionsPanel + fit engine handle the
 * clean/tight cases silently. Two variants:
 *
 *   emergency  — the hard floor DOES fit, but the result is cramped. Offer AI
 *                shortening (recommended) or "Maksymalnie zacieśnij" (apply the
 *                floor anyway).
 *   impossible — spacing alone cannot reach the target. AI shortening only.
 *
 * Pure presenter over DialogShell; the parent (PdfCanvas) owns the document and
 * the fit result. "Skróć z AI" closes the modal and opens the assistant via
 * the parent's onRequestAiShorten.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import { formatFitTargetLabel } from "../../../utils/fitToPages.js";
import classes from "./LongCvModal.module.css";

/**
 * @param {{
 *   open: boolean,
 *   variant: "emergency"|"impossible",
 *   targetPages: number,
 *   canUseAi: boolean,
 *   onForceTighten: () => void,   // emergency only: apply the hard-floor fit
 *   onRequestAiShorten: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function LongCvModal({
  open,
  variant,
  targetPages,
  canUseAi,
  onForceTighten,
  onRequestAiShorten,
  onClose,
}) {
  if (!open || !variant) return null;

  const targetLabel = formatFitTargetLabel(targetPages ?? 1);
  const aiLabel = canUseAi ? "Skróć treść z AI" : "Skróć z AI (Pro)";

  let title;
  let body;
  if (variant === "emergency") {
    title = `Zmieścimy na ${targetLabel}`;
    body = (
      <p className={classes.lead}>
        Żeby zmieścić CV na {targetLabel}, możemy mocno zmniejszyć odstępy albo
        skrócić treść. Skrócenie treści wygląda lepiej.
      </p>
    );
  } else {
    title = "Trzeba skrócić treść";
    body = (
      <p className={classes.lead}>
        Samo zmniejszenie odstępów nie zmieści CV na {targetLabel} — jest za dużo
        treści. Możemy wskazać fragmenty do skrócenia, bez zmiany faktów.
      </p>
    );
  }

  const actions = (
    <>
      <button type="button" className={classes.ghost} onClick={onClose}>
        Nie teraz
      </button>
      {variant === "emergency" ? (
        <button type="button" className={classes.ghost} onClick={onForceTighten}>
          Maksymalnie zacieśnij
        </button>
      ) : null}
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
      radius={2}
      title={title}
      footer={<div className={classes.actions}>{actions}</div>}
    >
      <div className={classes.body}>{body}</div>
    </DialogShell>
  );
}
