import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Read server-owned limits and reuse the existing plan selection transaction. */
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiUser, FiFolder, FiDownload, FiUpload, FiZap, FiShield, FiKey } from 'react-icons/fi';
import { HeroNote, SiteMarker, UsageMetric } from '../../components/common/SiteLayout/SitePrimitives';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import { clearAccessToken, clearLocalAccountData, getEditorPath, getSessionUsername } from '../../utils/authSession';
import { useEntitlements } from '../../hooks/useEntitlements';
import { SessionContext } from '../../store/session-context';
import { UiSurfacesContext } from '../../store/ui-surfaces-context';
import { TEMPLATES } from '../../templates';
import PlanSelectModal from '../../components/modals/PlanSelectModal/PlanSelectModal';
import GoogleSignInButton from '../../components/common/GoogleSignInButton/GoogleSignInButton';
import { linkGoogle } from '../../services/authApi';
import { deleteAccount, downloadAccountData } from '../../services/accountApi';
import DialogShell from '../../components/common/DialogShell/DialogShell';

export default function AccountPage() {
  useTranslation();
  const { entitlements, loading, error, refresh } = useEntitlements();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [isPlanModal, setPlanModal] = useState(() => params.get('purchase') === 'pro');
  const [notice, setNotice] = useMessageState(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [privacyAction, setPrivacyAction] = useState(null);
  const username = getSessionUsername() || '';
  const requestedTemplate = TEMPLATES.find((template) => template.id === params.get("template"));
  const showPlanModal = useCallback(() => setPlanModal((open) => !open), []);
  const pushToast = useCallback((message) => setNotice(message), []);
  const handleGoogleLink = useCallback(async (credential) => {
    try {
      await linkGoogle(credential);
      setNotice({ title: messageRef("account:accountPage.googleConnected"), msg: messageRef("account:accountPage.youCanNowAlsoSignInWith"), variant: 'success' });
    } catch (error) {
      setNotice({ title: messageRef("account:accountPage.couldNotConnectGoogle"), msg: messageOf(error), variant: 'error' });
    }
  }, []);
  const handleExport = useCallback(async () => {
    setPrivacyAction('export');
    try {
      await downloadAccountData();
      setNotice({ title: messageRef("account:accountPage.exportReady"), msg: messageRef("account:accountPage.theJsonFileHasBeenDownloadedTo"), variant: 'success' });
    } catch (error) {
      setNotice({ title: messageRef("account:accountPage.couldNotDownloadYourData"), msg: messageOf(error), variant: 'error' });
    } finally {
      setPrivacyAction(null);
    }
  }, []);
  const handleDelete = useCallback(async () => {
    if (confirmation !== username) return;
    setPrivacyAction('delete');
    try {
      await deleteAccount(confirmation);
      clearLocalAccountData();
      navigate('/', { replace: true });
    } catch (error) {
      setNotice({ title: messageRef("account:accountPage.couldNotDeleteYourAccount"), msg: messageOf(error), variant: 'error' });
      setPrivacyAction(null);
      setDeletionOpen(false);
    }
  }, [confirmation, navigate, username]);
  const metrics = [[uiText("account:accountPage.cvProjects"), 'projects', 'max_projects', <FiFolder key="projects" />], [uiText("account:accountPage.pdfDownloadsPerMonth"), 'exports_count', 'max_exports_per_month', <FiDownload key="exports" />], [uiText("account:accountPage.cvImportsPerMonth"), 'cv_imports_count', 'max_cv_imports_per_month', <FiUpload key="imports" />], [uiText("account:accountPage.aiCredits"), 'ai_credits_used', 'monthly_ai_credits', <FiZap key="ai" />]];
  return <SiteLayout workspace title={uiText("interview:interviewFlow.accountAndPlan")} eyebrow={uiText("account:accountPage.yourWorkspace")} intro={uiText("account:accountPage.checkPlanUsageConnectSignInMethods")}
    heroAside={<HeroNote icon={<FiUser />} label={uiText("account:accountPage.yourAccount")} title={username || uiText("account:accountPage.signedInUser")}><p>{uiText("account:accountPage.documentsAndSettingsInOnePlace")}</p><Link to="/app/documents">{uiText("editor:pdfCanvas.backToDocuments")}</Link></HeroNote>}>
    {requestedTemplate && <p className={classes.notice}>{uiText("account:accountPage.selectedTemplate")} {requestedTemplate.name}. <Link to={getEditorPath({ start: "new", template: requestedTemplate.id })}>{uiText("account:accountPage.backToCvSetup")}</Link></p>}
    {loading && <div role="status"><p>{uiText("account:accountPage.loadingCurrentAllowances")}</p><div className={classes.metrics}>{metrics.map(([label]) => <div key={label} className={classes.skeleton} aria-hidden="true" />)}</div></div>}
    {error && <div className={classes.error} role="alert"><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Faccount">{uiText("editor:pdfCanvas.signInAgain")}</Link> : <button className={classes.secondary} onClick={refresh}>{uiText("errors:errorBoundary.tryAgain")}</button>}</div>}
    {notice && <div className={notice.variant === 'error' ? classes.error : classes.notice} role={notice.variant === 'error' ? 'alert' : 'status'}><strong>{notice.title}</strong><p>{notice.msg}</p></div>}
    {entitlements && <section className={classes.accountPlan}><div className={classes.sectionHeading}><div><p className={classes.eyebrow}>{uiText("account:accountPage.planAndUsage")}</p><h2>{uiText("account:accountPage.yourPlan")} {entitlements.plan_name}</h2></div><div className={classes.actions}><button className={classes.primary} onClick={showPlanModal}>{uiText("editor:sidebar.changePlan")}</button><Link className={classes.secondary} to="/pricing">{uiText("auth:register.comparePlans")}</Link></div></div><dl className={classes.metrics}>{metrics.map(([label, usage, limit, icon]) => <UsageMetric key={usage} label={label} used={entitlements.usage?.[usage]} limit={entitlements.limits?.[limit]} icon={icon} />)}</dl></section>}
    {entitlements?.ai_assistant === true && <section className={classes.supportPanel} aria-labelledby="pro-interview-heading"><SiteMarker><FiZap /></SiteMarker><div><p className={classes.eyebrow}>{uiText("account:accountPage.interviewIncludedInYourPro")}</p><h2 id="pro-interview-heading">{uiText("account:accountPage.startByTalkingAboutYourExperience")}</h2><p>{uiText("account:accountPage.anInterviewHelpsDescribeSpecificActivitiesAnd")}</p><div className={classes.actions}><Link className={classes.primary} to="/app/interview">{uiText("account:accountPage.createACvThroughAnInterview")} <FiZap aria-hidden="true" /></Link><Link to="/help#wywiad">{uiText("editor:startChooser.howInterviewsWork")}</Link><Link to="/app/career-profile">{uiText("account:accountPage.profileAndSavedInterviews")}</Link></div></div></section>}
    <div className={classes.settingsGrid}>
    <section className={classes.settingsPanel}><SiteMarker><FiKey /></SiteMarker><h2>{uiText("account:accountPage.googleSignIn")}</h2><p>{uiText("account:accountPage.connectOnlyTheEmailAddressYouUse")}</p><GoogleSignInButton onCredential={handleGoogleLink} label="continue_with" /></section>
    <section className={classes.settingsPanel} aria-labelledby="privacy-controls"><SiteMarker><FiShield /></SiteMarker><h2 id="privacy-controls">{uiText("account:accountPage.yourData")}</h2><p>{uiText("account:accountPage.downloadAPortableCopyOfYourAccount")}</p><div className={classes.actions}><button className={classes.secondary} disabled={privacyAction !== null} onClick={handleExport}><FiDownload aria-hidden="true" />{privacyAction === 'export' ? 'Przygotowywanie…' : uiText("account:accountPage.downloadMyData")}</button><Link to="/privacy">{uiText("account:accountPage.readThePrivacyPolicy")}</Link></div><div className={classes.destructiveArea}><p>{uiText("account:accountPage.beforeDeletingYourAccountDownloadAnyFinished")}</p><button className={classes.danger} disabled={privacyAction !== null} onClick={() => { setConfirmation(''); setDeletionOpen(true); }}>{uiText("account:accountPage.deleteAccount")}</button></div></section>
    </div>
    <div className={classes.sessionActions}><span>{uiText("account:accountPage.signedInAs")} <strong>{username || uiText("account:accountPage.user")}</strong></span><button className={classes.secondary} onClick={() => { clearAccessToken(); navigate('/', { replace: true }); }}>{uiText("editor:sidebar.signOut")}</button></div>
    <SessionContext.Provider value={{ entitlements, refreshEntitlements: refresh, pushToast }}><UiSurfacesContext.Provider value={{ isPlanModal, showPlanModal }}><PlanSelectModal /></UiSurfacesContext.Provider></SessionContext.Provider>
    <DialogShell open={deletionOpen} onClose={() => { if (privacyAction !== 'delete') setDeletionOpen(false); }} title={uiText("account:accountPage.deleteYourAccountPermanently")} subtitle={uiText("account:accountPage.documentsPhotosImportsPlanDataAiOperations")} role="alertdialog" variant="decision" surface="paper" initialFocusSelector="#account-delete-confirmation" footer={<div className={classes.actions}><button data-cancel-delete className={classes.secondary} disabled={privacyAction === 'delete'} onClick={() => setDeletionOpen(false)}>{uiText("ai:aiAssistant.cancel")}</button><button className={classes.danger} disabled={confirmation !== username || privacyAction === 'delete'} onClick={handleDelete}>{privacyAction === 'delete' ? 'Usuwanie…' : uiText("account:accountPage.deleteAccountPermanently")}</button></div>}>
      <div className={classes.dialogContent}><p>{uiText("auth:login.enterYourUsername")} <strong>{username}</strong>{uiText("account:accountPage.toConfirm")}</p><div className={classes.field}><label htmlFor="account-delete-confirmation">{uiText("auth:login.username")}</label><input id="account-delete-confirmation" value={confirmation} autoComplete="off" spellCheck="false" onChange={(event) => setConfirmation(event.target.value)} /></div></div>
    </DialogShell>
  </SiteLayout>;
}
