import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAssistantReviewCurrent } from './assistantReview.js';

test('review rejects edited, missing and added text but tolerates its accepted replacement and reflow', () => {
  const message = { id: 'review', sourceText: [{ element_id: 'one', content: 'Original' }], corrections: [{ element_id: 'one', content: 'Proposed' }] };
  assert.equal(isAssistantReviewCurrent(message, [{ element_id: 'one', content: 'Original', y: 45 }]), true);
  assert.equal(isAssistantReviewCurrent(message, [{ element_id: 'one', content: 'Edited' }]), false);
  assert.equal(isAssistantReviewCurrent(message, []), false);
  assert.equal(isAssistantReviewCurrent(message, [{ element_id: 'one', content: 'Original' }, { element_id: 'two', content: 'New' }]), false);
  assert.equal(isAssistantReviewCurrent(message, [{ element_id: 'one', content: 'Proposed' }], { review_one: 'accepted' }), true);
  assert.equal(isAssistantReviewCurrent({}, []), false);
});
