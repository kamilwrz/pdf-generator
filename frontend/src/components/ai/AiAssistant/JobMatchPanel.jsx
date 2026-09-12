import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './JobMatchPanel.module.css';

/** Full assistant workspace: analyse an offer, then reuse its findings in an interview. */
export default function JobMatchPanel({ url, description, notes, onUrl, onDescription, onNotes,
  busy, error, fieldError, analysis, stale, onAnalyse, onInterview, onBack, interviewRef }) {
  useTranslation();
  const heading = useRef(null);
  const resultHeading = useRef(null);
  useEffect(() => { if (analysis) resultHeading.current?.focus(); }, [analysis]);
  useEffect(() => { heading.current?.focus(); }, []);
  const requirements = analysis?.jobRequirements || [];
  return <section className={classes.workspace} aria-labelledby="job-match-heading" aria-busy={busy}>
    <header><button className={classes.back} onClick={onBack}>{t('ai:jobMatch.back')}</button>
      <h2 id="job-match-heading" tabIndex={-1} ref={heading}>{t('ai:aiAssistant.tailorToAJob')}</h2>
      <p>{t('ai:jobMatch.intro')}</p>
    </header>
    <fieldset disabled={busy} className={classes.form}>
      <label htmlFor="ai-job-offer-url">{t('ai:aiAssistant.jobAdvertLink')}</label>
      <input id="ai-job-offer-url" type="url" inputMode="url" value={url} onChange={(e) => onUrl(e.target.value)} placeholder="https://…" aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'ai-job-offer-error' : undefined} />
      <label htmlFor="ai-job-description">{t('ai:jobMatch.description')}</label>
      <textarea id="ai-job-description" value={description} onChange={(e) => onDescription(e.target.value)} rows={6} maxLength={20000} placeholder={t('ai:jobMatch.descriptionHint')} />
      <details><summary>{t('ai:jobMatch.notes')}</summary>
        <label htmlFor="ai-candidate-notes">{t('ai:jobMatch.notesLabel')}</label>
        <textarea id="ai-candidate-notes" value={notes} onChange={(e) => onNotes(e.target.value)} rows={4} maxLength={5000} />
      </details>
    </fieldset>
    {error && <p id="ai-job-offer-error" role="alert" className={classes.error}>{error}</p>}
    {busy && <p role="status">{t('ai:jobMatch.loading')}</p>}
    {analysis && <section className={classes.result} aria-label={t('ai:jobMatch.result')}>
      <h3 ref={resultHeading} tabIndex={-1}>{t('ai:jobMatch.result')}</h3>
      {stale ? <p role="status">{t('ai:jobMatch.stale')}</p> : <p>{t('ai:jobMatch.analysisHint')}</p>}
      {analysis.jobOffer?.title && <p><strong>{analysis.jobOffer.title}</strong></p>}
      <ul>{requirements.map((item, index) => <li key={item.id || index}>
        <span className={classes.status} data-status={item.match_status}>{t(`ai:jobMatch.${['matched', 'partial'].includes(item.match_status) ? item.match_status : 'missing'}`)}</span>
        <strong>{item.text}</strong>
      </li>)}</ul>
      {requirements.length === 0 && <p>{analysis.text}</p>}
      {analysis.strengths?.length > 0 && <details><summary>{t('ai:jobMatch.strengths')}</summary><ul>{analysis.strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    </section>}
    <footer className={classes.footer}>
      <p>{t('ai:jobMatch.interviewHint')}</p>
      <div><button ref={interviewRef} className={classes.primary} disabled={busy || (!url.trim() && !description.trim())} onClick={onInterview}>{t('ai:jobMatch.interview')}</button>
      <button disabled={busy || (!url.trim() && !description.trim())} onClick={onAnalyse}>{t('ai:jobMatch.analyse')}</button></div>
      <p className={classes.note}>{t('ai:jobMatch.credits')}</p>
    </footer>
  </section>;
}
