import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as uiText } from '../../../i18n/index.js';
import classes from './Interview.module.css';
import styles from './InterviewAnswerHelp.module.css';

function matchingHelp(help, questionId) {
  if (!help?.id || help.question_id !== questionId) return null;
  if (help.mode === 'draft' && typeof help.draft === 'string' && help.draft.trim()) return help;
  const guidance = help.guidance || help.draft;
  if (help.mode === 'guidance' && typeof guidance === 'string' && guidance.trim()) return help;
  if (help.mode === 'options' && Array.isArray(help.options) && help.options.length > 0
    && help.options.every(option => option?.id && typeof option.text === 'string' && option.text.trim())
    && new Set(help.options.map(option => option.id)).size === help.options.length) return help;
  return null;
}

/**
 * Review optional AI answer help without accepting or saving candidate facts.
 * The parent owns the versioned request, credits, answer append/length policy
 * and eventual answer submission. A matching cached suggestion is free to read.
 * Question-keyed mounts and request tokens discard late local results. Closing
 * an active request only hides its review; the parent remains busy until that
 * request settles because it can still update the server session revision.
 *
 * @param {object} props
 * @param {object} props.session - Current interview, question and cached help.
 * @param {string} props.answer - Unsaved answer supplied to explicit generation.
 * @param {boolean} props.disabled - Another parent operation blocks interaction.
 * @param {boolean} props.canAi - Resolved permission to generate paid AI help.
 * @param {Function} props.onGenerate - Takes the answer draft; resolves a session.
 * @param {Function} props.onUse - Takes selected text and suggestion ID. Return
 * false or reject to retain the suggestion when the parent cannot append it.
 * @param {Function} [props.onBusyChange] - Reports pending generation only.
 * @param {string|null} [props.usedSuggestionId] - Parent-controlled applied ID;
 * null re-enables cached use after the parent explicitly clears the answer.
 */
export default function InterviewAnswerHelp(props) {
  if (props.session?.question?.answer_help_available !== true) return null;
  return <QuestionAnswerHelp key={`${props.session.id}:${props.session.question.id}`} {...props} />;
}

