import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCareerFacts, newCareerRecord, careerFieldOptions } from './careerProfileView.js';

const fact = (id, path, text, extra = {}) => ({ id, path, text, context: '', kind: 'fact', source: 'manual', ...extra });

test('a complete role and language remain one record each, without data mutation', () => {
  const facts = [fact('title', '/experience/0/title', 'Analyst'), fact('firm', '/experience/0/company', 'Example'), fact('city', '/experience/0/city', 'Warsaw'), fact('date', '/experience/0/period', '2022–2025'), ...Array.from({ length: 12 }, (_, i) => fact(`b${i}`, `/experience/0/bullets/${i}`, `Achievement ${i}`)), fact('lang', '/languages/0/name', 'German'), fact('level', '/languages/0/level', 'C1')];
  const copy = structuredClone(facts);
  const groups = groupCareerFacts(facts);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Analyst');
  assert.equal(groups[0].fields.length, 16);
  assert.equal(groups[1].subtitle, 'C1');
  assert.deepEqual(facts, copy);
});

test('coalesces equivalent visible fields while retaining every evidence ID', () => {
  const groups = groupCareerFacts([fact('a', '/experience/0/company', 'Example'), fact('b', '/experience/0/company', 'Example'), fact('c', '/experience/0/company', 'Different')]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].fields[0].ids, ['a', 'b']);
  assert.equal(groups[0].fields.length, 2);
  assert.equal(groups[0].conflicts.size, 1);
});

test('keeps separate roles and explicit narrative context independent', () => {
  const facts = [fact('a', '/experience/0/company', 'Example'), fact('b', '/experience/1/company', 'Example'), fact('n', '', 'More work', { context: 'Example' })];
  assert.deepEqual(groupCareerFacts(facts).map((g) => g.section), ['experience', 'experience', 'notes']);
});

test('new records do not reuse gaps or exceed backend path bounds', () => {
  const facts = [fact('a', '/experience/2/title', 'Role')];
  assert.equal(newCareerRecord(facts, 'experience')[0].path, '/experience/3/title');
  assert.deepEqual(newCareerRecord([fact('a', '/experience/99/title', 'Last')], 'experience'), []);
  const group = groupCareerFacts(facts)[0];
  const paths = careerFieldOptions(group, facts).map((f) => f.path);
  assert.ok(paths.includes('/experience/2/bullets/0'));
  assert.ok(!paths.includes('/experience/2/title'));
});
