/** Presentation-only grouping. Persistent fact IDs, paths and evidence stay intact. */
import { interviewFields } from './interviewPresentation.js';

export const careerSections = [
  { id: 'identity', label: 'Dane i podsumowanie', short: 'Profil', description: 'Jak się przedstawiasz i jak można się z Tobą skontaktować.' },
  { id: 'experience', label: 'Doświadczenie', short: 'Doświadczenie', description: 'Role, firmy i osiągnięcia — każdy etap kariery w jednym miejscu.' },
  { id: 'education', label: 'Edukacja', short: 'Edukacja', description: 'Uczelnie, kierunki i najważniejsze etapy nauki.' },
  { id: 'skills', label: 'Umiejętności', short: 'Umiejętności', description: 'Narzędzia i kompetencje, które możesz wykorzystać w CV.' },
  { id: 'languages', label: 'Języki', short: 'Języki', description: 'Język i poziom znajomości tworzą jeden wpis.' },
  { id: 'custom_sections', label: 'Projekty i inne', short: 'Projekty', description: 'Projekty, kursy, wolontariat i dodatkowe sekcje.' },
  { id: 'notes', label: 'Z wywiadu i notatki', short: 'Notatki', description: 'Dodatkowe informacje, ograniczenia i sformułowania do wykorzystania.' },
];

const names = { title: 'Stanowisko / nazwa', company: 'Firma', city: 'Miejscowość', period: 'Okres', degree: 'Kierunek / stopień', school: 'Uczelnia', description: 'Opis', subtitle: 'Dodatkowy opis', date: 'Data', name: 'Język', level: 'Poziom', category: 'Kategoria', kind: 'Rodzaj sekcji', placement: 'Położenie sekcji' };

