/**
 * Shown right after a guest logs in or registers when a buffered
 * `cvstudio.guest.doc` exists in this browser's localStorage.
 *
 * Guest documents are scoped to the browser, not to any identity — anyone
 * who next authenticates on this device would otherwise silently inherit
 * whatever a previous, unrelated guest session left behind (a shared
 * computer, a QA account, or simply a different family member). Asking for
 * explicit confirmation before PdfCanvas loads that JSON onto the A4 canvas
 * prevents that cross-account leak while still supporting the legitimate
 * case: the same visitor who edited as a guest and later signed in.
 *
 * Confirm only hydrates the editor canvas. It does not call
 * `POST /pdf/create_pdf`; the user saves later via the Topbar.
 * Dismissal is intentionally separate from decline: close, Escape, and the
 * backdrop keep the browser draft so an uncertain user never deletes work by
 * dismissing a prompt.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./ClaimGuestDocumentModal.module.css";

export default function ClaimGuestDocumentModal({ open, title, onConfirm, onDecline, onDismiss }) {
  const documentTitle = typeof title === "string" && title.trim()
    ? title.trim()
    : "Szkic CV bez nazwy";

  return (
    <DialogShell
      open={open}
      onClose={onDismiss}
      width={620}
      variant="decision"
      surface="paper"
      eyebrow="Odzyskiwanie szkicu"
      title="Czy ten szkic należy do Ciebie?"
      subtitle="Znaleźliśmy CV zapisane wcześniej w tej przeglądarce, przed zalogowaniem."
      initialFocusSelector="[data-primary-action]"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.dismiss} onClick={onDismiss}>
            Pomiń na razie
          </button>
          <div className={classes.decisionActions}>
            <button type="button" className={classes.decline} onClick={onDecline}>
              Usuń ten szkic
            </button>
            <button
              type="button"
              className={classes.primary}
              data-primary-action=""
              onClick={onConfirm}
            >
              Wczytaj mój szkic
            </button>
          </div>
        </div>
      )}
    >
      <div className={classes.content}>
        <div className={classes.documentSummary}>
          <span className={classes.documentMark} aria-hidden="true">CV</span>
          <div>
            <p className={classes.documentLabel}>Znaleziony dokument</p>
            <p className={classes.documentTitle}>{documentTitle}</p>
          </div>
        </div>

        <dl className={classes.consequences} aria-label="Skutki wyboru">
          <div className={classes.consequence}>
            <dt><span aria-hidden="true">01</span> Po wczytaniu</dt>
            <dd>Szkic otworzy się w edytorze. Na koncie zapiszesz go dopiero po kliknięciu „Zapisz”.</dd>
          </div>
          <div className={`${classes.consequence} ${classes.destructiveConsequence}`}>
            <dt><span aria-hidden="true">02</span> Po usunięciu</dt>
            <dd>Lokalna kopia zniknie z tej przeglądarki i nie będzie można jej odzyskać.</dd>
          </div>
        </dl>

        <p className={classes.reassurance}>
          Jeśli nie rozpoznajesz dokumentu, może pochodzić od innej osoby korzystającej z tego urządzenia.
          Zamknięcie okna zachowa szkic na później.
        </p>
      </div>
    </DialogShell>
  );
}
