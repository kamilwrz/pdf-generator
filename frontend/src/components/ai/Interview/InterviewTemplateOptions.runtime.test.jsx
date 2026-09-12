import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterviewTemplateOptions from './InterviewTemplateOptions';
import { interviewRequest } from '../../../services/interviews.js';
import { measureInterviewTemplateCandidates } from '../../../utils/interviewTemplateFit.js';

vi.mock('../../../services/interviews.js', () => ({ interviewRequest: vi.fn() }));
vi.mock('../../../utils/interviewTemplateFit.js', () => ({ measureInterviewTemplateCandidates: vi.fn() }));
// Geometry is covered by the real-browser suite. This boundary test keeps the
// real selector interaction and verifies explicit selection of measured data.
const session = { id: 'interview', revision: 4, profile_revision: 2, evidence_scope: 'session' };
const candidate = { template_id: 'linden', pages: 1, elements: [{ element_id: 'kept' }], spacing_px: { stack: 2 } };
const entitlements = { template_tier: 'all', plan_slug: 'pro' };
const setup = (props = {}) => render(<InterviewTemplateOptions session={session} entitlements={entitlements} onSelect={vi.fn()} {...props} />);
afterEach(cleanup);
beforeEach(() => {
  interviewRequest.mockReset().mockResolvedValue({ revision: 4, candidates: [] });
  measureInterviewTemplateCandidates.mockReset().mockResolvedValue({ candidates: [candidate], failedTemplateIds: [], cancelled: false });
});

it('keeps an existing preview read-only until checking and applies only on explicit choice', async () => {
  const onSelect = vi.fn();
  setup({ onSelect });
  expect(interviewRequest).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź inne szablony' }));
  await screen.findByText('Ta treść mieści się na jednej stronie w 1 innym szablonie.');
  expect(interviewRequest).toHaveBeenCalledExactlyOnceWith('/ai/interviews/interview/preview-templates', 'POST', {
    revision: 4, profile_revision: 2, evidence_scope: 'session',
  });
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Jedna strona w innym szablonie' })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: /Użyj tego szablonu/ }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(candidate);
});

it('automatically checks once after generation even under StrictMode', async () => {
  const onAutoStart = vi.fn();
  render(<StrictMode><InterviewTemplateOptions session={session} entitlements={entitlements} autoCheck onAutoStart={onAutoStart} onSelect={vi.fn()} /></StrictMode>);
  await screen.findByText('Ta treść mieści się na jednej stronie w 1 innym szablonie.');
  expect(interviewRequest).toHaveBeenCalledTimes(1);
  expect(onAutoStart).toHaveBeenCalledTimes(1);
});

it('retains retry after a scan failure and distinguishes partial checks from no fit', async () => {
  interviewRequest.mockRejectedValueOnce(new Error('Unavailable'));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź inne szablony' }));
  await screen.findByRole('alert');
  measureInterviewTemplateCandidates.mockResolvedValueOnce({ candidates: [], failedTemplateIds: ['regent'], cancelled: false });
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź ponownie' }));
  await screen.findByText(/Części szablonów nie udało się poprawnie sprawdzić/);
  expect(screen.queryByText(/Żaden z porównanych szablonów/)).not.toBeInTheDocument();
});

it('discards a late response after cancellation and prevents selection while editing', async () => {
  let resolve;
  interviewRequest.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź inne szablony' }));
  await userEvent.click(screen.getByRole('button', { name: 'Przerwij sprawdzanie' }));
  resolve({ revision: 4, candidates: [] });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sprawdź inne szablony' })).toBeVisible());
  expect(measureInterviewTemplateCandidates).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź inne szablony' }));
  await screen.findByText('Ta treść mieści się na jednej stronie w 1 innym szablonie.');
  view.rerender(<InterviewTemplateOptions session={session} entitlements={entitlements} disabled onSelect={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Użyj tego szablonu/ })).toBeDisabled();
});

it('rejects mismatched revisions without measuring or offering stale layouts', async () => {
  interviewRequest.mockResolvedValueOnce({ revision: 5, candidates: [candidate] });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Sprawdź inne szablony' }));
  await screen.findByRole('alert');
  expect(measureInterviewTemplateCandidates).not.toHaveBeenCalled();
});
