import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './Interview.module.css';

/** A noninteractive progress list explains the three actions without adding navigation stops. */
export default function InterviewStages({ active }) {
  useTranslation();
  const stages = [
    ['source', t('interview:simple.sourceStep')],
    ['conversation', t('interview:simple.conversationStep')],
    ['prepare', t('interview:simple.templateStep')],
  ];
  return <ol className={classes.stages} aria-label={t('interview:interviewFlow.interviewStages')}>
      {stages.map(([key, label], index) => <li key={key}
        aria-current={active === key ? 'step' : undefined}>
        <span>{String(index + 1).padStart(2, '0')}</span>{' '}{label}
      </li>)}
    </ol>;
}
