import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t, getUiLanguage } from '../../i18n';
import { getAccessToken } from '../../utils/authSession';
import { interviewRequest } from '../../services/interviews';
import { ApiClient, ENDPOINTS } from '../../services/api';
import { CV_IMPORT_REQUEST_OPTIONS } from '../../utils/cvImportRequest';
import { fetchOwnedPdfDownload, triggerBlobDownload } from '../../utils/download';
import { useEntitlements } from '../../hooks/useEntitlements';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import InterviewFlow from '../../components/ai/Interview/InterviewFlow';
import CvContent from '../../components/ai/Interview/CvContent';
import SavedConversationDetails from './SavedConversationDetails';
import ui from '../../components/common/SiteLayout/SiteLayout.module.css';
import styles from './TailoringPage.module.css';

const empty = () => ({ source_kind: null, source_id: null, offer_kind: 'text', job_description: '', job_offer_url: '', language: getUiLanguage(), step: 'source' });
const intake = (flow) => Object.fromEntries(Object.keys(empty()).map(key => [key, flow[key]]));
const path = id => `/tailoring/${id}`;
const steps = ['source', 'offer', 'questions', 'review', 'download'];

/** Public entry explains price before authentication; private drafts belong to an account. */
export default function TailoringPage() {
  const { flowId } = useParams();
  useTranslation();
  return <SiteLayout workspace={Boolean(getAccessToken())} compact title={t('tailoring:title')} intro={t('tailoring:intro')}
    eyebrow={t('public:siteLayout.interview')}
    breadcrumbs={[{ label: t('public:siteLayout.interview'), to: '/app/assistant' }, { label: t('tailoring:title') }]}>
    {!getAccessToken() ? <section className={styles.panel}>
      <h2>{t('tailoring:guestTitle')}</h2><p>{t('tailoring:price')}</p><p>{t('tailoring:accountNeeded')}</p>
      <div className={ui.actions}><Link className={ui.primary} to="/register?returnTo=%2Fapp%2Ftailor">{t('tailoring:createAccount')}</Link><Link className={ui.secondary} to="/login?returnTo=%2Fapp%2Ftailor">{t('public:siteLayout.signIn')}</Link></div>
    </section> : flowId ? <Workspace key={flowId} id={flowId} /> : <FlowList />}
  </SiteLayout>;
}

/** Saved starts are explicit; simply opening this page never creates a draft or calls AI. */
function FlowList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const createId = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems((await interviewRequest('/tailoring')).items); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function create() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const flow = await interviewRequest(path(createId.current), 'PUT', { ...empty(), revision: 0 });
      navigate(`/app/tailor/${flow.id}`);
    } catch (err) { setError(err); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.panel}>
    <h2>{t('tailoring:beginTitle')}</h2><p>{t('tailoring:price')}</p>
    <p>{t('tailoring:sourceHint')}</p>
    <button className={ui.primary} disabled={busy} onClick={create}>{busy ? t('tailoring:working') : t('tailoring:begin')}</button>
    {error && <div role="alert" className={ui.error}><p>{error.message}</p><button className={ui.secondary} onClick={load}>{t('tailoring:reload')}</button></div>}
    {loading && <p role="status">{t('tailoring:loading')}</p>}
    {items.length > 0 && <section aria-labelledby="tailoring-history-title">
      <h2 id="tailoring-history-title" className={styles.listTitle}>{t('tailoring:resume')}</h2>
      <ul className={styles.list}>{items.map(item => <li key={item.id} aria-labelledby={`tailoring-title-${item.id}`}>
        <SavedConversationDetails session={{ ...item, mode: 'tailor' }} titleId={`tailoring-title-${item.id}`} />
        <div className={`${ui.actions} ${styles.listActions}`}>
          <Link className={ui.secondary} to={`/app/tailor/${item.id}`} aria-describedby={`tailoring-title-${item.id}`}>{t('tailoring:history.continue')}</Link>
          {item.document_id && <Link className={ui.secondary} to={`/app/documents/${item.document_id}`} aria-describedby={`tailoring-title-${item.id}`}>{t('tailoring:edit')}</Link>}
        </div>
      </li>)}</ul>
    </section>}
    {!loading && !error && items.length === 0 && <p className={styles.hint}>{t('tailoring:history.empty')}</p>}
  </section>;
}

