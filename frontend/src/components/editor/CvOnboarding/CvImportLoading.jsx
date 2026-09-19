import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from '../../../i18n';
import styles from './CvImportLoading.module.css';

/**
 * Presents the pending PDF request without estimating server progress. The
 * document scan is an indeterminate activity cue, not a preview of user data.
 * Mount only during extraction; unmounting clears the long-wait notice timer.
 * The parent owns cancellation, request identity and focus after completion.
 */
export default function CvImportLoading({ filename }) {
  useTranslation();
  const heading = useRef(null);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // Explain a longer request once, without announcing timer ticks or
    // retrying an extraction that may still be running on the server.
    const timer = window.setTimeout(() => setLongWait(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);

  return <section className={styles.panel} aria-labelledby="cv-import-loading-title">
    <div className={styles.main}>
      <div className={styles.document} role="progressbar" aria-label={t('onboarding:importLoadingTitle')}>
        <div className={styles.paper} aria-hidden="true">
          <span className={styles.identity} />
          <span className={styles.shortLine} />
          <span className={styles.rule} />
          <span className={styles.line} /><span className={styles.line} />
          <span className={styles.shortLine} />
          <span className={styles.rule} />
          <span className={styles.line} /><span className={styles.shortLine} />
        </div>
        <span className={styles.scanner} aria-hidden="true" />
      </div>
      <div className={styles.copy}>
        <p className={styles.file}><span>PDF</span><span>{filename}</span></p>
        <h2 id="cv-import-loading-title" ref={heading} tabIndex={-1}>{t('onboarding:importLoadingTitle')}</h2>
        <p className={styles.description}>{t('onboarding:importLoadingDescription')}</p>
      </div>
    </div>
    <p className={styles.note} role="status" aria-live="polite" aria-atomic="true">
      {t(longWait ? 'onboarding:importLoadingLongWait' : 'onboarding:importLoadingNext')}
    </p>
  </section>;
}
