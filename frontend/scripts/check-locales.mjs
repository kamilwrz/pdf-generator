/** Release gate for message keys, parameters and CLDR plural families. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const forms = /_(zero|one|two|few|many|other)$/;
const params = (text) => [...text.matchAll(/{{\s*([^},]+)(?:,[^}]+)?\s*}}/g)].map((m) => m[1].trim()).sort();
export function validateCatalogues(catalogues) {
  const failures = [];
  const reference = catalogues.pl;
  for (const [locale, catalogue] of Object.entries(catalogues)) {
    const namespaces = new Set([...Object.keys(reference), ...Object.keys(catalogue)]);
    for (const ns of namespaces) {
      const source = reference[ns] || {};
      const target = catalogue[ns] || {};
      const keys = new Set([...Object.keys(source), ...Object.keys(target)]);
      const families = new Set();
      for (const key of keys) {
        if (forms.test(key)) { families.add(key.replace(forms, '')); continue; }
        if (typeof target[key] !== 'string' || !target[key].trim()) failures.push(`${locale}:${ns}:${key}: missing or empty`);
        if (!(key in source)) failures.push(`${locale}:${ns}:${key}: unknown key`);
        if (typeof target[key] === 'string' && typeof source[key] === 'string'
            && JSON.stringify(params(target[key])) !== JSON.stringify(params(source[key]))) failures.push(`${locale}:${ns}:${key}: parameter mismatch`);
      }
      for (const family of families) {
        const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
        const expectedParams = params(source[`${family}_other`] || '');
        for (const form of required) {
          const value = target[`${family}_${form}`];
          if (typeof value !== 'string' || !value.trim()) failures.push(`${locale}:${ns}:${family}_${form}: missing plural`);
          else if (JSON.stringify(params(value)) !== JSON.stringify(expectedParams)) failures.push(`${locale}:${ns}:${family}_${form}: parameter mismatch`);
        }
      }
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalogues = Object.fromEntries(await Promise.all(['pl', 'en'].map(async (locale) => [locale,
    JSON.parse(await readFile(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8'))])));
  const failures = validateCatalogues(catalogues);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('PL/EN translation keys, parameters and plural families are complete.');
}
