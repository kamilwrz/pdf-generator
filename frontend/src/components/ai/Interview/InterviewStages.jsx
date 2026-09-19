import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './Interview.module.css';

/**
 * A noninteractive progress list explains the three actions without adding
 * navigation stops. Steps are strictly ordered, so everything before the
 * active step is presented as completed — including a CV chosen upstream in
 * onboarding, which must read as done rather than skipped.
 */
export default function InterviewStages({ active }) {
  useTranslation();
  const stages = [
    ['source', t('interview:simple.sourceStep')],
    ['conversation', t('interview:simple.conversationStep')],
    ['prepare', t('interview:simple.templateStep')],
  ];
  const activeIndex = stages.findIndex(([key]) => key === active);
  return <ol className={classes.stages} aria-label={t('interview:interviewFlow.interviewStages')}>
      {stages.map(([key, label], index) => <li key={key}
        aria-current={active === key ? 'step' : undefined}
        data-complete={index < activeIndex || undefined}>
        <span aria-hidden="true">{index < activeIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>
        {' '}{label}
        {index < activeIndex && <span className={classes.srOnly}> ({t('interview:simple.stepDone')})</span>}
      </li>)}
    </ol>;
}
