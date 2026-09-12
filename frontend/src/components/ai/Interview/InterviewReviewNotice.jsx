import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { factLabel } from '../../../utils/interviewPresentation';
import classes from './Interview.module.css';

/** Explain filtered suggestions without exposing provider diagnostics or claims. */
export default function InterviewReviewNotice({ preview, legacy = false }) {
  useTranslation();
  const notes = preview?.review_notes || [];
  // Summarize repeated scalar corrections by section and outcome, retaining the count.
  const grouped = new Map();
  notes.forEach((note) => {
    const label = factLabel({ path: note.path });
    const key = `${label}:${note.action}`;
    const previous = grouped.get(key);
    grouped.set(key, { label, action: note.action, count: (previous?.count || 0) + 1 });
  });
  if (!legacy && !notes.length && !preview?.recovered_previous_attempt) return null;
  return <aside className={classes.reviewNotice} aria-label={uiText("interview:interviewReviewNotice.reviewAiSuggestion")}>
    {legacy ? <><h3>{uiText("interview:interviewReviewNotice.yourAnswersAreSaved")}</h3><p>{uiText("interview:interviewReviewNotice.thePreviousSuggestionNeededCorrectingPrepareYour")}</p></> : <>
      <h3>{uiText("interview:interviewReviewNotice.yourCvIsReadyToReview")}</h3>
      {notes.length > 0 && <><p>{uiText("interview:interviewReviewNotice.someDetailsWereNotConfirmedInThose")}</p>
        <details><summary>{uiText("interview:interviewReviewNotice.whatWeKeptOrOmitted")}{notes.length})</summary><ul>{[...grouped].map(([key, note]) => <li key={key}><strong>{note.label}</strong> — {note.action === 'kept_original' ? uiText("interview:interviewReviewNotice.confirmedContentRetained") : uiText("interview:interviewReviewNotice.unconfirmedAdditionOmitted")}{note.count > 1 ? ` (${note.count})` : ''}</li>)}</ul></details></>}
      {preview?.recovered_previous_attempt && <p>{uiText("interview:interviewReviewNotice.thisPreviewReusesThePreviousResultRecovery")}</p>}
    </>}
  </aside>;
}
