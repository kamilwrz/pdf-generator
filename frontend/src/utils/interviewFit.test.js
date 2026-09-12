import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeInterviewFit, prepareInterviewFit, measureFitBudget, balanceInterviewPages } from './interviewFit.js';

const field = { path: '/summary', value: 'Report preparation', evidence_refs: ['source'] };
const body = { category: 'textarea', element_id: 'body', content: field.value, page: 1, top: 100, height: 400 };

test('uses actual editable prose and ignores footers, headings and locked framing', () => {
  const elements = [body,
    { category: 'text', content: 'EDUCATION', page: 2, top: 66, height: 40, flowRole: 'section-chrome' },
    { category: 'text', page: 2, top: 800, height: 20, fixedToPage: true }];
  assert.deepEqual(measureFitBudget(elements, [field], 1), { editable_height: 400, required_reduction: .1 });
  assert.equal(measureFitBudget(elements, [field], 1, [{ id: 'source', kind: 'framing' }]).required_reduction, 1);
});

test('does not count unrelated source prose as reducible space', () => {
  assert.equal(measureFitBudget([{ ...body, content: 'Education and languages' }], [field], 1).editable_height, 0);
});

test('three shortening steps retain server revisions and then commit once', async () => {
  const calls = [];
  const initial = { id: 'session', revision: 4, profile_revision: 2, evidence_scope: 'session', phase: 'preview', preview: { fit: { status: 'pending', attempts: 0 } } };
  const send = async (path, method, data) => {
    calls.push({ path, method, data });
    return { ...initial, revision: data.revision + 1, preview: { fit: { status: data.action === 'finish' ? 'complete' : 'pending', attempts: calls.length } } };
  };
  const final = await completeInterviewFit(initial, send, () => true,
    async s => ({ action: s.preview.fit.attempts < 3 ? 'shorten' : 'finish' }));
  assert.deepEqual(calls.map(c => c.data.action), ['shorten', 'shorten', 'shorten', 'finish']);
  assert.deepEqual(calls.map(c => c.data.revision), [4, 5, 6, 7]);
  assert.equal(final.preview.fit.status, 'complete');
});

test('does not run paid steps after unmount, on clarification, or for finished previews', async () => {
  const fail = async () => { throw new Error('Unexpected request'); };
  for (const [phase, status, current] of [['preview', 'pending', false], ['clarification', 'pending', true], ['preview', 'complete', true]]) {
    await completeInterviewFit({ phase, preview: { fit: { status } } }, fail, () => current, fail);
  }
});

test('single-page balance preserves the complete document', () => {
  const elements = [body];
  assert.equal(balanceInterviewPages(elements, {}), elements);
});

test('unavailable browser fonts preserve the server layout without paid shortening', async () => {
  const elements = [{ ...body, page: 2 }];
  const result = await prepareInterviewFit({ template_id: 'linden', spacing_px: {},
    preview: { elements, pages: 2, changes: [field], fit: { allow_shorten: true } } });
  assert.equal(result.action, 'finish');
  assert.equal(result.elements, elements);
  assert.equal(result.required_reduction, 0);
});
