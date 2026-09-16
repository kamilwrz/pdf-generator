import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import InterviewRequirements from './InterviewRequirements';

afterEach(cleanup);
const requirements = [{ id: 'requirement:a', text: 'AML', status: 'partial' }, { id: 'requirement:b', text: 'SQL', status: 'matched' }];
it('uses stable IDs and updates context when questions change', () => {
  const { rerender } = render(<InterviewRequirements requirements={requirements} question={{ entry_id: 'requirement:b' }} focused />);
  expect(screen.getByRole('complementary')).toHaveTextContent('SQL');
  rerender(<InterviewRequirements requirements={requirements} question={{ entry_id: 'requirement:a' }} focused />);
  expect(screen.getByRole('complementary')).toHaveTextContent('AML');
  expect(screen.getByRole('complementary')).not.toHaveTextContent('SQL');
});
it('does not guess a requirement for missing or unrelated questions', () => {
  const { rerender, container } = render(<InterviewRequirements requirements={requirements} focused />);
  expect(container).toBeEmptyDOMElement();
  rerender(<InterviewRequirements requirements={requirements} question={{ entry_id: 'role:a' }} focused />);
  expect(container).toBeEmptyDOMElement();
});
it('keeps overview collapsed and identifies its current row', () => {
  const { container } = render(<InterviewRequirements requirements={requirements} question={{ entry_id: 'requirement:a' }} />);
  expect(container.querySelector('details')).not.toHaveAttribute('open');
  expect(container.querySelector('[aria-current]')).toHaveTextContent('AML');
});
