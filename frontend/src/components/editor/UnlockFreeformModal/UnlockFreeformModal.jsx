import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Confirm converting a template document into a freeform project (via copy).
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./UnlockFreeformModal.module.css";

export default function UnlockFreeformModal({ open, onCancel, onConfirm }) {
  useTranslation();
  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={440}
      title={uiText("editor:unlockFreeformModal.unlockFreeformEditing")}
      subtitle={uiText("editor:unlockFreeformModal.switchFromTemplateModeToFreeformEditing")}
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={onCancel}>{uiText("ai:aiAssistant.cancel")}</button>
          <button type="button" className={classes.primary} onClick={onConfirm}>{uiText("editor:unlockFreeformModal.createACopyAndUnlock")}</button>
        </div>
      )}
    >
      <p className={classes.copy}>{uiText("editor:unlockFreeformModal.thisDocumentWillBecomeAFreeformProject")}</p>
      <p className={classes.note}>{uiText("editor:unlockFreeformModal.weCreateACopySoYouCan")}</p>
    </DialogShell>
  );
}
