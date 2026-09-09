/** Read server-owned limits and reuse the existing plan selection transaction. */
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import classes from '../../components/common/SiteLayout/SiteLayout.module.css';
import { clearAccessToken, getEditorPath, getSessionUsername } from '../../utils/authSession';
import { useEntitlements } from '../../hooks/useEntitlements';
import { SessionContext } from '../../store/session-context';
import { UiSurfacesContext } from '../../store/ui-surfaces-context';
import { TEMPLATES } from '../../templates';
import PlanSelectModal from '../../components/modals/PlanSelectModal/PlanSelectModal';

export default function AccountPage() {
  const { entitlements, loading, error, refresh } = useEntitlements();
  const [isPlanModal, setPlanModal] = useState(false);
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedTemplate = TEMPLATES.find((template) => template.id === params.get("template"));
  const showPlanModal = useCallback(() => setPlanModal((open) => !open), []);
  const pushToast = useCallback((message) => setNotice(message), []);
  const metrics = [['Projekty CV', 'projects', 'max_projects'], ['Pobrania PDF w miesiącu', 'exports_count', 'max_exports_per_month'], ['Importy CV w miesiącu', 'cv_imports_count', 'max_cv_imports_per_month'], ['Kredyty AI', 'ai_credits_used', 'monthly_ai_credits']];
  return <SiteLayout workspace title="Konto i plan" intro={`Konto: ${getSessionUsername() || 'zalogowany użytkownik'}`}>
    {requestedTemplate && <p className={classes.notice}>Wybrany szablon: {requestedTemplate.name}. <Link to={getEditorPath({ start: "new", template: requestedTemplate.id })}>Wróć do konfiguracji CV</Link></p>}
    {loading && <p role="status">Ładowanie aktualnych limitów…</p>}
    {error && <div className={classes.error} role="alert"><p>{error.message}</p>{error.status === 401 ? <Link to="/login?returnTo=%2Fapp%2Faccount">Zaloguj się ponownie</Link> : <button className={classes.secondary} onClick={refresh}>Spróbuj ponownie</button>}</div>}
    {notice && <div className={notice.variant === 'error' ? classes.error : classes.notice} role={notice.variant === 'error' ? 'alert' : 'status'}><strong>{notice.title}</strong><p>{notice.msg}</p></div>}
    {entitlements && <section className={classes.section}><h2>Twój plan: {entitlements.plan_name}</h2><dl>{metrics.map(([label, usage, limit]) => <div className={classes.row} key={usage}><dt>{label}</dt><dd>{entitlements.usage?.[usage] ?? '—'} / {entitlements.limits?.[limit] === null ? 'bez limitu' : entitlements.limits?.[limit] ?? '—'}</dd></div>)}</dl><div className={classes.actions}><button className={classes.primary} onClick={showPlanModal}>Zmień plan</button><Link className={classes.secondary} to="/pricing">Porównaj plany</Link></div></section>}
    <div className={classes.actions}><Link to="/app/documents">Wróć do dokumentów</Link><button className={classes.secondary} onClick={() => { clearAccessToken(); navigate('/', { replace: true }); }}>Wyloguj się</button></div>
    <SessionContext.Provider value={{ entitlements, refreshEntitlements: refresh, pushToast }}><UiSurfacesContext.Provider value={{ isPlanModal, showPlanModal }}><PlanSelectModal /></UiSurfacesContext.Provider></SessionContext.Provider>
  </SiteLayout>;
}
