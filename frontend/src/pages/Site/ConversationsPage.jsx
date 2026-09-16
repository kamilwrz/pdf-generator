import { useMessageState, messageRef, messageOf } from '../../i18n/messageState.js';
import { t as uiText } from '../../i18n/index.js';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteLayout from '../../components/common/SiteLayout/SiteLayout';
import { interviewRequest } from '../../services/interviews';
import classes from '../../components/ai/Interview/Interview.module.css';
import layout from './ConversationsPage.module.css';
import DialogShell from '../../components/common/DialogShell/DialogShell';
import SavedConversationDetails from './SavedConversationDetails';
import { conversationTitle } from '../../utils/interviewHistory';

/** Owned conversation history. Reads and deletion never generate content or change saved CVs. */
export default function ConversationsPage() {
  useTranslation();
  const [sessionPage, setSessionPage] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [error, setError] = useMessageState('');
  const [status, setStatus] = useMessageState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const lock = useRef(false);
  const confirmationTrigger = useRef(null);
  const sessionsHeading = useRef(null);
  const restoreAfterDeletion = useRef(false);
  useEffect(() => {
    if (busy || confirmDelete || !restoreAfterDeletion.current) return;
    restoreAfterDeletion.current = false;
    const trigger = confirmationTrigger.current;
    (trigger?.isConnected && !trigger.disabled ? trigger : sessionsHeading.current)?.focus();
  }, [busy, confirmDelete]);
  function restoreDeletionFocus() { restoreAfterDeletion.current = true; }
  function adopt(result) { setSessions(result.items); setNextOffset(result.next_offset); setSessionsLoaded(true); setSessionPage(0); }
  useEffect(() => {
    let active = true;
    interviewRequest('/ai/interviews').then(result => { if (active) adopt(result); }).catch(err => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, [setError]);
  async function run(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try { await work(); } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); lock.current = false; }
  }
  const deletingSession = sessions.find(session => session.id === confirmDelete);
  function closeSessionDeletion() {
    if (lock.current) return;
    setConfirmDelete(null); setError(''); restoreDeletionFocus();
  }
  async function deleteSession() {
    const selected = deletingSession;
    if (!selected) return;
    await run(async () => {
      await interviewRequest('/ai/interviews/' + selected.id, 'DELETE');
      const remaining = sessions.filter(session => session.id !== selected.id);
      setSessions(remaining);
      // Deletion shifts server offsets. Preserve pagination without skipping older rows.
      setNextOffset(offset => offset === null ? null : Math.max(0, offset - 1));
      setSessionPage(page => Math.min(page, Math.max(0, Math.ceil(remaining.length / 6) - 1)));
      setConfirmDelete(null);
      setStatus(messageRef('public:careerProfilePage.conversationDeleted', { title: conversationTitle(selected) }));
      restoreDeletionFocus();
    });
  }
  return <SiteLayout workspace compact title={uiText('interview:simple.history')} breadcrumbs={[{ label: uiText('public:siteLayout.interview'), to: '/app/assistant' }]}>
    <div className={classes.flow} aria-busy={busy}>
      {error && !deletingSession && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} onClick={() => run(async () => adopt(await interviewRequest('/ai/interviews')))}>{uiText('interview:interviewFlow.loadSavedState')}</button></div>}
      <p role="status">{status}</p>
      <section className={layout.sessions}><h2 ref={sessionsHeading} tabIndex={-1}>{uiText("public:careerProfilePage.savedInterviews")}</h2><p className={classes.hint}>{uiText("public:careerProfilePage.conversationHistoryHint")}</p>
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
      </section>
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
