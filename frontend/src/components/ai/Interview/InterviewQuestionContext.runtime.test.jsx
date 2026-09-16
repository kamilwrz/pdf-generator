import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import InterviewQuestionContext from './InterviewQuestionContext';

afterEach(cleanup);
const facts = [
  { path: '/experience/0/title', text: 'Junior Analyst' },
  { path: '/experience/1/title', text: 'Senior Analyst' },
  { path: '/experience/1/company', text: 'Example Company' },
  { path: '/experience/1/period', text: '2022–2026' },
  { path: '/custom_sections/0/items/0/title', text: 'First project' },
  { path: '/custom_sections/0/items/1/title', text: 'Second project' },
];
it('identifies the exact role and updates when the question changes', () => {
  const { rerender } = render(<InterviewQuestionContext question={{ entry_id: '/experience/1' }} facts={facts} />);
  expect(screen.getByRole('complementary')).toHaveTextContent('Senior Analyst');
  expect(screen.getByRole('complementary')).toHaveTextContent('Example Company · 2022–2026');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('Junior Analyst');
  rerender(<InterviewQuestionContext question={{ entry_id: '/experience/0' }} facts={facts} />);
  expect(screen.getByRole('complementary')).toHaveTextContent('Junior Analyst');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('Senior Analyst');
});
it('resolves one project rather than its entire custom section', () => {
  render(<InterviewQuestionContext question={{ entry_id: '/custom_sections/0/items/1' }} facts={facts} />);
  expect(screen.getByRole('complementary')).toHaveTextContent('Second project');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('First project');
});
it.each([
  ['/education/0', [{ path: '/education/0/degree', text: 'Law' }, { path: '/education/0/school', text: 'University' }], 'Law', 'University'],
  ['/skills/0', [{ path: '/skills/0', text: 'SQL' }], 'SQL', ''],
  ['/languages/0', [{ path: '/languages/0/name', text: 'English' }], 'English', ''],
  ['note:one', [], 'Team mentoring', ''],
  [undefined, [], 'Team mentoring', ''],
])('renders %s with readable context', (entry_id, evidence, title, detail) => {
  render(<InterviewQuestionContext question={{ entry_id, context: 'Team mentoring' }} facts={evidence} />);
  expect(screen.getByRole('complementary')).toHaveTextContent(title);
  if (detail) expect(screen.getByRole('complementary')).toHaveTextContent(detail);
});
it('does not turn general questions into existing CV entries or expose IDs', () => {
  const { rerender } = render(<InterviewQuestionContext question={{ entry_id: 'general:experience', context: '/experience/0' }} facts={facts} />);
  expect(screen.getByRole('complementary')).not.toHaveTextContent('Junior Analyst');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('/experience/0');
  rerender(<InterviewQuestionContext question={{ entry_id: 'old-id', context: 'entry:/experience/0' }} facts={facts} />);
  expect(screen.getByRole('complementary')).not.toHaveTextContent('entry:');
});
it('leaves offer questions and factual clarifications to their existing context', () => {
  const { rerender, container } = render(<InterviewQuestionContext question={{ entry_id: 'requirement:one' }} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<InterviewQuestionContext question={{ entry_id: '/experience/0', clarification: true }} facts={facts} />);
  expect(container).toBeEmptyDOMElement();
});
