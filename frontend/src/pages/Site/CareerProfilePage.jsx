/** Account-owned career facts and resumable sessions remain usable without Pro. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import FactEditor from '../../components/ai/Interview/FactEditor';
import { interviewRequest } from '../../services/interviews';
import classes from '../../components/ai/Interview/Interview.module.css';
import layout from './CareerProfilePage.module.css';
import site from '../../components/common/SiteLayout/SiteLayout.module.css';

const modes = { create: 'Tworzenie CV', enrich: 'Uzupełnianie CV', tailor: 'Dopasowanie do oferty' };
const phases = { intake: 'Informacje początkowe', ready: 'Gotowy do kolejnego pytania', question: 'Pytanie', review: 'Podsumowanie', clarification: 'Doprecyzowanie', preview: 'Podgląd CV', completed: 'CV zapisane' };

export default function CareerProfilePage() {
  const [view, setView] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [sessionPage, setSessionPage] = useState(0);
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const lock = useRef(false);
  const deleteButton = useRef(null);
  const confirmationTrigger = useRef(null);
  const confirmationHeading = useRef(null);
  useEffect(() => { if (confirmDelete) confirmationHeading.current?.focus(); }, [confirmDelete]);
  function restoreDeletionFocus() {
    // Wait for the deleted row to unmount before choosing a surviving target.
    requestAnimationFrame(() => (confirmationTrigger.current?.isConnected ? confirmationTrigger.current : deleteButton.current)?.focus());
  }
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([interviewRequest('/career-profile'), interviewRequest('/ai/interviews')]);
    setProfile(p); setFacts(p.facts); setSessions(s.items); setNextOffset(s.next_offset);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([interviewRequest('/career-profile'), interviewRequest('/ai/interviews')])
      .then(([p, s]) => { if (active) { setProfile(p); setFacts(p.facts); setSessions(s.items); setNextOffset(s.next_offset); } })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try { await work(); } catch (err) { setError(err.message); }
    finally { setBusy(false); lock.current = false; }
  }
  const dirty = profile && JSON.stringify(facts) !== JSON.stringify(profile.facts);
  const name = facts.find((f) => f.path === '/name')?.text;
  const title = facts.find((f) => f.path === '/title')?.text;
  return <SiteLayout workspace compact title="Profil zawodowy" intro="Cała Twoja kariera. Uporządkowana i gotowa na kolejny krok." heroActions={<Link className={site.primary} to="/app/interview">Utwórz CV z pomocą wywiadu →</Link>} heroAside={<><span className={site.eyebrow}>Twoje doświadczenie, Twój głos</span><strong className={site.noteTitle}>{name || 'Zacznij od swojej historii'}</strong><p>{title || 'Role, projekty i umiejętności tworzą wspólną podstawę Twoich CV.'}</p><span className={layout.profileMeta}>Informacje: {facts.length} · Rozmowy: {sessions.length}</span></>}>
    <div className={`${classes.flow} ${layout.profile}`} aria-busy={busy}>
      <nav className={layout.views} aria-label="Widoki profilu"><button disabled={busy || editing} aria-current={view === 'profile' ? 'page' : undefined} onClick={() => setView('profile')}>Moje informacje</button><button disabled={busy || editing} aria-current={view === 'sessions' ? 'page' : undefined} onClick={() => setView('sessions')}>Zapisane wywiady <span>{sessions.length}</span></button></nav>
      {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} onClick={() => run(load)}>Wczytaj zapisany profil</button></div>}
      <p className={layout.status} role="status">{busy ? 'Zapisujemy zmiany…' : status}</p>
      {view === 'profile' && (profile ? <><FactEditor facts={facts} onChange={setFacts} disabled={busy} onEditingChange={setEditing} /><div className={layout.saveBar}><p>{editing ? 'Zastosuj lub anuluj edycję pola, aby zapisać profil.' : dirty ? 'Masz niezapisane zmiany' : 'Wszystkie informacje zapisane'}<span>Zmiany dotyczą profilu. Wcześniejsze CV zachowują swoją treść.</span></p><div className={classes.actions}>
        <button className={classes.primary} disabled={busy || editing || !dirty || facts.some((fact) => !fact.text.trim())} onClick={() => run(async () => { const p = await interviewRequest('/career-profile', 'PUT', { revision: profile.revision, facts }); setProfile(p); setFacts(p.facts); setStatus('Profil zapisany.'); })}>Zapisz profil</button>
        <button ref={deleteButton} className={classes.danger} disabled={busy || editing || !facts.length} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setConfirmDelete('profile'); }}>Wyczyść profil</button>
      </div></div></> : !error && <p className={layout.loading}>Wczytujemy profil…</p>)}
      {confirmDelete && <section className={classes.question} aria-label="Potwierdzenie usunięcia"><h2 ref={confirmationHeading} tabIndex={-1}>{confirmDelete === 'profile' ? 'Usunąć wszystkie informacje z profilu?' : 'Usunąć zapisany wywiad?'}</h2><p>Wcześniej zapisane CV pozostaną dostępne. {confirmDelete === 'profile' ? 'Nowe generowanie nie wykorzysta usuniętych faktów.' : 'Usuniemy również informacje zapisane tylko w tej rozmowie. Dane profilu konta pozostaną.'}</p><div className={classes.actions}><button className={classes.danger} disabled={busy} onClick={() => run(async () => {
        if (confirmDelete === 'profile') { const p = await interviewRequest(`/career-profile?revision=${profile.revision}`, 'DELETE'); setProfile(p); setFacts([]); }
        else { await interviewRequest(`/ai/interviews/${confirmDelete}`, 'DELETE'); setSessions((current) => current.filter((s) => s.id !== confirmDelete)); setSessionPage(0); }
        setConfirmDelete(null); setStatus('Dane usunięte.'); restoreDeletionFocus();
      })}>Potwierdzam usunięcie</button><button disabled={busy} onClick={() => { setConfirmDelete(null); restoreDeletionFocus(); }}>Anuluj</button></div></section>}
      {view === 'sessions' && <section className={layout.sessions}><h2>Zapisane wywiady</h2><p className={classes.hint}>Wróć do rozmowy lub otwórz przygotowane CV.</p>
      {!sessions.length && <p>Nie masz jeszcze zapisanych wywiadów.</p>}
      <ul className={classes.requirements}>{sessions.slice(sessionPage * 6, (sessionPage + 1) * 6).map((session) => <li key={session.id}><strong>{modes[session.mode]}</strong><p>{phases[session.phase]} · {new Date(session.updated_at).toLocaleDateString('pl-PL')}</p><div className={classes.actions}><Link className={classes.link} to={`/app/interview/${session.id}`}>Wznów wywiad</Link>{session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>Otwórz CV</Link>}<button className={classes.danger} disabled={busy} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setConfirmDelete(session.id); }}>Usuń wywiad</button></div></li>)}</ul>
      {sessions.length > 6 && <nav className={classes.actions} aria-label="Strony wywiadów"><button disabled={busy || sessionPage === 0} onClick={() => setSessionPage((n) => n - 1)}>Poprzednie rozmowy</button><span>{sessionPage + 1} / {Math.ceil(sessions.length / 6)}</span><button disabled={busy || (sessionPage + 1) * 6 >= sessions.length} onClick={() => setSessionPage((n) => n + 1)}>Kolejne rozmowy</button></nav>}
      {nextOffset !== null && <button disabled={busy} onClick={() => run(async () => { const page = await interviewRequest(`/ai/interviews?offset=${nextOffset}`); setSessions((s) => [...s, ...page.items]); setNextOffset(page.next_offset); })}>Pokaż starsze wywiady</button>}
      </section>}
    </div>
  </SiteLayout>;
}
