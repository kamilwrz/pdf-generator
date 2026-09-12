import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { t } from './index.js';
/** Updating copy changes only the title; route focus and scroll belong to routing. */
export function usePageTitle(key) {
  useTranslation();
  const title = t(key);
  useEffect(() => { document.title = `${title} — CV Studio`; }, [title]);
}
