import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { t as uiText } from "../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Account-owned career facts and resumable sessions remain usable without Pro. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import FactEditor from '../../components/ai/Interview/FactEditor';
import InterviewSourceRequired from '../../components/ai/Interview/InterviewSourceRequired';
import { isCareerNote, careerNoteSignature } from '../../utils/careerProfileView';
import { interviewRequest } from '../../services/interviews';
import classes from '../../components/ai/Interview/Interview.module.css';
import layout from './CareerProfilePage.module.css';
import site from '../../components/common/SiteLayout/SiteLayout.module.css';
import DialogShell from '../../components/common/DialogShell/DialogShell';
import SavedConversationDetails from './SavedConversationDetails';
import { conversationTitle } from '../../utils/interviewHistory';

export default function CareerProfilePage() {
  useTranslation();
  const [view, setView] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [sessionPage, setSessionPage] = useState(0);
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [error, setError] = useMessageState('');
  const [status, setStatus] = useMessageState('');
  const [busy, setBusy] = useState(false);
  const [updatingSource, setUpdatingSource] = useState(false);
  const [noteConflict, setNoteConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const lock = useRef(false);
  const deleteButton = useRef(null);
  const profileViewButton = useRef(null);
  const confirmationTrigger = useRef(null);
  const confirmationHeading = useRef(null);
  const sessionsHeading = useRef(null);
  const restoreAfterDeletion = useRef(false);
  useEffect(() => { if (confirmDelete) confirmationHeading.current?.focus(); }, [confirmDelete]);
  useEffect(() => {
    // Wait for the request and React commit before focusing a surviving control.
    // The original delete button may be unmounted or disabled after clearing.
    if (busy || confirmDelete || !restoreAfterDeletion.current) return;
    restoreAfterDeletion.current = false;
    const trigger = confirmationTrigger.current;
    const target = trigger?.isConnected && !trigger.disabled ? trigger : view === 'sessions' ? sessionsHeading.current : profileViewButton.current;
    target?.focus();
  }, [busy, confirmDelete, view]);
  function restoreDeletionFocus() {
    restoreAfterDeletion.current = true;
  }
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([interviewRequest('/career-profile'), interviewRequest('/ai/interviews')]);
    // Recover current server state without discarding locally applied note edits.
    const notes = !noteConflict && profile && JSON.stringify(facts) !== JSON.stringify(profile.facts)
      ? facts.filter(isCareerNote).map((fact) => ({ ...fact, path: '' })) : null;
    if (notes && careerNoteSignature(profile.facts) !== careerNoteSignature(p.facts)) {
      setNoteConflict(true); setError(messageRef("public:careerProfilePage.noteConflict")); return;
    }
    setProfile(p); setFacts(notes ? [...p.facts.filter((fact) => !isCareerNote(fact)), ...notes] : p.facts);
    setSessions(s.items); setNextOffset(s.next_offset); setSessionsLoaded(true); setSessionPage(0); setNoteConflict(false);
  }, [facts, profile, noteConflict]);
  useEffect(() => {
    let active = true;
    Promise.all([interviewRequest('/career-profile'), interviewRequest('/ai/interviews')])
      .then(([p, s]) => { if (active) { setProfile(p); setFacts(p.facts); setSessions(s.items); setNextOffset(s.next_offset); setSessionsLoaded(true); } })
      .catch((err) => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, []);
  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try { await work(); } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); lock.current = false; }
  }
  const dirty = profile && JSON.stringify(facts) !== JSON.stringify(profile.facts);
  // Resolve eligibility from the server's filtered owned sources. Existing
  // profile facts alone must never unlock editing, including after source deletion.
  const hasSource = Boolean(profile?.sources?.documents?.length || profile?.sources?.imports?.length);
  const binding = profile?.source_binding;
  const sourceValue = binding ? `${binding.kind}:${binding.id}` : '';
  // Legacy manually authored fields remain visible as notes until a source is
  // chosen. Never present old source snapshots as the currently selected CV.
  const visibleFacts = binding ? facts : facts.filter(isCareerNote);
  async function refreshSource(choice) {
    if (lock.current || editing) return;
    const notes = dirty ? facts.filter(isCareerNote).map((fact) => ({ ...fact, path: '' })) : null;
    await run(async () => {
      setUpdatingSource(true);
      try {
        const [kind, id] = choice?.split(':') || [];
        const next = choice
          ? await interviewRequest('/career-profile/source', 'PUT', { revision: profile.revision, kind, id: Number(id) })
          : await interviewRequest('/career-profile');
        // A source refresh may advance the profile revision. Do not silently
        // rebase local notes over another window's additions/edits/deletions.
        // Keep the draft and require the explicitly labelled saved-state recovery.
        if (notes && careerNoteSignature(profile.facts) !== careerNoteSignature(next.facts)) {
          setNoteConflict(true); setError(messageRef("public:careerProfilePage.noteConflict")); return;
        }
        setNoteConflict(false); setProfile(next);
        // Applied but unsaved notes survive source changes and background reads.
        // Only the selected CV fields are replaced by the authoritative response.
        setFacts(notes ? [...next.facts.filter((fact) => !isCareerNote(fact)), ...notes] : next.facts);
        setStatus(messageRef("public:careerProfilePage.sourceUpdated"));
      } finally { setUpdatingSource(false); }
    });
  }
  useEffect(() => {
    // Returning from the editor or another browser tab refreshes saved CV data.
    // An open field draft stays mounted and is never replaced by a background read.
    const refresh = () => { if (binding && !editing && !lock.current && document.visibilityState === 'visible') void refreshSource(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  });
  const name = visibleFacts.find((f) => f.path === '/name')?.text;
  const title = visibleFacts.find((f) => f.path === '/title')?.text;
  const deletingSession = sessions.find((session) => session.id === confirmDelete);
  function closeSessionDeletion() {
    if (lock.current) return;
    setConfirmDelete(null); setError(''); restoreDeletionFocus();
  }
  async function deleteSession() {
    const selected = deletingSession;
    if (!selected) return;
    await run(async () => {
      await interviewRequest(`/ai/interviews/${selected.id}`, 'DELETE');
      const remaining = sessions.filter((session) => session.id !== selected.id);
      setSessions(remaining);
      // Removing an item shifts the server's offset page. Keep the current
      // visible page when possible, and do not skip the next older conversation.
      setNextOffset((offset) => offset === null ? null : Math.max(0, offset - 1));
      setSessionPage((page) => Math.min(page, Math.max(0, Math.ceil(remaining.length / 6) - 1)));
      setConfirmDelete(null);
      setStatus(messageRef('public:careerProfilePage.conversationDeleted', { title: conversationTitle(selected) }));
      restoreDeletionFocus();
    });
  }
  return <SiteLayout workspace compact title={uiText("public:siteLayout.careerProfile")} intro={uiText("public:careerProfilePage.yourWholeCareerOrganisedAndReadyFor")} heroActions={hasSource && <Link className={site.primary} to="/app/interview">{uiText("public:careerProfilePage.createACvThroughAnInterview")}</Link>} heroAside={<><span className={site.eyebrow}>{uiText("public:careerProfilePage.yourExperienceYourVoice")}</span><strong className={site.noteTitle}>{name || uiText("public:careerProfilePage.startWithYourStory")}</strong><p>{title || uiText("public:careerProfilePage.rolesProjectsAndSkillsFormAShared")}</p></>}>
    <div className={`${classes.flow} ${layout.profile}`} aria-busy={busy}>
      <nav className={layout.views} aria-label={uiText("public:careerProfilePage.profileViews")}><button ref={profileViewButton} disabled={busy || editing} aria-current={view === 'profile' ? 'page' : undefined} onClick={() => setView('profile')}>{uiText("public:careerProfilePage.myInformation")}</button><button disabled={busy || editing} aria-current={view === 'sessions' ? 'page' : undefined} onClick={() => setView('sessions')}>{uiText("public:careerProfilePage.savedInterviews")} <span>{sessions.length}</span></button></nav>
      {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy || editing} onClick={() => run(load)}>{uiText(noteConflict ? "public:careerProfilePage.loadSavedNotes" : "public:careerProfilePage.loadSavedProfile")}</button></div>}
      <p className={layout.status} role="status">{busy ? uiText(updatingSource ? "public:careerProfilePage.updatingSource" : "public:careerProfilePage.savingChanges") : status}</p>
      {view === 'profile' && (profile ? <>{(hasSource || binding) && <section className={layout.source}>
        <label>{uiText("public:careerProfilePage.profileSource")}<select value={sourceValue} disabled={busy || editing || Boolean(confirmDelete) || !hasSource} onChange={(event) => { if (event.target.value) void refreshSource(event.target.value); }}>
          <option value="" disabled>{uiText("public:careerProfilePage.chooseSource")}</option>
          {binding && !profile.source_available && <option value={sourceValue} disabled>{uiText("public:careerProfilePage.sourceUnavailable")}</option>}
          <optgroup label={uiText("public:careerProfilePage.savedCvs")}>{profile.sources.documents.map((doc) => <option key={doc.id} value={`document:${doc.id}`}>{doc.title}</option>)}</optgroup>
          <optgroup label={uiText("public:careerProfilePage.imports")}>{profile.sources.imports.map((item) => <option key={item.id} value={`import:${item.id}`}>{item.filename}</option>)}</optgroup>
        </select></label>
        <p>{uiText("public:careerProfilePage.sourceGuidance")}</p>
        <div className={classes.actions}>
          {binding && profile.source_available && <Link className={classes.link} aria-disabled={busy || editing || dirty} onClick={(event) => { if (busy || editing || dirty) event.preventDefault(); }} to={binding.kind === 'document' ? `/app/documents/${binding.id}` : '/app/import'}>{uiText(binding.kind === 'document' ? "public:careerProfilePage.editSourceCv" : "public:careerProfilePage.editImportedCv")}</Link>}
          {binding && <button disabled={busy || editing} onClick={() => refreshSource()}>{uiText("public:careerProfilePage.refreshSource")}</button>}
        </div>
        {binding?.kind === 'import' && <p className={classes.hint}>{uiText("public:careerProfilePage.importEditGuidance")}</p>}
        {dirty && <p className={classes.hint}>{uiText("public:careerProfilePage.saveBeforeEditor")}</p>}
        {binding && !profile.source_available && <p role="status">{uiText("public:careerProfilePage.sourceUnavailable")}</p>}
      </section>}
      {!hasSource && <InterviewSourceRequired />}
      {(hasSource || visibleFacts.length > 0) && <FactEditor key={sourceValue} detachNotePaths facts={visibleFacts} onChange={(next) => setFacts(binding ? next : [...facts.filter((fact) => !isCareerNote(fact)), ...next])} disabled={busy} readOnly={!hasSource} onEditingChange={setEditing} />}{(hasSource || facts.length > 0 || binding) && <div className={layout.saveBar}><p>{editing ? uiText("public:careerProfilePage.applyOrCancelFieldEditingBeforeSaving") : dirty ? uiText("public:careerProfilePage.youHaveUnsavedChanges") : uiText("public:careerProfilePage.allInformationSaved")}<span>{uiText("public:careerProfilePage.changesAffectYourProfileExistingCvsKeep")}</span></p><div className={classes.actions}>
        {hasSource && <button className={classes.primary} disabled={busy || editing || noteConflict || !dirty || facts.some((fact) => !fact.text.trim())} onClick={() => run(async () => { const p = await interviewRequest('/career-profile', 'PUT', { revision: profile.revision, facts }); setProfile(p); setFacts(p.facts); setStatus(messageRef("public:careerProfilePage.profileSaved")); })}>{uiText("public:careerProfilePage.saveProfile")}</button>}
        <details className={layout.management}><summary>{uiText('public:careerProfilePage.manageProfile')}</summary><button ref={deleteButton} className={classes.danger} disabled={busy || editing || (!facts.length && !binding)} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setConfirmDelete('profile'); }}>{uiText("public:careerProfilePage.clearProfile")}</button></details>
      </div></div>}</> : !error && <p className={layout.loading}>{uiText("public:careerProfilePage.loadingProfile")}</p>)}
      {confirmDelete === 'profile' && <section className={classes.question} aria-label={uiText("public:careerProfilePage.confirmDeletion")}><h2 ref={confirmationHeading} tabIndex={-1}>{uiText("public:careerProfilePage.deleteAllProfileInformation")}</h2><p>{uiText("public:careerProfilePage.previouslySavedCvsWillRemainAvailable")} {uiText("public:careerProfilePage.newGenerationWillNotUseDeletedFacts")}</p><div className={classes.actions}><button className={classes.danger} disabled={busy} onClick={() => run(async () => {
        if (confirmDelete === 'profile') { const p = await interviewRequest(`/career-profile?revision=${profile.revision}`, 'DELETE'); setProfile({ ...p, sources: profile.sources }); setFacts([]); setNoteConflict(false); }
        setConfirmDelete(null); setStatus(messageRef("public:careerProfilePage.dataDeleted")); restoreDeletionFocus();
      })}>{uiText("public:careerProfilePage.confirmDeletion2")}</button><button disabled={busy} onClick={() => { setConfirmDelete(null); restoreDeletionFocus(); }}>{uiText("ai:aiAssistant.cancel")}</button></div></section>}
      {view === 'sessions' && <section className={layout.sessions}><h2 ref={sessionsHeading} tabIndex={-1}>{uiText("public:careerProfilePage.savedInterviews")}</h2><p className={classes.hint}>{uiText("public:careerProfilePage.conversationHistoryHint")}</p>
      {!sessionsLoaded && !error && <p role="status">{uiText('public:careerProfilePage.loadingConversations')}</p>}
      {sessionsLoaded && !sessions.length && <p>{uiText("public:careerProfilePage.youHaveNoSavedInterviewsYet")}</p>}
      <ul className={layout.sessionList}>{sessions.slice(sessionPage * 6, (sessionPage + 1) * 6).map((session) => <li key={session.id} aria-labelledby={`conversation-${session.id}`}>
        <SavedConversationDetails session={session} titleId={`conversation-${session.id}`} />
        <div className={`${classes.actions} ${layout.sessionActions}`}>
          <Link className={classes.link} aria-describedby={`conversation-${session.id}`} to={`/app/interview/${session.id}`}>{uiText("public:careerProfilePage.resumeInterview")}</Link>
          {session.document_id && <Link className={classes.link} aria-describedby={`conversation-${session.id}`} to={`/app/documents/${session.document_id}`}>{uiText("public:careerProfilePage.openCv")}</Link>}
          <button className={classes.danger} aria-describedby={`conversation-${session.id}`} disabled={busy} onClick={(event) => { confirmationTrigger.current = event.currentTarget; setError(''); setConfirmDelete(session.id); }}>{uiText("public:careerProfilePage.deleteInterview")}</button>
        </div>
      </li>)}</ul>
      {sessions.length > 6 && <nav className={classes.actions} aria-label={uiText("public:careerProfilePage.interviewPages")}><button disabled={busy || sessionPage === 0} onClick={() => setSessionPage((n) => n - 1)}>{uiText("public:careerProfilePage.previousInterviews")}</button><span>{sessionPage + 1} / {Math.ceil(sessions.length / 6)}</span><button disabled={busy || (sessionPage + 1) * 6 >= sessions.length} onClick={() => setSessionPage((n) => n + 1)}>{uiText("public:careerProfilePage.nextInterviews")}</button></nav>}
      {nextOffset !== null && <button disabled={busy} onClick={() => run(async () => { const page = await interviewRequest(`/ai/interviews?offset=${nextOffset}`); setSessions((s) => [...s, ...page.items]); setNextOffset(page.next_offset); })}>{uiText("public:careerProfilePage.showOlderInterviews")}</button>}
      </section>}
      <DialogShell open={Boolean(deletingSession)} onClose={closeSessionDeletion} title={uiText('public:careerProfilePage.deleteSavedInterview')} variant="decision" initialFocusSelector="[data-cancel-conversation]" bodyClassName={classes.flow} footer={<div className={`${classes.flow} ${layout.deleteControls}`}><div className={classes.actions}>
        <button data-cancel-conversation disabled={busy} onClick={closeSessionDeletion}>{uiText('ai:aiAssistant.cancel')}</button>
        <button className={classes.danger} disabled={busy} onClick={deleteSession}>{uiText('public:careerProfilePage.deleteConversationPermanently')}</button>
      </div></div>}>
        {deletingSession && <>
          <SavedConversationDetails session={deletingSession} compact />
          <p className={layout.deleteExplanation}>{uiText('public:careerProfilePage.deleteConversationWarning')}</p>
          {error && <p className={classes.error} role="alert">{error}</p>}
          <p role="status">{busy ? uiText('public:careerProfilePage.deletingConversation') : ''}</p>
        </>}
      </DialogShell>
    </div>
  </SiteLayout>;
}
