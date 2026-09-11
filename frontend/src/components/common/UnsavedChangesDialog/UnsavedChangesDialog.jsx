import DialogShell from "../DialogShell/DialogShell";
import classes from "./UnsavedChangesDialog.module.css";

/**
 * Confirms destructive navigation for authenticated documents.
 *
 * Guest drafts never reach this dialog: `useDirtyGuard` flushes their local
 * snapshot synchronously and lets navigation continue. Keeping that policy in
 * the guard prevents individual buttons from drifting into different save
 * semantics.
 */
export default function UnsavedChangesDialog({
  open,
  onCancel,
  onDiscard,
  onSave,
  isSaving = false,
  isNewDocument = false,
  error = "",
}) {
  const handleClose = isSaving ? () => {} : onCancel;

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      width={460}
      title={isNewDocument ? "Niezapisane CV" : "Niezapisane zmiany"}
      subtitle={isNewDocument ? "To CV nie zostało jeszcze zapisane na koncie" : "Zmiany w tym CV nie zostały jeszcze zapisane"}
      role="alertdialog"
      layer="recovery"
      initialFocusSelector="[data-unsaved-cancel]"
      footer={(
        <div className={classes.actions}>
          <button
            type="button"
            className={classes.cancel}
            data-unsaved-cancel=""
            onClick={onCancel}
            disabled={isSaving}
          >
            Wróć do edycji
          </button>
          <button
            type="button"
            className={classes.discard}
            onClick={onDiscard}
            disabled={isSaving}
          >
            {isNewDocument ? "Odrzuć CV" : "Odrzuć zmiany"}
          </button>
          <button
            type="button"
            className={classes.save}
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Zapisywanie…" : "Zapisz i kontynuuj"}
          </button>
        </div>
      )}
    >
      <div className={classes.body}>
        <span className={classes.marker} aria-hidden="true">!</span>
        <p>
          {isNewDocument
            ? "Jeśli przejdziesz dalej, utracisz to CV. Zapisz je, aby wrócić do niego w Moich dokumentach."
            : "Jeśli przejdziesz dalej, utracisz zmiany od ostatniego zapisu. Zapisana wersja CV pozostanie w Moich dokumentach."}
        </p>
        {error ? (
          <p className={classes.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </DialogShell>
  );
}
