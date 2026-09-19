import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import InterviewDemo from './InterviewDemo';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([
  [false, 'W dotychczasowym CV', '„Obsługa klientów.”', /Odpowiadanie na maile/],
  [true, 'W ogłoszeniu', 'Excel: tabele przestawne i raporty sprzedaży.', /Cotygodniowe raporty sprzedaży/],
])('keeps the source and complete proposal visible without playback (tailoring=%s)', (tailoring, label, source, result) => {
  vi.useFakeTimers();
  render(<InterviewDemo tailoring={tailoring} />);
  expect(screen.getByText(label)).toBeVisible();
  expect(screen.getByText(source)).toBeVisible();
  expect(screen.getByText(result)).toBeVisible();
  expect(screen.getByText('Przed zapisaniem sprawdź, czy opis zgadza się z Twoim doświadczeniem.')).toBeVisible();
  expect(screen.getByText('Asystent pyta')).not.toBeVisible();
  expect(screen.getByText('Twoja odpowiedź')).not.toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.getByText(result)).toBeVisible();
  expect(screen.getByText('Asystent pyta')).not.toBeVisible();
  expect(vi.getTimerCount()).toBe(0);
});
