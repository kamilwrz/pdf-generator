import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
  useTranslation();
  const handleClose = isSaving ? () => {} : onCancel;

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      width={460}
      title={isNewDocument ? uiText("editor:unsavedChangesDialog.unsavedCv") : uiText("editor:unsavedChangesDialog.unsavedChanges")}
      subtitle={isNewDocument ? uiText("editor:unsavedChangesDialog.thisCvHasNotBeenSavedTo") : uiText("editor:unsavedChangesDialog.changesToThisCvHaveNotBeen")}
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
          >{uiText("editor:unsavedChangesDialog.returnToEditing")}</button>
          <button
            type="button"
            className={classes.discard}
            onClick={onDiscard}
            disabled={isSaving}
          >
            {isNewDocument ? uiText("editor:unsavedChangesDialog.discardCv") : uiText("editor:unsavedChangesDialog.discardChanges")}
          </button>
          <button
            type="button"
            className={classes.save}
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Zapisywanie…" : uiText("editor:unsavedChangesDialog.saveAndContinue")}
          </button>
        </div>
      )}
    >
      <div className={classes.body}>
        <span className={classes.marker} aria-hidden="true">!</span>
        <p>
          {isNewDocument
            ? uiText("editor:unsavedChangesDialog.ifYouContinueYouWillLoseThis")
            : uiText("editor:unsavedChangesDialog.ifYouContinueYouWillLoseChanges")}
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
