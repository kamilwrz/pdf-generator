import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUiLocale } from '../../../i18n';
import { interviewRequest } from '../../../services/interviews';
import classes from './Interview.module.css';

/**
 * Show settled request costs in every interview host, outside the PDF tree.
 * Read the ledger after success AND failure: a preview may charge for completed
 * stages before a later stage fails. Never infer charges from the account balance
 * or retained session.usage, which can describe another request or a replay.
 */
export default function InterviewCredits({ sessionId, revision, busy, entitlements, balanceLoading, balanceError, onRefreshBalance }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState(null);
  const [settledRead, setSettledRead] = useState(null);
  const [retry, setRetry] = useState(0);
  // Each busy-to-idle transition needs a fresh read even if a failed write did
  // not change the revision. Derive loading from identity instead of resetting
  // state in the effect; only completed external reads update React state.
  const request = useMemo(() => ({ sessionId, revision, busy, retry }), [sessionId, revision, busy, retry]);
  const loading = settledRead?.request !== request;
  const failed = !loading && settledRead.failed;
  useEffect(() => {
    if (request.busy) return;
    let current = true;
    interviewRequest(`/ai/interviews/${request.sessionId}/credits`).then((data) => {
      if (!Number.isFinite(data?.credits_charged) || !Array.isArray(data.requests)) throw new Error('Invalid credit receipt');
      if (current) { setSnapshot({ sessionId: request.sessionId, data }); setSettledRead({ request, failed: false }); }
    }).catch(() => { if (current) setSettledRead({ request, failed: true }); });
    // A different session or newer request must never receive this old receipt.
    return () => { current = false; };
  }, [request]);

  const data = snapshot?.sessionId === sessionId ? snapshot.data : null;
  const latest = data?.requests[0];
  const number = (value) => new Intl.NumberFormat(getUiLocale()).format(value);
  const credits = (value) => t('interview:credits.amount', { count: value, value: number(value) });
  const operation = (value) => t(`interview:credits.operation.${value}`);
  const remaining = entitlements?.remaining?.ai_credits;
  const knownBalance = !busy && !balanceLoading && !balanceError && Number.isFinite(remaining) && remaining >= 0;
  const status = (item) => `${credits(item.credits_charged)}${item.pending ? ` · ${t('interview:credits.pending')}` : ''}`;
  const retryRead = () => { setRetry((value) => value + 1); onRefreshBalance?.(); };

  return <section className={classes.credits} aria-label={t('interview:credits.title')}>
    <div className={classes.creditSummary} role="status" aria-live="polite" aria-atomic="true">
      <p><strong>{t('interview:credits.total')}</strong> {data ? credits(data.credits_charged) : '—'}</p>
      <p><strong>{t('interview:credits.remaining')}</strong> {knownBalance ? credits(remaining) : t('interview:credits.unavailable')}</p>
      <p className={classes.creditLatest}>{busy ? t('interview:credits.working') : loading ? t('interview:credits.loading') : failed ? t('interview:credits.error') : latest
        ? t('interview:credits.latest', { operation: operation(latest.operation), cost: status(latest) }) : t('interview:credits.empty')}</p>
    </div>
    <p className={classes.hint}>{t('interview:credits.free')}</p>
    {failed && <button type="button" disabled={busy || loading} onClick={retryRead}>{t('interview:credits.retry')}</button>}
    {data?.requests.length > 0 && <details className={classes.creditHistory}>
      <summary>{t('interview:credits.history', { count: data.requests.length })}</summary>
      <ol>{data.requests.map((item) => <li key={item.id}>
        <div className={classes.creditSummary}><strong>{operation(item.operation)}</strong><span>{status(item)}</span></div>
        <time dateTime={item.created_at}>{new Intl.DateTimeFormat(getUiLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at))}</time>
        <ul>{item.stages.map((stage, index) => <li key={index}>{operation(stage.operation === 'preview' ? 'draft' : stage.operation)}: {stage.status === 'pending' ? t('interview:credits.pending') : credits(stage.credits_charged)}{stage.status === 'failed' ? ` · ${t('interview:credits.failedStage')}` : ''}</li>)}</ul>
      </li>)}</ol>
      <p className={classes.hint}>{t('interview:credits.recovery')}</p>
      {!failed && data.requests.some((item) => item.pending) && <button type="button" disabled={busy || loading} onClick={retryRead}>{t('interview:credits.retry')}</button>}
    </details>}
  </section>;
}
