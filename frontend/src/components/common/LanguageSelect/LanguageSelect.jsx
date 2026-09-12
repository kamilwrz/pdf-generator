import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { setUiLanguage } from '../../../i18n';
import classes from './LanguageSelect.module.css';

/** The same native selector remains keyboard-accessible on every entry route. */
export default function LanguageSelect() {
  const id = useId();
  const { t, i18n } = useTranslation('common');
  return <label className={classes.control} htmlFor={id}>
    <span className={classes.label}>{t('language')}</span>
    <select id={id} value={i18n.resolvedLanguage === 'en' ? 'en' : 'pl'}
      onChange={(event) => void setUiLanguage(event.target.value)}>
      <option value="pl" lang="pl">Polski</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>;
}
