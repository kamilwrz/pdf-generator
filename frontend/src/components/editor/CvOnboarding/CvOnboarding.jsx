import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiArrowRight, FiCheck, FiFileText, FiUpload } from 'react-icons/fi';
import { t } from '../../../i18n';
import { getAccessToken, getSessionUsername } from '../../../utils/authSession';
import { createDefaultStarterConfig } from '../../../utils/cvStarter';
import { clearOnboarding, loadOnboarding, onboardingSteps, saveOnboarding } from '../../../utils/cvOnboarding';
import { isTemplateAllowed } from '../../../utils/entitlements';
import { cvImportRecoveryMessage, cvImportStatusLabel } from '../../../utils/cvImportRequest';
import { TEMPLATES } from '../../../templates';
import { interviewRequest } from '../../../services/interviews';
import { extractCvPdf, readCvSource, validateCvPdf } from '../../../services/cvImport';
import DialogShell from '../../common/DialogShell/DialogShell';
import CvSetupOptions from './CvSetupOptions';
import styles from './CvOnboarding.module.css';

/**
 * One creation flow for guests and accounts. Only the final create callback may
 * replace the active canvas; source reads and navigation never run paid AI.
 * The journal contains choices and owned IDs, while extracted content stays in
 * memory. Request epochs prevent a dismissed/replaced flow adopting late data.
 */
