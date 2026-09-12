import { t as uiText } from "../i18n/index.js";
/** Owned career/interview requests. Retries retain server operation identity. */
import { ApiClient } from './api';
import { getAccessToken } from '../utils/authSession';
import { isCareerNote } from '../utils/careerProfileView';

/** Read the current token on every request so session renewal needs no remount. */
export function interviewRequest(path, method = 'GET', data, key) {
  const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
  // Initial generation includes three provider calls; a shortening pair has
  // two. Each is capped server-side at 540 seconds, with settlement headroom.
  // Free fit writes keep the ordinary limit. Paid calls are never auto-retried.
  const isGeneration = method === 'POST' && /^\/ai\/interviews\/[^/]+\/preview$/.test(path);
  const isFit = method === 'POST' && /\/preview-fit$/.test(path) && data?.action === 'shorten';
  const timeoutMs = isGeneration ? 3 * 540_000 + 60_000 : isFit ? 2 * 540_000 + 60_000 : 180_000;
  return api.httpRequest(path, method, data === undefined ? undefined : JSON.stringify(data),
    uiText("interview:interviews.couldNotSaveTheInterviewYourAnswers"), {
      timeoutMs, retries: 0, retryOnTimeout: false,
      ...(key ? { headers: { 'Idempotency-Key': key } } : {}),
    });
}

/** Resolve session evidence before rendering; legacy sessions fail closed. */
export function interviewEvidence(profile, session) {
  if (!session || session.evidence_scope === 'profile') return profile;
  return session.evidence_profile || { revision: 0, facts: [] };
}

/** Merge proposals into the selected store; never mix candidates implicitly. */
export function reviewFacts(profile, session) {
  const facts = [...(interviewEvidence(profile, session)?.facts || [])];
  for (const proposed of session?.proposed_facts || []) {
    // Clarifications retain their source ID: review the replacement in place,
    // without retaining the obsolete assertion as a second career fact.
    const index = facts.findIndex((fact) => fact.id === proposed.id);
    if (index >= 0) facts[index] = proposed;
    else if (!facts.some((fact) => fact.text === proposed.text && fact.path === proposed.path && fact.kind === proposed.kind && fact.context === proposed.context)) {
      facts.push(proposed);
    }
  }
  if (session?.phase === 'intake' && Array.isArray(session.review_source_facts)) {
    // A refreshed snapshot replaces all source fields, including deleted rows.
    // Keep authored notes and confirmed answer bindings; a clarification may
    // deliberately replace a source ID/path and must retain that identity.
    const notes = facts.filter(isCareerNote).map((fact) =>
      !fact.question && fact.kind === 'fact' && (fact.source || 'manual') === 'manual'
        ? { ...fact, path: '' } : fact);
    const source = session.review_source_facts.filter((fact) => !notes.some((note) =>
      note.id === fact.id || note.kind === 'fact' && note.path && note.path === fact.path));
    return [...source, ...notes];
  }
  return facts;
}
