import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { completeInterviewFit, prepareInterviewFit, measureFitBudget, fillInterviewPages } from './interviewFit.js';
import { applyFitPack } from './fitToPages.js';
import { applyFlowSpacing } from './sectionStructure.js';
import { measureDocumentPageFills } from './layoutDensity.js';
import { contentMaxPage } from './structureOperation.js';

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

test('single-page filling preserves the complete document', () => {
  const elements = [body];
  assert.equal(fillInterviewPages(elements, {}).elements, elements);
});

const fixture = JSON.parse(readFileSync(new URL('../../e2e/fixtures/interview-fit.json', import.meta.url), 'utf8'));
const spacing = { stack: 4, record: 10, section: 21, after_rule: 8 };

test('reclaims artificial page-break whitespace and fills page one without draining its records', () => {
  // Reproduce the former balancing pass: the fake larger bottom margin
  // unnecessarily moves a complete experience record onto page two.
  const balanced = applyFlowSpacing(fixture.elements, spacing, 842, { bottomMargin: 240 });
  const before = structuredClone(balanced);
  const packed = applyFitPack(balanced, spacing, 842);
  const result = fillInterviewPages(balanced, spacing);
  const fills = measureDocumentPageFills(result.elements, 2);
  assert.equal(contentMaxPage(result.elements), 2);
  assert.ok(fills[0] > .98, `First-page fill: ${fills[0]}`);
  assert.ok(fills[0] - fills[1] > .4, 'A shorter final page is allowed');
  assert.ok(result.spacing.section > spacing.section, 'Use larger gaps when they fit');
  for (const original of packed.filter(el => !el.fixedToPage)) {
    const saved = result.elements.find(el => el.element_id === original.element_id);
    assert.equal(saved.content, original.content);
    assert.ok(saved.page <= original.page, original.element_id);
  }
  assert.deepEqual(balanced, before, 'Trials must not mutate the source');
  assert.deepEqual(applyFitPack(result.elements, result.spacing, 842), result.elements, 'Saved geometry matches its rhythm');
});

test('fills continuation pages in order without adding a page or splitting a record', () => {
  const long = fixture.elements.map(el => el.bulletList ? { ...el, height: el.height * 2 } : el);
  const packed = applyFitPack(long, spacing, 842);
  assert.ok(contentMaxPage(packed) >= 3);
  const result = fillInterviewPages(long, spacing);
  assert.equal(contentMaxPage(result.elements), contentMaxPage(packed));
  const groups = new Map();
  for (const original of packed.filter(el => !el.fixedToPage)) {
    const saved = result.elements.find(el => el.element_id === original.element_id);
    assert.equal(saved.content, original.content);
    assert.ok(saved.page <= original.page);
    if (!saved.flowGroup) continue;
    const pages = groups.get(saved.flowGroup) || new Set();
    pages.add(saved.page);
    groups.set(saved.flowGroup, pages);
  }
  for (const pages of groups.values()) assert.equal(pages.size, 1);
});

test('unavailable browser fonts preserve the server layout without paid shortening', async () => {
  const elements = [{ ...body, page: 2 }];
  const result = await prepareInterviewFit({ template_id: 'linden', spacing_px: {},
    preview: { elements, pages: 2, changes: [field], fit: { allow_shorten: true } } });
  assert.equal(result.action, 'finish');
  assert.equal(result.elements, elements);
  assert.equal(result.required_reduction, 0);
});

const pendingFit = { id: 'session', revision: 4, profile_revision: 2, evidence_scope: 'session',
  template_id: 'linden', phase: 'preview', preview: { profile_revision: 2, fit: { status: 'pending' } } };
const committedFit = { ...pendingFit, revision: 5,
  preview: { profile_revision: 2, fit: { status: 'complete' } } };

test('recovers a lost final response by reading the committed fit without another write', async () => {
  for (const error of [new TypeError('Failed to fetch'), Object.assign(new Error('Timeout'), { name: 'AbortError' }),
    Object.assign(new Error('Gateway unavailable'), { status: 503 })]) {
    const calls = [];
    const send = async (path, method = 'GET') => {
      calls.push([path, method]);
      if (method === 'POST') throw error;
      return committedFit;
    };
    assert.equal(await completeInterviewFit(pendingFit, send, () => true, async () => ({ action: 'finish' })), committedFit);
    assert.deepEqual(calls, [['/ai/interviews/session/preview-fit', 'POST'], ['/ai/interviews/session', 'GET']]);
  }
});

test('never treats an unfinished, stale or unrelated recovery snapshot as successful fitting', async () => {
  const error = new TypeError('Failed to fetch');
  for (const saved of [pendingFit, { ...committedFit, revision: 6 }, { ...committedFit, id: 'other' },
    { ...committedFit, profile_revision: 3 }, { ...committedFit, evidence_scope: 'profile' },
    { ...committedFit, template_id: 'sterling' }, { ...committedFit, phase: 'clarification' },
    { ...committedFit, preview: { profile_revision: 3, fit: { status: 'complete' } } },
    { ...committedFit, preview: { profile_revision: 2, fit: { status: 'restored' } } }, null]) {
    await assert.rejects(completeInterviewFit(pendingFit, async (_path, method) => {
      if (method === 'POST') throw error;
      return saved;
    }, () => true, async () => ({ action: 'finish' })), value => value === error);
  }
});

test('keeps the original error when recovery fails or the workflow closes', async () => {
  const error = new TypeError('Failed to fetch');
  for (const close of [false, true]) {
    let active = true;
    await assert.rejects(completeInterviewFit(pendingFit, async (_path, method) => {
      if (method === 'POST') throw error;
      if (!close) throw new Error('Recovery unavailable');
      active = false;
      return committedFit;
    }, () => active, async () => ({ action: 'finish' })), value => value === error);
  }
});

test('does not recover validation failures or automatically resume interrupted paid shortening', async () => {
  for (const [action, error] of [['finish', Object.assign(new Error('Invalid layout'), { status: 422 })],
    ['shorten', new TypeError('Failed to fetch')]]) {
    let calls = 0;
    await assert.rejects(completeInterviewFit(pendingFit, async () => { calls += 1; throw error; },
      () => true, async () => ({ action })), value => value === error);
    assert.equal(calls, 1);
  }
});
