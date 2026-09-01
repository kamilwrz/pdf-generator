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
  error = "",
}) {
  const handleClose = isSaving ? () => {} : onCancel;

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      width={460}
      title="Niezapisane zmiany"
      subtitle="Ta wersja dokumentu nie została jeszcze zapisana"
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
            Odrzuć zmiany
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
          Jeśli przejdziesz dalej, zmiany wprowadzone od ostatniego zapisu
          zostaną utracone.
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
