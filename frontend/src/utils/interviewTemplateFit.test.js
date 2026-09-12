import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMPACT_FLOW_SPACING } from './flowSpacing.js';
import { applyFlowSpacing } from './sectionStructure.js';
import { contentMaxPage } from './structureOperation.js';
import { measureInterviewTemplateCandidate, measureInterviewTemplateCandidates } from './interviewTemplateFit.js';

const text = (id, extra = {}) => ({ element_id: id, category: 'textarea', content: 'Verified content',
  page: 1, left: 240, top: 100, width: 300, height: 18, fontSize: 10, lineHeight: 12,
  fontFamily: 'Inter', flowRole: 'body', ...extra });
const candidate = (id = 'linden', elements = [text('body')]) => ({ template_id: id, elements,
  pages: 2, spacing_px: { stack: 4, record: 10, section: 21, after_rule: 8 } });
const response = (candidates) => ({ revision: 4, profile_revision: 2, evidence_scope: 'session', target_pages: 1, candidates });
const line = (element) => ({ text: element.content, xOffset: 0,
  advanceWidth: Math.min(Number(element.width), String(element.content).length * 3) });
const resolved = async (elements) => elements.map(element => element.category === 'textarea'
  ? { ...element, resolvedLines: [line(element)] } : element);
const options = { resolveLayouts: resolved, measureTextWidth: value => String(value).length * 3 };

test('explicitly uses S and compact spacing even when M starts on one page', async () => {
  const original = candidate();
  const snapshot = structuredClone(original);
  const result = await measureInterviewTemplateCandidate(original, options);
  assert.equal(result.pages, 1);
  assert.equal(result.typography_preset, 'S');
  assert.deepEqual(result.spacing_px, COMPACT_FLOW_SPACING);
  assert.ok(result.elements[0].fontSize < original.elements[0].fontSize);
  assert.equal(result.elements[0].content, original.elements[0].content);
  assert.equal('resolvedLines' in result.elements[0], false);
  assert.deepEqual(original, snapshot);
});

test('many measured fields fit one page without accumulating heuristic box padding', async () => {
  const elements = [{ element_id: 'heading', category: 'text', flowRole: 'section-chrome',
    content: 'EXPERIENCE', left: 245, top: 75, fontFamily: 'Inter', fontSize: 10, width: 200 },
  ...Array.from({ length: 33 }, (_, index) => text(`field-${index}`, {
    content: `Verified field ${index}`, flowGroup: `record-${index}`, left: 245,
    top: 100 + index * 18, width: 280,
  }))];
  const result = await measureInterviewTemplateCandidate(candidate('linden', elements), options);
  assert.equal(result.pages, 1);
  assert.equal(result.elements.length, elements.length);
  for (const original of elements) {
    const measured = result.elements.find(element => element.element_id === original.element_id);
    assert.equal(measured.content, original.content);
    if (measured.category === 'textarea') assert.equal(measured.height, Math.ceil(measured.lineHeight));
  }
  // Thirty-three valid one-line records fit with their actual line boxes.
  // Reintroducing the old per-field allowance manufactures a second page.
  const inflated = result.elements.map(element => element.category === 'textarea'
    ? { ...element, height: element.height + 6 } : element);
  assert.equal(contentMaxPage(applyFlowSpacing(inflated, COMPACT_FLOW_SPACING, 842)), 2);
});

test('unknown template is a measurement failure, never a default-font promise', async () => {
  await assert.rejects(measureInterviewTemplateCandidate(candidate('unknown'), options), /support small typography/);
});

test('missing browser fonts never certify the server page count', async () => {
  await assert.rejects(measureInterviewTemplateCandidate({ ...candidate(), pages: 1 }), /fonts could not be measured/);
});

test('font readiness includes masthead and fixed footer, and ignores stale line metadata', async () => {
  for (const missing of ['name', 'footer']) {
    const elements = [text('body'), text('name', { flowRole: 'masthead', top: 40 }),
      text('footer', { fixedToPage: true, top: 805, width: 300 })];
    elements.forEach(element => { element.resolvedLines = [line(element)]; });
    await assert.rejects(measureInterviewTemplateCandidate(candidate('linden', elements), {
      ...options,
      resolveLayouts: async source => {
        assert.ok(source.every(element => !element.resolvedLines));
        return (await resolved(source)).map(element => element.element_id === missing
          ? { ...element, resolvedLines: undefined } : element);
      },
    }), /fonts could not be measured/);
  }
});

test('rechecks browser font measurement after S changes and later packing passes', async () => {
  let calls = 0;
  await assert.rejects(measureInterviewTemplateCandidate(candidate(), {
    ...options, resolveLayouts: async source => (++calls === 3 ? source : resolved(source)),
  }), /fonts could not be measured/);
  assert.equal(calls, 3);
});

test('rejects text rewriting or omission instead of presenting a shorter recommendation', async () => {
  await assert.rejects(measureInterviewTemplateCandidate(candidate(), {
    ...options,
    resolveLayouts: async source => resolved(source.map(element => ({ ...element, content: 'Changed content' }))),
  }), /changed content/);
  await assert.rejects(measureInterviewTemplateCandidate(candidate(), {
    ...options, resolveLayouts: async () => [],
  }), /changed content/);
});

