/** Owned career/interview requests. Retries retain server operation identity. */
import { ApiClient } from './api';
import { getAccessToken } from '../utils/authSession';

/** Read the current token on every request so session renewal needs no remount. */
export function interviewRequest(path, method = 'GET', data, key) {
  const api = new ApiClient({ Authorization: `Bearer ${getAccessToken()}` });
  return api.httpRequest(path, method, data === undefined ? undefined : JSON.stringify(data),
    'Nie udało się zapisać wywiadu. Twoje odpowiedzi pozostają dostępne.', {
      timeoutMs: 180_000, retries: 0, retryOnTimeout: false,
      ...(key ? { headers: { 'Idempotency-Key': key } } : {}),
    });
}

/** Merge only explicitly proposed facts; deleted profile data is never restored. */
export function reviewFacts(profile, session) {
  const facts = [...(profile?.facts || [])];
  for (const proposed of session?.proposed_facts || []) {
    if (!facts.some((fact) => fact.id === proposed.id || (fact.text === proposed.text && fact.path === proposed.path))) {
      facts.push(proposed);
    }
  }
  return facts;
}
