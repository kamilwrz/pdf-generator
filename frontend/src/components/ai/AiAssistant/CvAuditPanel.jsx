import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import classes from './CvAuditPanel.module.css';

const CATEGORIES = new Set([
  'contact', 'summary', 'experience', 'achievements', 'skills', 'education',
  'grammar', 'language', 'consistency', 'conciseness', 'structure', 'privacy', 'ats', 'job_fit',
]);
const ACTIONS = new Set([
  'grammar', 'language', 'improve', 'shorten', 'translate', 'interview', 'ats_score', 'match_job',
]);
const KINDS = ['error', 'improvement', 'missing', 'verification'];
const PRIORITY = { high: 0, medium: 1, low: 2 };

function categoryLabel(category) {
  return CATEGORIES.has(category.id) ? t(`ai:cvAudit.category.${category.id}`) : category.label;
}

/** Count visible findings rather than trusting a second, potentially stale total. */
function countFindings(findings) {
  return Object.fromEntries(KINDS.map((kind) => [kind, findings.filter((item) => item.kind === kind).length]));
}

function FindingCounts({ findings, compact = false }) {
  const counts = countFindings(findings);
  return <dl className={compact ? classes.compactCounts : classes.counts}>
    {KINDS.filter((kind) => !compact || counts[kind] > 0).map((kind) => <div key={kind}>
      <dt>{t(`ai:cvAudit.count.${kind}`)}</dt><dd>{counts[kind]}</dd>
    </div>)}
  </dl>;
}

/** Only application-owned tools can be launched; provider text never becomes navigation. */
function AuditAction({ action, actionId, onAction, disabled }) {
  if (!ACTIONS.has(action)) return <p className={classes.note}>{t('ai:cvAudit.manual')}</p>;
  return <div className={classes.action}>
    <p className={classes.note}>{t(`ai:cvAudit.actionHint.${action}`)}</p>
    <button id={`cv-audit-action-${actionId}`} type="button" disabled={disabled || !onAction} onClick={() => onAction(action)}>
      {t(`ai:cvAudit.action.${action}`)}
    </button>
  </div>;
}

/**
 * Read-only, category-based review of a server-validated version 1 CV audit.
 * Application labels follow the live UI language; evidence and provider prose
 * remain the historical result. Only explicit tool clicks call `onAction` with
 * an allow-listed action. The parent owns requests, credits, document identity,
 * result focus and staleness; this panel never writes to the canvas or PDF tree.
 *
 * @param {object} props.audit - Normalised categories, findings, strengths and limits.
 * @param {string} props.auditId - Stable message identity for focus restoration after a subflow.
 * @param {Function} props.onAction - Starts a named tool or opens its preparation flow.
 * @param {boolean} props.disabled - Disables paid/tool actions while another task runs.
 * @param {boolean} props.stale - Keeps an old audit readable but blocks its tool actions.
 * @param {Function} props.onRerun - Explicitly requests a fresh audit of the current CV.
 */
