/** Application language is browser-local and never part of a CV snapshot. */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import pl from './locales/pl-shell.json' with { type: 'json' };


export const LANGUAGE_STORAGE_KEY = 'cvstudio.uiLanguage';
export const UI_LANGUAGES = Object.freeze(['pl', 'en']);

/** Resolve the verification handoff, then the explicit browser preference. */
export function initialLanguage(storage, location = globalThis.location) {
  try {
    if (location?.pathname === '/verify-email') {
      const handedOff = new URLSearchParams(location.search).get('lang');
      if (UI_LANGUAGES.includes(handedOff)) return handedOff;
    }
    const saved = (storage === undefined ? globalThis.localStorage : storage)?.getItem(LANGUAGE_STORAGE_KEY);
    return UI_LANGUAGES.includes(saved) ? saved : 'pl';
  } catch {
    return 'pl';
  }
}

// Public copy loads before first render; workspace copy is awaited by route
// loaders. Language changes await the currently required bundles atomically.
const catalogueLoads = new Map();
let workspaceRequired = false;
const loaders = {
  'en-shell': () => import('./locales/en-shell.js'),
  'pl-workspace': () => import('./locales/pl-workspace.js'),
  'en-workspace': () => import('./locales/en-workspace.js'),
};
async function loadCatalogue(language, kind) {
  const id = `${language}-${kind}`;
  if (!loaders[id]) return;
  if (!catalogueLoads.has(id)) catalogueLoads.set(id, loaders[id]().then(({ default: messages }) => {
    for (const [namespace, values] of Object.entries(messages)) i18n.addResourceBundle(language, namespace, values, true, true);
  }).catch((error) => { catalogueLoads.delete(id); throw error; }));
  return catalogueLoads.get(id);
}
async function ensureLanguage(language) {
  await loadCatalogue(language, 'shell');
  if (workspaceRequired) await loadCatalogue(language, 'workspace');
}
export async function ensureWorkspaceMessages() {
  workspaceRequired = true;
  await languageReady;
  await ensureLanguage(getUiLanguage());
}
export const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  resources: { pl },
  lng: 'pl',
  fallbackLng: 'pl',
  supportedLngs: UI_LANGUAGES,
  defaultNS: 'common',
  keySeparator: false,
  initImmediate: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** Read language when starting an operation, not when constructing a client. */
export function getUiLanguage() { return i18n.resolvedLanguage === 'en' ? 'en' : 'pl'; }
export function getUiLocale() { return getUiLanguage() === 'en' ? 'en-GB' : 'pl-PL'; }

/** Translate application-owned copy only; never pass authored CV text here. */
export function t(key, params) { return i18n.t(key, params); }

/**
 * A readonly presentation list resolves copy at access time. Module-level
 * registries may be frozen; evaluating their labels during import would pin
 * pricing highlights and template descriptions to the initial language.
 */
export function localisedList(values) {
  const list = new Array(values.length);
  values.forEach((value, index) => Object.defineProperty(list, index, {
    enumerable: true, configurable: false,
    get: () => typeof value === 'function' ? value() : value,
  }));
  return Object.freeze(list);
}

function reflectLanguage() {
  const language = getUiLanguage();
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  try { globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Private browsing may deny storage; the in-memory choice still works. */ }
}
const preferredLanguage = initialLanguage();
i18n.on('languageChanged', reflectLanguage);
export const languageReady = preferredLanguage === 'en'
  ? ensureLanguage('en').then(() => i18n.changeLanguage('en'))
  : Promise.resolve().then(reflectLanguage);

/** Change presentation without navigating, remounting providers or saving a CV. */
let languageRequest = 0;
export async function setUiLanguage(language) {
  const request = ++languageRequest;
  const selected = UI_LANGUAGES.includes(language) ? language : 'pl';
  await ensureLanguage(selected);
  // A slower download cannot override a newer explicit selection.
  if (request === languageRequest) return i18n.changeLanguage(selected);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LANGUAGE_STORAGE_KEY && UI_LANGUAGES.includes(event.newValue)
      && event.newValue !== getUiLanguage()) void setUiLanguage(event.newValue);
  });
}
