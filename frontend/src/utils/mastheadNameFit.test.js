import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMastheadNameFontIntent, fitMastheadNames } from './mastheadNameFit.js';
import { applyNameCaseToggle, applyTitleToggle } from './mastheadIdentityOps.js';
import { TEST_TEMPLATES } from '../templates/testTemplatePacks.js';
import { materializeElementSpecs } from './materializeElementSpecs.js';
import { applySlateTextSize } from './slateAppearance.js';
import { applyMonumentTextSize } from './monumentAppearance.js';
import { hydratePersistedCanvasElement } from './persistedCanvasElement.js';
import { hideProfilePhoto, showProfilePhoto } from './profilePhotoVisibility.js';
import { applyChannelRelayout } from './contactBandOps.js';

const measureTextWidth = (text, style) => text.length * style.fontSize * (style.bold ? 0.7 : 0.5)
  + Math.max(0, text.length - 1) * (Number(style.letterSpacing) || 0);
const fit = (elements) => fitMastheadNames(elements, { measureTextWidth });
const nameOf = (elements) => elements.find((element) => element.mastheadRole === 'name');
const replaceName = (elements, patch) => elements.map((element) => element === nameOf(elements)
  ? { ...element, ...patch } : element);
const starter = (id) => {
  let next = 0;
  return materializeElementSpecs(TEST_TEMPLATES.find((template) => template.id === id).elements,
    () => `name-test-${++next}`);
};

for (const template of ['slate', 'monument']) {
  test(`${template}: long names shrink then wrap without losing source text`, () => {
    const original = starter(template);
    const initial = fit(original);
    const sourceName = nameOf(original);
    assert.equal(nameOf(initial).fontSize, sourceName.fontSize);
    assert.equal(fit(initial), initial);
    const content = 'W'.repeat(32);
    const shrunk = fit(replaceName(initial, { content }));
    assert.ok(nameOf(shrunk).fontSize >= 14);
    assert.ok(nameOf(shrunk).fontSize < sourceName.fontSize);
    assert.equal(nameOf(shrunk).nameFit.extraHeight, 0);
    assert.equal(nameOf(shrunk).content, content);

    const longContent = 'W'.repeat(100);
    const wrapped = fit(replaceName(shrunk, { content: longContent }));
    const name = nameOf(wrapped);
    assert.equal(name.fontSize, 14);
    assert.ok(name.height > name.lineHeight);
    assert.equal(name.content, longContent);
    assert.ok(name.left + name.width <= (template === 'slate' ? 547 : 405));
    assert.equal(fit(wrapped), wrapped);
    for (const element of original.filter((element) => element.fixedToPage || element.photoSlot
      || element.flowLane === 'sidebar')) {
      assert.equal(wrapped.find((candidate) => candidate.element_id === element.element_id).top, element.top);
    }
    const restored = fit(replaceName(wrapped, { content: sourceName.content }));
    assert.equal(nameOf(restored).fontSize, sourceName.fontSize);
    assert.equal(nameOf(restored).nameFit.extraHeight, 0);
    for (const element of original) {
      assert.ok(Math.abs(restored.find((candidate) => candidate.element_id === element.element_id).top - element.top) < 0.011);
    }
  });

  test(`${template}: persistence, case, explicit size and hidden title keep fitting reversible`, () => {
    const initial = fit(starter(template));
    const long = fit(replaceName(initial, { content: 'Aleksandra ' + 'W'.repeat(100) }));
    const reloaded = JSON.parse(JSON.stringify(long));
    assert.equal(fit(reloaded), reloaded);
    const bandId = nameOf(long).mastheadBandId;
    const hidden = applyTitleToggle(long, bandId, () => 'new-title').elements;
    const short = fit(replaceName(hidden, { content: 'Anna Nowak' }));
    const shown = applyTitleToggle(short, bandId, () => 'new-title').elements;
    const title = (elements) => elements.find((element) => element.mastheadRole === 'title');
    assert.equal(title(shown).top, title(initial).top);
    const upper = fit(applyNameCaseToggle(long, bandId).elements);
    assert.equal(nameOf(upper).fontSize, 14);
    const changedSize = fit(replaceName(initial, { fontSize: 20 }));
    const longAtNewSize = fit(replaceName(changedSize, { content: 'W'.repeat(100) }));
    const shortAtNewSize = fit(replaceName(longAtNewSize, { content: 'Anna' }));
    assert.equal(nameOf(shortAtNewSize).fontSize, 20);

    const preset = template === 'slate' ? applySlateTextSize : applyMonumentTextSize;
    const small = fit(preset(long, 's'));
    const medium = fit(preset(small, 'm'));
    const shortAfterPreset = fit(replaceName(medium, { content: 'Anna' }));
    assert.equal(nameOf(shortAfterPreset).fontSize, nameOf(initial).fontSize);
  });
}

test('other templates and unmanaged freeform text retain their authored geometry', () => {
  for (const template of TEST_TEMPLATES.filter((template) => !['slate', 'monument'].includes(template.id))) {
    assert.equal(fit(template.elements), template.elements);
  }
  const freeform = [{ category: 'text', content: 'W'.repeat(100), fontSize: 24 }];
  assert.equal(fit(freeform), freeform);
});

