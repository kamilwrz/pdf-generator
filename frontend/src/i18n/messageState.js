import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t, getUiLanguage } from './index.js';

const MESSAGE = 'cvstudio.presentationMessage';
/** Keep application copy as a key until render; never tag user or AI prose. */
export function messageRef(key, params) { return { kind: MESSAGE, key, params }; }
export function messageOf(error) {
  return error?.messageKey ? messageRef(error.messageKey, error.messageParams) : error?.message;
}
export function resolveMessage(value, language = getUiLanguage()) {
  if (value?.kind === MESSAGE) return t(value.key, { ...resolveMessage(value.params, language), lng: language });
  if (Array.isArray(value)) return value.map((item) => resolveMessage(item, language));
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMessage(item, language)]));
  }
  return value;
}
/** Retain raw state and expose translated presentation without firing setters. */
export function useMessageState(initial) {
  const [value, setValue] = useState(initial);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const presented = useMemo(() => resolveMessage(value, language), [value, language]);
  return [presented, setValue];
}
