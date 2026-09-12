import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCareerFacts, isCareerNote } from './careerProfileView.js';

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

test('uses an interview question as the note title without discarding its context', () => {
  const answer = fact('answer-q1', '', 'Zamknęłam sprawę po analizie.', { question: 'Jak podjęłaś decyzję o zamknięciu sprawy?', context: 'Analiza transakcji' });
  const group = groupCareerFacts([answer])[0];
  assert.equal(group.title, answer.question);
  assert.equal(group.subtitle, answer.context);
  assert.equal(group.fields[0].question, answer.question);
});

test('legacy intake notes stay editable but unknown imported fields remain source-owned', () => {
  assert.equal(isCareerNote(fact('intake-note', '', 'User note', { source: 'document:30' })), true);
  assert.equal(isCareerNote(fact('src-unknown', '', 'Imported value', { source: 'document:30' })), false);
});
