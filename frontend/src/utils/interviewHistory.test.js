import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationDate, conversationTitle } from './interviewHistory.js';

test('history preserves UTC and explicit offsets including repeated daylight-saving hours', () => {
  assert.equal(conversationDate('2026-09-16T14:32:00').toISOString(), '2026-09-16T14:32:00.000Z');
  assert.equal(conversationDate('2026-09-16T14:32:00Z').toISOString(), '2026-09-16T14:32:00.000Z');
  const summer = conversationDate('2026-10-25T02:30:00+02:00');
  const winter = conversationDate('2026-10-25T02:30:00+01:00');
  assert.equal(winter - summer, 3_600_000);
  assert.equal(conversationDate(null), null);
  assert.equal(conversationDate('invalid'), null);
});

test('offer identity distinguishes tailoring while legacy context never invents an advert title', () => {
  const source = { mode: 'tailor', offer_title: 'AML Analyst', offer_company: 'Bank A', source_title: 'CV source' };
  assert.equal(conversationTitle(source), 'AML Analyst · Bank A');
  assert.equal(conversationTitle({ ...source, mode: 'enrich' }), 'CV source');
  assert.equal(conversationTitle({ mode: 'tailor', offer_excerpt: 'We are hiring', candidate_name: 'Anna', target_role: 'Analyst' }), 'Anna · Analyst');
});
