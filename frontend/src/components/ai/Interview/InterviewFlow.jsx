/**
 * Shared interview controller for account creation and the existing assistant.
 * Server state survives unmount/logout. Answers are saved before asking again;
 * failed requests retain input and can be recovered by loading the session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { interviewRequest, reviewFacts } from '../../../services/interviews';
import { listOwnedDocuments } from '../../../services/documents';
import { useEntitlements } from '../../../hooks/useEntitlements';
import { TEMPLATES } from '../../../templates';
import { isTemplateAllowed } from '../../../utils/entitlements';
import FactEditor from './FactEditor';
import InterviewLoading from './InterviewLoading';
import InterviewPreview from './InterviewPreview';
import TemplateCarousel from '../AiCvPanel/TemplateCarousel';
import InterviewReviewNotice from './InterviewReviewNotice';
import classes from './Interview.module.css';

const languageLabels = { pl: 'Polski', en: 'Angielski', de: 'Niemiecki', fr: 'Francuski', es: 'Hiszpański', uk: 'Ukraiński', it: 'Włoski', nl: 'Niderlandzki' };
const statuses = { matched: 'Potwierdzone', partial: 'Do doprecyzowania', unknown: 'Brak informacji', gap: 'Potwierdzony brak doświadczenia' };

export default function InterviewFlow({ sessionId, initialSource = null, currentSource = null, mode = 'create', onClose, sourceChanged = false, onSourceRefreshed }) {
  const navigate = useNavigate();
  const { entitlements, refresh } = useEntitlements();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pendingOperation, setPendingOperation] = useState('load');
  const [panel, setPanel] = useState('conversation');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [documents, setDocuments] = useState([]);
  const [imports, setImports] = useState([]);
  const [importCursor, setImportCursor] = useState(null);
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState(initialSource?.candidate_notes || '');
  const [language, setLanguage] = useState(initialSource?.language || 'pl');
  const [template, setTemplate] = useState(initialSource?.template_id || '');
  const [factEditing, setFactEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const createKey = useRef(crypto.randomUUID());
  const heading = useRef(null);
  const sessionRef = useRef(null);
  const canAi = entitlements?.ai_assistant === true;

  const adopt = useCallback((next, currentProfile) => {
    sessionRef.current = next;
    setSession(next); setProfile(currentProfile); setFacts(reviewFacts(currentProfile, next));
    setTemplate(next?.template_id || '');
    setPanel(next?.phase === 'preview' || next?.phase === 'completed' ? 'preview' : 'conversation');
    if (!next) {
      setName(currentProfile.facts.find((fact) => fact.path === '/name' && fact.kind === 'fact')?.text || '');
      setTitle(currentProfile.facts.find((fact) => fact.path === '/title' && fact.kind === 'fact')?.text || '');
    }
  }, []);

  const load = useCallback(async () => {
    const id = sessionRef.current?.id || sessionId;
    const [currentProfile, next] = await Promise.all([
      interviewRequest('/career-profile'), id ? interviewRequest(`/ai/interviews/${id}`) : Promise.resolve(null),
    ]);
    if (alive.current) adopt(next, currentProfile);
  }, [sessionId, adopt]);

  useEffect(() => {
    alive.current = true;
    load().catch((err) => { if (alive.current) setError(err.message); }).finally(() => { if (alive.current) setInitialLoading(false); });
    if (!sessionId && !initialSource) Promise.all([listOwnedDocuments(), interviewRequest('/ai/imports')])
      .then(([docs, imported]) => { if (alive.current) { setDocuments(docs); setImports(imported.items || []); setImportCursor(imported.next_cursor || null); } })
      .catch((err) => { if (alive.current) setError(err.message); });
    return () => { alive.current = false; };
  }, [sessionId, initialSource, load]);

  // Return focus to the active task after a request; hidden forms keep their drafts.
  useEffect(() => { if (!busy && !initialLoading) heading.current?.focus(); }, [session?.phase, session?.question?.id, reviewOpen, panel, busy, initialLoading]);

  async function run(work, operationName = 'load') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setPendingOperation(operationName); setError(''); setNotice('');
    try { await work(); }
    catch (err) { if (alive.current) setError(err.message); }
    finally { lock.current = false; if (alive.current) { setBusy(false); refresh(); } }
  }

  function versions() { return { revision: session.revision, profile_revision: profile.revision }; }

  async function operation(action, extra = {}) {
    setPendingOperation(action);
    const result = await interviewRequest(`/ai/interviews/${session.id}/${action}`, 'POST', { ...versions(), ...extra });
    if (!alive.current) return;
    if (result.document_id && action === 'document') { navigate(`/app/documents/${result.document_id}`); return; }
    if (!result.profile) setPendingOperation('sync');
    const currentProfile = result.profile || await interviewRequest('/career-profile');
    if (alive.current) adopt(result.session || result, currentProfile);
  }

  const confirm = () => run(async () => {
    await operation('confirm', { facts }); setReviewOpen(false); setNotice('Informacje zostały zapisane w profilu zawodowym.');
  });

  const start = () => run(async () => {
    const [kind, id] = source.split(':');
    const body = { mode, ...(initialSource || {}), language,
      ...(!initialSource ? { cv_data: { name, title }, candidate_notes: notes,
        ...(kind === 'document' ? { source_document_id: Number(id), cv_data: {} } : {}),
        ...(kind === 'import' ? { source_import_id: Number(id), cv_data: {} } : {}),
      } : { candidate_notes: notes }),
    };
    const result = await interviewRequest('/ai/interviews', 'POST', body, createKey.current);
    if (alive.current) { adopt(result, await interviewRequest('/career-profile')); setReviewOpen(true); }
  }, 'start');

  const saveAnswer = (status) => run(async () => {
    await operation('answers', { question_id: session.question.id, answer, status });
    if (alive.current) { setAnswer(''); setNotice('Odpowiedź zapisana.'); }
  });

  const hasPending = Boolean(session?.proposed_facts?.length);
  const reviewing = session?.phase === 'intake' || reviewOpen || (session?.phase === 'review' && session?.clarification_round && hasPending);
  const activePanel = reviewing ? 'facts' : session?.phase === 'clarification' ? 'conversation' : panel;
  const waiting = busy || initialLoading;
  // Clarifications have their own bounded queue; discovery answers must not
  // make the first clarification appear as question nine of a new interview.
  const clarified = session?.answers.filter((item) => item.question?.clarification).length || 0;
  const clarificationTotal = clarified + (session?.question ? 1 : 0) + (session?.pending_clarifications?.length || 0);
  return <section className={`${classes.flow} ${classes.interview}`} aria-label="Wywiad zawodowy">
    <div className={classes.utility}><Link aria-disabled={waiting} onClick={(event) => { if (waiting) event.preventDefault(); }} className={classes.link} to="/app/career-profile">Profil i zapisane wywiady</Link><Link className={classes.link} to="/help#wywiad" target="_blank" rel="noopener noreferrer">Pomoc do wywiadu (nowa karta)</Link>{onClose && <button type="button" disabled={waiting} onClick={onClose}>Wróć do asystenta</button>}</div>
    <h2 ref={heading} tabIndex={-1} className={classes.taskTitle}>{activePanel === 'prepare' ? 'Przygotuj swoją wersję CV' : reviewing ? 'Sprawdź informacje o sobie' : session?.phase === 'clarification' ? 'Doprecyzujmy szczegóły' : session?.phase === 'preview' ? 'Twoja nowa wersja CV' : mode === 'tailor' || session?.mode === 'tailor' ? 'Wywiad pod ofertę' : 'Wywiad zawodowy'}</h2>
    {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} type="button" onClick={() => run(load)}>Wczytaj zapisany stan</button></div>}
    <p role="status" aria-live="polite">{!waiting ? notice : ''}</p>
    {waiting && <InterviewLoading operation={initialLoading ? 'load' : pendingOperation} facts={profile?.facts.length} answers={session?.answers.length} language={languageLabels[session?.language || language]} template={TEMPLATES.find((item) => item.id === template)?.name} />}
    <div hidden={waiting} aria-busy={waiting}>
    {session && <nav className={classes.stages} aria-label="Etapy wywiadu">{[['facts', 'Twoje informacje'], ['conversation', 'Rozmowa'], ['prepare', 'Przygotuj CV'], ['preview', 'Wynik']].map(([key, label], index) => <button type="button" key={key} aria-current={activePanel === key ? 'step' : undefined} disabled={busy || factEditing || (Boolean(session.question) && key !== 'conversation') || (session.phase === 'intake' && key !== 'facts') || (session.phase === 'clarification' && key !== 'conversation') || (key === 'preview' && !session.preview) || (session.phase === 'completed' && key !== 'preview')} onClick={() => { setReviewOpen(key === 'facts'); setPanel(key); }}><span>{String(index + 1).padStart(2, '0')}</span>{' '}{label}</button>)}</nav>}
    {!canAi && entitlements && <p>Wywiad AI wymaga Pro. Możesz nadal przeglądać i poprawiać zapisane informacje. <Link to="/app/account">Konto i plan</Link></p>}
    {sourceChanged && <p className={classes.error}>CV w edytorze zmieniło się od rozpoczęcia rozmowy. Zapisz odpowiedź, a następnie wczytaj aktualne źródło. Zachowamy dotychczasowe odpowiedzi.</p>}
    {session && (sourceChanged || session.source_document_id) && <button disabled={busy || session.phase === 'completed' || Boolean(answer.trim())} type="button" onClick={() => run(async () => { await operation('source', currentSource || {}); onSourceRefreshed?.(); setReviewOpen(true); })}>Wczytaj aktualne CV do wywiadu</button>}
    {!profile && !error && <p>Wczytujemy profil zawodowy…</p>}
    {!session && profile && <fieldset disabled={busy}>
      <legend>{mode === 'tailor' ? 'Uzupełnij doświadczenia istotne dla oferty' : 'Od czego zaczynamy?'}</legend>
      <p>Rozmowa wykorzysta Twój profil i wybrane źródło. Pytania możesz pomijać, a rozmowę wznowić później.</p>
      {!initialSource && <><label>Źródło informacji<select value={source} onChange={(e) => setSource(e.target.value)}><option value="">Mój profil / nowe informacje</option><optgroup label="Moje CV">{documents.map((doc) => <option key={doc.id} value={`document:${doc.id}`}>{doc.title}</option>)}</optgroup><optgroup label="Importy">{imports.filter((item) => item.status === 'succeeded').map((item) => <option key={item.id} value={`import:${item.id}`}>{item.filename || item.source_filename || 'Import CV'}</option>)}</optgroup></select></label>
        {importCursor && <button type="button" onClick={() => run(async () => { const page = await interviewRequest(`/ai/imports?cursor=${encodeURIComponent(importCursor)}`); setImports((current) => [...current, ...(page.items || [])]); setImportCursor(page.next_cursor || null); })}>Pokaż starsze importy</button>}
        {!source && <><label>Imię i nazwisko<input autoComplete="name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jeśli nie ma go jeszcze w profilu" /></label><label>Stanowisko docelowe<input maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label></>}
      </>}
      <label>{mode === 'tailor' ? 'Dodatkowe fakty o Tobie' : 'Historia zawodowa, projekty i edukacja'}<textarea rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opisz role, firmy, okresy pracy i osiągnięcia. Możesz zacząć od projektu, praktyk lub studiów." /></label>
      <label>Język nowego CV<select value={language} onChange={(e) => setLanguage(e.target.value)}>{Object.entries(languageLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <button className={classes.primary} disabled={!canAi} type="button" onClick={start}>Rozpocznij wywiad</button>
      <p className={classes.hint}>Pytania i generowanie korzystają z kredytów AI. Sam zapis informacji nie zużywa kredytów.</p>
    </fieldset>}
    {session && <>
      <p className={classes.step}>{session.phase === 'clarification' ? session.question ? `Doprecyzowanie ${clarified + 1} z ${clarificationTotal}` : `Doprecyzowania: ${session.pending_clarifications?.length || 0} do sprawdzenia` : `Zapisane odpowiedzi: ${session.answers.length}`} · Język CV: {languageLabels[session.language]}</p>
      {session.generation_feedback?.length > 0 && !session.preview && <InterviewReviewNotice legacy />}
      {activePanel === 'conversation' && session.requirements.length > 0 && <details><summary>Wymagania oferty</summary><ul className={classes.requirements}>{session.requirements.map((req, index) => <li key={index}><strong>{statuses[req.status]}</strong> — {req.text}</li>)}</ul></details>}
      {reviewing ? <><FactEditor facts={facts} onChange={setFacts} disabled={busy} onEditingChange={setFactEditing} /><div className={classes.actions}><button className={classes.primary} disabled={busy || factEditing || facts.some((f) => !f.text.trim())} onClick={confirm}>Zatwierdź informacje</button>{session.phase !== 'intake' && <button disabled={busy || factEditing} onClick={() => { setReviewOpen(false); setPanel('conversation'); }}>Wróć do rozmowy</button>}</div></> : <>
        {activePanel === 'conversation' && <>
        {session.phase === 'clarification' && <div className={classes.progress}>
          <p>Sprawdźmy szczegóły w proponowanej treści. Możesz je poprawić albo pominąć i przejść do CV opartego na potwierdzonych informacjach.</p>
          {!session.question && <><p>Krótka runda obejmie do {Math.min(5, session.pending_clarifications?.length || 0)} pytań. Jej uruchomienie i zapis odpowiedzi nie zużywają kredytów. Po zatwierdzeniu informacji ponowne generowanie CV korzysta z kredytów AI.</p><button className={classes.primary} disabled={busy || sourceChanged} onClick={() => run(() => operation('clarify'))}>Doprecyzuj — do 5 pytań</button></>}
          <button disabled={busy || sourceChanged} onClick={() => run(() => operation('skip-clarifications'))}>{hasPending ? 'Zakończ doprecyzowanie i sprawdź odpowiedzi' : 'Pomiń doprecyzowanie i pokaż CV'}</button>
        </div>}
        {session.question && <div className={classes.question}><h3>{session.question.text}</h3><p className={classes.hint}>{session.question.reason}</p>{session.question.clarification && <><figure className={classes.proposal}><figcaption>{session.question.record_label || "Propozycja do sprawdzenia"}<span>Propozycja AI · wymaga Twojego potwierdzenia</span></figcaption><blockquote>{session.question.suggested_text}</blockquote></figure><p>Wpisz poprawny opis. Jeśli propozycja jest zgodna z prawdą, potwierdź ją własnymi słowami.</p></>}<label>Twoja odpowiedź<textarea rows={5} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} /></label><div className={classes.actions}><button className={classes.primary} disabled={busy || !answer.trim()} onClick={() => saveAnswer('answered')}>Zapisz odpowiedź</button><button disabled={busy} onClick={() => saveAnswer('no_experience')}>Nie mam takiego doświadczenia</button><button disabled={busy} onClick={() => saveAnswer('unknown')}>Nie pamiętam</button><button disabled={busy} onClick={() => saveAnswer('skipped')}>Pomiń</button></div></div>}
        {session.phase !== 'completed' && <div className={classes.actions}>
          {!session.question && session.phase !== 'clarification' && session.answers.length < session.question_limit && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('next'))}>Następne pytanie</button>}
          <button disabled={busy} onClick={() => setReviewOpen(true)}>Sprawdź informacje{hasPending ? ` (${session.proposed_facts.length} nowych)` : ''}</button>
          {(session.phase === 'review' || session.phase === 'preview') && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('extend'))}>Pogłęb wywiad — do 5 pytań</button>}
        </div>}
        {!session.question && session.phase !== 'clarification' && session.phase !== 'completed' && <div className={classes.nextStep}><div><h3>{hasPending ? 'Zbierz odpowiedzi w swoim profilu' : 'Gotowe do przygotowania CV?'}</h3><p>{hasPending ? 'Sprawdź nowe informacje, zanim wykorzystamy je w treści.' : 'Możesz przejść dalej albo odpowiedzieć na kolejne pytania.'}</p></div><button className={classes.primary} type="button" onClick={() => hasPending ? setReviewOpen(true) : setPanel('prepare')}>{hasPending ? 'Przejrzyj nowe informacje' : 'Przejdź do przygotowania CV'}</button></div>}
        </>}
        {activePanel === 'prepare' && session.phase !== 'completed' && session.phase !== 'clarification' && <fieldset disabled={busy} className={classes.preparation}>
          <legend>Przygotuj CV</legend>
          {hasPending && <p>Zatwierdź lub usuń nowe informacje przed generowaniem.</p>}
          <label>Szablon nowego CV<select value={template} onChange={(e) => setTemplate(e.target.value)} disabled={session.mode === 'tailor' && Boolean(session.template_id)}><option value="">Wybierz szablon</option>{TEMPLATES.filter((t) => isTemplateAllowed(t, entitlements)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {(session.mode !== 'tailor' || !session.template_id) && <details><summary>Obejrzyj szablony</summary><TemplateCarousel templates={TEMPLATES} entitlements={entitlements} selectedId={template} visibleCount={1} fillingId={busy ? template : null} onSelect={(selected) => setTemplate(selected.id)} actionLabel="Wybierz szablon" /></details>}
          <p className={classes.hint}>Treść ułożymy ponownie w szablonie. Ręczne przesunięcia elementów nie są kopiowane. Źródłowe CV pozostanie bez zmian.</p>
          <button className={classes.primary} disabled={!canAi || !template || hasPending || sourceChanged} onClick={() => run(() => operation('preview', { template_id: template }))}>{session.preview ? 'Odśwież podgląd' : 'Przygotuj CV z potwierdzonych informacji'}</button>
        </fieldset>}
        {activePanel === 'preview' && session.preview && session.phase !== 'clarification' && <>
          <InterviewPreview key={`${session.id}-${session.revision}`} preview={session.preview} source={session.source_cv_data} facts={profile.facts} />
          <div className={classes.resultActions}><p>Zapisz osobny dokument. Źródłowe CV pozostanie bez zmian.</p><div className={classes.actions}>
            <button className={classes.primary} disabled={busy || hasPending || sourceChanged || session.preview.profile_revision !== profile.revision || session.phase === 'completed'} onClick={() => run(() => operation('document'))}>Zapisz jako nowe CV</button>
            {session.phase !== 'completed' && <button type="button" disabled={busy} onClick={() => setPanel('prepare')}>Zmień szablon lub odśwież</button>}
          </div></div>
        </>}
        {session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>Otwórz zapisane CV</Link>}
      </>}
    </>}
    </div>
  </section>;
}
