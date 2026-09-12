import { localisedList } from "../../../i18n/index.js";
import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import classes from './InterviewLoading.module.css';

const operations = {
  load: localisedList(localisedList([() => uiText("interview:interviewLoading.openingYourHistory"), () => uiText("interview:interviewLoading.loadingYourSelectedInformationAndSavedInterview"), () => uiText("interview:interviewLoading.readingAccountData")])),
  start: localisedList([() => uiText("interview:interviewLoading.bringingYourStartingInformationTogether"), () => uiText("interview:interviewLoading.preparingTheSelectedSourceAndInformationFor"), () => uiText("interview:interviewLoading.preparingTheConversation")]),
  next: localisedList([() => uiText("interview:interviewLoading.findingTheRightQuestion"), () => uiText("interview:interviewLoading.aiSelectsAQuestionBasedOnYour"), () => uiText("interview:interviewLoading.aiQuestionSelection")]),
  answers: localisedList([() => uiText("interview:interviewLoading.keepingYourAnswer"), () => uiText("interview:interviewLoading.savingYourAnswerBeforeYouMoveTo"), () => uiText("interview:interviewLoading.savingYourAnswer")]),
  confirm: localisedList([() => uiText("interview:interviewLoading.savingConfirmedInformation"), () => uiText("interview:interviewLoading.savingInformationToThisInterviewSSelected"), () => uiText("interview:interviewLoading.savingConfirmedInformation2")]),
  preview: localisedList([() => uiText("interview:interviewLoading.yourStoryIsTakingShape"), () => uiText("interview:interviewLoading.preparationIncludesDraftingSeparateLanguageAndStyle"), () => uiText("interview:interviewLoading.preparingAndCheckingYourCv")]),
  document: localisedList([() => uiText("interview:interviewLoading.savingANewVersionOfYourCv"), () => uiText("interview:interviewLoading.creatingASeparateDocumentOnceSavedIt"), () => uiText("interview:interviewLoading.savingTheDocument")]),
  source: localisedList([() => uiText("interview:interviewLoading.updatingYourStartingInformation"), () => uiText("interview:interviewLoading.loadingTheCurrentCvSavedAnswersRemain"), () => uiText("interview:interviewLoading.refreshingSource")]),
  clarify: localisedList([() => uiText("interview:interviewLoading.returningToTheDetails"), () => uiText("interview:interviewLoading.openingASavedQuestionAboutInformationThat"), () => uiText("interview:interviewLoading.readingTheQuestion")]),
  'skip-clarifications': localisedList([() => uiText("interview:interviewLoading.preparingTheNextStep"), () => uiText("interview:interviewLoading.keepingConfirmedInformationAndRetrievingTheCurrent"), () => uiText("interview:interviewLoading.updatingTheConversation")]),
  extend: localisedList([() => uiText("interview:interviewLoading.openingTheNextChapter"), () => uiText("interview:interviewLoading.addingAnOptionalRoundOfUpTo"), () => uiText("interview:interviewLoading.extendingTheConversation")]),
  sync: localisedList([() => uiText("interview:interviewLoading.updatingTheView"), () => uiText("interview:interviewLoading.theOperationHasReturnedRetrievingThisInterview"), () => uiText("interview:interviewLoading.synchronisingInformation")]),
};

/** An indeterminate, operation-specific wait surface. Time never advances server stages. */
export default function InterviewLoading({ operation = 'load', facts, answers, language, template }) {
  useTranslation();
  const [seconds, setSeconds] = useState(0);
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const [title, description, current] = operations[operation] || operations.load;
  return <section className={classes.loading} aria-label={uiText("interview:interviewLoading.processingInterview")}>
    <div className={classes.manuscript} aria-hidden="true">
      <span className={classes.documentLabel}>CV / STUDIO</span>
      <div className={classes.paper}><i /><i /><i /><span /><i /><i /><i /><span /><i /><i /></div>
      <span className={classes.documentLabel}>{uiText("interview:interviewLoading.informationContent")}</span>
    </div>
    <div className={classes.body}>
      <p className={classes.eyebrow}>{uiText("interview:interviewLoading.interviewInProgress")}</p>
      <div role="status" aria-live="polite" aria-atomic="true"><h3 ref={heading} tabIndex={-1}>{title}</h3><p>{description}</p></div>
      <div className={classes.track} role="progressbar" aria-label={current}><span /></div>
      <div className={classes.current}><strong>{current}</strong><span aria-hidden="true">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div>
      <dl className={classes.context}>{answers != null && <div><dt>{uiText("interview:interviewLoading.savedAnswers")}</dt><dd>{answers}</dd></div>}{facts != null && <div><dt>{uiText("interview:interviewLoading.confirmedInformation")}</dt><dd>{facts}</dd></div>}{language && <div><dt>{uiText("ai:aiAssistant.cvLanguage")}</dt><dd>{language}</dd></div>}{template && <div><dt>{uiText("interview:interviewLoading.template")}</dt><dd>{template}</dd></div>}</dl>
      <p className={classes.note}>{seconds >= 30 ? uiText("interview:interviewLoading.theOperationIsStillRunningTimingDepends") : uiText("interview:interviewLoading.theResultWillAppearWhenTheOperation")}</p>
    </div>
  </section>;
}
