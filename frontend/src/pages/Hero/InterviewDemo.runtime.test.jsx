import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import InterviewDemo from './InterviewDemo';

const environment = vi.hoisted(() => ({ inView: true, reduced: false }));
vi.mock('motion/react', () => ({ useInView: () => environment.inView, useReducedMotion: () => environment.reduced }));
afterEach(() => { cleanup(); vi.useRealTimers(); environment.inView = true; environment.reduced = false; });

it('plays once, pauses, permits manual selection and replays without an API', () => {
  vi.useFakeTimers();
  render(<InterviewDemo />);
  expect(screen.getByRole('button', { name: /Pytanie/ })).toHaveAttribute('aria-pressed', 'true');
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('button', { name: /Odpowiedź/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Wstrzymaj pokaz' }));
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByRole('button', { name: /Odpowiedź/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Wznów pokaz' }));
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole('button', { name: /Propozycja/ })).toHaveAttribute('aria-pressed', 'true');
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.getByRole('button', { name: 'Odtwórz ponownie' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Odtwórz ponownie' }));
  expect(screen.getByRole('button', { name: /Pytanie/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Odpowiedź/ }));
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByRole('button', { name: /Odpowiedź/ })).toHaveAttribute('aria-pressed', 'true');
});

it('does not advance offscreen or with reduced motion and cleans up timers', () => {
  vi.useFakeTimers();
  environment.inView = false;
  const { rerender, unmount } = render(<InterviewDemo />);
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByRole('button', { name: /Pytanie/ })).toHaveAttribute('aria-pressed', 'true');
  environment.inView = true;
  environment.reduced = true;
  rerender(<InterviewDemo />);
  expect(screen.queryByRole('button', { name: 'Wstrzymaj pokaz' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Propozycja/ }));
  expect(screen.getByText('Tak może brzmieć Twój opis')).toBeVisible();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
