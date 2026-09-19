import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setUiLanguage } from '../../../i18n';
import CvImportLoading from './CvImportLoading';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(['pl', 'en'])('announces a long wait once in %s and clears its timer on unmount', async language => {
  await setUiLanguage(language);
  vi.useFakeTimers();
  const view = render(<CvImportLoading filename="CV.pdf" />);
  const original = screen.getByRole('status').textContent;
  expect(screen.getByRole('heading')).toHaveFocus();
  act(() => vi.advanceTimersByTime(29_999));
  expect(screen.getByRole('status')).toHaveTextContent(original);
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toHaveTextContent(language === 'pl' ? 'Odczytywanie nadal trwa.' : 'Still reading your CV.');
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
