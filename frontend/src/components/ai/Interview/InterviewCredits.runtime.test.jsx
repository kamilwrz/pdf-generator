import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterviewCredits from './InterviewCredits';
import { interviewRequest } from '../../../services/interviews';
import { setUiLanguage } from '../../../i18n';

vi.mock('../../../services/interviews', () => ({ interviewRequest: vi.fn() }));
afterEach(async () => { cleanup(); await setUiLanguage('pl'); });
const receipt = { credits_charged: 7, requests: [{ id: 'q1', operation: 'next', credits_charged: 7, pending: false, created_at: '2026-09-12T10:00:00Z', stages: [{ operation: 'next', credits_charged: 7, status: 'settled' }] }] };
const props = { sessionId: 'session', revision: 2, busy: false, entitlements: { remaining: { ai_credits: 93 } } };

it('shows actual costs, free saves and native history in both languages', async () => {
  interviewRequest.mockResolvedValue(receipt);
  render(<InterviewCredits {...props} />);
  await screen.findByText('Ostatnie zapytanie AI — Pytanie wywiadu: 7 kredytów');
  expect(screen.getByText(/Pozostało na koncie:/).parentElement).toHaveTextContent('93 kredyty');
  // Native summary keyboard activation is covered in Chromium; jsdom only
  // implements its click default action.
  await userEvent.setup().click(screen.getByText('Historia zapytań AI (1)'));
  expect(screen.getByText(/Zapis odpowiedzi, informacji i doprecyzowań: 0/)).toBeVisible();
  expect(screen.getByText('Pytanie wywiadu: 7 kredytów')).toBeVisible();
  await setUiLanguage('en');
  await screen.findByText('Last AI request — Interview question: 7 credits');
  expect(interviewRequest).toHaveBeenCalledTimes(1);
});

it('refreshes after failed work, retains earlier charges and never presents unknown costs as zero', async () => {
  interviewRequest.mockResolvedValue(receipt);
  const { rerender } = render(<InterviewCredits {...props} />);
  await screen.findByText(/Ostatnie zapytanie AI/);
  rerender(<InterviewCredits {...props} busy />);
  expect(screen.getByText(/Koszt bieżącego zapytania/)).toBeVisible();
  expect(screen.getByText('Ostatnie zapytanie AI — Pytanie wywiadu: 7 kredytów')).toBeVisible();
  expect(screen.queryByText('93 kredyty')).not.toBeInTheDocument();
  interviewRequest.mockRejectedValueOnce(new Error('offline'));
  rerender(<InterviewCredits {...props} balanceError="offline" />);
  await screen.findByText(/Nie udało się odświeżyć kosztów/);
  expect(screen.getByText(/Zużycie w tym wywiadzie:/).parentElement).toHaveTextContent('7 kredytów');
  expect(screen.getByText('Ostatnie zapytanie AI — Pytanie wywiadu: 7 kredytów')).toBeVisible();
  expect(screen.getByText('brak aktualnych danych')).toBeVisible();
  interviewRequest.mockResolvedValue({ credits_charged: 18, requests: [{ ...receipt.requests[0], id: 'preview', operation: 'preview', credits_charged: 11, stages: [{ operation: 'editorial', credits_charged: 11, status: 'failed' }] }, ...receipt.requests] });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Odśwież rozliczenia' }));
  await screen.findByText('Ostatnie zapytanie AI — Przygotowanie CV: 11 kredytów');
  expect(screen.getByText(/Zużycie w tym wywiadzie:/).parentElement).toHaveTextContent('18 kredytów');
  expect(interviewRequest.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true);
});

it('does not duplicate recovered charges and labels pending settlement explicitly', async () => {
  interviewRequest.mockResolvedValue(receipt);
  const { rerender } = render(<InterviewCredits {...props} />);
  await screen.findByText(/Ostatnie zapytanie AI/);
  rerender(<InterviewCredits {...props} busy />);
  rerender(<InterviewCredits {...props} revision={3} />);
  await waitFor(() => expect(interviewRequest).toHaveBeenCalledTimes(2));
  await screen.findByText('Ostatnie zapytanie AI — Pytanie wywiadu: 7 kredytów');
  expect(screen.getByText(/Zużycie w tym wywiadzie:/).parentElement).toHaveTextContent('7 kredytów');
  interviewRequest.mockResolvedValue({ credits_charged: 0, requests: [{ ...receipt.requests[0], credits_charged: 0, pending: true, stages: [{ operation: 'next', status: 'pending', credits_charged: 0 }] }] });
  rerender(<InterviewCredits {...props} sessionId="other" />);
  await screen.findByText(/Ostatnie zapytanie AI.*rozliczenie w toku/);
  expect(screen.getByText(/Zużycie w tym wywiadzie:/).parentElement).toHaveTextContent('0 kredytów');
});

it('keeps free-save guidance visible without an empty history disclosure', async () => {
  interviewRequest.mockResolvedValue({ credits_charged: 0, requests: [] });
  const { container } = render(<InterviewCredits {...props} />);
  await waitFor(() => expect(screen.getByText(/Zużycie w tym wywiadzie:/).parentElement).toHaveTextContent('0 kredytów'));
  expect(screen.getByText(/Zapis odpowiedzi, informacji i doprecyzowań: 0/)).toBeVisible();
  expect(container.querySelector('details')).toBeNull();
  await setUiLanguage('en');
  expect(screen.getByText('Saving answers, information and clarifications: 0 credits.')).toBeVisible();
  expect(container.querySelector('details')).toBeNull();
});

it('keeps pending and failed metered stages in history and retries only its read', async () => {
  const onRefreshBalance = vi.fn();
  interviewRequest.mockResolvedValue({ credits_charged: 7, requests: [{
    ...receipt.requests[0], operation: 'preview', pending: true,
    stages: [
      { operation: 'preview', credits_charged: 7, status: 'failed' },
      { operation: 'editorial', credits_charged: 0, status: 'pending' },
    ],
  }] });
  render(<InterviewCredits {...props} onRefreshBalance={onRefreshBalance} />);
  await screen.findByText(/Ostatnie zapytanie AI.*rozliczenie w toku/);
  await userEvent.setup().click(screen.getByText('Historia zapytań AI (1)'));
  expect(screen.getByText(/7 kredytów.*etap nie powiódł się/)).toBeVisible();
  expect(screen.getByText(/Redakcja.*rozliczenie w toku/)).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Odśwież rozliczenia' }));
  await waitFor(() => expect(interviewRequest).toHaveBeenCalledTimes(2));
  expect(onRefreshBalance).toHaveBeenCalledOnce();
  expect(interviewRequest.mock.calls.every(([path, method]) => path.endsWith('/credits') && (!method || method === 'GET'))).toBe(true);
});