/** Label scalar fields according to their record instead of repeating a section name. */
export function careerFieldLabel(path) {
  if (interviewFields[path]) return interviewFields[path];
  if (/^\/experience\/\d+\/title$/.test(path)) return 'Stanowisko';
  if (/^\/custom_sections\/\d+\/title$/.test(path)) return 'Nazwa sekcji';
  if (/^\/custom_sections\/\d+\/items\/\d+\/title$/.test(path)) return 'Nazwa wpisu';
  if (/\/bullets\/\d+$/.test(path)) return 'Działanie lub osiągnięcie';
  if (/^\/skills\//.test(path) && !path.endsWith('/category')) return 'Umiejętność';
  if (/\/items\/\d+$/.test(path)) return 'Informacja';
  return names[path?.split('/').at(-1)] || 'Informacja';
}

function location(fact) {
  const path = fact.path || '';
  if (interviewFields[path]) return { section: 'identity', key: path === '/summary' ? '/summary' : '/identity', root: '' };
  const match = path.match(/^\/(experience|education|languages|skills|custom_sections)\/(\d+)(.*)$/);
  if (match) {
    const [, section, index, rest] = match;
    if (section === 'skills' && !rest) return { section, key: '/skills-flat', root: '/skills' };
    return { section, key: `/${section}/${index}`, root: `/${section}/${index}` };
  }
  // Contextual notes stay separate from CV records. Matching a company name
  // heuristically could silently associate evidence with the wrong role.
  return { section: 'notes', key: `notes:${fact.context || ''}`, root: '' };
}

/** Group source scalars by record; coalesce only equivalent display rows, never data. */
export function groupCareerFacts(facts) {
  const groups = new Map();
  for (const fact of facts) {
    const loc = location(fact);
    if (!groups.has(loc.key)) groups.set(loc.key, { ...loc, facts: [], fields: [] });
    groups.get(loc.key).facts.push(fact);
  }
  for (const group of groups.values()) {
    const display = new Map();
    for (const fact of group.facts) {
      // Template metadata is retained in persistence but is not career prose.
      if (/^\/custom_sections\/\d+\/(kind|placement)$/.test(fact.path)) continue;
      const key = JSON.stringify([fact.path || '', fact.text, fact.kind, fact.context || '', fact.question || '']);
      if (display.has(key)) display.get(key).ids.push(fact.id);
      else display.set(key, { ...fact, ids: [fact.id], label: careerFieldLabel(fact.path) });
    }
    group.fields = [...display.values()];
    const value = (suffix) => group.facts.find((f) => f.path === `${group.root}/${suffix}`)?.text;
    const section = careerSections.find((s) => s.id === group.section);
    group.title = group.section === 'identity' ? (group.key === '/summary' ? 'Podsumowanie zawodowe' : group.facts.find((f) => f.path === '/name')?.text || 'Dane osobowe i kontakt')
      : group.section === 'notes' ? group.facts.find((f) => f.question)?.question || group.facts[0].context || 'Dodatkowe informacje'
        : value('title') || value('degree') || value('name') || value('category') || section.label;
    const projectNames = group.facts.filter((f) => /\/items\/\d+\/title$/.test(f.path));
    if (group.section === 'custom_sections' && projectNames.length === 1) group.title = projectNames[0].text;
    group.subtitle = group.section === 'notes' && group.facts.some((f) => f.question)
      ? group.facts[0].context
      : [value('company'), value('school'), value('city'), value('period'), value('level')].filter(Boolean).join(' · ');
    group.preview = group.fields.filter((f) => /\/bullets\/|\/items\//.test(f.path) || !f.path || f.path === '/summary' || group.key === '/skills-flat').map((f) => f.text).filter(Boolean).slice(0, 3).join(' · ');
    const paths = group.fields.map((f) => f.path).filter(Boolean);
    group.conflicts = new Set(paths.filter((path, i) => paths.indexOf(path) !== i));
  }
  return [...groups.values()];
}

function nextIndex(facts, root) {
  const indices = facts.map((f) => f.path?.startsWith(`${root}/`) ? Number(f.path.slice(root.length + 1).split('/')[0]) : -1).filter(Number.isInteger);
  return Math.max(-1, ...indices) + 1;
}

/** Create an explicit user-requested record without changing any existing paths. */
export function newCareerRecord(facts, section) {
  const root = `/${section}/${nextIndex(facts, `/${section}`)}`;
  const make = (path, text = '') => ({ id: crypto.randomUUID(), text, context: '', kind: 'fact', path, source: 'manual' });
  if (Number(root.split('/').at(-1)) > 99) return [];
  if (section === 'experience') return [make(`${root}/title`)];
  if (section === 'education') return [make(`${root}/degree`)];
  if (section === 'languages') return [make(`${root}/name`)];
  if (section === 'skills') return [make(root)];
  if (section === 'custom_sections') return [make(`${root}/title`, 'Projekty'), make(`${root}/kind`, 'projects'), make(`${root}/items/0/title`)];
  const missing = Object.keys(interviewFields).find((path) => !facts.some((f) => f.path === path));
  return [make(section === 'identity' && missing ? missing : '')];
}

/** Available insertions are constrained to the selected record's existing shape. */
export function careerFieldOptions(group, facts) {
  let options = [];
  if (group.section === 'identity') options = Object.entries(interviewFields).map(([path, label]) => ({ path, label }));
  if (group.section === 'experience') options = ['title', 'company', 'city', 'period'].map((key) => ({ path: `${group.root}/${key}`, label: names[key] }));
  if (group.section === 'education') options = ['degree', 'school', 'city', 'period', 'description'].map((key) => ({ path: `${group.root}/${key}`, label: names[key] }));
  if (group.section === 'languages') options = ['name', 'level'].map((key) => ({ path: `${group.root}/${key}`, label: names[key] }));
  if (['experience', 'education'].includes(group.section)) options.push({ path: `${group.root}/bullets/${nextIndex(facts, `${group.root}/bullets`)}`, label: 'Działanie lub osiągnięcie' });
  if (group.section === 'skills') {
    const root = group.key === '/skills-flat' ? '/skills' : `${group.root}/items`;
    options.push({ path: `${root}/${nextIndex(facts, root)}`, label: 'Umiejętność' });
  }
  if (group.section === 'custom_sections') {
    const itemRoots = [...new Set(group.facts.map((f) => f.path.match(/^(\/custom_sections\/\d+\/items\/\d+)\//)?.[1]).filter(Boolean))];
    for (const root of itemRoots) {
      const title = facts.find((f) => f.path === `${root}/title`)?.text || 'Wpis';
      for (const key of ['title', 'subtitle', 'date', 'description']) options.push({ path: `${root}/${key}`, label: `${title} — ${names[key]}` });
      options.push({ path: `${root}/bullets/${nextIndex(facts, `${root}/bullets`)}`, label: `${title} — osiągnięcie` });
    }
  }
  if (group.section === 'notes') options.push({ path: '', label: 'Dodatkowa informacja' });
  return options.filter((o) => (!o.path || !facts.some((f) => f.path === o.path)) && !/\/\d{3,}(?:\/|$)/.test(o.path));
}
