import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiArrowUpRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';
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

/** Presents a workspace workflow with one explicit entry and visible plan terms.
 * Callers own entitlement decisions; rendering a choice never starts AI work.
 */
export function WorkflowChoice({ id, icon, title, description, note, to, action }) {
  return <article className={classes.workflowChoice} aria-labelledby={id}>
    <div className={classes.workflowHeading}><SiteMarker>{icon}</SiteMarker><h2 id={id}>{title}</h2></div>
    <p>{description}</p>
    <div className={classes.workflowAction}><p>{note}</p><Link className={classes.secondary} to={to}>{action}<FiArrowRight aria-hidden="true" /></Link></div>
  </article>;
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
