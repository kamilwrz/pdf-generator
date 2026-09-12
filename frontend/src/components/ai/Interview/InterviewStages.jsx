import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './Interview.module.css';

/** Both host sizes share the same transition guard; the compact selector adds no new step. */
export default function InterviewStages({ active, disabled, onSelect }) {
  useTranslation();
  const stages = [
    ['facts', t('interview:interviewFlow.yourInformation')],
    ['conversation', t('interview:interviewFlow.conversationStage')],
    ['prepare', t('interview:interviewFlow.prepareCv')],
    ['preview', t('interview:interviewFlow.resultStage')],
  ];
  return <>
    <nav className={classes.stages} aria-label={t('interview:interviewFlow.interviewStages')}>
      {stages.map(([key, label], index) => <button type="button" key={key}
        aria-current={active === key ? 'step' : undefined} disabled={disabled(key)} onClick={() => onSelect(key)}>
        <span>{String(index + 1).padStart(2, '0')}</span>{' '}{label}
      </button>)}
    </nav>
    <label className={classes.compactStages}>{t('ai:task.stages')}
      <select value={active} disabled={stages.every(([key]) => disabled(key))} onChange={event => onSelect(event.target.value)}>
        {stages.map(([key, label], index) => <option key={key} value={key} disabled={disabled(key)}>{t('ai:task.stage', { number: index + 1, label })}</option>)}
      </select>
    </label>
  </>;
}
