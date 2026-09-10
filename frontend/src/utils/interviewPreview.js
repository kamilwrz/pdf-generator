import { groupCareerFacts } from './careerProfileView.js';
import { interviewFields } from './interviewPresentation.js';

/** Group complete preview records without changing the renderer payload or evidence. */
export function previewRecords(data, changes = []) {
  const facts = [];
  function visit(value, path) {
    if (typeof value === 'string' && value.trim()) facts.push({ id: path, path, text: value, kind: 'fact' });
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => visit(child, `${path}/${key}`));
  }
  Object.entries(data || {}).forEach(([key, value]) => {
    if (interviewFields[`/${key}`] || ['experience', 'education', 'skills', 'languages', 'custom_sections'].includes(key)) visit(value, `/${key}`);
  });
  // Include removed/unknown fields in the changes view even if absent from the result.
  changes.forEach((change, i) => { if (!facts.some((f) => f.path === change.path)) facts.push({ id: `change-${i}`, path: change.path, text: change.value, kind: 'fact' }); });
  return groupCareerFacts(facts).map((group) => ({ ...group, changes: changes.filter((change) => group.facts.some((f) => f.path === change.path)) }));
}

/** Select one complete record for semantic reading; the full CV remains untouched. */
export function recordContent(data, group) {
  if (!group) return {};
  if (group.key === '/summary') return { summary: data.summary };
  if (group.section === 'identity') return Object.fromEntries(Object.entries(data).filter(([key]) => interviewFields[`/${key}`] && key !== 'summary'));
  if (group.key === '/skills-flat') return { skills: data.skills };
  const index = Number(group.root.split('/').at(-1));
  return { [group.section]: data[group.section]?.[index] ? [data[group.section][index]] : [] };
}
