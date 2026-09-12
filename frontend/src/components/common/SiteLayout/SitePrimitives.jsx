import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { FiArrowUpRight } from 'react-icons/fi';
import classes from './SiteLayout.module.css';

/** A noninteractive icon marker; the adjacent text always carries its meaning. */
export function SiteMarker({ children }) {
  useTranslation();
  return <span className={classes.marker} aria-hidden="true">{children}</span>;
}

/** Labels a supporting hero fact without introducing a competing page heading. */
export function HeroNote({ icon, label, title, children }) {
  useTranslation();
  return <><div className={classes.noteHeading}><SiteMarker>{icon}</SiteMarker><span>{label}</span><FiArrowUpRight aria-hidden="true" /></div><strong className={classes.noteTitle}>{title}</strong><div className={classes.noteBody}>{children}</div></>;
}

/**
 * Displays server usage without inventing a percentage for unlimited or unknown
 * allowances. A finite, positive limit gets a native labelled meter; its visual
 * value is clamped, while the text retains the actual usage, including overruns.
 */
export function UsageMetric({ label, used, limit, icon }) {
  useTranslation();
  const metered = Number.isFinite(used) && Number.isFinite(limit) && limit > 0;
  return <div className={classes.metric}>
    <dt><SiteMarker>{icon}</SiteMarker>{label}</dt>
    <dd><strong>{used ?? '—'}</strong><span>/ {limit === null ? uiText("public:sitePrimitives.unlimited") : limit ?? '—'}</span></dd>
    <dd className={classes.metricTrack}>{metered ? <meter min={0} max={limit} value={Math.max(0, Math.min(used, limit))} aria-label={`${label}: wykorzystano ${used} z ${limit}`} /> : <span>{limit === null ? uiText("public:sitePrimitives.unlimitedInYourPlan") : limit === 0 ? uiText("public:sitePrimitives.unavailableInYourPlan") : uiText("public:sitePrimitives.allowanceUnavailable")}</span>}</dd>
  </div>;
}