test('an authored narrower frame stays bounded across repeated fitting', () => {
  const initial = replaceName(starter('slate'), { width: 170, content: 'W'.repeat(55) });
  const fitted = fit(initial);
  assert.equal(nameOf(fitted).width, 170);
  assert.equal(fit(fitted), fitted);
  assert.equal(nameOf(fit(replaceName(fitted, { content: 'Anna' }))).width, 170);
});

test('explicitly choosing the current fitted size replaces the previous maximum', () => {
  const initial = fit(replaceName(starter('monument'), { content: 'W'.repeat(100) }));
  const chosen = initial.map((element) => element === nameOf(initial)
    ? applyMastheadNameFontIntent(element, { fontSize: 14 }) : element);
  assert.equal(nameOf(fit(replaceName(chosen, { content: 'Anna' }))).fontSize, 14);
});

test('real API extra_properties retain the base size and accumulated line displacement', () => {
  const fitted = fit(replaceName(starter('monument'), { content: 'W'.repeat(100) }));
  const columns = ['element_id', 'category', 'page', 'left', 'top', 'width', 'height',
    'content', 'fontFamily', 'fontSize', 'color', 'src', 'backgroundColor'];
  const loaded = fitted.map((element) => hydratePersistedCanvasElement({
    ...Object.fromEntries(columns.map((key) => [key, element[key]])),
    extra_properties: Object.fromEntries(Object.entries(element).filter(([key]) => !columns.includes(key))),
  }));
  assert.equal(nameOf(fit(loaded)).nameFit.extraHeight, nameOf(fitted).nameFit.extraHeight);
  assert.equal(nameOf(fit(replaceName(loaded, { content: 'Anna' }))).fontSize, 33);
});

test('Slate keeps fitting in the main column while photo-less contacts stay on the rail', () => {
  const original = fit(starter('slate'));
  const hidden = hideProfilePhoto(original, 'slate', () => 'contact-heading');
  const relaid = applyChannelRelayout(hidden.elements, hidden.contactBandId,
    (text) => text.length * 4, () => 'contact').elements;
  const fitted = fit(replaceName(relaid, { content: 'W'.repeat(100) }));
  assert.equal(nameOf(fitted).width, 329);
  assert.equal(nameOf(fitted).fontSize, 14);
  for (const element of relaid.filter((element) => element.contactChannel)) {
    assert.equal(fitted.find((candidate) => candidate.element_id === element.element_id).top, element.top);
  }
  const contact = fitted.find((element) => element.contactBand);
  const initialContact = original.find((element) => element.contactBand);
  assert.equal(contact.profilePhotoMainContactBand.anchor.startY,
    initialContact.contactBand.anchor.startY + nameOf(fitted).nameFit.extraHeight);
  const shown = showProfilePhoto(fitted, 'slate');
  const short = fit(replaceName(shown.elements, { content: 'Anna' }));
  assert.equal(short.find((element) => element.contactBand).contactBand.anchor.startY,
    initialContact.contactBand.anchor.startY);
});

test('a wrapped name repaginates complete main records before they cross the footer', () => {
  const source = starter('monument');
  const name = nameOf(source);
  const identity = source.find((element) => element.mastheadIdentity);
  const contacts = source.filter((element) => element.contactBand || element.contactChannel);
  const elements = [name, identity, ...contacts,
    { element_id: 'heading', category: 'text', content: 'EXPERIENCE', fontSize: 12,
      left: 74, top: 685, page: 1, flowRole: 'section-chrome', editorSectionType: 'experience' },
    { element_id: 'role', category: 'textarea', content: 'Analyst', fontSize: 12, bold: true,
      left: 74, top: 713, width: 400, height: 20, lineHeight: 20, page: 1, flowRole: 'content', flowGroup: 'record' },
    { element_id: 'body', category: 'textarea', content: 'Complete work experience.', fontSize: 10,
      left: 74, top: 738, width: 400, height: 24, lineHeight: 12, page: 1, flowRole: 'content', flowGroup: 'record' }];
  const fitted = fit(replaceName(elements, { content: 'W'.repeat(300) }));
  assert.equal(nameOf(fitted).nameFit.repaginate, true);
  const role = fitted.find((element) => element.element_id === 'role');
  const body = fitted.find((element) => element.element_id === 'body');
  assert.ok(body.top + body.height <= 770);
  assert.equal(role.page, body.page);
  assert.equal(fit(fitted), fitted);
  const short = fit(replaceName(fitted, { content: 'Anna' }));
  assert.ok(short.find((element) => element.element_id === 'body').top + 24 <= 770);
});

test('fitting measures transformed inline styles and accepts exact browser wrap counts', () => {
  const initial = starter('slate');
  const text = 'Müller ' + 'W'.repeat(70);
  const elements = replaceName(initial, { content: text,
    runs: [{ start: 0, end: 6, italic: true }], textTransform: 'uppercase' });
  const calls = [];
  const fitted = fitMastheadNames(elements, {
    measureTextWidth: (value, style) => { calls.push({ value, style }); return measureTextWidth(value, style); },
    measureLines: () => [{}, {}, {}, {}],
  });
  const name = nameOf(fitted);
  assert.equal(name.height, 4 * 16.8);
  assert.equal(name.nameFit.extraHeight, 50.4);
  assert.ok(calls.some(({ value, style }) => value === 'MÜLLER' && style.italic && style.bold));
  assert.deepEqual(name.runs, nameOf(elements).runs);
  assert.equal(name.content, text);
});
