import { useTranslation } from 'react-i18next';
import { interviewQuestionContext } from '../../../utils/interviewQuestionContext.js';
import styles from './InterviewRequirements.module.css';

/** Always-visible CV scope above ordinary questions in both interview hosts.
 * Reuses the offer context's visual grammar without a disclosure or extra action.
 * The caller supplies only the already-selected evidence store, never all profiles.
 */
export default function InterviewQuestionContext({ question, facts }) {
  const { t } = useTranslation();
  const context = interviewQuestionContext(question, facts);
  if (!context) return null;
  return <aside className={`${styles.current} ${styles.cvContext}`} aria-label={t('interview:requirements.current')}>
    <div className={styles.meta}><span className={styles.eyebrow}>{t('interview:requirements.current')}</span><span className={styles.section}>{context.section}</span></div>
    <p className={styles.quote}>{context.title}</p>
    {context.detail && <p className={styles.detail}>{context.detail}</p>}
  </aside>;
}
