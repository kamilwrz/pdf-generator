import { t as uiText } from "../i18n/index.js";
/** Presentation-only grouping. Persistent fact IDs, paths and evidence stay intact. */
import { interviewFields } from './interviewPresentation.js';

export const careerSections = [
  { id: 'identity', get label() { return uiText("editor:careerProfileView.detailsAndSummary"); }, short: 'Profil', get description() { return uiText("editor:careerProfileView.howYouIntroduceYourselfAndHowTo"); } },
  { id: 'experience', get label() { return uiText("interview:cvContent.experience"); }, get short() { return uiText("interview:cvContent.experience"); }, get description() { return uiText("editor:careerProfileView.rolesCompaniesAndAchievementsEachCareerStage"); } },
  { id: 'education', get label() { return uiText("interview:cvContent.education"); }, get short() { return uiText("interview:cvContent.education"); }, get description() { return uiText("editor:careerProfileView.institutionsSubjectsAndKeyLearningStages"); } },
  { id: 'skills', get label() { return uiText("interview:cvContent.skills"); }, get short() { return uiText("interview:cvContent.skills"); }, get description() { return uiText("editor:careerProfileView.toolsAndAbilitiesYouCanUseIn"); } },
  { id: 'languages', get label() { return uiText("interview:cvContent.languages"); }, get short() { return uiText("interview:cvContent.languages"); }, get description() { return uiText("editor:careerProfileView.aLanguageAndItsProficiencyLevelForm"); } },
  { id: 'custom_sections', get label() { return uiText("editor:careerProfileView.projectsAndOtherInformation"); }, get short() { return uiText("editor:careerProfileView.projects"); }, get description() { return uiText("editor:careerProfileView.projectsCoursesVolunteeringAndAdditionalSections"); } },
  { id: 'notes', get label() { return uiText("editor:careerProfileView.fromInterviewAndNotes"); }, short: 'Notatki', get description() { return uiText("editor:careerProfileView.additionalInformationConstraintsAndWordingToUse"); } },
];

const names = { get title() { return uiText("editor:careerProfileView.jobTitleName"); }, get company() { return uiText("editor:careerProfileView.company"); }, get city() { return uiText("editor:careerProfileView.location"); }, get period() { return uiText("editor:careerProfileView.period"); }, get degree() { return uiText("editor:careerProfileView.subjectDegree"); }, school: 'Uczelnia', get description() { return uiText("editor:careerProfileView.description"); }, get subtitle() { return uiText("editor:careerProfileView.additionalDescription"); }, date: 'Data', get name() { return uiText("editor:careerProfileView.language"); }, get level() { return uiText("editor:careerProfileView.level"); }, category: 'Kategoria', get kind() { return uiText("editor:careerProfileView.sectionType"); }, get placement() { return uiText("editor:careerProfileView.sectionPosition"); } };

/** Label scalar fields according to their record instead of repeating a section name. */
export function careerFieldLabel(path) {
  if (interviewFields[path]) return interviewFields[path];
  if (/^\/experience\/\d+\/title$/.test(path)) return uiText("editor:templatesModal.jobTitle");
  if (/^\/custom_sections\/\d+\/title$/.test(path)) return uiText("editor:careerProfileView.sectionName");
  if (/^\/custom_sections\/\d+\/items\/\d+\/title$/.test(path)) return uiText("editor:careerProfileView.entryName");
  if (/\/bullets\/\d+$/.test(path)) return uiText("editor:careerProfileView.activityOrAchievement");
  if (/^\/skills\//.test(path) && !path.endsWith('/category')) return uiText("ai:scopedAiReview.skill");
  if (/\/items\/\d+$/.test(path)) return 'Informacja';
  return names[path?.split('/').at(-1)] || 'Informacja';
}

/** Legacy unbound intake notes lack src- IDs; extracted source fields retain them. */
export function isCareerNote(fact) {
  return Boolean((!fact.path && !fact.id.startsWith('src-')) || fact.question || (fact.kind && fact.kind !== 'fact') || (fact.source || 'manual') === 'manual' ||
    (!fact.id.startsWith('src-') && !/^(document|import):/.test(fact.source || '')));
}

/** Compare note content without optional defaults, field bindings or array order. */
export function careerNoteSignature(facts) {
  return JSON.stringify(facts.filter(isCareerNote).map((fact) => [fact.id, fact.text, fact.context || '', fact.question || '', fact.kind || 'fact', fact.source || 'manual']).sort((a, b) => a[0].localeCompare(b[0])));
}

function location(fact, sourceProfile) {
  const path = fact.path || '';
  // Notes and answers have their own section in both account and interview
  // review. Their stored paths remain untouched for generation and clarification.
  if (sourceProfile && isCareerNote(fact)) return { section: 'notes', key: `notes:${fact.question || fact.context || ''}`, root: '' };
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
export function groupCareerFacts(facts, { sourceProfile = false } = {}) {
  const groups = new Map();
  for (const fact of facts) {
    const loc = location(fact, sourceProfile);
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
    group.title = group.section === 'identity' ? (group.key === '/summary' ? uiText("editor:careerProfileView.professionalSummary") : group.facts.find((f) => f.path === '/name')?.text || uiText("editor:careerProfileView.personalAndContactDetails"))
      : group.section === 'notes' ? group.facts.find((f) => f.question)?.question || group.facts[0].context || uiText("editor:careerProfileView.additionalInformation2")
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