function QuestionAnswerHelp({ session, answer, disabled = false, canAi = false, onGenerate, onUse, onBusyChange, usedSuggestionId }) {
  useTranslation();
  const questionId = session.question.id;
  const initial = matchingHelp(session.answer_help, questionId);
  const [localHelp, setLocalHelp] = useState(null);
  const [open, setOpen] = useState(Boolean(initial));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState({ helpId: null, ids: [] });
  const [usedId, setUsedId] = useState(null);
  const [applying, setApplying] = useState(false);
  const heading = useRef(null);
  const trigger = useRef(null);
  const focusTrigger = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const requestLock = useRef(false);
  const applyLock = useRef(false);
  const busyCallback = useRef(onBusyChange);
  const lastFocusState = useRef({ open: Boolean(initial), pending: false, helpId: initial?.id, error: null });
  const regionId = useId();
  busyCallback.current = onBusyChange;
  const help = matchingHelp(session.answer_help, questionId) || matchingHelp(localHelp, questionId);
  const selected = selection.helpId === help?.id ? selection.ids : [];
  const used = Boolean(help && (usedSuggestionId === undefined ? usedId : usedSuggestionId) === help.id);

  useEffect(() => {
    const previous = lastFocusState.current;
    lastFocusState.current = { open, pending, helpId: help?.id, error };
    // Focus committed review content after opening or a generation boundary.
    // Checkbox changes and explicit answer insertion leave the parent's answer
    // focus intact; reading a cached result on initial mount is also passive.
    if (open && !pending && (!previous.open || previous.pending || previous.helpId !== help?.id
      || error === 'interview:answerHelp.error' && previous.error !== error)) heading.current?.focus();
  }, [open, pending, help?.id, error]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      if (requestLock.current) busyCallback.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (!open && !pending && !disabled && focusTrigger.current) {
      focusTrigger.current = false;
      trigger.current?.focus();
    }
  }, [open, pending, disabled]);

  async function generate() {
    if (disabled || !canAi || requestLock.current) return;
    // Existing server help is a read, including after a dismissed request has
    // finished. Reopening must never reserve another model operation.
    if (help) { setOpen(true); return; }
    requestLock.current = true;
    const token = ++sequence.current;
    const current = () => mounted.current && sequence.current === token;
    setOpen(true); setPending(true); setError(null);
    busyCallback.current?.(true);
    try {
      const next = await onGenerate(answer);
      if (!current()) return;
      const generated = next?.id === session.id && next?.question?.id === questionId
        ? matchingHelp(next.answer_help, questionId) : null;
      if (!generated) throw new Error('Answer help did not match the current question.');
      setLocalHelp(generated); setSelection({ helpId: generated.id, ids: [] }); setUsedId(null);
    } catch {
      if (current()) setError('interview:answerHelp.error');
    } finally {
      requestLock.current = false;
      if (mounted.current) { setPending(false); busyCallback.current?.(false); }
    }
  }

  function close() {
    sequence.current += 1;
    focusTrigger.current = true;
    setOpen(false); setError(null);
    // Keep the request lock until its promise settles. A cancelled response may
    // be cached by the parent, but it cannot reopen this dismissed review.
  }

  async function applySuggestion() {
    if (disabled || pending || applying || applyLock.current || used || !help) return;
    const text = help.mode === 'draft' ? help.draft : help.options
      ?.filter(option => selected.includes(option.id)).map(option => option.text).join('\n');
    if (!text || help.mode === 'guidance') return;
    applyLock.current = true;
    setApplying(true); setError(null);
    const token = sequence.current;
    try {
      const accepted = await onUse(text, help.id);
      if (!mounted.current || token !== sequence.current) return;
      if (accepted === false) setError('interview:answerHelp.useError');
      else setUsedId(help.id);
    } catch {
      if (mounted.current && token === sequence.current) setError('interview:answerHelp.useError');
    } finally {
      applyLock.current = false;
      if (mounted.current) setApplying(false);
    }
  }

  const actionDisabled = disabled || pending || applying;
  return <section className={styles.panel} aria-label={uiText('interview:answerHelp.title')}>
    {!open && <>
      <button ref={trigger} type="button" aria-expanded="false" aria-controls={regionId}
        disabled={disabled || pending || (!help && !canAi)} onClick={() => {
          if (help) { setOpen(true); return; }
          void generate();
        }}>{uiText(help ? 'interview:answerHelp.reopen' : 'interview:answerHelp.generate')}</button>
      <p className={classes.hint}>{uiText('interview:answerHelp.credits')}</p>
      {!help && !canAi && <p className={classes.hint}>{uiText('interview:answerHelp.unavailable')}</p>}
    </>}
    {open && <div id={regionId}>
      <h4 ref={heading} tabIndex={-1}>{uiText('interview:answerHelp.title')}</h4>
      <p className={classes.hint}>{uiText('interview:answerHelp.credits')}</p>
      {help && !pending && <>
        {help.mode === 'draft' && <figure className={classes.proposal}>
          <figcaption>{uiText('interview:answerHelp.draftLabel')}</figcaption>
          <blockquote>{help.draft}</blockquote>
        </figure>}
        {help.mode === 'guidance' && <div className={styles.guidance}>
          <p className={styles.label}>{uiText('interview:answerHelp.guidanceLabel')}</p>
          <p>{help.guidance || help.draft}</p>
        </div>}
        {help.mode === 'options' && <fieldset disabled={actionDisabled || used}>
          <legend>{uiText('interview:answerHelp.optionsLegend')}</legend>
          <p className={classes.hint} id={`${regionId}-options-hint`}>{uiText('interview:answerHelp.optionsHint')}</p>
          {help.options.map(option => <label key={option.id} className={styles.option}>
            <input type="checkbox" checked={selected.includes(option.id)} aria-describedby={`${regionId}-options-hint`}
              onChange={event => setSelection({ helpId: help.id, ids: event.target.checked
                ? [...selected, option.id] : selected.filter(id => id !== option.id) })} />
            <span>{option.text}</span>
          </label>)}
        </fieldset>}
        {help.mode !== 'guidance' && <div className={classes.actions}>
          <button type="button" className={classes.primary} disabled={actionDisabled || used
            || (help.mode === 'options' && selected.length === 0)} onClick={() => void applySuggestion()}>
            {uiText(help.mode === 'draft' ? 'interview:answerHelp.useDraft' : 'interview:answerHelp.useSelected')}
          </button>
        </div>}
      </>}
      {error && <p role="alert" className={classes.error}>{uiText(error)}</p>}
      <div className={classes.actions}>
        {error === 'interview:answerHelp.error' && <button type="button" disabled={actionDisabled || !canAi}
          onClick={() => void generate()}>{uiText('interview:answerHelp.retry')}</button>}
        <button type="button" disabled={applying} onClick={close}>
          {uiText(pending ? 'interview:answerHelp.cancel' : 'interview:answerHelp.close')}
        </button>
      </div>
    </div>}
    <div role="status" aria-live="polite" aria-atomic="true">
      {pending && <p>{uiText('interview:answerHelp.loading')}</p>}
      {open && used && <p>{uiText('interview:answerHelp.used')}</p>}
    </div>
  </section>;
}
