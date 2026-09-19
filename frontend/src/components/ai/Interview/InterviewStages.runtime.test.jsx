import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import InterviewStages from './InterviewStages';

afterEach(cleanup);

it('labels the first step CV and marks steps before the active one as completed', () => {
  render(<InterviewStages active="conversation" />);
  const [source, conversation, template] = screen.getAllByRole('listitem');
  expect(source).toHaveTextContent('CV');
  expect(source).toHaveTextContent('ukończono');
  expect(source).not.toHaveAttribute('aria-current');
  expect(conversation).toHaveAttribute('aria-current', 'step');
  expect(conversation).not.toHaveTextContent('ukończono');
  expect(template).not.toHaveTextContent('ukończono');
});

it('shows no completed marks while the first step is active', () => {
  render(<InterviewStages active="source" />);
  const [source] = screen.getAllByRole('listitem');
  expect(source).toHaveAttribute('aria-current', 'step');
  expect(screen.queryByText('ukończono')).not.toBeInTheDocument();
});
