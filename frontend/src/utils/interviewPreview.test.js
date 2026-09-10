import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecords, recordContent } from './interviewPreview.js';

test('preview groups scalar changes into full roles without changing data or evidence', () => {
  const data = { name: 'Anna', experience: [{ title: 'Analityczka', company: 'Firma', bullets: ['Raportowanie', 'Kontrola'] }], languages: [{ name: 'Polski', level: 'C2' }] };
  const changes = [{ path: '/experience/0/bullets/0', value: 'Raportowanie', evidence_refs: ['fact1', 'fact2'] }];
  const snapshot = JSON.stringify({ data, changes });
  const groups = previewRecords(data, changes);
  assert.equal(groups.length, 3);
  const role = groups.find((g) => g.section === 'experience');
  assert.equal(role.title, 'Analityczka');
  assert.equal(role.changes[0], changes[0]);
  assert.deepEqual(recordContent(data, role), { experience: [data.experience[0]] });
  assert.equal(JSON.stringify({ data, changes }), snapshot);
});

test('removed changes stay reviewable and template metadata does not become a record', () => {
  const data = { name: 'Anna', labels: { experience: 'PRACA' }, photo: 'private-image' };
  const groups = previewRecords(data, [{ path: '/summary', value: '', evidence_refs: [] }]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.key === '/summary').changes.length, 1);
  assert.deepEqual(recordContent(data, groups[0]), { name: 'Anna' });
});
