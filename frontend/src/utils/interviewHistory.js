import { t as uiText } from '../i18n/index.js';

/** Resolve a saved identity without inventing a title from an advert excerpt. */
export function conversationTitle(session) {
  const offer = [session.offer_title, session.offer_company].filter(Boolean).join(' · ');
  return (session.mode === 'tailor' && offer) || session.document_title || session.source_title
    || [session.candidate_name, session.target_role].filter(Boolean).join(' · ')
    || uiText('public:careerProfilePage.untitledConversation');
}

/** Localise workflow labels while leaving authored document/offer text intact. */
export function conversationMode(session) {
  return uiText({ create: 'editor:topbar.creatingCv', enrich: 'public:careerProfilePage.cvEnrichment', tailor: 'public:careerProfilePage.jobTailoring' }[session.mode] || 'public:careerProfilePage.savedInterviews');
}

/** Treat old timezone-less API dates as UTC, matching database storage. */
export function conversationDate(value) {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