/**
 * Coordinates free intake and the existing paid interview. Serial draft writes
 * preserve revisions across autosave/Continue; authored text never enters URLs
 * or local storage. Navigation guards retain an unsaved draft after a failure.
 */
function Workspace({ id }) {
  const { entitlements, refresh } = useEntitlements();
  const [flow, setFlow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [sources, setSources] = useState({ documents: [], imports: [] });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [interviewStep, setInterviewStep] = useState('questions');
  const [file, setFile] = useState(null);
  const remote = useRef(null);
  const current = useRef(null);
  const alive = useRef(true);
  const queue = useRef(Promise.resolve());
  const lock = useRef(false);
  const importKey = useRef(crypto.randomUUID());
  // Resume the same checkout after a browser refresh or cancelled redirect.
  const checkoutKey = useRef(`tailor-${id}`);
  const heading = useRef(null);
  const blocker = useBlocker(dirty);
  const documentId = flow?.document_id;
  const step = documentId ? 'download' : flow?.session_id ? interviewStep : draft?.step || 'source';
  const canAi = entitlements?.ai_assistant === true;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [saved, choices] = await Promise.all([interviewRequest(path(id)), interviewRequest('/tailoring/sources')]);
      if (!alive.current) return;
      remote.current = saved; current.current = intake(saved);
      setFlow(saved); setDraft(current.current); setSources(choices); setDirty(false);
    } catch (err) { if (alive.current) setError(err); }
  }, [id]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function change(patch) {
    current.current = { ...current.current, ...patch };
    setDraft(current.current); setDirty(true); setNotice('');
  }

  const save = useCallback((value) => {
    const perform = async () => {
      if (!remote.current || remote.current.locked) return remote.current;
      if (alive.current) setSaving(true);
      try {
        const saved = await interviewRequest(path(id), 'PUT', { ...value, revision: remote.current.revision });
        remote.current = saved;
        if (alive.current) {
          setFlow(saved);
          if (JSON.stringify(value) === JSON.stringify(current.current)) setDirty(false);
        }
        return saved;
      } finally { if (alive.current) setSaving(false); }
    };
    const result = queue.current.catch(() => {}).then(perform);
    queue.current = result;
    return result;
  }, [id]);
  useEffect(() => {
    if (!draft || !dirty || flow?.locked) return;
    const timer = setTimeout(() => { save(draft).catch(err => { if (alive.current) setError(err); }); }, 700);
    return () => clearTimeout(timer);
  }, [draft, dirty, flow?.locked, save]);

  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice('');
    try { await work(); }
    catch (err) { if (alive.current) setError(err); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function move(next) {
    const value = { ...current.current, step: next };
    await save(value);
    current.current = value; setDraft(value); setDirty(false);
  }
  async function upload() {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
    const result = await api.httpRequest(ENDPOINTS.AI.EXTRACT_CV, 'POST', form, t('tailoring:importError'), {
      ...CV_IMPORT_REQUEST_OPTIONS, headers: { 'Idempotency-Key': importKey.current },
    });
    const value = { ...current.current, source_kind: 'import', source_id: result.import.id };
    await save(value);
    current.current = value; setDraft(value); setDirty(false); setFile(null);
    setSources(await interviewRequest('/tailoring/sources')); refresh();
  }
  async function purchase() {
    const saved = await save(current.current);
    const response = await interviewRequest(ENDPOINTS.BILLING.SELECT_PLAN, 'POST', {
      plan_slug: 'pro', tailoring_flow_id: id,
    }, checkoutKey.current);
    if (response.checkout_url) window.location.assign(response.checkout_url);
    else { remote.current = saved; refresh(); setNotice('tailoring:paymentReady'); }
  }
  async function start() {
    const saved = await save(current.current);
    try {
      const started = await interviewRequest(`${path(id)}/start`, 'POST', { revision: saved.revision });
      remote.current = started; setFlow(started); setDirty(false);
    } catch (err) {
      // Read only after an uncertain start: recover a committed session or the
      // unlocked revision after validation, never repeat the start implicitly.
      const recovered = await interviewRequest(path(id)).catch(() => null);
      if (recovered) { remote.current = recovered; setFlow(recovered); }
      throw err;
    }
  }
  const savedDocument = useCallback((document_id) => {
    setFlow(value => ({ ...value, document_id })); setDirty(false);
  }, []);
  const selectedData = flow && draft?.source_id === flow.source_id && draft?.source_kind === flow.source_kind ? flow.source_cv_data : null;
  const hasOffer = draft && (draft.offer_kind === 'text' ? draft.job_description.trim() : draft.job_offer_url.trim());

  return <div className={styles.workspace}>
    <ol className={styles.steps} aria-label={t('tailoring:steps')}>{steps.map((item, index) => <li key={item} aria-current={item === step ? 'step' : undefined}><span>{index + 1}</span>{t(`tailoring:step.${item}`)}</li>)}</ol>
    <div className={styles.status} role="status">{saving ? t('tailoring:saving') : dirty ? t('tailoring:unsaved') : flow ? t('tailoring:saved') : t('tailoring:loading')}{busy && ` · ${t('tailoring:working')}`}{notice && ` · ${t(notice)}`}</div>
    {error && <div role="alert" className={ui.error}><p>{error.message}</p><div className={ui.actions}>
      {error.status === 401 ? <Link className={ui.secondary} to={`/login?returnTo=${encodeURIComponent(`/app/tailor/${id}`)}`}>{t('public:siteLayout.signIn')}</Link>
        : <button className={ui.secondary} disabled={busy || saving} onClick={() => run(load)}>{t('tailoring:reload')}</button>}
      {dirty && <button className={ui.secondary} disabled={busy} onClick={() => run(() => save(current.current))}>{t('tailoring:retrySave')}</button>}
    </div><p>{t('tailoring:reloadHint')}</p></div>}
    {blocker.state === 'blocked' && <section className={ui.notice} role="alert"><p>{t('tailoring:leaveHint')}</p><div className={ui.actions}><button className={ui.primary} onClick={() => blocker.reset()}>{t('tailoring:stay')}</button><button className={ui.secondary} onClick={() => blocker.proceed()}>{t('tailoring:leave')}</button></div></section>}
    {flow && draft && !flow.session_id && <section className={styles.panel} aria-busy={busy}>
      <h2 ref={heading} tabIndex={-1}>{t(`tailoring:step.${step}`)}</h2>
      <p>{t('tailoring:price')}</p>
      <fieldset disabled={busy || Boolean(flow.locked)} className={styles.fields}>
      {step === 'source' && <>
        <p>{t('tailoring:sourceHint')}</p>
        <label>{t('tailoring:file')}<input type="file" accept="application/pdf,.pdf" onChange={event => { setFile(event.target.files?.[0] || null); importKey.current = crypto.randomUUID(); }} /></label>
        {file && <button type="button" className={ui.secondary} disabled={file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')} onClick={() => run(upload)}>{t('tailoring:upload')}</button>}
        {file && (file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')) && <p role="alert">{t('tailoring:fileLimit')}</p>}
        {(sources.documents.length > 0 || sources.imports.length > 0) && <label>{t('tailoring:existing')}<select value={draft.source_id ? `${draft.source_kind}:${draft.source_id}` : ''} onChange={event => {
          const [kind, number] = event.target.value.split(':'); change({ source_kind: kind || null, source_id: number ? Number(number) : null });
        }}><option value="">{t('tailoring:chooseSource')}</option><optgroup label={t('tailoring:documents')}>{sources.documents.map(item => <option key={item.id} value={`document:${item.id}`}>{item.title}</option>)}</optgroup><optgroup label={t('tailoring:imports')}>{sources.imports.map(item => <option key={item.id} value={`import:${item.id}`}>{item.filename}</option>)}</optgroup></select></label>}
        <button type="button" className={ui.secondary} onClick={() => run(async () => { setSources(await interviewRequest('/tailoring/sources')); })}>{t('tailoring:recoverImport')}</button>
        <p className={styles.hint}>{t('tailoring:importHint')}</p>
        {selectedData && <details open className={styles.review}><summary>{t('tailoring:reviewSource')}</summary><CvContent data={selectedData} /></details>}
        <button className={ui.primary} disabled={!selectedData || saving || dirty} onClick={() => run(() => move('offer'))}>{t('tailoring:toOffer')}</button>
        <Link to="/app/new">{t('tailoring:noCv')}</Link>
      </>}
      {step === 'offer' && <>
        <p>{t('tailoring:offerHint')}</p>
        <fieldset className={styles.radios}><legend>{t('tailoring:offerInput')}</legend>{['text', 'url'].map(kind => <label key={kind}><input type="radio" name="offerKind" checked={draft.offer_kind === kind} onChange={() => change({ offer_kind: kind })} />{t(`tailoring:offer.${kind}`)}</label>)}</fieldset>
        {draft.offer_kind === 'text' ? <label>{t('tailoring:description')}<textarea rows={8} maxLength={20000} value={draft.job_description} onChange={event => change({ job_description: event.target.value })} /></label>
          : <label>{t('tailoring:url')}<input type="url" maxLength={2048} value={draft.job_offer_url} onChange={event => change({ job_offer_url: event.target.value })} placeholder="https://…" /><span className={styles.hint}>{t('tailoring:urlHint')}</span></label>}
        <label>{t('tailoring:language')}<select value={draft.language} onChange={event => change({ language: event.target.value })}><option value="pl">Polski</option><option value="en">English</option></select></label>
        <p>{t('tailoring:credits')}</p><p>{t('tailoring:confirmHint')}</p>
        <div className={ui.actions}>
          {canAi ? <button className={ui.primary} disabled={!hasOffer} onClick={() => run(start)}>{t('tailoring:startInterview')}</button>
            : <button className={ui.primary} disabled={!hasOffer || !entitlements} onClick={() => run(purchase)}>{t('tailoring:buyPro')}</button>}
          <button className={ui.secondary} onClick={() => run(() => move('source'))}>{t('tailoring:backSource')}</button>
        </div>
        {!entitlements && <button className={ui.secondary} onClick={refresh}>{t('tailoring:checkPlan')}</button>}
      </>}
      </fieldset>
      {flow.locked && !flow.session_id && <div className={ui.notice}><p>{t('tailoring:recoverStart')}</p><button className={ui.primary} disabled={busy} onClick={() => run(start)}>{t('tailoring:retryStart')}</button></div>}
    </section>}
    {flow?.session_id && !documentId && <InterviewFlow sessionId={flow.session_id} mode="tailor" guided onGuidedStage={setInterviewStep} onDocumentSaved={savedDocument} />}
    {documentId && <section className={styles.panel}>
      <h2 ref={heading} tabIndex={-1}>{t('tailoring:ready')}</h2><p>{t('tailoring:readyHint')}</p>
      <div className={ui.actions}><button className={ui.primary} disabled={busy} onClick={() => run(async () => {
        const result = await fetchOwnedPdfDownload(documentId, { retries: 0 });
        triggerBlobDownload(result.blob, result.title); setNotice('tailoring:downloaded');
      })}>{t('tailoring:download')}</button><Link className={ui.secondary} to={`/app/documents/${documentId}`}>{t('tailoring:edit')}</Link></div>
      <Link to="/app/documents">{t('tailoring:documents')}</Link>
    </section>}
  </div>;
}
