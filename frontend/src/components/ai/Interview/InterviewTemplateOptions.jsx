import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as uiText } from '../../../i18n/index.js';
import { interviewRequest } from '../../../services/interviews.js';
import { TEMPLATES } from '../../../templates';
import { isTemplateAllowed } from '../../../utils/entitlements.js';
import { templatePreviewPath } from '../../../i18n/templatePreviews.js';
import classes from './Interview.module.css';
import styles from './InterviewTemplateOptions.module.css';

/**
 * Offers only measured one-page layouts of the current verified interview text.
 * Scanning is free and leaves the current preview usable. Revision-keyed mounts
 * discard stale measurements; cancellation/unmount prevent late publication.
 * Only the explicit apply action asks the parent to persist a replacement.
 */
export default function InterviewTemplateOptions({ session, entitlements, disabled, autoCheck = false, onAutoStart, onSelect }) {
  useTranslation();
  const [result, setResult] = useState({ status: 'idle', candidates: [], failedTemplateIds: [] });
  const [progress, setProgress] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const sequence = useRef(0);
  const scanning = useRef(false);
  const autoStarted = useRef(false);
  const heading = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);

  const scan = useCallback(async (automatic = false) => {
    if (disabled || scanning.current) return;
    scanning.current = true;
    const token = ++sequence.current;
    const isCurrent = () => mounted.current && token === sequence.current;
    setResult({ status: 'loading', candidates: [], failedTemplateIds: [] });
    setProgress(null);
    try {
      const response = await interviewRequest(`/ai/interviews/${session.id}/preview-templates`, 'POST', {
        revision: session.revision, profile_revision: session.profile_revision, evidence_scope: session.evidence_scope,
      });
      if (!isCurrent()) return;
      if (response.revision !== session.revision) throw new Error('Stale template measurements');
      const { measureInterviewTemplateCandidates } = await import('../../../utils/interviewTemplateFit.js');
      const measured = await measureInterviewTemplateCandidates(response, {
        isCurrent, onProgress: (value) => { if (isCurrent()) setProgress(value); },
      });
      if (!isCurrent() || measured.cancelled) return;
      setResult({ ...measured, status: 'complete' });
    } catch {
      if (isCurrent()) setResult({ status: 'error', candidates: [], failedTemplateIds: [] });
    } finally {
      if (isCurrent()) scanning.current = false;
      if (isCurrent() && !automatic) heading.current?.focus();
    }
  }, [disabled, session]);

  useEffect(() => {
    // A completed generation may request one automatic scan. Ordinary reads
    // expose the same explicit action without regenerating any CV content.
    let cancelled = false;
    // Defer until after the effect setup/cleanup cycle so StrictMode does not
    // issue two requests or leave an automatically started scan abandoned.
    queueMicrotask(() => {
      if (!cancelled && autoCheck && !disabled && !autoStarted.current) {
        autoStarted.current = true;
        onAutoStart?.();
        void scan(true);
      }
    });
    return () => { cancelled = true; };
  }, [autoCheck, disabled, onAutoStart, scan]);

  const candidates = result.candidates.filter(candidate => {
    const template = TEMPLATES.find(item => item.id === candidate.template_id);
    return template && isTemplateAllowed(template, entitlements);
  });
  const selected = candidates.find(candidate => candidate.template_id === selectedId) || candidates[0];
  const selectedTemplate = TEMPLATES.find(template => template.id === selected?.template_id);
  const cancel = () => {
    sequence.current += 1;
    scanning.current = false;
    setResult({ status: 'idle', candidates: [], failedTemplateIds: [] });
    heading.current?.focus();
  };

  return <section className={classes.progress} aria-label={uiText('interview:templates.title')}>
    <h3 ref={heading} tabIndex={-1}>{uiText('interview:templates.title')}</h3>
    <p className={classes.hint}>{uiText('interview:templates.help')}</p>
    <div role="status" aria-live="polite" aria-atomic="true">
      {result.status === 'loading' && <p>{progress
        ? uiText('interview:templates.progress', { completed: progress.completed, total: progress.total })
        : uiText('interview:templates.loading')}</p>}
      {result.status === 'complete' && <p>{candidates.length
        ? uiText('interview:templates.found', { count: candidates.length })
        : uiText(result.failedTemplateIds.length ? 'interview:templates.incomplete' : 'interview:templates.none')}</p>}
      {result.status === 'complete' && candidates.length > 0 && result.failedTemplateIds.length > 0 && <p className={classes.hint}>{uiText('interview:templates.partial')}</p>}
    </div>
    {result.status === 'error' && <p role="alert" className={classes.error}>{uiText('interview:templates.error')}</p>}
    {selectedTemplate && <details open>
      <summary>{uiText('interview:templates.choose')}</summary>
      <div className={styles.choice}>
        <div>
          <label>{uiText('interview:templates.select')}<select value={selected.template_id} disabled={disabled}
            onChange={event => setSelectedId(event.target.value)}>
            {candidates.map(candidate => <option key={candidate.template_id} value={candidate.template_id}>
              {TEMPLATES.find(template => template.id === candidate.template_id).name}
            </option>)}
          </select></label>
          <p>{uiText('interview:templates.settings')}</p>
          <p className={classes.hint}>{uiText('interview:templates.samples')}</p>
          <button type="button" className={classes.primary} disabled={disabled} onClick={() => {
            if (!disabled) onSelect(selected);
          }}>{uiText('interview:templates.apply')}</button>
        </div>
        <figure className={styles.sample}>
          <img key={selectedTemplate.id} src={templatePreviewPath(selectedTemplate.id)}
            alt={uiText('interview:templates.sampleAlt', { name: selectedTemplate.name })} loading="lazy" />
          <figcaption>{selectedTemplate.name}</figcaption>
        </figure>
      </div>
    </details>}
    <div className={classes.actions}>
      {result.status === 'loading'
        ? <button type="button" onClick={cancel}>{uiText('interview:templates.cancel')}</button>
        : <button type="button" disabled={disabled} onClick={() => scan()}>{uiText(result.status === 'idle' ? 'interview:templates.check' : 'interview:templates.retry')}</button>}
    </div>
  </section>;
}
