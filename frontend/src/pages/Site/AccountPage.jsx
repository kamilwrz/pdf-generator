/** Read server-owned limits and reuse the existing plan selection transaction. */
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  const { entitlements, loading, error, refresh } = useEntitlements();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [isPlanModal, setPlanModal] = useState(() => params.get('purchase') === 'pro');
  const [notice, setNotice] = useState(null);
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
      setNotice({ title: 'Google połączone', msg: 'Od teraz możesz logować się także przez Google.', variant: 'success' });
    } catch (error) {
      setNotice({ title: 'Nie udało się połączyć Google', msg: error.message, variant: 'error' });
    }
  }, []);
  const handleExport = useCallback(async () => {
    setPrivacyAction('export');
    try {
      await downloadAccountData();
      setNotice({ title: 'Eksport gotowy', msg: 'Plik JSON został pobrany na Twoje urządzenie.', variant: 'success' });
    } catch (error) {
      setNotice({ title: 'Nie udało się pobrać danych', msg: error.message, variant: 'error' });
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
      setNotice({ title: 'Nie udało się usunąć konta', msg: error.message, variant: 'error' });
      setPrivacyAction(null);
      setDeletionOpen(false);
    }
  }, [confirmation, navigate, username]);
  const metrics = [['Projekty CV', 'projects', 'max_projects'], ['Pobrania PDF w miesiącu', 'exports_count', 'max_exports_per_month'], ['Importy CV w miesiącu', 'cv_imports_count', 'max_cv_imports_per_month'], ['Kredyty AI', 'ai_credits_used', 'monthly_ai_credits']];
  return <SiteLayout workspace title="Konto i plan" intro={`Konto: ${getSessionUsername() || 'zalogowany użytkownik'}`}>
    {requestedTemplate && <p className={classes.notice}>Wybrany szablon: {requestedTemplate.name}. <Link to={getEditorPath({ start: "new", template: requestedTemplate.id })}>Wróć do konfiguracji CV</Link></p>}
    {loading && <p role="status">Ładowanie aktualnych limitów…</p>}
    {error && <div className={classes.error} role="alert"><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Faccount">Zaloguj się ponownie</Link> : <button className={classes.secondary} onClick={refresh}>Spróbuj ponownie</button>}</div>}
    {notice && <div className={notice.variant === 'error' ? classes.error : classes.notice} role={notice.variant === 'error' ? 'alert' : 'status'}><strong>{notice.title}</strong><p>{notice.msg}</p></div>}
    {entitlements && <section className={classes.section}><h2>Twój plan: {entitlements.plan_name}</h2><dl>{metrics.map(([label, usage, limit]) => <div className={classes.row} key={usage}><dt>{label}</dt><dd>{entitlements.usage?.[usage] ?? '—'} / {entitlements.limits?.[limit] === null ? 'bez limitu' : entitlements.limits?.[limit] ?? '—'}</dd></div>)}</dl><div className={classes.actions}><button className={classes.primary} onClick={showPlanModal}>Zmień plan</button><Link className={classes.secondary} to="/pricing">Porównaj plany</Link></div></section>}
    <section className={classes.section}><h2>Logowanie Google</h2><p>Połącz konto tylko z adresem e-mail użytym w CV Studio.</p><GoogleSignInButton onCredential={handleGoogleLink} label="continue_with" /></section>
    <section className={classes.section} aria-labelledby="privacy-controls"><h2 id="privacy-controls">Twoje dane</h2><p>Pobierz przenośną kopię danych konta albo trwale usuń konto wraz z dokumentami, zdjęciami, importami i historią rozliczeń przechowywaną przez CV Studio.</p><p>Przed usunięciem pobierz osobno gotowe pliki PDF, których chcesz zachować.</p><div className={classes.actions}><button className={classes.secondary} disabled={privacyAction !== null} onClick={handleExport}>{privacyAction === 'export' ? 'Przygotowywanie…' : 'Pobierz moje dane'}</button><button className={classes.danger} disabled={privacyAction !== null} onClick={() => { setConfirmation(''); setDeletionOpen(true); }}>Usuń konto</button><Link to="/privacy">Przeczytaj politykę prywatności</Link></div></section>
    <div className={classes.actions}><Link to="/app/documents">Wróć do dokumentów</Link><button className={classes.secondary} onClick={() => { clearAccessToken(); navigate('/', { replace: true }); }}>Wyloguj się</button></div>
    <SessionContext.Provider value={{ entitlements, refreshEntitlements: refresh, pushToast }}><UiSurfacesContext.Provider value={{ isPlanModal, showPlanModal }}><PlanSelectModal /></UiSurfacesContext.Provider></SessionContext.Provider>
    <DialogShell open={deletionOpen} onClose={() => { if (privacyAction !== 'delete') setDeletionOpen(false); }} title="Usunąć konto na zawsze?" subtitle="Dokumenty, zdjęcia, importy, dane planu, operacje AI i rekordy płatności zapisane w CV Studio zostaną trwale usunięte. Tej operacji nie można cofnąć." role="alertdialog" variant="decision" surface="paper" initialFocusSelector="#account-delete-confirmation" footer={<div className={classes.actions}><button data-cancel-delete className={classes.secondary} disabled={privacyAction === 'delete'} onClick={() => setDeletionOpen(false)}>Anuluj</button><button className={classes.danger} disabled={confirmation !== username || privacyAction === 'delete'} onClick={handleDelete}>{privacyAction === 'delete' ? 'Usuwanie…' : 'Usuń konto trwale'}</button></div>}>
      <div className={classes.dialogContent}><p>Wpisz nazwę użytkownika <strong>{username}</strong>, aby potwierdzić.</p><div className={classes.field}><label htmlFor="account-delete-confirmation">Nazwa użytkownika</label><input id="account-delete-confirmation" value={confirmation} autoComplete="off" spellCheck="false" onChange={(event) => setConfirmation(event.target.value)} /></div></div>
    </DialogShell>
  </SiteLayout>;
}