test('rejects clipped text and visible text collisions', async () => {
  for (const elements of [
    [text('name', { flowRole: 'masthead', top: 836 })],
    [text('first', { flowRole: 'masthead' }), text('second', { flowRole: 'masthead' })],
  ]) {
    await assert.rejects(measureInterviewTemplateCandidate(candidate('linden', elements), options), /clear one-page layout/);
  }
});

test('alignment boxes may overlap when their browser-painted glyphs do not', async () => {
  const result = await measureInterviewTemplateCandidate(candidate('linden', [
    text('first', { flowRole: 'masthead', content: 'Title' }),
    text('second', { flowRole: 'masthead', content: 'Date' }),
  ]), { ...options, resolveLayouts: async source => (await resolved(source)).map(element => ({
    ...element, resolvedLines: element.resolvedLines.map(record => ({ ...record,
      xOffset: element.element_id === 'second' ? 240 : 0 })),
  })) });
  assert.equal(result.pages, 1);
});

test('a page count alone cannot certify text crossing its width or an embedded photo', async () => {
  await assert.rejects(measureInterviewTemplateCandidate(candidate(), { ...options,
    resolveLayouts: async source => (await resolved(source)).map(element => ({ ...element,
      resolvedLines: [{ ...line(element), advanceWidth: 900 }] })),
  }), /clear one-page layout/);
  await assert.rejects(measureInterviewTemplateCandidate(candidate('linden', [
    text('name', { flowRole: 'masthead' }),
    { element_id: 'photo', category: 'image', src: '/photo.png', flowRole: 'masthead-anchor',
      page: 1, left: 240, top: 100, width: 30, height: 30 },
  ]), options), /clear one-page layout/);
});

test('a genuinely longer packed document is absent without becoming a measurement failure', async () => {
  const elements = [text('first', { content: 'Long text', height: 680 }),
    text('second', { page: 2, content: 'More long text', height: 680 })];
  const result = await measureInterviewTemplateCandidate(candidate('linden', elements), {
    ...options, resolveLayouts: async source => source.map(element => ({ ...element,
      resolvedLines: Array.from({ length: 55 }, () => line(element)) })),
  });
  assert.equal(result, null);
});

test('collects every verified alternative while keeping per-template failures separate', async () => {
  const progress = [];
  const result = await measureInterviewTemplateCandidates(response([
    candidate('fits-first'), candidate('failed-font'), candidate('too-long'), candidate('fits-last'),
  ]), { onProgress: value => progress.push(value), measureCandidate: async item => {
    if (item.template_id === 'failed-font') throw new Error('Missing font.');
    return item.template_id === 'too-long' ? null : { ...item, pages: 1 };
  } });
  assert.deepEqual(result.candidates.map(item => item.template_id), ['fits-first', 'fits-last']);
  assert.deepEqual(result.failedTemplateIds, ['failed-font']);
  assert.equal(result.cancelled, false);
  assert.deepEqual(progress.at(-1), { completed: 4, total: 4, templateId: 'fits-last' });
});

test('cooperative cancellation removes stale successes and stops later templates', async () => {
  let current = true;
  let calls = 0;
  const result = await measureInterviewTemplateCandidates(response([candidate('first'), candidate('second'), candidate('third')]), {
    isCurrent: () => current,
    measureCandidate: async item => {
      calls += 1;
      if (calls === 2) current = false;
      return { ...item, pages: 1 };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { candidates: [], failedTemplateIds: [], cancelled: true });
});

test('cancellation during the font wait prevents S and further measurements', async () => {
  let current = true;
  let calls = 0;
  const result = await measureInterviewTemplateCandidate(candidate(), { ...options, isCurrent: () => current,
    resolveLayouts: async source => { calls += 1; current = false; return resolved(source); },
  });
  assert.equal(calls, 1);
  assert.equal(result, null);
});

test('cached-font scans yield to pending cancellation before the next template', async () => {
  let current = true;
  let calls = 0;
  const result = await measureInterviewTemplateCandidates(response([candidate('first'), candidate('second')]), {
    isCurrent: () => current,
    onProgress: () => setTimeout(() => { current = false; }, 0),
    measureCandidate: async item => { calls += 1; return { ...item, pages: 1 }; },
  });
  assert.equal(calls, 1);
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.candidates, []);
});

test('rejects malformed response and keeps an empty supported-template set valid', async () => {
  await assert.rejects(measureInterviewTemplateCandidates({ candidates: [] }), /Invalid template comparison/);
  assert.deepEqual(await measureInterviewTemplateCandidates(response([])), {
    candidates: [], failedTemplateIds: [], cancelled: false,
  });
});

test('the public template fixture keeps every nonfixed element and verified text', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../../e2e/fixtures/interview-fit.json', import.meta.url), 'utf8'));
  const elements = fixture.elements.map(element => element.bulletList
    ? { ...element, content: '• Verified task' } : element);
  const result = await measureInterviewTemplateCandidate(candidate('linden', elements), options);
  assert.equal(result.pages, 1);
  for (const original of elements.filter(element => !element.fixedToPage)) {
    assert.equal(result.elements.find(element => element.element_id === original.element_id)?.content, original.content);
  }
});
