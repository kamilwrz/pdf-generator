import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
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
 * Confirm hydrates the editor canvas. For an explicit download return it also
 * requests PDF export; it never saves a server document implicitly.
 * Dismissal is intentionally separate from decline: close, Escape, and the
 * backdrop keep the browser draft so an uncertain user never deletes work by
 * dismissing a prompt.
 */
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./ClaimGuestDocumentModal.module.css";

export default function ClaimGuestDocumentModal({ open, title, onConfirm, onDecline, onDismiss, download = false }) {
  useTranslation();
  const documentTitle = typeof title === "string" && title.trim()
    ? title.trim()
    : uiText("editor:claimGuestDocumentModal.untitledCvDraft");

  return (
    <DialogShell
      open={open}
      onClose={onDismiss}
      width={620}
      variant="decision"
      surface="paper"
      eyebrow={download ? uiText("editor:claimGuestDocumentModal.finalStepDownloadPdf") : uiText("editor:claimGuestDocumentModal.recoveringYourDraft")}
      title={uiText("editor:claimGuestDocumentModal.doesThisDraftBelongToYou")}
      subtitle={uiText("editor:claimGuestDocumentModal.weFoundACvSavedInThis")}
      initialFocusSelector="[data-primary-action]"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.dismiss} onClick={onDismiss}>{uiText("editor:claimGuestDocumentModal.decideLater")}</button>
          <div className={classes.decisionActions}>
            <button type="button" className={classes.decline} onClick={onDecline}>{uiText("editor:claimGuestDocumentModal.deleteThisDraft")}</button>
            <button
              type="button"
              className={classes.primary}
              data-primary-action=""
              onClick={onConfirm}
            >
              {download ? uiText("editor:claimGuestDocumentModal.thisIsMyCvDownloadPdf") : uiText("editor:claimGuestDocumentModal.loadMyDraft")}
            </button>
          </div>
        </div>
      )}
    >
      <div className={classes.content}>
        <div className={classes.documentSummary}>
          <span className={classes.documentMark} aria-hidden="true">CV</span>
          <div>
            <p className={classes.documentLabel}>{uiText("editor:claimGuestDocumentModal.documentFound")}</p>
            <p className={classes.documentTitle}>{documentTitle}</p>
          </div>
        </div>

        <dl className={classes.consequences} aria-label={uiText("editor:claimGuestDocumentModal.whatYourChoiceMeans")}>
          <div className={classes.consequence}>
            <dt><span aria-hidden="true">01</span> {uiText("editor:claimGuestDocumentModal.afterLoading")}</dt>
            <dd>{download ? uiText("editor:claimGuestDocumentModal.weWillLoadYourCvAndPrepare") : uiText("editor:claimGuestDocumentModal.theDraftWillOpenInTheEditor")}</dd>
          </div>
          <div className={`${classes.consequence} ${classes.destructiveConsequence}`}>
            <dt><span aria-hidden="true">02</span> {uiText("editor:claimGuestDocumentModal.afterDeletion")}</dt>
            <dd>{uiText("editor:claimGuestDocumentModal.theLocalCopyWillBeRemovedFrom")}</dd>
          </div>
        </dl>

        <p className={classes.reassurance}>{uiText("editor:claimGuestDocumentModal.ifYouDoNotRecogniseThisDocument")}</p>
      </div>
    </DialogShell>
  );
}
