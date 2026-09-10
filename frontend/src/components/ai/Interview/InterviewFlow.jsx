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
import { factLabel } from '../../../utils/interviewPresentation';
import TemplateCarousel from '../AiCvPanel/TemplateCarousel';
import CvContent from './CvContent';
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
    load().catch((err) => { if (alive.current) setError(err.message); });
    if (!sessionId && !initialSource) Promise.all([listOwnedDocuments(), interviewRequest('/ai/imports')])
      .then(([docs, imported]) => { if (alive.current) { setDocuments(docs); setImports(imported.items || []); setImportCursor(imported.next_cursor || null); } })
      .catch((err) => { if (alive.current) setError(err.message); });
    return () => { alive.current = false; };
  }, [sessionId, initialSource, load]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [session?.phase, session?.question?.id, reviewOpen]);

  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (err) { if (alive.current) setError(err.message); }
    finally { lock.current = false; if (alive.current) { setBusy(false); refresh(); } }
  }

  function versions() { return { revision: session.revision, profile_revision: profile.revision }; }

  async function operation(action, extra = {}) {
    const result = await interviewRequest(`/ai/interviews/${session.id}/${action}`, 'POST', { ...versions(), ...extra });
    if (!alive.current) return;
    if (result.document_id && action === 'document') { navigate(`/app/documents/${result.document_id}`); return; }
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
  });

  const saveAnswer = (status) => run(async () => {
    await operation('answers', { question_id: session.question.id, answer, status });
    if (alive.current) { setAnswer(''); setNotice('Odpowiedź zapisana.'); }
  });

  const hasPending = Boolean(session?.proposed_facts?.length);
  const reviewing = session?.phase === 'intake' || reviewOpen;
  return <section className={classes.flow} aria-label="Wywiad zawodowy" aria-busy={busy}>
    <div className={classes.actions}><Link className={classes.link} to="/app/career-profile">Profil i zapisane wywiady</Link>{onClose && <button type="button" onClick={onClose}>Wróć do asystenta</button>}</div>
    <h2 ref={heading} tabIndex={-1}>{reviewing ? 'Sprawdź informacje o sobie' : session?.phase === 'preview' ? 'Twoja nowa wersja CV' : mode === 'tailor' || session?.mode === 'tailor' ? 'Wywiad pod ofertę' : 'Wywiad zawodowy'}</h2>
    {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} type="button" onClick={() => run(load)}>Wczytaj zapisany stan</button></div>}
    <p role="status" aria-live="polite">{busy ? 'Zapisujemy dane lub przygotowujemy odpowiedź…' : notice}</p>
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
      <p className={classes.step}>Odpowiedzi: {session.answers.length} / {session.question_limit} · Język CV: {languageLabels[session.language]}</p>
      {session.generation_feedback?.length > 0 && <div className={classes.error} role="alert"><p>Kontrola treści zatrzymała niepotwierdzone propozycje. Popraw informacje lub wygeneruj CV ponownie.</p><ul>{session.generation_feedback.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>}
      {session.requirements.length > 0 && <details><summary>Wymagania oferty</summary><ul className={classes.requirements}>{session.requirements.map((req, index) => <li key={index}><strong>{statuses[req.status]}</strong> — {req.text}</li>)}</ul></details>}
      {reviewing ? <><FactEditor facts={facts} onChange={setFacts} disabled={busy} /><div className={classes.actions}><button className={classes.primary} disabled={busy || facts.some((f) => !f.text.trim())} onClick={confirm}>Zatwierdź informacje</button>{session.phase !== 'intake' && <button disabled={busy} onClick={() => setReviewOpen(false)}>Wróć do rozmowy</button>}</div></> : <>
        {session.question && <div className={classes.question}><h3>{session.question.text}</h3><p className={classes.hint}>{session.question.reason}</p><label>Twoja odpowiedź<textarea rows={5} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} /></label><div className={classes.actions}><button className={classes.primary} disabled={busy || !answer.trim()} onClick={() => saveAnswer('answered')}>Zapisz odpowiedź</button><button disabled={busy} onClick={() => saveAnswer('no_experience')}>Nie mam takiego doświadczenia</button><button disabled={busy} onClick={() => saveAnswer('unknown')}>Nie pamiętam</button><button disabled={busy} onClick={() => saveAnswer('skipped')}>Pomiń</button></div></div>}
        {session.phase !== 'completed' && <div className={classes.actions}>
          {!session.question && session.answers.length < session.question_limit && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('next'))}>Następne pytanie</button>}
          <button disabled={busy} onClick={() => setReviewOpen(true)}>Sprawdź informacje{hasPending ? ` (${session.proposed_facts.length} nowych)` : ''}</button>
          {(session.phase === 'review' || session.phase === 'preview') && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('extend'))}>Pogłęb wywiad — do 5 pytań</button>}
        </div>}
        {session.phase !== 'completed' && <fieldset disabled={busy}>
          <legend>Przygotuj CV</legend>
          {hasPending && <p>Zatwierdź lub usuń nowe informacje przed generowaniem.</p>}
          <label>Szablon nowego CV<select value={template} onChange={(e) => setTemplate(e.target.value)} disabled={session.mode === 'tailor' && Boolean(session.template_id)}><option value="">Wybierz szablon</option>{TEMPLATES.filter((t) => isTemplateAllowed(t, entitlements)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {(session.mode !== 'tailor' || !session.template_id) && <details><summary>Obejrzyj szablony</summary><TemplateCarousel templates={TEMPLATES} entitlements={entitlements} selectedId={template} visibleCount={1} fillingId={busy ? template : null} onSelect={(selected) => setTemplate(selected.id)} actionLabel="Wybierz szablon" /></details>}
          <p className={classes.hint}>Treść ułożymy ponownie w szablonie. Ręczne przesunięcia elementów nie są kopiowane. Źródłowe CV pozostanie bez zmian.</p>
          <button className={classes.primary} disabled={!canAi || !template || hasPending || sourceChanged} onClick={() => run(() => operation('preview', { template_id: template }))}>{session.preview ? 'Odśwież podgląd' : 'Przygotuj CV z potwierdzonych informacji'}</button>
        </fieldset>}
        {session.preview && <div className={classes.preview}>
          <h3>Podgląd treści · {session.preview.pages} {session.preview.pages === 1 ? 'strona' : 'stron'}</h3>
          <p>Sprawdź fakty i przypisanie osiągnięć do ról przed zapisaniem.</p>
          {session.preview.changes.map((field, index) => {
            const previous = session.source_cv_data && field.path.split('/').slice(1).reduce((value, key) => value?.[key], session.source_cv_data);
            return <details key={`${field.path}-${index}`} className={classes.fact}><summary>{factLabel({ path: field.path })}: {field.value.slice(0, 90)}</summary>{previous && <p><strong>W źródłowym CV:</strong> {String(previous)}</p>}<p><strong>Nowa treść:</strong> {field.value}</p><p className={classes.hint}>Na podstawie: {field.evidence_refs.map((id) => profile.facts.find((f) => f.id === id)?.text || 'Informacja usunięta — odśwież podgląd').join(' · ')}</p></details>;
          })}
          <details><summary>Cała treść CV</summary><CvContent data={session.preview.cv_data} /></details>
          {session.preview.remaining_gaps.length > 0 && <><h3>Pozostałe braki</h3><ul>{session.preview.remaining_gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
          <button className={classes.primary} disabled={busy || sourceChanged || session.preview.profile_revision !== profile.revision || session.phase === 'completed'} onClick={() => run(() => operation('document'))}>Zapisz jako nowe CV</button>
        </div>}
        {session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>Otwórz zapisane CV</Link>}
      </>}
    </>}
  </section>;
}
