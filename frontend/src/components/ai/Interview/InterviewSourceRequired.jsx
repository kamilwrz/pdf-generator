import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './Interview.module.css';

/** Shared recovery for interview/profile intake; never mounts the fact editor. */
export default function InterviewSourceRequired({ onReturn }) {
  useTranslation();
  return <section className={classes.progress} aria-label={t('interview:interviewFlow.addSourceFirst')}>
    <h3>{t('interview:interviewFlow.addSourceFirst')}</h3>
    <p>{t(onReturn ? 'interview:interviewFlow.editorSourceNeedsName' : 'interview:interviewFlow.sourceRequiredHelp')}</p>
    <div className={classes.actions}>
      {onReturn ? <button type="button" onClick={onReturn}>{t('interview:interviewFlow.returnToCv')}</button> : <>
        <Link className={classes.link} to="/app/import">{t('editor:topbar.importPdf')}</Link>
        <Link className={classes.link} to="/app/new">{t('interview:interviewFlow.createCvManually')}</Link>
      </>}
    </div>
    <p className={classes.hint}>{t('interview:interviewFlow.noSessionOrCredits')}</p>
  </section>;
}
