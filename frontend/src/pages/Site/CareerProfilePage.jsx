/** Account-owned career facts and resumable sessions remain usable without Pro. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import FactEditor from '../../components/ai/Interview/FactEditor';
import { interviewRequest } from '../../services/interviews';
import classes from '../../components/ai/Interview/Interview.module.css';

const modes = { create: 'Tworzenie CV', enrich: 'Uzupełnianie CV', tailor: 'Dopasowanie do oferty' };
const phases = { intake: 'Informacje początkowe', ready: 'Gotowy do kolejnego pytania', question: 'Pytanie', review: 'Podsumowanie', preview: 'Podgląd CV', completed: 'CV zapisane' };

export default function CareerProfilePage() {
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
  return <SiteLayout workspace title="Profil zawodowy" intro="Twoje doświadczenie jest wspólną podstawą kolejnych CV. Zapisane dokumenty zachowują własną treść.">
    <div className={`${classes.flow} ${classes.workspace}`} aria-busy={busy}>
      <Link className={classes.link} to="/app/interview">Utwórz CV z pomocą wywiadu</Link>
      {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} onClick={() => run(load)}>Wczytaj zapisany profil</button></div>}
      <p role="status">{busy ? 'Zapisujemy zmiany…' : status}</p>
      {profile ? <><FactEditor facts={facts} onChange={setFacts} disabled={busy} /><div className={classes.actions}>
        <button className={classes.primary} disabled={busy || facts.some((fact) => !fact.text.trim())} onClick={() => run(async () => { const p = await interviewRequest('/career-profile', 'PUT', { revision: profile.revision, facts }); setProfile(p); setFacts(p.facts); setStatus('Profil zapisany.'); })}>Zapisz profil</button>
        <button ref={deleteButton} className={classes.danger} disabled={busy} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setConfirmDelete('profile'); }}>Wyczyść profil</button>
      </div></> : !error && <p>Wczytujemy profil…</p>}
      {confirmDelete && <section className={classes.question} aria-label="Potwierdzenie usunięcia"><h2 ref={confirmationHeading} tabIndex={-1}>{confirmDelete === 'profile' ? 'Usunąć wszystkie informacje z profilu?' : 'Usunąć zapisany wywiad?'}</h2><p>Wcześniej zapisane CV pozostaną dostępne. {confirmDelete === 'profile' ? 'Nowe generowanie nie wykorzysta usuniętych faktów.' : 'Potwierdzone informacje pozostaną w profilu.'}</p><div className={classes.actions}><button className={classes.danger} disabled={busy} onClick={() => run(async () => {
        if (confirmDelete === 'profile') { const p = await interviewRequest(`/career-profile?revision=${profile.revision}`, 'DELETE'); setProfile(p); setFacts([]); }
        else { await interviewRequest(`/ai/interviews/${confirmDelete}`, 'DELETE'); setSessions((current) => current.filter((s) => s.id !== confirmDelete)); }
        setConfirmDelete(null); setStatus('Dane usunięte.'); restoreDeletionFocus();
      })}>Potwierdzam usunięcie</button><button disabled={busy} onClick={() => { setConfirmDelete(null); restoreDeletionFocus(); }}>Anuluj</button></div></section>}
      <h2>Zapisane wywiady</h2>
      {!sessions.length && <p>Nie masz jeszcze zapisanych wywiadów.</p>}
      <ul className={classes.requirements}>{sessions.map((session) => <li key={session.id}><strong>{modes[session.mode]}</strong><p>{phases[session.phase]} · {new Date(session.updated_at).toLocaleDateString('pl-PL')}</p><div className={classes.actions}><Link className={classes.link} to={`/app/interview/${session.id}`}>Wznów wywiad</Link>{session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>Otwórz CV</Link>}<button className={classes.danger} disabled={busy} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setConfirmDelete(session.id); }}>Usuń wywiad</button></div></li>)}</ul>
      {nextOffset !== null && <button disabled={busy} onClick={() => run(async () => { const page = await interviewRequest(`/ai/interviews?offset=${nextOffset}`); setSessions((s) => [...s, ...page.items]); setNextOffset(page.next_offset); })}>Pokaż starsze wywiady</button>}
    </div>
  </SiteLayout>;
}
