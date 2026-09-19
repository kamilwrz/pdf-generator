import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUiLocale } from '../../../i18n';
import { interviewRequest } from '../../../services/interviews';
import classes from './InterviewCredits.module.css';

/**
 * One static receipt line in every interview host, outside the PDF tree:
 * "Kredyty · Zużyte N · Dostępne M". The per-request history disclosure was
 * removed on request to reduce cognitive load; the ledger read remains because
 * the used total must come from settled charges, never from the account
 * balance or retained session.usage, which can describe another request or a
 * replay. The read repeats after success AND failure: a preview may charge for
 * completed stages before a later stage fails.
 */
export default function InterviewCredits({ sessionId, revision, busy, entitlements, balanceLoading, balanceError, onRefreshBalance, showBalance = true }) {
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
  const number = (value) => new Intl.NumberFormat(getUiLocale()).format(value);
  const remaining = entitlements?.remaining?.ai_credits;
  const knownBalance = !busy && !balanceLoading && !balanceError && Number.isFinite(remaining) && remaining >= 0;
  // An unknown amount stays an explicit dash; a settling charge is announced
  // rather than shown as a stale or invented number.
  const pending = busy || loading || data?.requests.some((item) => item.pending);

  return <section className={classes.credits} aria-label={t('interview:credits.title')}>
    <p className={classes.line}>
      <span className={classes.label}>{t('interview:credits.title')}</span>
      <span className={classes.metric} aria-live="polite" aria-atomic="true">{t('interview:credits.usedShort')} <strong>{data ? number(data.credits_charged) : '—'}</strong></span>
      {showBalance && <span className={classes.metric}>{t('interview:credits.balanceShort')} <strong>{knownBalance ? number(remaining) : '—'}</strong></span>}
      {pending && !failed && <span className={classes.hint}>{t('interview:credits.pending')}</span>}
    </p>
    {failed && <div role="status" className={classes.line}>
      <span className={classes.hint}>{t('interview:credits.error')}</span>
      <button type="button" disabled={busy || loading} onClick={() => { setRetry((value) => value + 1); onRefreshBalance?.(); }}>{t('interview:credits.retry')}</button>
    </div>}
  </section>;
}
