/** Browser-local setup choices. CV content and upload bytes never enter this record. */
export const ONBOARDING_KEY = 'cvstudio.onboarding.v1';
const steps = new Set(['start', 'source', 'goal', 'template']);
const goals = new Set(['manual', 'improve', 'tailor']);

/** Validate untrusted storage and bind source references to the current account. */
export function sanitizeOnboarding(value, owner) {
  if (!value || value.version !== 1 || !steps.has(value.step)) return null;
  if (value.owner !== owner && value.owner !== null) return null;
  const source = value.owner === owner && ['document', 'import'].includes(value.source?.kind)
    && Number.isSafeInteger(value.source.id) && value.source.id > 0
    ? { kind: value.source.kind, id: value.source.id } : null;
  const config = value.config;
  if (!config || !['pl', 'en'].includes(config.language) || typeof config.templateId !== 'string'
    || !Array.isArray(config.contacts) || !Array.isArray(config.sections)) return null;
  // Copy only setup fields. Never persist a response object through object spread.
  return {
    version: 1, owner, step: !source && ['goal', 'template'].includes(value.step) && value.mode === 'existing' ? 'source' : value.step,
    mode: value.mode === 'existing' ? 'existing' : 'blank', goal: goals.has(value.goal) ? value.goal : 'manual', source,
    config: { language: config.language, templateId: config.templateId.slice(0, 80), includeTitle: Boolean(config.includeTitle), includePhoto: Boolean(config.includePhoto),
      contacts: config.contacts.slice(0, 10).filter(item => typeof item?.key === 'string').map(item => ({ key: item.key.slice(0, 40), selected: Boolean(item.selected) })),
      sections: config.sections.slice(0, 40).filter(item => typeof item?.key === 'string' && typeof item?.label === 'string').map(item => ({ key: item.key.slice(0, 100), label: item.label.slice(0, 160), selected: Boolean(item.selected), custom: Boolean(item.custom) })),
    },
    importKey: typeof value.importKey === 'string' ? value.importKey.slice(0, 100) : null,
    tailoringId: typeof value.tailoringId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.tailoringId) ? value.tailoringId : null,
  };
}

/** Restore only choices belonging to this visitor; storage failure does not block setup. */
export function loadOnboarding(owner) {
  try { return sanitizeOnboarding(JSON.parse(localStorage.getItem(ONBOARDING_KEY)), owner); } catch { return null; }
}

/** Persist the validated setup journal; returns false when browser storage is unavailable. */
export function saveOnboarding(value) {
  try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(sanitizeOnboarding(value, value.owner))); return true; } catch { return false; }
}

/** Clear only this workflow, preserving the user's independent editor draft. */
export function clearOnboarding() {
  try { localStorage.removeItem(ONBOARDING_KEY); } catch { /* Memory-only setup remains usable. */ }
}

/** The rail lists actual work; blank creation has no source or AI-goal questions. */
export function onboardingSteps(mode, goal) {
  return mode === 'blank' ? ['start', 'template'] : goal === 'manual'
    ? ['start', 'source', 'goal', 'template'] : ['start', 'source', 'goal'];
}
