import { useMessageState, messageRef, messageOf } from '../../../i18n/messageState.js';
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { getUiLanguage } from '../../../i18n';
/**
 * Shared interview controller for account creation and the existing assistant.
 * Server state survives unmount/logout. Answers are saved before asking again;
 * failed requests retain input and can be recovered by loading the session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { interviewRequest, reviewFacts, interviewEvidence } from '../../../services/interviews';
import { useEntitlements } from '../../../hooks/useEntitlements';
import { TEMPLATES } from '../../../templates';
import { isTemplateAllowed } from '../../../utils/entitlements';
import FactEditor from './FactEditor';
import InterviewLoading from './InterviewLoading';
import InterviewPreview from './InterviewPreview';
import TemplateCarousel from '../AiCvPanel/TemplateCarousel';
import InterviewReviewNotice from './InterviewReviewNotice';
import InterviewSourceRequired from './InterviewSourceRequired';
import classes from './Interview.module.css';

const languageLabels = { get pl() { return uiText("ai:aiAssistant.polish"); }, get en() { return uiText("ai:aiAssistant.english"); }, get de() { return uiText("ai:aiAssistant.german"); }, get fr() { return uiText("ai:aiAssistant.french"); }, get es() { return uiText("ai:aiAssistant.spanish"); }, get uk() { return uiText("ai:aiAssistant.ukrainian"); }, get it() { return uiText("ai:aiAssistant.italian"); }, get nl() { return uiText("ai:aiAssistant.dutch"); } };
const statuses = { get matched() { return uiText("interview:interviewFlow.confirmed"); }, get partial() { return uiText("interview:interviewFlow.toClarify"); }, get unknown() { return uiText("interview:interviewFlow.noInformation"); }, get gap() { return uiText("interview:interviewFlow.confirmedLackOfExperience"); } };

export default function InterviewFlow({ sessionId, initialSource = null, currentSource = null, mode = 'create', onClose, sourceChanged = false, onSourceRefreshed }) {
  useTranslation();
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
  const [error, setError] = useMessageState('');
  const [notice, setNotice] = useMessageState('');
  const [documents, setDocuments] = useState([]);
  const [imports, setImports] = useState([]);
  const [source, setSource] = useState('');
  const [includeProfile, setIncludeProfile] = useState(false);
  const [notes, setNotes] = useState(initialSource?.candidate_notes || '');
  const [language, setLanguage] = useState(() => initialSource?.language || getUiLanguage());
  const [template, setTemplate] = useState(initialSource?.template_id || '');
  const [factEditing, setFactEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const createKey = useRef(crypto.randomUUID());
  const sourceNotes = useRef({});
  const heading = useRef(null);
  const sessionRef = useRef(null);
  const canAi = entitlements?.ai_assistant === true;

  const adopt = useCallback((next, currentProfile) => {
    currentProfile = interviewEvidence(currentProfile, next);
    sessionRef.current = next;
    setSession(next); setProfile(currentProfile); setFacts(reviewFacts(currentProfile, next));
    setTemplate(next?.template_id || '');
    setPanel(next?.phase === 'preview' || next?.phase === 'completed' ? 'preview' : 'conversation');
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
    return () => { alive.current = false; };
  }, [sessionId, initialSource, load]);

  // Return focus to the active task after a request; hidden forms keep their drafts.
  useEffect(() => { if (!busy && !initialLoading) heading.current?.focus(); }, [session?.phase, session?.question?.id, reviewOpen, panel, busy, initialLoading]);

  async function run(work, operationName = 'load') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setPendingOperation(operationName); setError(''); setNotice('');
    try { await work(); }
    catch (err) { if (alive.current) setError(messageOf(err)); }
    finally { lock.current = false; if (alive.current) { setBusy(false); refresh(); } }
  }

  function versions() { return { revision: session.revision, profile_revision: profile.revision, evidence_scope: session.evidence_scope }; }

  async function operation(action, extra = {}) {
    setPendingOperation(action);
    const result = await interviewRequest(`/ai/interviews/${session.id}/${action}`, 'POST', { ...versions(), ...extra });
    if (!alive.current) return;
    if (result.document_id && action === 'document') { navigate(`/app/documents/${result.document_id}`); return; }
    if (!result.profile) setPendingOperation('sync');
    const next = result.session || result;
    const currentProfile = result.profile || (next.evidence_scope !== 'profile' ? interviewEvidence(null, next) : await interviewRequest('/career-profile'));
    if (alive.current) adopt(result.session || result, currentProfile);
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

  const start = () => run(async () => {
    if (!sourceReady) return;
    const [kind, id] = source.split(':');
    const body = { mode, ...(initialSource || {}), language, include_profile: includeProfile,
      ...(!initialSource ? { cv_data: {}, candidate_notes: notes,
        ...(kind === 'document' ? { source_document_id: Number(id), cv_data: {} } : {}),
        ...(kind === 'import' ? { source_import_id: Number(id), cv_data: {} } : {}),
      } : { candidate_notes: notes }),
    };
    const result = await interviewRequest('/ai/interviews', 'POST', body, createKey.current);
    if (alive.current) { adopt(result, result.evidence_scope === 'profile' ? await interviewRequest('/career-profile') : interviewEvidence(null, result)); setReviewOpen(true); }
  }, 'start');

  const saveAnswer = (status, text = answer) => run(async () => {
    await operation('answers', { question_id: session.question.id, answer: text, status });
    if (alive.current) {
      const destination = session.evidence_scope === 'session' ? uiText("interview:interviewFlow.inThisInterview") : uiText("interview:interviewFlow.inYourCareerProfile");
      const message = status === 'answered' ? uiText("interview:interviewFlow.answerSaved", { value0: (destination) })
        : status === 'no_experience' ? uiText("interview:interviewFlow.lackOfExperienceSaved", { value0: (destination) })
          : status === 'unknown' ? uiText("interview:interviewFlow.savedICannotRemember") : uiText("interview:interviewFlow.questionSkipped");
      setAnswer(''); setNotice(message);
    }
  });

  const legacy = Boolean(session && (session.requires_source_choice || !session.evidence_scope));
  const isolated = session ? session.evidence_scope === 'session' : !includeProfile;
  // Account facts only supplement an explicit CV/import. They never unlock an
  // empty editor snapshot; the same source predicate is enforced by the server.
  const sourceReady = initialSource
    ? Boolean(initialSource.cv_data?.name?.trim())
    : Boolean(source);
  const hasPending = Boolean(session?.proposed_facts?.length);
  const needsFactSave = Boolean(session && (!session.confirmed || hasPending || JSON.stringify(facts) !== JSON.stringify(profile?.facts || [])));
  const reviewDestination = session?.question || !session?.answers.length ? 'conversation' : 'prepare';
  const reviewing = session?.phase === 'intake' || reviewOpen;
  const activePanel = reviewing ? 'facts' : session?.phase === 'clarification' ? 'conversation' : panel;
  const waiting = busy || initialLoading;
  // Clarifications have their own bounded queue; discovery answers must not
  // make the first clarification appear as question nine of a new interview.
  const clarified = session?.answers.filter((item) => item.question?.clarification).length || 0;
  const clarificationTotal = clarified + (session?.question ? 1 : 0) + (session?.pending_clarifications?.length || 0);
  const clarificationQuestion = session?.question?.clarification ? session.question : null;
  const hasAnswerDraft = Boolean(answer.trim());
  return <section className={`${classes.flow} ${classes.interview}`} aria-label={uiText("interview:interviewFlow.careerInterview")}>
    <div className={classes.utility}><Link aria-disabled={waiting} onClick={(event) => { if (waiting) event.preventDefault(); }} className={classes.link} to="/app/career-profile">{uiText("interview:interviewFlow.profileAndSavedInterviews")}</Link><Link className={classes.link} to="/help#wywiad" target="_blank" rel="noopener noreferrer">{uiText("interview:interviewFlow.interviewHelpNewTab")}</Link>{onClose && <button type="button" disabled={waiting} onClick={onClose}>{uiText("interview:interviewFlow.backToAssistant")}</button>}</div>
    <h2 ref={heading} tabIndex={-1} className={classes.taskTitle}>{activePanel === 'prepare' ? uiText("interview:interviewFlow.prepareYourVersionOfTheCv") : reviewing ? uiText("interview:interviewFlow.reviewYourCvInformation") : session?.phase === 'clarification' ? uiText("interview:interviewFlow.letSClarifyTheDetails") : session?.phase === 'preview' ? uiText("interview:interviewFlow.yourNewCvVersion") : mode === 'tailor' || session?.mode === 'tailor' ? uiText("interview:interviewFlow.jobSpecificInterview") : uiText("interview:interviewFlow.careerInterview")}</h2>
    {error && <div className={classes.error} role="alert"><p>{error}</p><button disabled={busy} type="button" onClick={() => run(load)}>{uiText("interview:interviewFlow.loadSavedState")}</button></div>}
    <p role="status" aria-live="polite">{!waiting ? notice : ''}</p>
    {waiting && <InterviewLoading operation={initialLoading ? 'load' : pendingOperation} facts={session || !isolated ? profile?.facts.length : undefined} answers={session?.answers.length} language={languageLabels[session?.language || language]} template={TEMPLATES.find((item) => item.id === template)?.name} />}
    <div hidden={waiting} aria-busy={waiting}>
    {session && !legacy && <nav className={classes.stages} aria-label={uiText("interview:interviewFlow.interviewStages")}>{[['facts', uiText("interview:interviewFlow.yourInformation")], ['conversation', uiText('interview:interviewFlow.conversationStage')], ['prepare', uiText("interview:interviewFlow.prepareCv")], ['preview', uiText('interview:interviewFlow.resultStage')]].map(([key, label], index) => <button type="button" key={key} aria-current={activePanel === key ? 'step' : undefined} disabled={busy || factEditing || (Boolean(session.question) && key !== 'conversation') || (session.phase === 'clarification' && key !== 'conversation') || (key === 'preview' && (!session.preview || needsFactSave)) || (session.phase === 'completed' && key !== 'preview')} onClick={() => goTo(key)}><span>{String(index + 1).padStart(2, '0')}</span>{' '}{label}</button>)}</nav>}
    {!canAi && entitlements && <p>{uiText("interview:interviewFlow.aiInterviewsRequireProYouCanStill")} <Link to="/app/account">{uiText("interview:interviewFlow.accountAndPlan")}</Link></p>}
    {sourceChanged && <p className={classes.error}>{uiText("interview:interviewFlow.theCvInTheEditorHasChanged")}</p>}
    {session && !legacy && (sourceChanged || session.source_document_id) && <button disabled={busy || session.phase === 'completed' || Boolean(answer.trim())} type="button" onClick={() => run(async () => { await operation('source', currentSource || {}); onSourceRefreshed?.(); setReviewOpen(true); })}>{uiText("interview:interviewFlow.loadCurrentCvIntoTheInterview")}</button>}
    {!profile && !error && <p>{uiText("interview:interviewFlow.loadingCareerProfile")}</p>}
    {!session && profile && <fieldset disabled={busy}>
      {(sourceReady || documents.length > 0 || imports.length > 0) && <>
      <legend>{mode === 'tailor' ? uiText("interview:interviewFlow.addExperienceRelevantToThisJob") : uiText("interview:interviewFlow.whereShallWeStart")}</legend>
      <p id="interview-source-help">{uiText("interview:interviewFlow.chooseWhetherToUseYourProfileOr")}</p>
      {!initialSource && <><label>{uiText("interview:interviewFlow.informationSource")}<select value={source} onChange={(e) => {
          const selected = e.target.value;
          sourceNotes.current[source] = notes;
          setNotes(sourceNotes.current[selected] || '');
          setSource(selected); setIncludeProfile(false);
        }} aria-describedby="interview-source-help"><option value="">{uiText("interview:interviewFlow.chooseExistingSource")}</option><optgroup label={uiText("interview:interviewFlow.myCv")}>{documents.map((doc) => <option key={doc.id} value={`document:${doc.id}`}>{doc.title}</option>)}</optgroup><optgroup label={uiText("interview:interviewFlow.imports")}>{imports.map((item) => <option key={item.id} value={`import:${item.id}`}>{item.filename || uiText('editor:topbar.importPdf')}</option>)}</optgroup></select></label>
      </>}
      </>}
      {sourceReady && <label className={classes.scopeChoice}><input type="checkbox" checked={includeProfile} onChange={(event) => setIncludeProfile(event.target.checked)} />{uiText("interview:interviewFlow.thisIsMyCvIncludeMyCareer")}</label>}
      {!sourceReady && (initialSource || (!documents.length && !imports.length)) && <InterviewSourceRequired onReturn={onClose} />}
      {sourceReady && <>
      <p className={classes.hint}>{isolated ? uiText("interview:interviewFlow.onlyTheSelectedCvAndInformationFrom") : uiText("interview:interviewFlow.weWillUseYourAccountProfileInformation")}</p>
      <label>{mode === 'tailor' ? uiText("interview:interviewFlow.additionalFactsForThisCv") : uiText("interview:interviewFlow.careerHistoryProjectsAndEducation")}<textarea rows={5} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uiText("interview:interviewFlow.describeRolesCompaniesEmploymentDatesAndAchievements")} /></label>
      <label>{uiText("interview:interviewFlow.newCvLanguage")}<select value={language} onChange={(e) => setLanguage(e.target.value)}>{Object.entries(languageLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <button className={classes.primary} disabled={!canAi} type="button" onClick={start}>{uiText("interview:interviewFlow.startInterview")}</button>
      <p className={classes.hint}>{uiText("interview:interviewFlow.answerInYourOwnWordsWhenPreparing")}</p>
      <p className={classes.hint}>{uiText("interview:interviewFlow.questionsContentGenerationEditingAndVerificationUse")}</p>
      </>}
    </fieldset>}
    {legacy && <div className={classes.progress}>
      <h3>{uiText("interview:interviewFlow.chooseASourceInANewInterview")}</h3>
      <p>{uiText("interview:interviewFlow.thisInterviewWasCreatedBeforeSourcesWere")}</p>
      <Link className={classes.link} to="/app/interview">{uiText("interview:interviewFlow.startANewInterview")}</Link>
      <details><summary>{uiText("interview:interviewFlow.savedAnswers")}{session.answers.length})</summary>{session.answers.map((item, index) => <p key={index}><strong>{item.question.text}</strong><br />{item.answer || item.status}</p>)}</details>
    </div>}
    {session && !legacy && <>
      <p className={classes.step}>{session.phase === 'clarification' ? session.question ? uiText("interview:interviewFlow.clarificationOf", { value0: (clarified + 1), value1: (clarificationTotal) }) : uiText("interview:interviewFlow.clarificationsRemaining", { count: session.pending_clarifications?.length || 0 }) : uiText("interview:interviewFlow.savedAnswers2", { value0: (session.answers.length) })} {uiText("interview:interviewFlow.cvLanguage")} {languageLabels[session.language]} · {isolated ? uiText("interview:interviewFlow.thisCvOnlyAccountProfileExcluded") : uiText("interview:interviewFlow.accountProfile")}</p>
      {session.generation_feedback?.length > 0 && !session.preview && <InterviewReviewNotice legacy />}
      {activePanel === 'conversation' && session.requirements.length > 0 && <details><summary>{uiText("ai:aiAssistant.jobRequirements")}</summary><ul className={classes.requirements}>{session.requirements.map((req, index) => <li key={index}><strong>{statuses[req.status]}</strong> — {req.text}</li>)}</ul></details>}
      {reviewing ? <><FactEditor isolated={isolated} facts={facts} onChange={setFacts} disabled={busy} onEditingChange={setFactEditing} /><p className={classes.hint}>{needsFactSave ? (isolated ? uiText("interview:interviewFlow.continuingWillSaveInformationInThisInterview") : uiText("interview:interviewFlow.continuingWillSaveInformationInYourCareer")) : uiText("interview:interviewFlow.allInformationIsSaved")}</p><div className={classes.actions}><button className={classes.primary} disabled={busy || factEditing || facts.some((f) => !f.text.trim())} onClick={() => goTo(reviewDestination)}>{reviewDestination === 'conversation' ? uiText("interview:interviewFlow.continueToInterview") : uiText("interview:interviewFlow.continueToCvPreparation")}</button>{reviewDestination !== 'conversation' && <button disabled={busy || factEditing || facts.some((f) => !f.text.trim())} onClick={() => goTo('conversation')}>{uiText("interview:interviewFlow.backToInterview")}</button>}</div></> : <>
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
          <fieldset className={classes.clarificationDecision}>
            <legend>{uiText("interview:interviewFlow.chooseOneAnswer")}</legend>
            <div className={classes.decisionOptions}>
              <section className={classes.decisionOption} aria-labelledby={`confirm-proposal-${clarificationQuestion.id}`}>
                <h4 id={`confirm-proposal-${clarificationQuestion.id}`}>{uiText("interview:interviewFlow.yesTheFullDescriptionIsCorrect")}</h4>
                <p id={`confirm-proposal-help-${clarificationQuestion.id}`}>{uiText("interview:interviewFlow.chooseThisOnlyIfBothTheDescription")}</p>
                <button className={!hasAnswerDraft ? classes.primary : undefined} disabled={busy || hasAnswerDraft} aria-describedby={`confirm-proposal-help-${clarificationQuestion.id}`} onClick={() => saveAnswer('answered', clarificationQuestion.suggested_text)}>{uiText("interview:interviewFlow.yesConfirmThisDescription")}</button>
              </section>
              <section className={classes.decisionOption} aria-labelledby={`correct-proposal-${clarificationQuestion.id}`}>
                <h4 id={`correct-proposal-${clarificationQuestion.id}`}>{uiText("interview:interviewFlow.noTheDescriptionNeedsCorrecting")}</h4>
                <p id={`correction-help-${clarificationQuestion.id}`}>{uiText("interview:interviewFlow.enterTheCompleteReplacementDescriptionNotJust")}</p>
                <label>{uiText("interview:interviewFlow.fullCorrectedDescription")}<textarea rows={5} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} aria-describedby={`correction-help-${clarificationQuestion.id}`} placeholder={uiText("interview:interviewFlow.enterTheEntireDescriptionYouWantIn")} /></label>
                <button className={hasAnswerDraft ? classes.primary : undefined} disabled={busy || !hasAnswerDraft} onClick={() => saveAnswer('answered')}>{uiText("interview:interviewFlow.saveFullCorrectedDescription")}</button>
              </section>
            </div>
          </fieldset>
          <div className={classes.alternativeAnswers}>
            <h4>{uiText("interview:interviewFlow.ifNeitherAnswerFits")}</h4>
            <p>{uiText("interview:interviewFlow.noExperienceRecordsThatFactExplicitlyI")}</p>
            {hasAnswerDraft && <p role="status">{uiText("interview:interviewFlow.removeYourCorrectedDescriptionToChooseOne")}</p>}
            <div className={classes.actions}>
              <button disabled={busy || hasAnswerDraft} onClick={() => saveAnswer('no_experience')}>{uiText("interview:interviewFlow.iDidNotHaveThisExperience")}</button>
              <button disabled={busy || hasAnswerDraft} onClick={() => saveAnswer('unknown')}>{uiText("interview:interviewFlow.iCannotRememberICannotConfirm")}</button>
              <button disabled={busy || sourceChanged || hasAnswerDraft} onClick={() => run(() => operation('skip-clarifications'))}>{uiText("interview:interviewFlow.finishClarificationWithoutSavingTheSuggestion")}</button>
            </div>
          </div>
        </div>}
        {session.question && !clarificationQuestion && <div className={classes.question}><h3>{session.question.text}</h3><p className={classes.hint}>{session.question.reason}</p>
          <p className={classes.hint} id={`answer-help-${session.question.id}`}>{uiText("interview:interviewFlow.answerInYourOwnWordsWhenPreparing")}</p>
          {session.question.follow_up_to && <p className={classes.hint}>{uiText("interview:interviewFlow.aFollowUpToAnEarlierAnswer")}</p>}
          <label>{uiText("interview:factEditor.yourAnswer")}<textarea rows={5} maxLength={4000} value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={busy} aria-describedby={`answer-help-${session.question.id}`} /></label><div className={classes.actions}><button className={classes.primary} disabled={busy || !answer.trim()} onClick={() => saveAnswer('answered')}>{uiText("interview:interviewFlow.saveAnswer")}</button><button disabled={busy} onClick={() => saveAnswer('no_experience')}>{uiText("interview:interviewFlow.iDoNotHaveThatExperience")}</button><button disabled={busy} onClick={() => saveAnswer('unknown')}>{uiText("interview:interviewFlow.iCannotRemember")}</button><button disabled={busy} onClick={() => saveAnswer('skipped')}>{uiText("ai:aiAssistant.skip")}</button></div></div>}
        {session.phase !== 'completed' && <div className={classes.actions}>
          {!session.question && !session.discovery_complete && session.phase !== 'clarification' && session.answers.length < session.question_limit && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('next'))}>{uiText("interview:interviewFlow.nextQuestion")}</button>}
          <button disabled={busy} onClick={() => setReviewOpen(true)}>{uiText("interview:interviewFlow.reviewInformation")}{hasPending ? uiText("interview:interviewFlow.toSave", { value0: (session.proposed_facts.length) }) : ''}</button>
          {!session.discovery_complete && session.question_limit < 50 && (session.phase === 'review' || session.phase === 'preview') && <button disabled={busy || !canAi || sourceChanged} onClick={() => run(() => operation('extend'))}>{uiText("interview:interviewFlow.exploreFurtherUpToQuestions")}</button>}
        </div>}
        {!session.question && session.phase !== 'clarification' && session.phase !== 'completed' && <div className={classes.nextStep}><div><h3>{uiText("interview:interviewFlow.readyToPrepareYourCv")}</h3><p>{hasPending ? uiText("interview:interviewFlow.continuingWillSaveNewOrChangedInformation") : session.discovery_complete ? uiText("interview:interviewFlow.weHaveCoveredTheAvailableEntriesYou") : uiText("interview:interviewFlow.youCanContinueOrAnswerMoreQuestions")}</p></div><button className={classes.primary} type="button" onClick={() => goTo('prepare')}>{uiText("interview:interviewFlow.continueToCvPreparation")}</button></div>}
        </>}
        {activePanel === 'prepare' && session.phase !== 'completed' && session.phase !== 'clarification' && <fieldset disabled={busy} className={classes.preparation}>
          <legend>{uiText("interview:interviewFlow.prepareCv")}</legend>
          <p className={classes.hint}>{uiText("interview:interviewFlow.aiWillDraftTheContentEditIts")}</p>
          {hasPending && <p>{uiText("interview:interviewFlow.confirmOrRemoveNewInformationBeforeGenerating")}</p>}
          <label>{uiText("interview:interviewFlow.newCvTemplate")}<select value={template} onChange={(e) => setTemplate(e.target.value)} disabled={session.mode === 'tailor' && Boolean(session.template_id)}><option value="">{uiText("interview:interviewFlow.chooseATemplate")}</option>{TEMPLATES.filter((t) => isTemplateAllowed(t, entitlements)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {(session.mode !== 'tailor' || !session.template_id) && <details><summary>{uiText("interview:interviewFlow.browseTemplates")}</summary><TemplateCarousel templates={TEMPLATES} entitlements={entitlements} selectedId={template} visibleCount={1} fillingId={busy ? template : null} onSelect={(selected) => setTemplate(selected.id)} actionLabel={uiText("interview:interviewFlow.chooseATemplate")} /></details>}
          <p className={classes.hint}>{uiText("interview:interviewFlow.contentWillBeLaidOutAgainIn")}</p>
          <button className={classes.primary} disabled={!canAi || !template || hasPending || sourceChanged} onClick={() => run(() => operation('preview', { template_id: template }))}>{session.preview ? uiText("interview:interviewFlow.refreshPreview") : uiText("interview:interviewFlow.prepareCvFromConfirmedInformation")}</button>
        </fieldset>}
        {activePanel === 'preview' && session.preview && session.phase !== 'clarification' && <>
          <InterviewPreview key={`${session.id}-${session.revision}`} preview={session.preview} source={session.source_cv_data} facts={profile.facts} />
          <div className={classes.resultActions}><p>{uiText("interview:interviewFlow.saveASeparateDocumentTheSourceCv")}</p><div className={classes.actions}>
            <button className={classes.primary} disabled={busy || hasPending || sourceChanged || session.preview.profile_revision !== profile.revision || session.phase === 'completed'} onClick={() => run(() => operation('document'))}>{uiText("interview:interviewFlow.saveAsANewCv")}</button>
            {session.phase !== 'completed' && <button type="button" disabled={busy} onClick={() => setPanel('prepare')}>{uiText("interview:interviewFlow.changeTemplateOrRefresh")}</button>}
          </div></div>
        </>}
        {session.document_id && <Link className={classes.link} to={`/app/documents/${session.document_id}`}>{uiText("interview:interviewFlow.openSavedCv")}</Link>}
      </>}
    </>}
    </div>
  </section>;
}
