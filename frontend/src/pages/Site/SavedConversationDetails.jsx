import { getUiLocale, t as uiText } from '../../i18n/index.js';
import { useTranslation } from 'react-i18next';
import layout from './CareerProfilePage.module.css';
import { conversationTitle, conversationMode, conversationDate } from '../../utils/interviewHistory';

function SavedTime({ value }) {
  const date = conversationDate(value);
  return date ? <time dateTime={date.toISOString()}>{date.toLocaleString(getUiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> : <span>{uiText('public:careerProfilePage.dateUnavailable')}</span>;
}

/** Show source excerpts as labelled data, never infer a role from a pasted advert. */
export default function SavedConversationDetails({ session, titleId, compact = false }) {
  useTranslation();
  const phases = {
    intake: 'public:careerProfilePage.startingInformation', ready: 'public:careerProfilePage.readyForTheNextQuestion',
    question: 'public:careerProfilePage.waitingForAnswer', review: 'public:careerProfilePage.reviewInformation',
    clarification: 'public:careerProfilePage.clarifyingInformation', preview: 'public:careerProfilePage.cvPreview', completed: 'public:careerProfilePage.cvSaved',
    source: 'tailoring:history.source', offer: 'tailoring:history.offer', interrupted: 'tailoring:history.interrupted',
  };
  const source = [session.candidate_name, session.target_role].filter(Boolean).join(' · ');
  return <div className={layout.sessionDetails}>
    <p className={layout.sessionMode}>{conversationMode(session)} · {uiText(phases[session.phase] || 'public:careerProfilePage.savedConversation')}</p>
    <h3 id={titleId}>{conversationTitle(session)}</h3>
    {source && <p>{uiText('public:careerProfilePage.conversationCandidate', { value: source })}</p>}
    {session.source_title && session.source_title !== conversationTitle(session) && <p>{uiText('public:careerProfilePage.conversationSource', { value: session.source_title })}</p>}
    {session.mode === 'tailor' && !session.offer_title && session.offer_excerpt && <p className={layout.sessionExcerpt}><span>{uiText('public:careerProfilePage.offerExcerpt')}</span> {session.offer_excerpt}</p>}
    {session.offer_url && <p className={layout.sessionExcerpt}><span>{uiText('tailoring:history.offerUrl')}</span> {session.offer_url}</p>}
    <dl className={layout.sessionMetadata}>
      <div><dt>{uiText('public:careerProfilePage.lastActivity')}</dt><dd><SavedTime value={session.updated_at} /></dd></div>
      <div><dt>{uiText('public:careerProfilePage.conversationStarted')}</dt><dd><SavedTime value={session.created_at} /></dd></div>
      {Number.isInteger(session.answer_count) && <div><dt>{uiText('public:careerProfilePage.savedAnswers')}</dt><dd>{session.answer_count}</dd></div>}
    </dl>
    {!compact && session.last_question && <p className={layout.sessionExcerpt}><span>{uiText('public:careerProfilePage.lastQuestion')}</span> {session.last_question}</p>}
  </div>;
}
