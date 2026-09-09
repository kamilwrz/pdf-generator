import assert from 'node:assert/strict';
import test from 'node:test';
import { authLink, getDocumentPath, parseDocumentId, postAuthPath, safeReturnTo } from './siteRoutes.js';

test('document addresses reject malformed and unsafe database IDs', () => {
  assert.equal(getDocumentPath(41), '/app/documents/41');
  for (const value of ['0', '-1', '01', '1.2', '1e2', '1/2', '9007199254740993']) {
    assert.equal(parseDocumentId(value), null);
    assert.throws(() => getDocumentPath(value));
  }
});

test('authentication never follows external, encoded, or unrecognized destinations', () => {
  for (const value of ['https://example.org', '//example.org', '/app/../login', '/app/documents/41?returnTo=https://example.org', '/app/documents/%34%31']) assert.equal(safeReturnTo(value), null);
  assert.equal(safeReturnTo('/app/documents/41'), '/app/documents/41');
  assert.equal(postAuthPath(new URLSearchParams('returnTo=%2Fapp%2Fdocuments%2F41')), '/app/documents/41');
});

test('auth form changes retain selected templates and a valid destination', () => {
  const url = authLink('/register', new URLSearchParams('start=new&template=monument&plan=pro&returnTo=/app/documents/41&unexpected=secret'));
  const params = new URL(url, 'http://localhost').searchParams;
  assert.equal(params.get('template'), 'monument');
  assert.equal(params.get('returnTo'), '/app/documents/41');
  assert.equal(params.has('unexpected'), false);
});
