import { FiArrowUpRight } from 'react-icons/fi';
import classes from './SiteLayout.module.css';

/** A noninteractive icon marker; the adjacent text always carries its meaning. */
export function SiteMarker({ children }) {
  return <span className={classes.marker} aria-hidden="true">{children}</span>;
}

/** Labels a supporting hero fact without introducing a competing page heading. */
export function HeroNote({ icon, label, title, children }) {
  return <><div className={classes.noteHeading}><SiteMarker>{icon}</SiteMarker><span>{label}</span><FiArrowUpRight aria-hidden="true" /></div><strong className={classes.noteTitle}>{title}</strong><div className={classes.noteBody}>{children}</div></>;
}

/**
 * Displays server usage without inventing a percentage for unlimited or unknown
 * allowances. A finite, positive limit gets a native labelled meter; its visual
 * value is clamped, while the text retains the actual usage, including overruns.
 */
export function UsageMetric({ label, used, limit, icon }) {
  const metered = Number.isFinite(used) && Number.isFinite(limit) && limit > 0;
  return <div className={classes.metric}>
    <dt><SiteMarker>{icon}</SiteMarker>{label}</dt>
    <dd><strong>{used ?? '—'}</strong><span>/ {limit === null ? 'bez limitu' : limit ?? '—'}</span></dd>
    <dd className={classes.metricTrack}>{metered ? <meter min={0} max={limit} value={Math.max(0, Math.min(used, limit))} aria-label={`${label}: wykorzystano ${used} z ${limit}`} /> : <span>{limit === null ? 'Bez ograniczeń w Twoim planie' : limit === 0 ? 'Niedostępne w Twoim planie' : 'Limit niedostępny'}</span>}</dd>
  </div>;
}
