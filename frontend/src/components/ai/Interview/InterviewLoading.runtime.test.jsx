import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import InterviewLoading from './InterviewLoading';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('keeps an indeterminate server operation truthful after a long wait', () => {
  vi.useFakeTimers();
  const { rerender } = render(<InterviewLoading operation="preview" answers={8} facts={42} language="Polski" template="Linden" />);
  expect(screen.getByRole('heading', { name: 'Twoja historia nabiera kształtu' })).toHaveFocus();
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.getByText(/osobną redakcję języka i stylu/)).toHaveTextContent('niezależną weryfikację faktów');
  act(() => vi.advanceTimersByTime(45000));
  expect(screen.getByText(/Operacja nadal trwa/)).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Przygotowanie i kontrola CV');
  expect(screen.queryByText(/Gotowe|100%/)).not.toBeInTheDocument();
  rerender(<InterviewLoading operation="sync" answers={8} facts={42} />);
  expect(screen.getByText(/Wynik operacji dotarł/)).toBeVisible();
  expect(screen.getByText('0:45')).toHaveAttribute('aria-hidden', 'true');
});

it('distinguishes answer persistence from an AI question request', () => {
  const { rerender } = render(<InterviewLoading operation="answers" />);
  expect(screen.getByRole('heading', { name: 'Zachowujemy Twoją odpowiedź' })).toBeVisible();
  rerender(<InterviewLoading operation="next" />);
  expect(screen.getByRole('heading', { name: 'Szukamy właściwego pytania' })).toBeVisible();
});
