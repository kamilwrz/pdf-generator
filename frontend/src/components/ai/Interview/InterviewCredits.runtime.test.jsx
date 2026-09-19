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

it('shows one static used/available line without a history disclosure', async () => {
  interviewRequest.mockResolvedValue(receipt);
  const { container } = render(<InterviewCredits {...props} />);
  await waitFor(() => expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 7'));
  expect(screen.getByText('Dostępne').parentElement).toHaveTextContent('Dostępne 93');
  // The per-request history was removed on request; the receipt is read-only.
  expect(container.querySelector('details')).not.toBeInTheDocument();
  await setUiLanguage('en');
  expect(screen.getByText('Used').parentElement).toHaveTextContent('Used 7');
  expect(interviewRequest).toHaveBeenCalledTimes(1);
  expect(interviewRequest.mock.calls.every(([path, method]) => path.endsWith('/credits') && (!method || method === 'GET'))).toBe(true);
});

it('never presents unknown costs as zero while work or settlement is pending', async () => {
  interviewRequest.mockResolvedValue(receipt);
  const { rerender } = render(<InterviewCredits {...props} />);
  await waitFor(() => expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 7'));
  rerender(<InterviewCredits {...props} busy />);
  // A running request hides the balance (it may change) but keeps settled usage.
  expect(screen.getByText('Dostępne').parentElement).toHaveTextContent('Dostępne —');
  expect(screen.getByText('rozliczenie w toku')).toBeVisible();
  interviewRequest.mockResolvedValue({ credits_charged: 0, requests: [{ ...receipt.requests[0], credits_charged: 0, pending: true, stages: [{ operation: 'next', status: 'pending', credits_charged: 0 }] }] });
  rerender(<InterviewCredits {...props} sessionId="other" />);
  await waitFor(() => expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 0'));
  expect(screen.getByText('rozliczenie w toku')).toBeVisible();
});

it('retains the last read after a failed refresh and retries only its read', async () => {
  const onRefreshBalance = vi.fn();
  interviewRequest.mockResolvedValue(receipt);
  const { rerender } = render(<InterviewCredits {...props} onRefreshBalance={onRefreshBalance} />);
  await waitFor(() => expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 7'));
  interviewRequest.mockRejectedValueOnce(new Error('offline'));
  rerender(<InterviewCredits {...props} onRefreshBalance={onRefreshBalance} balanceError="offline" revision={3} />);
  await screen.findByText(/Nie udało się odświeżyć kosztów/);
  expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 7');
  interviewRequest.mockResolvedValue({ ...receipt, credits_charged: 18 });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Odśwież rozliczenia' }));
  await waitFor(() => expect(screen.getByText('Zużyte').parentElement).toHaveTextContent('Zużyte 18'));
  expect(onRefreshBalance).toHaveBeenCalledOnce();
  expect(interviewRequest.mock.calls.every(([path, method]) => path.endsWith('/credits') && (!method || method === 'GET'))).toBe(true);
});
