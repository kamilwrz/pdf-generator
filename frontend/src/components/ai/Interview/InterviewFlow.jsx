import InterviewStages from './InterviewStages';
import InterviewRequirements from './InterviewRequirements';
import InterviewQuestionContext from './InterviewQuestionContext';
import { useMessageState, messageRef, messageOf } from '../../../i18n/messageState.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { getUiLanguage } from '../../../i18n';
/**
 * Shared interview controller for account creation and the existing assistant.
 * Server state survives unmount/logout. Answers are saved before asking again;
 * failed requests retain input and can be recovered by loading the session.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { interviewRequest, reviewFacts, interviewEvidence } from '../../../services/interviews';
import { useEntitlements } from '../../../hooks/useEntitlements';
import { TEMPLATES } from '../../../templates';
import { isTemplateAllowed } from '../../../utils/entitlements';
import FactEditor from './FactEditor';
import InterviewLoading from './InterviewLoading';
import InterviewCredits from './InterviewCredits';
import InterviewPreview from './InterviewPreview';
import { templatePreviewPath } from '../../../i18n/templatePreviews';
import InterviewReviewNotice from './InterviewReviewNotice';
import InterviewSourceRequired from './InterviewSourceRequired';
import InterviewSourcePicker from './InterviewSourcePicker';
import InterviewTemplateOptions from './InterviewTemplateOptions';
import InterviewAnswerHelp from './InterviewAnswerHelp';
import classes from './Interview.module.css';

const languageLabels = { get pl() { return uiText("ai:aiAssistant.polish"); }, get en() { return uiText("ai:aiAssistant.english"); }, get de() { return uiText("ai:aiAssistant.german"); }, get fr() { return uiText("ai:aiAssistant.french"); }, get es() { return uiText("ai:aiAssistant.spanish"); }, get uk() { return uiText("ai:aiAssistant.ukrainian"); }, get it() { return uiText("ai:aiAssistant.italian"); }, get nl() { return uiText("ai:aiAssistant.dutch"); } };

export default function InterviewFlow({ sessionId, initialSource = null, currentSource = null, mode = 'create', onClose, sourceChanged: editorSourceChanged = false, onSourceRefreshed, onCreditsChanged, guided = false, onGuidedStage, onDocumentSaved }) {
  useTranslation();
  const navigate = useNavigate();
  const { entitlements, refresh, loading: balanceLoading, error: balanceError } = useEntitlements();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [facts, setFacts] = useState([]);
  const [answer, setAnswer] = useState('');
  const [assistedAnswer, setAssistedAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pendingOperation, setPendingOperation] = useState('load');
  const [panel, setPanel] = useState('conversation');
  const [error, setError] = useMessageState('');
  const [notice, setNotice] = useMessageState('');
  const [documents, setDocuments] = useState([]);
  const [imports, setImports] = useState([]);
  const [language, setLanguage] = useState(() => initialSource?.language || getUiLanguage());
  const [template, setTemplate] = useState(initialSource?.template_id || '');
  const [allTemplates, setAllTemplates] = useState(false);
  const [factEditing, setFactEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [correctingProposal, setCorrectingProposal] = useState(false);
  const [autoTemplateRevision, setAutoTemplateRevision] = useState(null);
  const [scanningTemplateRevision, setScanningTemplateRevision] = useState(null);
  const [templateChoice, setTemplateChoice] = useState(null);
  // A late cleanup for a previous preview cannot release a newer scan's save
  // guard. The callback stays stable so child effects do not restart on render.
  const handleTemplateChecking = useCallback((revision, checking) => {
    setScanningTemplateRevision(current => checking ? revision : current === revision ? null : current);
  }, []);
  // Bind the staged choice to its measured preview. Cleanup from an older
  // preview must not clear a choice made after a newer revision was adopted.
  const handleTemplateChoice = useCallback((revision, candidate) => {
    setTemplateChoice(current => candidate ? { revision, candidate }
      : current?.revision === revision ? null : current);
  }, []);
  const lock = useRef(false);
  const alive = useRef(true);
  const createKey = useRef({ signature: null, key: crypto.randomUUID() });
  const heading = useRef(null);
  const sessionRef = useRef(null);
  const evidenceRef = useRef(null);
  const requestEpoch = useRef(0);
  const answerField = useRef(null);
  const correctionTrigger = useRef(null);
  const focusContext = useRef('');
  // Guards the guided auto-advance below so a resumed or reloaded session
  // does not repeat the paid first-question request while one is in flight.
  const autoAdvancedSession = useRef(null);
  const canAi = entitlements?.ai_assistant === true;
  // Standalone resumes use the server's saved-document revision check; embedded
  // interviews also include unsaved editor changes. Neither refreshes silently.
  const sourceChanged = editorSourceChanged || Boolean(session?.source_changed);

  const adopt = useCallback((next, currentProfile) => {
    currentProfile = interviewEvidence(currentProfile, next);
    // A generated draft belongs to exactly one question. Resuming a different
    // question must not carry its text or confirmation marker into that answer.
    if (sessionRef.current?.id !== next?.id || sessionRef.current?.question?.id !== next?.question?.id) {
      setAnswer(''); setAssistedAnswer(null); setCorrectingProposal(false);
    }
    sessionRef.current = next;
    evidenceRef.current = currentProfile;
    setSession(next); setProfile(currentProfile); setFacts(reviewFacts(currentProfile, next));
    setTemplate(next?.template_id || '');
    setPanel(next?.preview?.fit?.status === 'pending' ? 'prepare' : next?.phase === 'preview' || next?.phase === 'completed' ? 'preview' : 'conversation');
  }, []);

  const load = useCallback(async () => {
    const id = sessionRef.current?.id || sessionId;
    const next = id ? await interviewRequest(`/ai/interviews/${id}`) : null;
    const currentProfile = next && next.evidence_scope !== 'profile'
      ? interviewEvidence(null, next) : await interviewRequest('/career-profile');
    // Load every source before revealing intake. Retry repeats this read as well,
    // so a failed library request is never presented as an empty account.
    if (!id && !initialSource) {
      if (alive.current) {
        setDocuments(currentProfile.sources?.documents || []); setImports(currentProfile.sources?.imports || []);
      }
    }
    if (alive.current) adopt(next, currentProfile);
  }, [sessionId, initialSource, adopt]);

  useEffect(() => {
    alive.current = true;
    load().catch((err) => { if (alive.current) setError(messageOf(err)); }).finally(() => { if (alive.current) setInitialLoading(false); });
    return () => { alive.current = false; requestEpoch.current += 1; };
  }, [sessionId, initialSource, load, setError]);

  // Return focus to the active task after a request; hidden forms keep their drafts.
  useEffect(() => {
    const context = JSON.stringify([session?.phase, session?.question?.id, reviewOpen, panel]);
    const changedTask = focusContext.current !== context;
    focusContext.current = context;
    // Answer assistance owns result/error focus inside the still-visible form.
    // Other operations and actual stage changes retain the task-heading rule.
    if (!busy && !initialLoading && (pendingOperation !== 'answer-help' || changedTask)) heading.current?.focus();
  }, [session?.phase, session?.question?.id, reviewOpen, panel, busy, initialLoading, pendingOperation]);

  async function run(work, operationName = 'load') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setPendingOperation(operationName); setError(''); setNotice('');
    try { await work(); }
    catch (err) { if (alive.current) setError(messageOf(err)); }
    // The embedded assistant owns another balance view; refresh both after
    // success or failure because an incomplete preview may still incur usage.
    finally { lock.current = false; if (alive.current) { setBusy(false); refresh(); onCreditsChanged?.(); } }
  }

  // Chained requests use the last server response, not a render's captured
  // revision. This keeps save → next and create → confirm → next atomic in order.
  function versions() {
    const current = sessionRef.current;
    return { revision: current.revision, profile_revision: evidenceRef.current.revision, evidence_scope: current.evidence_scope };
  }

  /**
   * Request a reviewable suggestion without saving an answer. Errors propagate
   * to the inline panel; a read-only recovery refreshes revisions and receipts
   * after partially completed paid stages without starting another AI request.
   */
  async function generateAnswerHelp(draft) {
    if (lock.current) throw new Error(uiText('interview:answerHelp.error'));
    const id = session.id;
    const questionId = session.question.id;
    const epoch = requestEpoch.current;
    const current = () => alive.current && requestEpoch.current === epoch
      && sessionRef.current?.id === id && sessionRef.current?.question?.id === questionId;
    lock.current = true; setBusy(true); setPendingOperation('answer-help'); setError(''); setNotice('');
    try {
      const next = await interviewRequest(`/ai/interviews/${id}/answer-help`, 'POST', {
        ...versions(), question_id: questionId, draft,
      });
      if (!current()) return null;
      adopt(next, profile);
      return next;
    } catch (err) {
      if (current()) {
        try {
          const next = await interviewRequest(`/ai/interviews/${id}`);
          if (current()) {
            const evidence = next.evidence_scope !== 'profile' ? interviewEvidence(null, next) : await interviewRequest('/career-profile');
            if (current()) {
              adopt(next, evidence);
              // A transport failure can arrive after the server committed the
              // checked result. Recover that exact draft as success, for free.
              if (next.question?.id === questionId && next.answer_help?.question_id === questionId
                && next.answer_help.based_on_draft === draft) return next;
            }
          }
        } catch { /* Retain the draft and original failure when recovery is unavailable. */ }
      }
      throw err;
    } finally {
      lock.current = false;
      if (alive.current && requestEpoch.current === epoch) { setBusy(false); refresh(); onCreditsChanged?.(); }
    }
  }

  /**
   * Keep checked task suggestions in the answer field without making checkbox
   * interaction a persistence boundary. Unchecking removes only text inserted
   * by that option and leaves the user's independently authored lines intact.
   */
  function useAnswerHelp(text, suggestionId, checked) {
    const suggestion = text?.trim();
    if (busy || !suggestion || session.answer_help?.id !== suggestionId) return false;
    const optionMode = typeof checked === 'boolean';
    const selectedTexts = assistedAnswer?.questionId === session.question.id
      && assistedAnswer.suggestionId === suggestionId ? assistedAnswer.selectedTexts || [] : [];
    if (optionMode && !checked) {
      const remaining = selectedTexts.filter(item => item !== suggestion);
      const lines = answer.split('\n');
      const index = lines.findIndex(line => line.trim() === suggestion);
      if (index !== -1) lines.splice(index, 1);
      setAnswer(lines.join('\n').replace(/^\n+|\n+$/g, ''));
      setAssistedAnswer(remaining.length > 0
        ? { questionId: session.question.id, suggestionId, selectedTexts: remaining }
        : null);
      return true;
    }
    if (optionMode && selectedTexts.includes(suggestion)) return true;
    const next = [answer.trimEnd(), suggestion].filter(Boolean).join('\n');
    if (next.length > 4000) return false;
    setAnswer(next);
    setAssistedAnswer({ questionId: session.question.id, suggestionId,
      ...(optionMode ? { selectedTexts: [...selectedTexts, suggestion] } : {}) });
    if (!optionMode) requestAnimationFrame(() => answerField.current?.focus());
    return true;
  }

  function changeAnswer(value) {
    setAnswer(value);
    if (!value.trim()) setAssistedAnswer(null);
  }

  async function operation(action, extra = {}) {
    setPendingOperation(action);
    let result;
    try {
      result = await interviewRequest(`/ai/interviews/${sessionRef.current.id}/${action}`, 'POST', { ...versions(), ...extra });
    } catch (err) {
      // Generation can persist its attempt or verified content before losing
      // the response. Refresh revisions for explicit recovery, without asking
      // the model again or discarding the original error if the read fails.
      if (action === 'preview' && alive.current) {
        try { await load(); } catch { /* Preserve the generation failure. */ }
      }
      throw err;
    }
    if (['preview', 'preview-review'].includes(action) && result.phase === 'preview' && result.preview?.fit?.status === 'pending' && alive.current) {
      const { completeInterviewFit } = await import('../../../utils/interviewFit.js');
      setPendingOperation('preview');
      try {
        result = await completeInterviewFit(result, interviewRequest, () => alive.current && sessionRef.current?.id === session.id);
      } catch (err) {
        // Reload only saved state after a partial fit. Recovery remains an
        // explicit action; a GET must never start another paid shortening.
        try { await load(); } catch { /* Preserve the fitting failure. */ }
        throw err;
      }
    }
    if (!alive.current) return;
    if (result.document_id && action === 'document') {
      if (onDocumentSaved) onDocumentSaved(result.document_id);
      else navigate(`/app/documents/${result.document_id}`);
      return;
    }
    if (!result.profile) setPendingOperation('sync');
    const next = result.session || result;
    const currentProfile = result.profile || (next.evidence_scope !== 'profile' ? interviewEvidence(null, next) : await interviewRequest('/career-profile'));
    if (alive.current) adopt(result.session || result, currentProfile);
    if (alive.current && ['preview', 'preview-review'].includes(action) && next.preview?.pages > 1 && next.preview?.fit?.status !== 'pending') {
      setAutoTemplateRevision(next.revision);
    }
    if (alive.current && action === 'preview-template') setNotice(messageRef('interview:templates.applied'));
    return next;
  }

  /** Apply a staged layout before saving, using its newly confirmed revision. */
  async function saveDocument() {
    let selectedSession = null;
    if (templateChoice?.revision === session.revision) {
      const candidate = templateChoice.candidate;
      selectedSession = await operation('preview-template', {
        template_id: candidate.template_id, elements: candidate.elements, spacing_px: candidate.spacing_px,
      });
      // A failed selection throws before saving. Closing or replacing the
      // interview during application must not save through this old handler.
      if (!selectedSession || !alive.current || sessionRef.current?.id !== session.id) return;
    }
    // React has not replaced this handler's captured session yet. Use the
    // template response's versions for the second write, never the old preview.
    await operation('document', selectedSession ? {
      revision: selectedSession.revision, profile_revision: selectedSession.profile_revision,
      evidence_scope: selectedSession.evidence_scope,
    } : {});
  }

  // Navigation is the save boundary: one explicit next action persists changed
  // facts before leaving. Failed saves retain the editor and its local draft.
  function goTo(key) {
    if (busy || factEditing || (key !== 'facts' && facts.some((fact) => !fact.text.trim()))) return;
    const show = () => { setReviewOpen(key === 'facts'); setPanel(key); };
    if (key === 'facts' || !needsFactSave) { show(); return; }
    return run(async () => {
      await operation('confirm', { facts });
      if (alive.current) {
        show();
        setNotice(session.evidence_scope === 'session' ? messageRef("interview:interviewFlow.informationSavedOnlyInThisInterviewYour") : messageRef("interview:interviewFlow.informationSavedToYourCareerProfile"));
      }
    }, 'confirm');
  }

  const start = (selected = '') => run(async () => {
    if (!canAi || (!sourceReady && !selected)) return;
    const [kind, id] = selected.split(':');
    const body = { mode, ...(initialSource || {}), language, include_profile: false,
      ...(!initialSource ? { cv_data: {}, candidate_notes: '',
        ...(kind === 'document' ? { source_document_id: Number(id), cv_data: {} } : {}),
        ...(kind === 'import' ? { source_import_id: Number(id), cv_data: {} } : {}),
      } : {}),
    };
    // Retry an uncertain start with the same identity, but never reuse it for
    // another candidate or changed language after a failed source selection.
    const signature = JSON.stringify(body);
    if (createKey.current.signature !== signature) createKey.current = { signature, key: crypto.randomUUID() };
    const result = await interviewRequest('/ai/interviews', 'POST', body, createKey.current.key);
    if (!alive.current) return;
    const evidence = interviewEvidence(null, result);
    adopt(result, evidence);
    // Choosing the source is the start action. Confirm only that existing
    // document's facts; no shared profile or AI-authored proposal is included.
    if (!result.confirmed) await operation('confirm', { facts: reviewFacts(evidence, result) });
    if (alive.current) await operation('next');
  }, 'start');

  const saveAnswer = (status, text = answer, finish = false) => run(async () => {
    const assisted = status === 'answered' && assistedAnswer?.questionId === session.question.id;
    const next = await operation('answers', { question_id: session.question.id, answer: text, status,
      ...(assisted ? { suggestion_id: assistedAnswer.suggestionId, confirm_suggestion: true } : {}),
    });
    if (alive.current) {
      // The server recognises standalone typed unknown answers without turning
      // them into facts. Keep the receipt consistent with the persisted meaning.
      status = sessionRef.current?.answers.at(-1)?.answer_meaning || status;
      const destination = session.evidence_scope === 'session' ? uiText("interview:interviewFlow.inThisInterview") : uiText("interview:interviewFlow.inYourCareerProfile");
      const message = status === 'answered' ? uiText("interview:interviewFlow.answerSaved", { value0: (destination) })
        : status === 'no_experience' ? uiText("interview:interviewFlow.lackOfExperienceSaved", { value0: (destination) })
          : status === 'unknown' ? uiText("interview:interviewFlow.savedICannotRemember") : uiText("interview:interviewFlow.questionSkipped");
      setAnswer(''); setAssistedAnswer(null); setNotice(message);
      // Persist first. A failed next-question request leaves the saved answer
      // intact and exposes explicit retry; loading a session never runs AI.
      if (finish) setPanel('prepare');
      else if (next && !session.question.clarification && canAi && !sourceChanged) {
        const following = canContinue(next) ? await operation('next') : next;
        if (alive.current && following && !following.question) setPanel('prepare');
      }
    }
  }, 'answers');

  function canContinue(current) {
    return !current.question && !current.discovery_complete && !current.discovery_round_complete
      && current.phase !== 'clarification' && current.answers.length < current.question_limit;
  }

  /** The third step selects a layout; it never starts generation on navigation alone. */
  function prepareCv() {
    goTo('prepare');
  }

  /** One template choice generates, verifies and saves a separate CV in that order.
   * A verification clarification interrupts this chain; unverified text is never saved.
   * Failed saving leaves the verified result available for a free save retry.
   */
  function createWithTemplate(selected) {
    return run(async () => {
      setTemplate(selected.id);
      const result = await operation('preview', { template_id: selected.id });
      if (!alive.current || !result || result.phase !== 'preview' || result.preview?.fit?.status === 'pending') return;
      // A fitted result that still needs several pages must stay on the
      // preview: `operation` has already armed the free automatic one-page
      // template comparison, and final saving waits for that check so a
      // two-page CV is never saved past the user unseen. Disarming and
      // direct saving remain reserved for a verified single-page result.
      if (result.preview?.pages > 1) return;
      setAutoTemplateRevision(null);
      if (!guided) await operation('document');
    }, 'preview');
  }

  const legacy = Boolean(session && (session.requires_source_choice || !session.evidence_scope));
  const isolated = session ? session.evidence_scope === 'session' : true;
  // New conversations always use the chosen CV alone. Empty editor snapshots
  // stay blocked; the server enforces the same source prerequisite.
  const sourceReady = Boolean(initialSource?.cv_data?.name?.trim());
  const hasPending = Boolean(session?.proposed_facts?.length);
  // Source refresh replaces the review draft. Keep applied notes until the
  // existing stage-navigation save succeeds; an open field must also stay put.
  const hasLocalFactChanges = JSON.stringify(facts) !== JSON.stringify(reviewFacts(profile, session));
  const needsFactSave = Boolean(session && (!session.confirmed || hasPending || JSON.stringify(facts) !== JSON.stringify(profile?.facts || [])));
  const reviewing = reviewOpen;
  const availableTemplates = TEMPLATES.filter(item => isTemplateAllowed(item, entitlements)
    && (session?.mode !== 'tailor' || !session.template_id || item.id === session.template_id))
    .sort((a, b) => Number(b.id === template) - Number(a.id === template) || Number(b.tier === 'free') - Number(a.tier === 'free'));
  const fitPending = session?.preview?.fit?.status === 'pending';
  const templateCheckPending = session?.revision != null
    && (autoTemplateRevision === session.revision || scanningTemplateRevision === session.revision);
  const selectedAlternative = templateChoice?.revision === session?.revision
    ? TEMPLATES.find(item => item.id === templateChoice?.candidate.template_id) : null;
  const activePanel = reviewing ? 'facts' : session?.phase === 'clarification' ? 'conversation' : fitPending && panel === 'preview' ? 'prepare' : panel;
  const waiting = busy || initialLoading;
  const stage = !session ? 'source' : activePanel === 'prepare' || activePanel === 'preview' ? 'prepare' : 'conversation';
  // The guided host owns its progress rail; ordinary hosts share three steps.
  useEffect(() => {
    onGuidedStage?.(activePanel === 'preview' ? 'review' : 'questions');
  }, [activePanel, onGuidedStage]);
  const inlineWaiting = busy && !initialLoading && ['answers', 'next', 'confirm', 'sync', 'preview-review', 'preview-template', 'answer-help'].includes(pendingOperation);
  // Clarifications have their own bounded queue; discovery answers must not
  // make the first clarification appear as question nine of a new interview.
  const clarified = session?.answers.filter((item) => item.question?.clarification).length || 0;
  const clarificationTotal = clarified + (session?.question ? 1 : 0) + (session?.pending_clarifications?.length || 0);
  const clarificationQuestion = session?.question?.clarification ? session.question : null;
  const discoveryAnswers = session?.answers.filter((item) => !item.question?.clarification).length || 0;
  const hasAnswerDraft = Boolean(answer.trim());
  // Resumed sessions and failed automatic requests expose an explicit next step.
  // Hide those choices while the save → next chain is already advancing the flow.
  const canAskNext = !session?.question && !session?.discovery_complete && !session?.discovery_round_complete
    && session?.phase !== 'clarification' && session?.answers.length < session?.question_limit;
  const canExtend = !session?.discovery_complete && session?.question_limit < 50
    && (session?.phase === 'review' || session?.phase === 'preview');
  // Guided (tailoring) conversations start exactly like an ordinary interview:
  // the very first question is requested as soon as the confirmed source is
  // ready, with no separate manual click. Later questions keep the explicit
  // "next question" action shared with the ordinary flow. A layout effect
  // (not a plain effect) sets `busy` before paint so the idle "begin
  // conversation" choice never flashes on screen first.
  useLayoutEffect(() => {
    if (!guided || waiting || !session || discoveryAnswers > 0 || !canAskNext) return;
    if (autoAdvancedSession.current === session.id) return;
    autoAdvancedSession.current = session.id;
    run(async () => {
      try { if (needsFactSave) await operation('confirm', { facts }); if (alive.current) await operation('next'); }
      catch (err) { autoAdvancedSession.current = null; throw err; }
    }, 'next');
    // `run`/`operation` close over refs and are recreated every render; the
    // guard above (keyed by session id) is what actually prevents re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided, waiting, session, discoveryAnswers, canAskNext, needsFactSave, facts]);
  const languageControl = <label>{uiText(initialSource ? 'interview:interviewFlow.newCvLanguage' : 'common:documentLanguage')}<select value={language} onChange={event => setLanguage(event.target.value)}>{Object.entries(languageLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>;
  return <section className={`${classes.flow} ${classes.interview}`} aria-label={uiText("interview:interviewFlow.careerInterview")}>
    {!guided && <InterviewStages active={stage} />}
    <header className={classes.taskHeader}><h2 ref={heading} tabIndex={-1} className={classes.taskTitle}>{!session && !initialSource ? uiText('interview:simple.chooseCv') : activePanel === 'prepare' ? uiText("interview:interviewFlow.prepareYourVersionOfTheCv") : reviewing ? uiText('interview:simple.content') : session?.phase === 'clarification' ? uiText("interview:interviewFlow.letSClarifyTheDetails") : session?.phase === 'preview' ? uiText("interview:interviewFlow.yourNewCvVersion") : mode === 'tailor' || session?.mode === 'tailor' ? uiText("interview:interviewFlow.jobSpecificInterview") : uiText("interview:interviewFlow.conversationTitle")}</h2><div className={classes.utility}>{session && !legacy && <button type="button" disabled={waiting || factEditing} aria-expanded={reviewing} onClick={() => goTo(reviewing ? (session.preview ? 'preview' : 'conversation') : 'facts')}>{uiText('interview:simple.content')}</button>}{!guided && <Link aria-disabled={waiting} onClick={(event) => { if (waiting) event.preventDefault(); }} className={classes.link} to="/app/conversations">{uiText("interview:simple.history")}</Link>}<Link className={classes.link} to="/help#wywiad" target="_blank" rel="noopener noreferrer" aria-label={uiText("interview:interviewFlow.interviewHelpNewTab")}>{uiText("ai:task.help")}</Link>{onClose && <button type="button" disabled={waiting} onClick={onClose}>{uiText("interview:interviewFlow.backToAssistant")}</button>}</div></header>
    {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} type="button" onClick={() => run(load)}>{uiText("interview:interviewFlow.loadSavedState")}</button></div>}
    <p role="status" aria-live="polite">{!waiting ? notice : ''}</p>
    {session && <InterviewCredits showBalance={!onClose} sessionId={session.id} revision={session.revision} busy={waiting} entitlements={entitlements} balanceLoading={balanceLoading} balanceError={balanceError} onRefreshBalance={() => { refresh(); onCreditsChanged?.(); }} />}
    {/* Keep answer saves inline; an empty stage gets an explanatory wait surface. */}
    {waiting && <InterviewLoading compact={inlineWaiting && Boolean(session?.question)} operation={initialLoading ? 'load' : pendingOperation} facts={session || !isolated ? profile?.facts.length : undefined} answers={session?.answers.length} language={languageLabels[session?.language || language]} template={TEMPLATES.find((item) => item.id === template)?.name} />}
    <div key={stage} className={classes.stageBody} data-stage={stage} hidden={waiting && !inlineWaiting} aria-busy={waiting}>
    {!canAi && entitlements && <p>{uiText("interview:interviewFlow.aiInterviewsRequireProYouCanStill")} <Link to="/app/account">{uiText("interview:interviewFlow.accountAndPlan")}</Link></p>}
    {sourceChanged && <p className={classes.error} role="status">{uiText(editorSourceChanged ? "interview:interviewFlow.theCvInTheEditorHasChanged" : "interview:interviewFlow.savedSourceChanged")}</p>}
    {session && !legacy && (sourceChanged || (reviewing && session.source_document_id)) && <button disabled={busy || factEditing || hasLocalFactChanges || session.phase === 'completed' || Boolean(answer.trim())} type="button" onClick={() => run(async () => { const next = await operation('source', currentSource || {}); onSourceRefreshed?.(); if (alive.current && next) await operation('confirm', { facts: reviewFacts(interviewEvidence(profile, next), next) }); })}>{uiText("interview:interviewFlow.loadCurrentCvIntoTheInterview")}</button>}
    {session && !legacy && reviewing && <div className={classes.actions}>
      {onClose ? <button type="button" disabled={busy || factEditing || hasLocalFactChanges} onClick={onClose}>{uiText("interview:interviewFlow.returnToSourceEditor")}</button>
        : session.source_document_id ? <Link className={classes.link} to={`/app/documents/${session.source_document_id}`} target="_blank" rel="noopener noreferrer">{uiText("interview:interviewFlow.editSourceInNewTab")}</Link>
          : session.source_import_id ? <Link className={classes.link} to="/app/import" target="_blank" rel="noopener noreferrer">{uiText("interview:interviewFlow.openSourceImport")}</Link> : null}
      {hasLocalFactChanges && <p className={classes.hint}>{uiText("interview:interviewFlow.saveNotesBeforeSourceRefresh")}</p>}
    </div>}
    {!session && profile && <fieldset disabled={busy} aria-label={uiText('interview:simple.chooseCv')}>
      {(sourceReady || documents.length > 0 || imports.length > 0) && <>
        {initialSource ? <><details className={classes.optionalNotes}><summary>{uiText('interview:interviewFlow.languageSetting', { language: languageLabels[language] })}</summary>{languageControl}</details><button type="button" className={classes.primary} disabled={!canAi} onClick={() => start()}>{uiText('interview:interviewFlow.startInterview')}</button></> :
          <InterviewSourcePicker documents={documents} imports={imports} disabled={!canAi || busy} onSelect={start} languageControl={languageControl} />}
      </>}
      {!sourceReady && (initialSource || (!documents.length && !imports.length)) && <InterviewSourceRequired onReturn={onClose} />}
    </fieldset>}
    {legacy && <div className={classes.progress}>
      <h3>{uiText("interview:interviewFlow.chooseASourceInANewInterview")}</h3>
      <p>{uiText("interview:interviewFlow.thisInterviewWasCreatedBeforeSourcesWere")}</p>
      <Link className={classes.link} to="/app/interview">{uiText("interview:interviewFlow.startANewInterview")}</Link>
      <details><summary>{uiText("interview:interviewFlow.savedAnswers")}{session.answers.length})</summary>{session.answers.map((item, index) => <p key={index}><strong>{item.question.text}</strong><br />{item.answer || item.status}</p>)}</details>
    </div>}
    {session && !legacy && <>
      {session.phase === 'clarification' && !reviewing && <p className={classes.step}>{session.question ? uiText('interview:interviewFlow.clarificationOf', { value0: clarified + 1, value1: clarificationTotal }) : uiText('interview:interviewFlow.clarificationsRemaining', { count: session.pending_clarifications?.length || 0 })}</p>}
      {session.generation_feedback?.length > 0 && !session.preview && <InterviewReviewNotice legacy />}
      {activePanel === 'conversation' && <InterviewRequirements requirements={session.requirements} question={clarificationQuestion ? null : session.question} />}
      {reviewing ? <div id="interview-content"><FactEditor compact isolated facts={facts} onChange={setFacts} disabled={busy} onEditingChange={setFactEditing} /><div className={classes.actions}><button className={classes.primary} disabled={busy || factEditing || facts.some(f => !f.text.trim())} onClick={() => goTo(session.preview ? 'preview' : 'conversation')}>{uiText('interview:simple.returnToConversation')}</button></div></div> : <>
        {activePanel === 'conversation' && <>
        {session.phase === 'clarification' && !session.question && <div className={classes.progress}>
          <p>{uiText("interview:interviewFlow.letSCheckTheDetailsInThe")}</p>
          <p>{uiText("interview:interviewFlow.thisShortRoundIncludesUpTo")} {Math.min(5, session.pending_clarifications?.length || 0)} {uiText("interview:interviewFlow.questionsStartingItAndSavingAnswersUse")}</p><button className={classes.primary} disabled={busy || sourceChanged} onClick={() => run(() => operation('clarify'))}>{uiText("interview:interviewFlow.clarifyUpToQuestions")}</button>
          <button disabled={busy || sourceChanged} onClick={() => run(() => operation('skip-clarifications'))}>{hasPending ? uiText("interview:interviewFlow.finishClarificationAndReviewAnswers") : uiText("interview:interviewFlow.skipClarificationAndShowCv")}</button>
        </div>}
        {clarificationQuestion && <div className={`${classes.question} ${classes.clarificationQuestion}`}>
          <header>
            <p className={classes.decisionLabel}>{uiText("interview:interviewFlow.cvContentDecision")}</p>
            <h3>{uiText("interview:interviewFlow.doesTheProposedDescriptionFullyMatchYour")}</h3>
            <p className={classes.hint}>{uiText("interview:interviewFlow.compareTheAiSConcernWithThe")}</p>
          </header>
          <div className={classes.clarificationPrompt}>
            <span>{uiText("interview:interviewFlow.whatNeedsChecking")}</span>
            <p>{clarificationQuestion.text}</p>
          </div>
          <figure className={classes.proposal}>
            <figcaption>{clarificationQuestion.record_label || uiText("interview:interviewFlow.suggestionToReview")}<span>{uiText("interview:interviewFlow.fullDescriptionProposedByAiNotYet")}</span></figcaption>
            <blockquote>{clarificationQuestion.suggested_text}</blockquote>
          </figure>
          <div>
            <p id={`confirm-proposal-help-${clarificationQuestion.id}`} className={classes.hint}>{uiText("interview:interviewFlow.chooseThisOnlyIfBothTheDescription")}</p>
            <div className={classes.actions}>
              <button className={!correctingProposal ? classes.primary : undefined} disabled={busy || hasAnswerDraft} aria-describedby={`confirm-proposal-help-${clarificationQuestion.id}`} onClick={() => saveAnswer('answered', clarificationQuestion.suggested_text)}>{uiText("interview:interviewFlow.yesConfirmThisDescription")}</button>
              <button ref={correctionTrigger} type="button" disabled={busy} aria-expanded={correctingProposal} aria-controls={`correction-${clarificationQuestion.id}`} onClick={() => {
                setCorrectingProposal(value => !value);
                if (!correctingProposal) requestAnimationFrame(() => answerField.current?.focus());
              }}>{uiText('interview:interviewFlow.correctDescription')}</button>
            </div>
            {hasAnswerDraft && !correctingProposal && <p role="status" className={classes.hint}>{uiText('interview:interviewFlow.correctionDraftRetained')}</p>}
            <div id={`correction-${clarificationQuestion.id}`} hidden={!correctingProposal} onKeyDown={event => {
              // Closing the optional editor retains its draft and keeps all
              // confirmation guards active until that draft is saved or cleared.
              if (event.key === 'Escape' && !busy) {
                event.stopPropagation(); setCorrectingProposal(false); correctionTrigger.current?.focus();
              }
            }}>
              <p id={`correction-help-${clarificationQuestion.id}`} className={classes.hint}>{uiText("interview:interviewFlow.enterTheCompleteReplacementDescriptionNotJust")}</p>
              <label htmlFor={`correction-text-${clarificationQuestion.id}`}>{uiText("interview:interviewFlow.fullCorrectedDescription")}</label>
              <textarea id={`correction-text-${clarificationQuestion.id}`} ref={answerField} rows={5} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} aria-describedby={`correction-help-${clarificationQuestion.id}`} placeholder={uiText("interview:interviewFlow.enterTheEntireDescriptionYouWantIn")} />
              <button className={classes.primary} disabled={busy || !hasAnswerDraft} onClick={() => saveAnswer('answered')}>{uiText("interview:interviewFlow.saveFullCorrectedDescription")}</button>
            </div>
          </div>
          <details className={classes.alternativeAnswers}>
            <summary>{uiText("interview:interviewFlow.ifNeitherAnswerFits")}</summary>
            <p>{uiText("interview:interviewFlow.noExperienceRecordsThatFactExplicitlyI")}</p>
            {hasAnswerDraft && <p role="status">{uiText("interview:interviewFlow.removeYourCorrectedDescriptionToChooseOne")}</p>}
            <div className={classes.actions}>
              <button disabled={busy || hasAnswerDraft} onClick={() => saveAnswer('no_experience')}>{uiText("interview:interviewFlow.iDidNotHaveThisExperience")}</button>
              <button disabled={busy || hasAnswerDraft} onClick={() => saveAnswer('unknown')}>{uiText("interview:interviewFlow.iCannotRememberICannotConfirm")}</button>
              <button disabled={busy || sourceChanged || hasAnswerDraft} onClick={() => run(() => operation('skip-clarifications'))}>{uiText("interview:interviewFlow.finishClarificationWithoutSavingTheSuggestion")}</button>
            </div>
          </details>
        </div>}
        {session.question && !clarificationQuestion && <div key={session.question.id} className={`${classes.question} ${classes.stageBody} ${classes.conversationQuestion}`}><div className={classes.questionContext}><InterviewRequirements requirements={session.requirements} question={session.question} focused /><InterviewQuestionContext question={session.question} facts={profile?.facts} /></div><div className={classes.answerForm}>{session.mode === 'tailor' && session.question.entry_id?.startsWith('requirement:') && <p className={classes.hint}>{uiText('ai:jobMatch.questionProgress', { number: 1 + session.answers.filter((item) => item.question.entry_id === session.question.entry_id).length })}</p>}<h3>{session.question.text}</h3>{session.question.reason && <p className={classes.hint}>{session.question.reason}</p>}
          <p className={classes.hint} id={`answer-help-${session.question.id}`}>{uiText("interview:interviewFlow.answerInYourOwnWordsWhenPreparing")}</p>
          {session.question.follow_up_to && <p className={classes.hint}>{uiText("interview:interviewFlow.aFollowUpToAnEarlierAnswer")}</p>}
          <label>{uiText("interview:factEditor.yourAnswer")}<textarea ref={answerField} rows={4} maxLength={4000} value={answer} onChange={(event) => changeAnswer(event.target.value)} disabled={busy} aria-describedby={`answer-help-${session.question.id}${assistedAnswer?.questionId === session.question.id ? ` answer-confirm-${session.question.id}` : ''}`} /></label>
          {assistedAnswer?.questionId === session.question.id && <p className={classes.hint} id={`answer-confirm-${session.question.id}`}>{uiText('interview:answerHelp.confirmHint')}</p>}
          <div className={classes.actions}><button className={classes.primary} disabled={busy || !answer.trim()} onClick={() => saveAnswer('answered')}>{uiText(assistedAnswer?.questionId === session.question.id ? 'interview:answerHelp.confirmSave' : 'interview:simple.send')}</button><button type="button" disabled={busy || sourceChanged} onClick={() => saveAnswer(hasAnswerDraft ? 'answered' : 'skipped', answer, true)}>{uiText(hasAnswerDraft ? assistedAnswer ? 'interview:simple.confirmAndFinish' : 'interview:simple.answerAndFinish' : 'interview:simple.finish')}</button></div>
          <InterviewAnswerHelp key={`${session.id}-${session.question.id}`} session={session} answer={answer}
            disabled={busy || factEditing || sourceChanged || hasLocalFactChanges} canAi={canAi}
            usedSuggestionId={assistedAnswer?.questionId === session.question.id ? assistedAnswer.suggestionId : null}
            onGenerate={generateAnswerHelp} onUse={useAnswerHelp} />
          <details><summary>{uiText('ai:task.otherAnswers')}</summary><div className={classes.actions}>
            <button disabled={busy} onClick={() => saveAnswer('no_experience', '')}>{uiText("interview:interviewFlow.iDoNotHaveThatExperience")}</button>
            <button disabled={busy} onClick={() => saveAnswer('unknown', '')}>{uiText("interview:interviewFlow.iCannotRemember")}</button>
            <button disabled={busy} onClick={() => saveAnswer('skipped', '')}>{uiText("ai:aiAssistant.skip")}</button>
          </div></details></div></div>}
        {!waiting && hasPending && session.phase !== 'completed' && !session.question && session.phase !== 'clarification' && <div className={classes.actions}>
          <button disabled={busy || Boolean(assistedAnswer && assistedAnswer.questionId === session.question?.id)} onClick={() => setReviewOpen(true)}>{uiText("interview:interviewFlow.reviewInformation")}{hasPending ? uiText("interview:interviewFlow.toSave", { value0: (session.proposed_facts.length) }) : ''}</button>
        </div>}
        {!waiting && !session.question && session.phase !== 'clarification' && session.phase !== 'completed' && <div className={classes.nextStep}>
          <div>
            <h3>{uiText(canAskNext ? (discoveryAnswers ? 'interview:interviewFlow.continueConversation' : 'interview:interviewFlow.beginConversation') : 'interview:interviewFlow.readyToPrepareYourCv')}</h3>
            <p>{canAskNext ? uiText('interview:interviewFlow.nextQuestionHint') : hasPending ? uiText("interview:interviewFlow.continuingWillSaveNewOrChangedInformation") : session.discovery_complete ? uiText(session.discovery_exhausted ? "interview:interviewFlow.answerLimitReached" : "interview:interviewFlow.weHaveCoveredTheAvailableEntriesYou") : uiText("interview:interviewFlow.youCanContinueOrAnswerMoreQuestions")}</p>
          </div>
          <div className={classes.actions}>
            {canAskNext && <button className={classes.primary} disabled={busy || !canAi || sourceChanged} onClick={() => run(async () => { if (needsFactSave) await operation('confirm', { facts }); if (alive.current) await operation('next'); }, 'next')}>{uiText("interview:interviewFlow.nextQuestion")}</button>}
            <button className={!canAskNext ? classes.primary : undefined} disabled={busy || factEditing} type="button" onClick={prepareCv}>{uiText('interview:simple.prepare')}</button>
          </div>
          {!canAskNext && canExtend && <details className={classes.moreQuestions}><summary>{uiText('interview:interviewFlow.moreQuestions')}</summary>
            <p className={classes.hint}>{uiText('interview:interviewFlow.moreQuestionsHint')}</p>
            <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('extend'))}>{uiText("interview:interviewFlow.exploreFurtherUpToQuestions")}</button>
          </details>}
        </div>}
        </>}
        {activePanel === 'prepare' && session.phase !== 'completed' && session.phase !== 'clarification' && <fieldset disabled={busy} className={classes.preparation} aria-label={uiText('interview:simple.templateStep')}>
          <p className={classes.hint}>{uiText('interview:simple.templateHint')}</p>
          {hasPending && <p>{uiText('interview:interviewFlow.confirmOrRemoveNewInformationBeforeGenerating')}</p>}
          <ul className={classes.templateGrid}>
            {(allTemplates ? availableTemplates : availableTemplates.slice(0, 6)).map(item => <li key={item.id}>
              <button type="button" disabled={!canAi || hasPending || sourceChanged || factEditing} onClick={() => createWithTemplate(item)} aria-label={uiText('interview:simple.createTemplate', { name: item.name })}>
                <img src={templatePreviewPath(item.id)} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
                <span>{item.name}<span aria-hidden="true">↗</span></span>
              </button>
            </li>)}
          </ul>
          <div className={classes.actions}>
          {availableTemplates.length > 6 && <button type="button" aria-expanded={allTemplates} onClick={() => setAllTemplates(value => !value)}>{uiText(allTemplates ? 'interview:simple.fewerTemplates' : 'interview:simple.moreTemplates')}</button>}
          <button type="button" disabled={busy || factEditing} onClick={() => goTo('conversation')}>{uiText('interview:interviewFlow.backToInterview')}</button>
          {fitPending && <button type="button" disabled={busy || sourceChanged} onClick={() => createWithTemplate({ id: template })}>{uiText('interview:fit.resume')}</button>}
          {fitPending && <button type="button" disabled={busy || sourceChanged} onClick={() => run(() => operation('preview-fit', { action: 'restore' }))}>{uiText('interview:fit.restore')}</button>}
          </div>
        </fieldset>}
        {activePanel === 'preview' && session.preview && session.phase !== 'clarification' && <>
          {session.preview.fit && <div className={classes.hint}>
            <p role="status">{uiText(session.preview.fit.status === 'restored' ? 'interview:fit.restored' : session.preview.pages < session.preview.fit.original_pages ? 'interview:fit.reduced' : 'interview:fit.balanced', { count: session.preview.pages })}</p>
            {session.preview.fit.can_restore && session.phase !== 'completed' && <button type="button" disabled={busy || factEditing || sourceChanged} onClick={() => run(() => operation('preview-fit', { action: 'restore' }))}>{uiText('interview:fit.restore')}</button>}
          </div>}
          {session.preview.pages > 1 && session.phase === 'preview' && <InterviewTemplateOptions
            key={`templates-${session.id}-${session.revision}`} session={session} entitlements={entitlements}
            disabled={busy || factEditing || sourceChanged || hasPending || session.preview.profile_revision !== profile.revision}
            autoCheck={autoTemplateRevision === session.revision} onAutoStart={() => setAutoTemplateRevision(null)}
            onCheckingChange={handleTemplateChecking}
            onChoiceChange={handleTemplateChoice}
            onSelect={candidate => run(() => operation('preview-template', {
              template_id: candidate.template_id, elements: candidate.elements, spacing_px: candidate.spacing_px,
            }), 'preview-template')} />}
          <InterviewPreview key={`preview-${session.id}-${session.revision}`} preview={session.preview} source={session.source_cv_data} facts={profile.facts}
            disabled={busy || sourceChanged} onEditingChange={setFactEditing}
            onReview={session.phase === 'completed' ? undefined : (path, value) => run(async () => {
              await operation('preview-review', { path, value });
              if (alive.current) { setPanel('preview'); setNotice(messageRef('interview:interviewPreview.reviewSaved')); heading.current?.focus(); }
            }, 'preview-review')} />
          <div className={classes.resultActions}><p>{uiText("interview:interviewFlow.saveASeparateDocumentTheSourceCv")}</p>
          {templateCheckPending && <p id={`template-check-${session.id}`} role="status">{uiText('interview:templates.waitBeforeSave')}</p>}
          {selectedAlternative && <p id={`template-choice-${session.id}`} role="status">{uiText('interview:templates.selectedForSave', { name: selectedAlternative.name })}</p>}
          <div className={classes.actions}>
            <button className={classes.primary} aria-describedby={[
              templateCheckPending && `template-check-${session.id}`, selectedAlternative && `template-choice-${session.id}`,
            ].filter(Boolean).join(' ') || undefined} disabled={busy || factEditing || hasPending || sourceChanged || templateCheckPending || session.preview.profile_revision !== profile.revision || session.phase === 'completed'} onClick={() => run(saveDocument, 'document')}>{uiText(guided ? 'tailoring:saveResult' : "interview:interviewFlow.saveAsANewCv")}</button>
            {session.phase !== 'completed' && <button type="button" disabled={busy || factEditing} onClick={() => goTo('prepare')}>{uiText("interview:interviewFlow.changeTemplateOrRefresh")}</button>}
          </div></div>
        </>}
        {session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>{uiText("interview:interviewFlow.openSavedCv")}</Link>}
      </>}
    </>}
    </div>
  </section>;
}
