import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './AiTask.module.css';

/** Shared presentation only: callers retain source validation, persistence and undo. */
export default function AiChangeReview({ title, changes, state = 'pending', disabled = false, onAccept, onReject, note, open = false }) {
  useTranslation();
  const details = useRef(null);
  // Focus the persistent disclosure before a decision can remove its buttons.
  const decide = callback => { details.current?.querySelector('summary')?.focus(); callback?.(); };
  return <details ref={details} className={classes.change} open={open || undefined} data-state={state}>
    <summary>{title}<span>{t(`ai:task.${state}`)}</span></summary>
    <div className={classes.changeBody}>
      {changes.map((change, index) => <div key={change.label || index} className={classes.comparison}>
        {changes.length > 1 && <h4>{change.label}</h4>}
        <dl><dt>{t('ai:aiAssistant.before')}</dt><dd>{change.before}</dd>
          <dt>{t('ai:task.after')}</dt><dd>{change.after}</dd></dl>
      </div>)}
      {note && <p className={classes.note}>{note}</p>}
      {state === 'pending' ? <div className={classes.actions}>
        <button type="button" className={classes.primary} disabled={disabled} onClick={() => decide(onAccept)}>{t('ai:aiAssistant.apply')}</button>
        <button type="button" disabled={disabled} onClick={() => decide(onReject)}>{t('ai:aiAssistant.skip')}</button>
      </div> : <p role="status">{t(`ai:task.${state}`)}</p>}
    </div>
  </details>;
}
