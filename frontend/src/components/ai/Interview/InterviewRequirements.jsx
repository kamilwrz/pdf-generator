import { useTranslation } from 'react-i18next';
import styles from './InterviewRequirements.module.css';

const statusKeys = { matched: 'confirmed', partial: 'toClarify', unknown: 'noInformation', gap: 'confirmedLackOfExperience' };

/** Read-only offer context shared by both interview hosts. Stable IDs, never list
 * positions or question wording, bind the current question to its requirement.
 * The focused variant stays outside the disclosure and performs no requests. */
export default function InterviewRequirements({ requirements = [], question, focused = false }) {
  const { t } = useTranslation();
  const activeIndex = question?.entry_id ? requirements.findIndex(item => item.id === question.entry_id) : -1;
  const status = item => Object.hasOwn(statusKeys, item.status) ? item.status : 'unknown';
  const label = item => t(`interview:interviewFlow.${statusKeys[status(item)]}`);
  if (!requirements.length || (focused && activeIndex < 0)) return null;
  const active = requirements[activeIndex];
  if (focused) return <aside className={styles.current} aria-label={t('interview:requirements.current')}>
    <div className={styles.meta}><span className={styles.eyebrow}>{t('interview:requirements.current')}</span><span className={styles.position}>{t('interview:requirements.position', { number: activeIndex + 1, total: requirements.length })}</span></div>
    <p className={styles.quote}>{active.text}</p>
    <span className={styles.badge} data-status={status(active)}>{label(active)}</span>
  </aside>;
  return <section className={styles.overview} aria-label={t('ai:aiAssistant.jobRequirements')}>
    <details>
      <summary className={styles.summary}>{t('ai:aiAssistant.jobRequirements')} <span className={styles.total}>{requirements.length}</span></summary>
      <ol className={styles.list}>
        {requirements.map((item, index) => <li key={item.id || index} className={styles.row} aria-current={index === activeIndex ? 'true' : undefined}>
          <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div className={styles.content}><div className={styles.meta}><span className={styles.badge} data-status={status(item)}>{label(item)}</span>{index === activeIndex && <span className={styles.eyebrow}>{t('interview:requirements.current')}</span>}</div><p>{item.text}</p></div>
        </li>)}
      </ol>
    </details>
    <div className={styles.counts} aria-label={t('interview:requirements.analysis')}>
      {Object.keys(statusKeys).map(key => {
        const count = requirements.filter(item => status(item) === key).length;
        return count > 0 && <span key={key}><strong>{count}</strong> {t(`interview:interviewFlow.${statusKeys[key]}`)}</span>;
      })}
    </div>
  </section>;
}
