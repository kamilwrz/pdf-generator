/**
 * Keep an analysis bound to its original text while allowing its own accepted
 * replacements. Layout reflow is deliberately excluded: accepting text can move
 * sibling elements without changing their meaning. Missing snapshots are read-only.
 */
export function isAssistantReviewCurrent(message, elements, states = {}) {
  if (!message?.sourceText) return false;
  const current = new Map(elements.map(element => [element.element_id, element]));
  return message.sourceText.every(({ element_id, content }) => {
    const element = current.get(element_id);
    if (!element) return false;
    const accepted = states[`${message.id}_${element_id}`] === 'accepted';
    const patch = accepted && message.corrections?.find(item => item.element_id === element_id);
    const expected = patch && 'content' in patch ? patch.content : content;
    return String(element.content ?? '') === String(expected ?? '');
  }) && elements.filter(element => 'content' in element).length === message.sourceText.length;
}
