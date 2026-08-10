/**
 * "Your CV is too long" assistant. A multi-step dialog that first tries a free,
 * deterministic remedy — the compact spacing preset — and only escalates to AI
 * content shortening when tightening the rhythm was not enough.
 *
 * Steps (driven by the `step` state below):
 *   intro-spacing  — sparse last page: lead with the compact spacing pass.
 *   intro-content  — full pages: lead with AI shortening; spacing offered as a
 *                    secondary "try anyway".
 *   result-success — the spacing pass reclaimed a page.
 *   result-still   — spacing was not enough; offer AI shortening.
 *
 * The modal never applies changes itself — the parent (`PdfCanvas`) owns the
 * document. It calls back `onApplyCompact` (returns the new page count so the
 * modal can branch) and `onRequestAiShorten`, keeping this component a pure
 * presenter over the shared `DialogShell`.
 */
import { useState } from "react";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./LongCvModal.module.css";

/** Locative "na N stronie/stronach" (na 1 stronie, na 2/3/5 stronach). */
function pagesLabel(n) {
  const abs = Math.abs(n);
  return abs === 1 ? "1 stronie" : `${abs} stronach`;
}

/** Accusative "ma N stronę/strony/stron" for the current-length sentence. */
function pagesCount(n) {
  const abs = Math.abs(n);
  if (abs === 1) return "1 stronę";
  const tens = abs % 100;
  const units = abs % 10;
  if (units >= 2 && units <= 4 && (tens < 10 || tens >= 20)) return `${abs} strony`;
  return `${abs} stron`;
}

/**
 * @param {{
 *   open: boolean,
 *   diagnosis: { mode: "spacing"|"content", pageCount: number, targetPages: number }|null,
 *   canUseAi: boolean,
 *   onApplyCompact: () => number,   // applies compact spacing, returns new page count
 *   onRequestAiShorten: () => void, // opens the assistant with the shorten action
 *   onClose: () => void,
 * }} props
 */
export default function LongCvModal({
  open,
  diagnosis,
  canUseAi,
  onApplyCompact,
  onRequestAiShorten,
  onClose,
}) {
  const initialStep = diagnosis?.mode === "content" ? "intro-content" : "intro-spacing";
  const [step, setStep] = useState(initialStep);
  const [wasOpen, setWasOpen] = useState(open);
  // Page count observed after the spacing pass (for the result copy).
  const [resultPages, setResultPages] = useState(null);

  // Reset to the diagnosis-appropriate intro each time the modal reopens.
  if (open && !wasOpen) {
    setStep(initialStep);
    setResultPages(null);
  }
  if (wasOpen !== open) setWasOpen(open);

  if (!open || !diagnosis) return null;

  const { pageCount, targetPages } = diagnosis;

  function handleApplyCompact() {
    const newPageCount = onApplyCompact();
    if (Number.isFinite(newPageCount) && newPageCount < pageCount) {
      setResultPages(newPageCount);
      setStep("result-success");
    } else {
      setResultPages(newPageCount);
      setStep("result-still");
    }
  }

  let title = "Twoje CV jest dość długie";
  let subtitle = null;
  let body = null;
  let actions = null;

  if (step === "intro-spacing") {
    subtitle = `Dokument ma ${pagesCount(pageCount)}.`;
    body = (
      <p className={classes.lead}>
        Ostatnia strona jest słabo wykorzystana, więc najpierw spróbujmy zmniejszyć
        odstępy — bez zmiany treści.
      </p>
    );
    actions = (
      <>
        <button type="button" className={classes.ghost} onClick={onClose}>
          Nie teraz
        </button>
        <button type="button" className={classes.primary} onClick={handleApplyCompact}>
          Zmieść na {pagesLabel(targetPages)}
        </button>
      </>
    );
  } else if (step === "intro-content") {
    subtitle = `Dokument ma ${pagesCount(pageCount)}.`;
    body = (
      <p className={classes.lead}>
        Strony są gęsto wypełnione, więc samo zmniejszenie odstępów raczej nie
        wystarczy. Możemy wskazać fragmenty, które warto skrócić — bez zmiany faktów w CV.
      </p>
    );
    actions = (
      <>
        <button type="button" className={classes.ghost} onClick={onClose}>
          Nie teraz
        </button>
        <button type="button" className={classes.ghost} onClick={handleApplyCompact}>
          Zmniejsz odstępy mimo to
        </button>
        <button type="button" className={classes.primary} onClick={onRequestAiShorten}>
          {canUseAi ? "Znajdź miejsca do skrócenia" : "Skróć z AI (Pro)"}
        </button>
      </>
    );
  } else if (step === "result-success") {
    title = "Gotowe";
    subtitle = null;
    body = (
      <p className={classes.lead}>
        Zastosowano bardziej kompaktowe odstępy. CV mieści się teraz na{" "}
        {pagesLabel(resultPages ?? targetPages)}.
      </p>
    );
    actions = (
      <button type="button" className={classes.primary} onClick={onClose}>
        Zamknij
      </button>
    );
  } else if (step === "result-still") {
    title = "Odstępy są już zwarte";
    subtitle = null;
    body = (
      <p className={classes.lead}>
        Samo zmniejszenie odstępów nie wystarczyło — CV nadal ma{" "}
        {pagesCount(resultPages ?? pageCount)}. Następnym krokiem jest skrócenie mniej
        istotnych fragmentów bez zmiany faktów.
      </p>
    );
    actions = (
      <>
        <button type="button" className={classes.ghost} onClick={onClose}>
          Zamknij
        </button>
        <button type="button" className={classes.primary} onClick={onRequestAiShorten}>
          {canUseAi ? "Skróć treść z AI" : "Skróć z AI (Pro)"}
        </button>
      </>
    );
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={520}
      radius={2}
      title={title}
      subtitle={subtitle}
      footer={<div className={classes.actions}>{actions}</div>}
    >
      <div className={classes.body}>{body}</div>
    </DialogShell>
  );
}
