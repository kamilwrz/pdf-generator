import { t } from '../i18n/index.js';
import { factLabel } from './interviewPresentation.js';

// Technical scope IDs are useful for matching, but never candidate-facing copy.
const readable = value => typeof value === 'string' && !/^(?:\/|general:|note:|requirement:|entry:)/.test(value.trim()) ? value.trim() : '';

/** Resolve a question's display context from the selected interview evidence.
 * Exact record paths preserve distinct roles at the same company and individual
 * custom-section items. Saved server context is a fallback for legacy questions
 * and notes; it must never be used to guess a different record. No data is changed.
 */
export function interviewQuestionContext(question, facts = []) {
  if (!question || question.clarification || question.entry_id?.startsWith('requirement:')) return null;
  const id = question.entry_id || '';
  const match = id.match(/^\/(experience|education|skills|languages)\/\d+$|^\/(custom_sections)\/\d+\/items\/\d+$/);
  const kind = match?.[1] || match?.[2];
  const savedLabel = readable(question.context);
  if (kind) {
    const values = field => [...new Set(facts.filter(f => f.kind !== 'gap' && f.path === `${id}/${field}`).map(f => readable(f.text)).filter(Boolean))].join(' · ');
    const section = factLabel({ path: id });
    const title = values('title') || values('degree') || values('name') || values('category')
      || readable(facts.find(f => f.path === id && f.kind !== 'gap')?.text) || savedLabel || section;
    const detail = [values('company'), values('school'), values('city'), values('period'), values('date'), values('level')].filter(Boolean).join(' · ');
    return { section, title, detail: detail === title ? '' : detail };
  }
  const general = id.match(/^general:(experience|education|skills|languages|custom_sections)$/);
  if (general) return { section: t('interview:questionContext.general'), title: factLabel({ path: `/${general[1]}/0` }), detail: '' };
  if (id.startsWith('note:')) return { section: t('interview:questionContext.notes'), title: savedLabel || t('interview:questionContext.notes'), detail: '' };
  return { section: t('interview:questionContext.subject'), title: savedLabel || t('interview:questionContext.unavailable'), detail: '' };
}
