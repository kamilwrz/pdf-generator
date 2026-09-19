import { t as uiText } from '../../i18n/index.js';
import { useTranslation } from 'react-i18next';
import classes from './InterviewDemo.module.css';

/**
 * Illustrates content improvement, or job tailoring when `tailoring` is true.
 * Source and proposal stay visible together; a native disclosure reveals the
 * supporting conversation at the reader's pace. Localised sample content never
 * enters application state, storage, an AI request or the document/PDF tree.
 */
export default function InterviewDemo({ tailoring = false }) {
  useTranslation();
  // Keep the evidence distinct: tailoring starts from an advert requirement,
  // while content improvement starts from the candidate's existing description.
  const copy = tailoring ? {
    interviewExampleLabel: uiText('public:hero.tailorDemo.interviewExampleLabel'),
    exampleSourceLabel: uiText('public:hero.tailorDemo.exampleSourceLabel'),
    exampleSource: uiText('public:hero.tailorDemo.exampleSource'),
    exampleQuestion: uiText('public:hero.tailorDemo.exampleQuestion'),
    exampleAnswer: uiText('public:hero.tailorDemo.exampleAnswer'),
    exampleResult: uiText('public:hero.tailorDemo.exampleResult'),
    demoReviewHint: uiText('public:hero.tailorDemo.demoReviewHint'),
  } : {
    interviewExampleLabel: uiText('public:hero.interviewExampleLabel'),
    exampleSourceLabel: uiText('public:hero.exampleSourceLabel'),
    exampleSource: uiText('public:hero.exampleSource'),
    exampleQuestion: uiText('public:hero.exampleQuestion'),
    exampleAnswer: uiText('public:hero.exampleAnswer'),
    exampleResult: uiText('public:hero.exampleResult'),
    demoReviewHint: uiText('public:hero.demoReviewHint'),
  };

  return (
    <figure className={classes.demo}>
      <figcaption className={classes.caption}>
        <strong>{copy.interviewExampleLabel}</strong>
        <span>{uiText('public:hero.demoSimulation')}</span>
      </figcaption>
      <div className={classes.source}>
        <span className={classes.label}>{copy.exampleSourceLabel}</span>
        <p>{copy.exampleSource}</p>
      </div>
      <div className={classes.result}>
        <span className={classes.label}>{uiText('public:hero.demoResultLabel')}</span>
        <p>{copy.exampleResult}</p>
      </div>
      <p className={classes.context}>{copy.demoReviewHint}</p>
      <details className={classes.conversation}>
        <summary>
          {uiText('public:hero.demoConversation')}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" />
            <path className={classes.expandStroke} d="M12 5v14" stroke="currentColor" strokeWidth="2" />
          </svg>
        </summary>
        <div className={classes.dialogue}>
          <div>
            <span className={classes.label}>{uiText('public:hero.exampleQuestionLabel')}</span>
            <p>{copy.exampleQuestion}</p>
          </div>
          <div>
            <span className={classes.label}>{uiText('public:hero.exampleAnswerLabel')}</span>
            <p>{copy.exampleAnswer}</p>
          </div>
        </div>
      </details>
    </figure>
  );
}
