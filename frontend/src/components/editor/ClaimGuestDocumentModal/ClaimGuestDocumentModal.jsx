/**
 * Shown right after a guest logs in or registers when a buffered
 * `cvstudio.guest.doc` exists in this browser's localStorage.
 *
 * Guest documents are scoped to the browser, not to any identity — anyone
 * who next authenticates on this device would otherwise silently inherit
 * whatever a previous, unrelated guest session left behind (a shared
 * computer, a QA account, or simply a different family member). Asking for
 * explicit confirmation before PdfCanvas's claim effect runs prevents that
 * cross-account leak while still supporting the legitimate case: the same
 * visitor who edited as a guest, closed the tab, and later signed in.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./ClaimGuestDocumentModal.module.css";

export default function ClaimGuestDocumentModal({ open, title, onConfirm, onDecline }) {
  return (
    <DialogShell
      open={open}
      onClose={onDecline}
      width={440}
      title="Znaleziono niezapisaną pracę"
      subtitle="Ta przeglądarka ma zapisany szkic CV, który nie został jeszcze przypisany do żadnego konta"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onDecline}>
            To nie moje — odrzuć
          </button>
          <button type="button" className={classes.primary} onClick={onConfirm}>
            Tak, zachowaj na moim koncie
          </button>
        </div>
      )}
    >
      <p className={classes.copy}>
        {title
          ? <>Znaleziony dokument nosi tytuł „{title}”. </>
          : null}
        Zachowaj go, jeśli to Twoja praca sprzed zalogowania — zapiszemy go na
        tym koncie. Jeśli to nie Twój szkic (np. wspólny komputer), odrzuć go
        i zacznij od pustego dokumentu.
      </p>
    </DialogShell>
  );
}
