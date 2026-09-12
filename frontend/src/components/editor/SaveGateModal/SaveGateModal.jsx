import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/**
 * Account gate for guest save, download, and CV-import intents.
 *
 * Each intent explains its actual side effect: saving persists the project,
 * downloading only hands a rendered PDF to the browser, and importing returns
 * to the protected upload flow. Existing browser drafts remain local until the
 * user explicitly claims and saves them after authentication.
 */
import { useNavigate } from "react-router-dom";
import DialogShell from "../../common/DialogShell/DialogShell";
import classes from "./SaveGateModal.module.css";

const CONTENT_BY_PURPOSE = {
  import: {
    eyebrow: "Import CV",
    get title() { return uiText("editor:saveGateModal.continueImportOnYourAccount"); },
    get subtitle() { return uiText("editor:saveGateModal.afterSigningInOrRegisteringYouWill"); },
    get lead() { return uiText("editor:saveGateModal.atThisStageWeDoNotSelect"); },
    facts: [
      { value: "1 import", get label() { return uiText("editor:saveGateModal.pdfFilePerMonth"); } },
      { get value() { return uiText("editor:saveGateModal.noChanges"); }, get label() { return uiText("editor:saveGateModal.inTheCurrentDraft"); } },
    ],
    get reassurance() { return uiText("editor:saveGateModal.yourImportIntentIsRetainedSoYou"); },
  },
  download: {
    get eyebrow() { return uiText("editor:saveGateModal.downloadingPdf"); },
    get title() { return uiText("editor:saveGateModal.downloadYourCvAsAPdf"); },
    get subtitle() { return uiText("editor:saveGateModal.afterSigningInOrRegisteringYouCan"); },
    get lead() { return uiText("editor:saveGateModal.downloadingDoesNotSaveYourCvIn"); },
    facts: [
      { get value() { return uiText("editor:saveGateModal.pdfFiles"); }, get label() { return uiText("editor:saveGateModal.downloadsPerMonth"); } },
      { get value() { return uiText("editor:saveGateModal.noWatermark"); }, get label() { return uiText("editor:saveGateModal.inEveryDownloadedFile"); } },
    ],
    get reassurance() { return uiText("editor:saveGateModal.afterSigningInConfirmThatThisCv"); },
  },
  save: {
    get eyebrow() { return uiText("editor:pdfOperationProgressModal.saveCv"); },
    get title() { return uiText("editor:saveGateModal.saveTheDraftToYourAccount"); },
    get subtitle() { return uiText("editor:saveGateModal.yourCurrentWorkRemainsAvailableWhenYou"); },
    get lead() { return uiText("editor:saveGateModal.aFreeAccountLetsYouSaveProgress"); },
    facts: [
      { value: "1 CV", get label() { return uiText("editor:saveGateModal.savedToYourAccount"); } },
      { get value() { return uiText("editor:saveGateModal.pdfFiles"); }, get label() { return uiText("editor:saveGateModal.downloadsPerMonth"); } },
    ],
    get reassurance() { return uiText("editor:saveGateModal.theDraftIsAlsoSavedLocallyIn"); },
  },
};

export default function SaveGateModal({ open, onCancel, purpose = "save" }) {
  useTranslation();
  const navigate = useNavigate();
  const authQuery = ["import", "download"].includes(purpose) ? `?start=${purpose}` : "";
  const content = CONTENT_BY_PURPOSE[purpose] ?? CONTENT_BY_PURPOSE.save;

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      width={620}
      variant="decision"
      surface="paper"
      eyebrow={content.eyebrow}
      title={content.title}
      subtitle={content.subtitle}
      initialFocusSelector="[data-primary-action]"
      footer={(
        <div className={classes.actions}>
          <button type="button" className={classes.cancel} onClick={onCancel}>{uiText("editor:saveGateModal.returnToEditor")}</button>
          <div className={classes.accountActions}>
            <button
              type="button"
              className={classes.secondary}
              onClick={() => navigate(`/login${authQuery}`)}
            >{uiText("public:siteLayout.signIn")}</button>
            <button
              type="button"
              className={classes.primary}
              data-primary-action=""
              onClick={() => navigate(`/register${authQuery}`)}
            >{uiText("editor:saveGateModal.createAFreeAccount")}</button>
          </div>
        </div>
      )}
    >
      <div className={classes.content}>
        <p className={classes.lead}>{content.lead}</p>
        <dl className={classes.facts} aria-label={uiText("editor:saveGateModal.freeAccountIncludes")}>
          {content.facts.map((fact, index) => (
            <div className={classes.fact} key={fact.value}>
              <dt>
                <span aria-hidden="true">0{index + 1}</span>
                {fact.value}
              </dt>
              <dd>{fact.label}</dd>
            </div>
          ))}
        </dl>
        <p className={classes.reassurance}>{content.reassurance}</p>
      </div>
    </DialogShell>
  );
}
