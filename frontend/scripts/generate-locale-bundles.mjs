/** Generate a small public dictionary and a deferred workspace dictionary. */
import { readFile, writeFile, rename } from 'node:fs/promises';
const publicModules = ['pages/Hero/Hero.jsx', 'pages/Hero/HeroTemplateShowcase.jsx', 'pages/Site/PublicPages.jsx', 'pages/Site/PrivacyPage.jsx', 'components/common/SiteLayout/SiteLayout.jsx', 'components/common/SiteLayout/SitePrimitives.jsx', 'components/common/ErrorBoundary/ErrorBoundary.jsx', 'templates/index.js', 'utils/templateLayouts.js', 'utils/planPresentation.js', 'services/api.js', 'App.jsx'];
const publicKeys = new Set();
for (const module of publicModules) {
  const source = await readFile(new URL(`../src/${module}`, import.meta.url), 'utf8');
  for (const match of source.matchAll(/(?:uiText|messageRef)\(["']([^"']+)["']/g)) publicKeys.add(match[1]);
}
for (const language of ['pl', 'en']) {
  const all = JSON.parse(await readFile(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), 'utf8'));
  const shell = {}, workspace = {};
  for (const [namespace, values] of Object.entries(all)) {
    for (const [key, text] of Object.entries(values)) {
      const target = namespace === 'common' || publicKeys.has(`${namespace}:${key}`) ? shell : workspace;
      (target[namespace] ??= {})[key] = text;
    }
  }
  for (const [suffix, values] of [['shell', shell], ['workspace', workspace]]) {
    const target = new URL(`../src/i18n/locales/${language}-${suffix}.json`, import.meta.url);
    const content = JSON.stringify(values, null, 2) + '\n';
    // Avoid unnecessary HMR and never expose half-written JSON to readers.
    if (await readFile(target, 'utf8').catch(() => null) !== content) {
      const temporary = new URL(`${target.href}.${process.pid}.tmp`);
      await writeFile(temporary, content);
      await rename(temporary, target);
    }
  }
}