export default function CvOnboarding({ initialTemplateId, initialIntent, initialImportId, entitlements, refreshEntitlements,
  onCreate, onImportCreate, onClose, onNavigate, legacyDraftAvailable, onRecoverLegacyDraft, hasActiveDocument, hasSavedDocument, isGuest }) {
  useTranslation();
  const owner = getSessionUsername();
  const [draft, setDraft] = useState(() => {
    const saved = (!initialIntent || initialIntent === 'onboarding') && loadOnboarding(owner);
    if (saved) return saved;
    const config = createDefaultStarterConfig();
    if (TEMPLATES.some(item => item.id === initialTemplateId)) config.templateId = initialTemplateId;
    return { version: 1, owner, mode: initialImportId || initialIntent === 'import' ? 'existing' : 'blank',
      step: initialImportId ? 'goal' : initialIntent === 'import' ? 'source' : 'start', goal: 'manual', config,
      source: initialImportId ? { kind: 'import', id: initialImportId } : null, importKey: null, tailoringId: null };
  });
  const [sourceData, setSourceData] = useState(null);
  const [choices, setChoices] = useState(null);
  const [history, setHistory] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [guideFailed, setGuideFailed] = useState(false);
  const heading = useRef(null);
  const completed = useRef(false);
  const departing = useRef(false);
  const fileInput = useRef(null);
  const lock = useRef(false);
  const epoch = useRef(0);
  const alive = useRef(true);
  const listLock = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const patch = useCallback(value => setDraft(current => ({ ...current, ...value })), []);
  const setConfig = useCallback(value => { setSectionError(''); setDraft(current => ({ ...current, config: typeof value === 'function' ? value(current.config) : value })); }, []);
  const rail = onboardingSteps(draft.mode, draft.goal);
  const activeIndex = rail.indexOf(draft.step);
  const knownAccess = typeof entitlements?.ai_assistant === 'boolean';
  const knownImportAccess = typeof entitlements?.extract_cv === 'boolean';
  const knownTemplateAccess = isGuest || entitlements?.template_tier === 'all' || Array.isArray(entitlements?.allowed_template_ids);
  // A partial entitlement response must not unlock paid template selection.
  const templateEntitlements = knownTemplateAccess ? entitlements : null;
  const remaining = entitlements?.remaining?.cv_imports;
  const importAllowed = entitlements?.extract_cv === true && (remaining == null || remaining > 0);
  const template = TEMPLATES.find(item => item.id === draft.config.templateId);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; epoch.current += 1; };
  }, []);
  useEffect(() => { setStorageFailed(!saveOnboarding(draft)); }, [draft]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [draft.step]);
  useEffect(() => {
    const previous = document.title;
    document.title = `${t('onboarding:stepCount', { current: activeIndex + 1, total: rail.length })}: ${t(`onboarding:step.${draft.step}`)} | CV Studio`;
    return () => { document.title = previous; };
  }, [activeIndex, rail.length, draft.step]);

  // A source reference is rehydrated through an ownership-checked read after
  // refresh/authentication. No source content is trusted from browser storage.
  const restoreSource = useCallback(async () => {
    const source = draftRef.current.source;
    if (!source || !getAccessToken()) return;
    const request = ++epoch.current;
    setBusy(true); lock.current = true; setError('');
    try {
      const result = await readCvSource(source);
      if (alive.current && request === epoch.current) setSourceData(result);
    } catch (failure) {
      if (alive.current && request === epoch.current) setError(failure.message);
    } finally {
      if (alive.current && request === epoch.current) { setBusy(false); lock.current = false; }
    }
  }, []);
  useEffect(() => { if (draftRef.current.source && draftRef.current.mode === 'existing') void restoreSource(); }, [restoreSource]);

  const loadSources = useCallback(async (cursor = null) => {
    if (listLock.current || !getAccessToken()) return;
    listLock.current = true; setLoadingSources(true); setListError('');
    try {
      const [sources, imports] = await Promise.all([
        interviewRequest('/tailoring/sources'),
        interviewRequest(`/ai/imports${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
      ]);
      if (!alive.current) return;
      setChoices(sources);
      setHistory(current => cursor ? [...(current || []), ...(imports.items || [])].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index) : imports.items || []);
      setNextCursor(imports.next_cursor || null);
    } catch (failure) { if (alive.current) setListError(failure.message); }
    finally { listLock.current = false; if (alive.current) setLoadingSources(false); }
  }, []);
  useEffect(() => { if (draft.step === 'source' && !isGuest) void loadSources(); }, [draft.step, isGuest, loadSources]);

  /** Serialize user actions; a new flow cannot receive an earlier flow's result. */
  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const request = ++epoch.current;
    const current = () => alive.current && epoch.current === request;
    try { await work(current); }
    catch (failure) { if (current()) setError(failure.message || t('onboarding:operationError')); }
    finally { if (current() && !departing.current) { lock.current = false; setBusy(false); } }
  }

  function go(step) {
    if (lock.current) return;
    setError(''); setSectionError(''); patch({ step });
  }
  function blank() {
    if (lock.current) return;
    setError(''); patch({ mode: 'blank', goal: 'manual', step: 'template' });
  }
  function chooseSource(source) {
    void run(async current => {
      const result = await readCvSource(source);
      if (current()) { setSourceData(result); patch({ source, mode: 'existing', step: 'goal',
        config: { ...draftRef.current.config, language: /^(en|english)$/i.test(result.cvData.language) ? 'en' : /^(pl|polish|polski)$/i.test(result.cvData.language) ? 'pl' : draftRef.current.config.language },
        tailoringId: source.kind === draftRef.current.source?.kind && source.id === draftRef.current.source?.id ? draftRef.current.tailoringId : null }); }
    });
  }
  function selectFile(selected) {
    if (!selected || lock.current) return;
    const invalid = validateCvPdf(selected);
    if (invalid) { setError(t(invalid)); return; }
    setError(''); setFile(selected); patch({ importKey: crypto.randomUUID() });
  }
  function upload() {
    if (!file || !importAllowed) return;
    void run(async current => {
      const key = draft.importKey || crypto.randomUUID();
      patch({ importKey: key });
      try {
        const result = await extractCvPdf(file, key);
        if (!current()) return;
        if (!result.import?.id || !result.cv_data?.name?.trim()) throw new Error(t('onboarding:sourceUnavailable'));
        setSourceData({ cvData: result.cv_data, title: file.name });
        patch({ source: { kind: 'import', id: result.import.id }, mode: 'existing', step: 'goal', tailoringId: null,
          config: { ...draftRef.current.config, language: /^(en|english)$/i.test(result.cv_data.language) ? 'en' : /^(pl|polish|polski)$/i.test(result.cv_data.language) ? 'pl' : draftRef.current.config.language } });
        setFile(null);
      } catch (failure) {
        // Unknown transport outcomes retain identity. A confirmed provider
        // rejection starts a new attempt; history can recover timed-out work.
        if (current() && failure.status && !['ai_request_in_progress', 'ai_operation_active'].includes(failure.code)) patch({ importKey: null });
        if (current()) void loadSources();
        throw failure;
      } finally { void refreshEntitlements?.(); }
    });
  }
  async function leave(path, complete = false) {
    if (lock.current) return;
    await run(async current => {
      saveOnboarding(draftRef.current);
      if (await onNavigate(path, current)) {
        // A lazy destination can keep this route mounted briefly. Escape must
        // not erase the journal after navigation has already been accepted.
        departing.current = true;
        completed.current = true;
        if (complete) clearOnboarding();
      }
    });
  }
  function finish(replacementConfirmed = false) {
    if (!isTemplateAllowed(template, templateEntitlements) || (draft.mode === 'existing' && !sourceData)) return;
    if (draft.mode === 'blank' && !draft.config.sections.some(item => item.selected)) {
      setSectionError(t('editor:newCvSetupModal.chooseAtLeastOneCvSection')); return;
    }
    if (hasActiveDocument && !replacementConfirmed) { setConfirming(true); return; }
    setConfirming(false);
    void run(async current => {
      const result = draft.mode === 'blank'
        ? await onCreate(draft.config, { replacementConfirmed, isCurrent: current })
        : await onImportCreate(sourceData.cvData, draft.config.templateId, draft.source, { replacementConfirmed, isCurrent: current });
      if (current() && result !== false) { completed.current = true; clearOnboarding(); onClose('created'); }
    });
  }
  function openAssistant() {
    if (!sourceData || !draft.source) return;
    if (draft.goal === 'improve') {
      void leave(`/app/interview?${new URLSearchParams({ source: draft.source.kind, sourceId: String(draft.source.id), language: draft.config.language })}`, true);
      return;
    }
    void run(async current => {
      const id = draft.tailoringId || crypto.randomUUID();
      patch({ tailoringId: id });
      // Recovery reads before retrying a previously attempted PUT. It must
      // never overwrite an existing intake or generate a second paid session.
      let flow;
      if (draft.tailoringId) {
        try { flow = await interviewRequest(`/tailoring/${id}`); }
        catch (failure) { if (failure.status !== 404) throw failure; }
      }
      if (!flow) flow = await interviewRequest(`/tailoring/${id}`, 'PUT', {
        revision: 0, source_kind: draft.source.kind, source_id: draft.source.id,
        offer_kind: 'text', job_description: '', job_offer_url: '', language: draft.config.language, step: 'offer',
      });
      if (current() && await onNavigate(`/app/tailor/${flow.id}`, current)) {
        departing.current = true; completed.current = true; clearOnboarding();
      }
    });
  }
  const cancel = () => {
    if (departing.current) return;
    // Invalidate callbacks before unmount. The server may finish an upload,
    // but a cancelled fill must not replace the active document.
    epoch.current += 1;
    clearOnboarding(); onClose('cancelled');
  };
  const titleKey = draft.step === 'start' ? 'welcome' : draft.step === 'source' ? 'sourceTitle' : draft.step === 'goal' ? 'goalTitle' : 'templateTitle';
  const back = () => go(draft.step === 'template' ? draft.mode === 'blank' ? 'start' : 'goal' : draft.step === 'goal' ? 'source' : 'start');
  const planLink = <button type="button" className={styles.secondary} disabled={busy} onClick={() => leave('/app/account?purchase=pro')}>{t('onboarding:explorePro')}</button>;

  return <DialogShell open variant={confirming ? 'decision' : 'fullscreen'} surface="paper"
    title={confirming ? t('editor:newCvSetupModal.createANewCv2') : 'CV STUDIO'}
    subtitle={confirming ? t(isGuest ? 'editor:newCvSetupModal.thisBrowserStoresOneCvDraftStarting' : hasSavedDocument ? 'editor:newCvSetupModal.theLastSavedVersionWillRemainIn' : 'editor:newCvSetupModal.theCurrentCvIsNotSavedTo') : undefined}
    onClose={confirming ? () => setConfirming(false) : cancel}
    initialFocusSelector={confirming ? '[data-keep-cv]' : '#onboarding-heading'}
    restoreFocusSelector="[data-onboarding-trigger]"
    shouldRestoreFocus={() => !completed.current}
    bodyClassName={styles.body}
    headerAction={!confirming && isGuest ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => leave('/login?start=onboarding')}>{t('public:siteLayout.signIn')}</button> : undefined}
    footer={confirming ? <div className={styles.actions}>
      <button type="button" className={styles.secondary} onClick={() => finish(true)}>{t('editor:newCvSetupModal.createANewCv')}</button>
      <button type="button" data-keep-cv className={styles.primary} onClick={() => setConfirming(false)}>{t('onboarding:keepCurrent')}</button>
    </div> : <div className={styles.footer}>
      <button type="button" className={styles.back} disabled={busy} onClick={draft.step === 'start' ? cancel : back}><FiArrowLeft aria-hidden="true" />{t(draft.step === 'start' ? 'onboarding:close' : 'onboarding:back')}</button>
      <a className={styles.privacy} href="/privacy" target="_blank" rel="noreferrer">{t('onboarding:privacyLink')}</a>
      <div className={styles.actions}>
        {draft.step === 'source' && <button type="button" className={styles.secondary} disabled={busy} onClick={blank}>{t('onboarding:fromScratch')}</button>}
        {draft.step === 'goal' && draft.goal === 'manual' && <button type="button" className={styles.primary} disabled={busy || !sourceData} onClick={() => go('template')}>{t('onboarding:chooseTemplate')}<FiArrowRight aria-hidden="true" /></button>}
        {draft.step === 'goal' && draft.goal !== 'manual' && (draft.goal === 'tailor' || entitlements?.ai_assistant === true) && <button type="button" className={styles.primary} disabled={busy || !sourceData || !knownAccess} onClick={openAssistant}>{t(draft.goal === 'tailor' ? 'onboarding:openTailor' : 'onboarding:openAssistant')}<FiArrowRight aria-hidden="true" /></button>}
        {draft.step === 'goal' && draft.goal === 'improve' && knownAccess && !entitlements.ai_assistant && planLink}
        {draft.step === 'template' && <button type="button" className={styles.primary} disabled={busy || !isTemplateAllowed(template, templateEntitlements) || (draft.mode === 'existing' && !sourceData)} onClick={() => finish()}>{t(busy ? 'onboarding:working' : 'onboarding:openEditor')}<FiArrowRight aria-hidden="true" /></button>}
      </div>
    </div>}>
    {confirming ? <p className={styles.confirmation}>{t('editor:newCvSetupModal.youCanReturnToYourCurrentCv')}</p> : <div className={styles.content} data-wide={draft.step === 'template'} aria-busy={busy}>
      <ol className={styles.progress} aria-label={t('onboarding:progress')}>
        {rail.map((step, index) => <li key={step} aria-current={step === draft.step ? 'step' : undefined} data-complete={index < activeIndex}>
          <span aria-hidden="true">{index < activeIndex ? <FiCheck /> : index + 1}</span><span>{t(`onboarding:step.${step}`)}</span>
        </li>)}
      </ol>
      <header className={styles.intro}>
        <div className={styles.guide}>{!guideFailed ? <img src="/cv-onboarding-guide.png" alt="" width="96" height="96" onError={() => setGuideFailed(true)} /> : <FiFileText aria-hidden="true" />}</div>
        <div><h1 id="onboarding-heading" ref={heading} tabIndex={-1}>{t(`onboarding:${titleKey}`)}</h1>
          <p>{t(draft.step === 'start' ? 'onboarding:sourceQuestion' : draft.step === 'template' ? 'onboarding:templateHint' : draft.step === 'source' ? 'onboarding:sourceHint' : 'onboarding:goalHint')}</p></div>
        <span className={styles.srOnly}>{t('onboarding:guide')}</span>
      </header>
      {storageFailed && <p role="status" className={styles.notice}>{t('onboarding:storageUnavailable')}</p>}
      {error && <div id="onboarding-error" role="alert" className={styles.error}><p>{error}</p>{draft.source && !sourceData && <button type="button" disabled={busy} onClick={restoreSource}>{t('onboarding:retrySource')}</button>}</div>}
      {busy && <p className={styles.notice} role="status">{t('onboarding:working')}</p>}
      {draft.step === 'start' && <div className={styles.startChoices}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => patch({ mode: 'existing', step: 'source' })}><FiUpload aria-hidden="true" />{t('onboarding:haveCv')}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={blank}><FiFileText aria-hidden="true" />{t('onboarding:fromScratch')}</button>
      </div>}
      {draft.step === 'start' && legacyDraftAvailable && <button className={styles.back} disabled={busy} onClick={() => run(async current => { if (await onRecoverLegacyDraft(current) && current()) { clearOnboarding(); onClose('created'); } })}>{t('editor:startChooser.moveAnOlderWizardDraftToA')}</button>}
      {draft.step === 'source' && (isGuest ? <section className={styles.accountGate}>
        <h2>{t('onboarding:accountTitle')}</h2><p>{t('onboarding:accountHint')}</p>
        <div className={styles.actions}><button className={styles.primary} onClick={() => leave('/register?start=onboarding')}>{t('onboarding:register')}</button><button className={styles.secondary} onClick={() => leave('/login?start=onboarding')}>{t('public:siteLayout.signIn')}</button></div>
      </section> : <section className={styles.source}>
        <div className={styles.dropzone} data-dragging={dragging} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (importAllowed) selectFile(event.dataTransfer.files?.[0]); }}>
          <div className={styles.uploadHeading}><FiUpload aria-hidden="true" /><div><label htmlFor="onboarding-pdf">{t('onboarding:uploadLabel')}</label><p id="onboarding-file-help">{t('onboarding:pdfHelp')}</p></div></div>
          <div className={styles.uploadControls}>
            <input ref={fileInput} id="onboarding-pdf" type="file" accept="application/pdf,.pdf" disabled={busy || !importAllowed} aria-describedby={`onboarding-file-help${error ? ' onboarding-error' : ''}`} aria-invalid={Boolean(error)} onChange={event => selectFile(event.target.files?.[0])} />
            <button type="button" className={styles.primary} disabled={busy || !file || !importAllowed} onClick={upload}>{t('onboarding:readPdf')}</button>
          </div>
          {file && <p className={styles.fileName}>{file.name}</p>}
          {!knownImportAccess ? <p className={styles.allowance} role="status">{t('onboarding:checkingAccess')} <button className={styles.back} disabled={busy} onClick={refreshEntitlements}>{t('onboarding:retry')}</button></p> : remaining != null && <p className={styles.allowance}>{t('onboarding:importsRemaining', { count: remaining })}</p>}
        </div>
        {knownImportAccess && !importAllowed && <div className={styles.notice}><p>{t('onboarding:importLimit')}</p>{planLink}</div>}
        <details className={styles.savedSources}>
          <summary>{t('onboarding:savedSources')}</summary>
          {loadingSources && <p role="status">{t('onboarding:loadingSources')}</p>}
          {listError && <div role="alert"><p>{listError}</p><button className={styles.secondary} disabled={loadingSources} onClick={() => loadSources()}>{t('onboarding:retry')}</button></div>}
          {choices && !loadingSources && !listError && !choices.documents?.length && !history?.length && <p>{t('onboarding:noSources')}</p>}
          <ul className={styles.sourceList}>{choices?.documents?.map(item => <li key={`document-${item.id}`}><button disabled={busy} onClick={() => chooseSource({ kind: 'document', id: item.id })}><FiFileText aria-hidden="true" /><span>{item.title || t('onboarding:untitled')}</span><FiArrowRight aria-hidden="true" /></button></li>)}</ul>
          <ul className={styles.sourceList}>{history?.map(item => <li key={`import-${item.id}`}>
            <button disabled={busy || item.status !== 'succeeded'} onClick={() => chooseSource({ kind: 'import', id: item.id })}><FiUpload aria-hidden="true" /><span>{item.filename || item.source_filename || t('onboarding:untitled')}<small>{cvImportStatusLabel(item.status)}</small></span><FiArrowRight aria-hidden="true" /></button>
            {item.status === 'failed' && <p>{cvImportRecoveryMessage(item.error_code)}</p>}
          </li>)}</ul>
          <button className={styles.back} disabled={loadingSources} onClick={() => loadSources()}>{t('onboarding:refreshHistory')}</button>
          {nextCursor && <button className={styles.secondary} disabled={loadingSources} onClick={() => loadSources(nextCursor)}>{t('onboarding:moreImports')}</button>}
        </details>
      </section>)}
      {draft.step === 'goal' && <fieldset className={styles.goals} disabled={busy}>
        <legend className={styles.srOnly}>{t('onboarding:goalTitle')}</legend>
        {sourceData && <p className={styles.selectedSource}>{t('onboarding:selectedSource')} <strong>{sourceData.title || sourceData.cvData.name}</strong></p>}
        {['manual', 'improve', 'tailor'].map(goal => <label key={goal} className={styles.goal}>
          <input type="radio" name="onboarding-goal" checked={draft.goal === goal} onChange={() => patch({ goal })} />
          <span><strong>{t(`onboarding:goal.${goal}`)}</strong><span>{t(`onboarding:goalHint.${goal}`)}</span></span>{goal !== 'manual' && <span className={styles.pro}>Pro</span>}
        </label>)}
        {draft.goal !== 'manual' && <><p className={styles.notice}>{t(knownAccess ? entitlements.ai_assistant ? 'onboarding:aiCredits' : 'onboarding:aiPro' : 'onboarding:checkingAccess')}</p>{!knownAccess && <button className={styles.secondary} onClick={refreshEntitlements}>{t('onboarding:retry')}</button>}</>}
      </fieldset>}
      {draft.step === 'template' && !knownTemplateAccess && <p role="status">{t('onboarding:checkingAccess')} <button className={styles.back} disabled={busy} onClick={refreshEntitlements}>{t('onboarding:retry')}</button></p>}
      {draft.step === 'template' && knownTemplateAccess && !isTemplateAllowed(template, templateEntitlements) && <div className={styles.notice}><p>{t('editor:templateRequiresPro')}</p>{planLink}</div>}
      {draft.step === 'template' && <CvSetupOptions config={draft.config} setConfig={setConfig} imported={draft.mode === 'existing'} entitlements={templateEntitlements} submitting={busy} sectionError={sectionError} />}
    </div>}
  </DialogShell>;
}
