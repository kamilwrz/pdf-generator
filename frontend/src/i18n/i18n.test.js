import test from 'node:test';
import assert from 'node:assert/strict';
import { initialLanguage, setUiLanguage, getUiLanguage, getUiLocale, t, localisedList } from './index.js';
import { createDefaultStarterConfig, buildStarterDocument } from '../utils/cvStarter.js';
import { validateCatalogues } from '../../scripts/check-locales.mjs';
import pl from './locales/pl.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

test('language resolution tolerates denied storage and supports verification handoff', () => {
  assert.equal(initialLanguage({ getItem: () => null }), 'pl');
  assert.equal(initialLanguage({ getItem: () => 'de' }), 'pl');
  assert.equal(initialLanguage({ getItem: () => { throw new Error('denied'); } }), 'pl');
  assert.equal(initialLanguage({ getItem: () => 'en' }), 'en');
  assert.equal(initialLanguage({ getItem: () => 'pl' }, { pathname: '/verify-email', search: '?lang=en' }), 'en');
  assert.equal(initialLanguage({ getItem: () => 'pl' }, { pathname: '/', search: '?lang=en' }), 'pl');
});

test('catalogues have complete keys, interpolation parameters and plurals', () => {
  assert.deepEqual(validateCatalogues({ pl, en }), []);
  assert.ok(validateCatalogues({ pl: { common: { test: '{{name}}' } }, en: { common: { test: '{{other}}' } } }).length);
  assert.ok(validateCatalogues({ pl: { common: { test_one: '{{count}}', test_other: '{{count}}' } }, en: { common: {} } }).length);
});

test('a UI switch keeps a started CV and user section names unchanged', async () => {
  await setUiLanguage('en');
  const config = createDefaultStarterConfig();
  assert.equal(config.language, 'en');
  config.sections.push({ key: 'custom-1', label: 'Moja sekcja', custom: true, selected: true });
  const before = JSON.stringify(buildStarterDocument(config));
  const list = localisedList([() => t('common:documentLanguage')]);
  assert.equal(list[0], 'CV language');
  await setUiLanguage('pl');
  assert.equal(list[0], 'Język CV');
  assert.equal(JSON.stringify(buildStarterDocument(config)), before);
  assert.equal(buildStarterDocument(config).cvData.language, 'English');
  assert.equal(createDefaultStarterConfig().language, 'pl');
  assert.equal(getUiLocale(), 'pl-PL');
  await setUiLanguage('en');
  assert.equal(getUiLocale(), 'en-GB');
  assert.equal(buildStarterDocument(createDefaultStarterConfig('pl')).cvData.language, 'Polish');
  await setUiLanguage('unsupported');
  assert.equal(getUiLanguage(), 'pl');
});


test('CLDR plural families support Polish teens and English counts', async () => {
  const { ensureWorkspaceMessages } = await import('./index.js');
  await ensureWorkspaceMessages();
  await setUiLanguage('pl');
  for (const [count, text] of [[1, '1 strona'], [2, '2 strony'], [5, '5 stron'], [12, '12 stron'], [22, '22 strony']]) {
    assert.equal(t('editor:pageCount.label', { count }), text);
  }
  await setUiLanguage('en');
  for (const count of [0, 1, 2, 5, 12, 22]) {
    assert.equal(t('editor:pageCount.label', { count }), `${count} ${count === 1 ? 'page' : 'pages'}`);
  }
  await setUiLanguage('pl');
});

test('freeform seed text follows document language at insertion only', async () => {
  const { createTextElement } = await import('../utils/a4ElementFactories.js');
  await setUiLanguage('en');
  assert.equal(createTextElement({ elementId: 'pl', language: 'Polish' }).content, 'Przykładowy tekst…');
  const english = createTextElement({ elementId: 'en', language: 'English' });
  assert.equal(english.content, 'Sample text…');
  await setUiLanguage('pl');
  assert.equal(english.content, 'Sample text…');
});
