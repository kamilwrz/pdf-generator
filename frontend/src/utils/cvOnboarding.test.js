import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeOnboarding, saveOnboarding, loadOnboarding, clearOnboarding, onboardingSteps } from './cvOnboarding.js';
import { postAuthPath, safeReturnTo } from './siteRoutes.js';
import { clearLocalAccountData } from './authSession.js';
const config = { language: 'en', templateId: 'linden', includePhoto: true, includeTitle: true, contacts: [{ key: 'email', selected: true }], sections: [{ key: 'summary', label: 'Summary', selected: true }] };
const draft = { version: 1, owner: 'anna', step: 'goal', mode: 'existing', goal: 'improve', source: { kind: 'document', id: 41 }, config };
function storage() {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
test('journal retains settings and references but never serializes CV content or files', () => {
  storage();
  saveOnboarding({ ...draft, file: '%PDF', cvData: { name: 'Private name' }, source: { ...draft.source, cv_data: 'Private data' }, config: { ...config, cv_data: 'Private' } });
  const result = loadOnboarding('anna');
  assert.deepEqual(result.config.contacts, config.contacts);
  assert.deepEqual(result.source, draft.source);
  assert.doesNotMatch(localStorage.getItem('cvstudio.onboarding.v1'), /Private|%PDF|cvData|cv_data/);
});
test('account changes cannot adopt another account source; guest choices resume after authentication', () => {
  assert.equal(sanitizeOnboarding(draft, 'other'), null);
  const guest = sanitizeOnboarding({ ...draft, owner: null }, 'anna');
  assert.equal(guest.source, null);
  assert.equal(guest.step, 'source');
  assert.equal(guest.config.templateId, 'linden');
  assert.equal(guest.owner, 'anna');
});
test('invalid versions, source identifiers and damaged storage fail safely', () => {
  assert.equal(sanitizeOnboarding({ ...draft, version: 2 }, 'anna'), null);
  assert.equal(sanitizeOnboarding({ ...draft, config: {} }, 'anna'), null);
  assert.equal(sanitizeOnboarding({ ...draft, source: { kind: 'document', id: '../41' } }, 'anna').step, 'source');
  storage(); localStorage.setItem('cvstudio.onboarding.v1', '{');
  assert.equal(loadOnboarding('anna'), null);
  globalThis.localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.equal(saveOnboarding(draft), false);
  assert.equal(loadOnboarding('anna'), null);
  assert.doesNotThrow(clearOnboarding);
});
test('cancellation and account deletion clear the wizard independently of a guest document', () => {
  storage(); localStorage.setItem('cvstudio.guest.doc', 'guest'); saveOnboarding(draft);
  clearOnboarding(); assert.equal(localStorage.getItem('cvstudio.guest.doc'), 'guest');
  saveOnboarding(draft); clearLocalAccountData(); assert.equal(loadOnboarding('anna'), null);
});
test('progress reflects skipped steps and auth resumption retains allow-listed task intent', () => {
  storage();
  assert.deepEqual(onboardingSteps('blank', 'manual'), ['start', 'template']);
  assert.deepEqual(onboardingSteps('existing', 'manual'), ['start', 'source', 'goal', 'template']);
  assert.deepEqual(onboardingSteps('existing', 'tailor'), ['start', 'source', 'goal']);
  assert.equal(postAuthPath(new URLSearchParams('start=onboarding')), '/cvstudio/guest?start=onboarding');
  assert.equal(safeReturnTo('/app/new?resume=1'), '/app/new?resume=1');
  assert.equal(postAuthPath(new URLSearchParams('returnTo=%2Fapp%2Faccount%3Fpurchase%3Dpro')), '/app/account?purchase=pro');
  assert.equal(safeReturnTo('/app/interview?source=document&sourceId=41&language=en&redirect=https://invalid.test'), '/app/interview?source=document&sourceId=41&language=en');
  assert.equal(safeReturnTo('/app/interview?source=document&sourceId=bad'), null);
});