export default function CvAuditPanel({ audit, auditId, onAction, disabled = false, stale = false, onRerun }) {
  useTranslation();
  const instanceId = useId();
  const stableAuditId = auditId || instanceId;
  const categoryRefs = useRef(new Map());
  const findingRefs = useRef(new Map());
  const categories = audit?.categories || [];
  const findings = categories.flatMap((category) => (category.findings || []).map((finding) => ({
    ...finding, categoryId: category.id, categoryLabel: categoryLabel(category),
  })));
  const priorities = [...findings].sort((a, b) => (PRIORITY[a.severity] ?? 2) - (PRIORITY[b.severity] ?? 2)).slice(0, 3);
  const assessed = categories.filter((category) => category.status !== 'not_assessed').length;
  const actionsDisabled = disabled || stale;

  function revealFinding(finding) {
    // Native disclosure state stays local, so a language switch or a new busy
    // state does not collapse the user's reading position. No AI request runs.
    const category = categoryRefs.current.get(finding.categoryId);
    if (!category) return;
    category.open = true;
    const target = findingRefs.current.get(`${finding.categoryId}:${finding.id}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }

  return <section className={classes.audit} aria-labelledby={`${instanceId}-heading`} data-cv-audit>
    <header className={classes.header}>
      <p className={classes.eyebrow}>{t('ai:cvAudit.eyebrow')}</p>
      <h3 id={`${instanceId}-heading`} data-cv-audit-heading tabIndex={-1}>{t('ai:cvAudit.title')}</h3>
      {audit?.summary && <p>{audit.summary}</p>}
      <p className={classes.note}>{t('ai:cvAudit.scope')}</p>
    </header>

    {stale && <div className={classes.stale}>
      <p role="status">{t('ai:cvAudit.stale')}</p>
      <button type="button" disabled={disabled || !onRerun} onClick={onRerun}>{t('ai:cvAudit.rerun')}</button>
    </div>}

    <section className={classes.overview} aria-label={t('ai:cvAudit.overview')}>
      <p className={classes.total}>{t('ai:cvAudit.total', { count: findings.length })}</p>
      <p className={classes.note}>{t('ai:cvAudit.coverage', { assessed, total: categories.length })}</p>
      <FindingCounts findings={findings} />
      <p className={classes.note}>{t('ai:cvAudit.countHint')}</p>
      {findings.length === 0 && <p>{t('ai:cvAudit.empty')}</p>}
    </section>

    {priorities.length > 0 && <nav className={classes.priorities} aria-label={t('ai:cvAudit.priorities')}>
      <h4>{t('ai:cvAudit.priorities')}</h4>
      <p className={classes.note}>{t('ai:cvAudit.priorityHint')}</p>
      <ol>{priorities.map((finding) => <li key={`${finding.categoryId}:${finding.id}`}>
        <button type="button" onClick={() => revealFinding(finding)}>
          <span className={classes.priorityLabel}>{t(`ai:cvAudit.severity.${finding.severity}`)} · {finding.categoryLabel}</span>
          <span>{finding.title}</span>
        </button>
      </li>)}</ol>
    </nav>}

    <section className={classes.categories} aria-label={t('ai:cvAudit.categories')}>
      <h4>{t('ai:cvAudit.categories')}</h4>
      {categories.map((category) => {
        const categoryFindings = category.findings || [];
        const status = ['needs_attention', 'clear', 'not_assessed'].includes(category.status)
          ? category.status : 'not_assessed';
        return <details key={category.id} className={classes.category} data-audit-category={category.id}
          ref={(node) => { if (node) categoryRefs.current.set(category.id, node); else categoryRefs.current.delete(category.id); }}>
          <summary>
            <span className={classes.categoryTitle}>{categoryLabel(category)}</span>
            <span className={classes.categoryMeta}>
              <span data-status={status}>{t(`ai:cvAudit.status.${status}`)}</span>
              {status !== 'not_assessed' && <span>{t('ai:cvAudit.categoryCount', { count: categoryFindings.length })}</span>}
            </span>
          </summary>
          <div className={classes.categoryBody}>
            {category.description && <p className={classes.note}>{category.description}</p>}
            {category.summary && <p>{category.summary}</p>}
            {categoryFindings.length > 0 && <FindingCounts findings={categoryFindings} compact />}
            {categoryFindings.length > 0 && <ol className={classes.findings}>
              {categoryFindings.map((finding) => <li key={finding.id}>
                <p className={classes.findingMeta}>
                  <span data-severity={finding.severity}>{t(`ai:cvAudit.severity.${finding.severity}`)}</span>
                  <span>{t(`ai:cvAudit.kind.${finding.kind}`)}</span>
                </p>
                <h5 tabIndex={-1} ref={(node) => {
                  const key = `${category.id}:${finding.id}`;
                  if (node) findingRefs.current.set(key, node); else findingRefs.current.delete(key);
                }}>{finding.title}</h5>
                <p>{finding.description}</p>
                {finding.location && <p className={classes.location}><strong>{t('ai:cvAudit.location')}</strong> {finding.location}</p>}
                {finding.evidence?.length > 0 && <div className={classes.evidence}>
                  <p className={classes.fieldLabel}>{t('ai:cvAudit.evidence')}</p>
                  {finding.evidence.map((item, index) => <blockquote key={`${item.element_id}:${index}`}>{item.quote}</blockquote>)}
                </div>}
                <div><p className={classes.fieldLabel}>{t('ai:cvAudit.recommendation')}</p><p>{finding.recommendation}</p></div>
                {finding.question && <div className={classes.question}>
                  <p className={classes.fieldLabel}>{t('ai:cvAudit.question')}</p><p>{finding.question}</p>
                </div>}
                <AuditAction action={finding.action} actionId={`${stableAuditId}:${category.id}:${finding.id}`}
                  onAction={onAction} disabled={actionsDisabled} />
              </li>)}
            </ol>}
            {categoryFindings.length === 0 && category.recommended_action &&
              <AuditAction action={category.recommended_action} actionId={`${stableAuditId}:${category.id}:next`}
                onAction={onAction} disabled={actionsDisabled} />}
          </div>
        </details>;
      })}
    </section>

    {audit?.strengths?.length > 0 && <section className={classes.supporting} aria-label={t('ai:cvAudit.strengths')}>
      <h4>{t('ai:cvAudit.strengths')}</h4>
      <ul>{audit.strengths.map((strength, index) => <li key={index}>{strength}</li>)}</ul>
    </section>}

    <section className={classes.supporting} aria-label={t('ai:cvAudit.limitations')}>
      <h4>{t('ai:cvAudit.limitations')}</h4>
      <p>{t('ai:cvAudit.limitHint')}</p>
      {audit?.limitations?.length > 0 && <ul>{audit.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
    </section>
    <p className={classes.note}>{t('ai:cvAudit.credits')}</p>
  </section>;
}
