import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterviewFlow from './InterviewFlow';
import FactEditor from './FactEditor';
import { reviewFacts, interviewRequest } from '../../../services/interviews';

vi.mock('../../../hooks/useEntitlements', () => ({ useEntitlements: () => ({ entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' }, refresh: vi.fn() }) }));
vi.mock('../../../services/documents', () => ({ listOwnedDocuments: vi.fn(async () => []) }));
vi.mock('../../../services/interviews', async (original) => ({ ...await original(), interviewRequest: vi.fn() }));

const fact = { id: 'name', text: 'Anna Nowak', kind: 'fact', context: '', path: '/name', source: 'manual' };
let session;
afterEach(cleanup);
beforeEach(() => {
  session = { id: 'session', revision: 2, mode: 'create', phase: 'question', language: 'pl', template_id: 'linden', answers: [], question_limit: 8, requirements: [], proposed_facts: [], confirmed: true,
    question: { id: 'q1', topic: 'project', text: 'Jaki projekt ukończyłaś?', reason: 'Pokażemy Twój wkład.', context: 'Projekt' } };
  interviewRequest.mockImplementation(async (path, method) => {
    if (path === '/career-profile') return { revision: 1, facts: [fact] };
    if (path.endsWith('/answers')) { session = { ...session, revision: 3, phase: 'ready', question: null, answers: [{}] }; return session; }
    if (path.endsWith('/next') && method === 'POST') return session;
    return session;
  });
});

describe('interview workflow', () => {
  it('saves an answer before requesting another question', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.type(await screen.findByLabelText('Twoja odpowiedź'), 'Zbudowałam raportowanie.');
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź' }));
    await screen.findByText('Odpowiedź zapisana.');
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/answers', 'POST', expect.objectContaining({ status: 'answered', answer: 'Zbudowałam raportowanie.', question_id: 'q1' }));
    expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/next'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Następne pytanie' }));
    await waitFor(() => expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/next'))).toBe(true));
  });

  it('retains typed input when saving fails', async () => {
    const user = userEvent.setup();
    interviewRequest.mockImplementation(async (path) => {
      if (path.endsWith('/answers')) throw new Error('Chwilowy błąd sieci.');
      if (path === '/career-profile') return { revision: 1, facts: [fact] };
      return session;
    });
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.type(await screen.findByLabelText('Twoja odpowiedź'), 'Moja odpowiedź');
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Twoja odpowiedź')).toHaveValue('Moja odpowiedź');
  });

  it('distinguishes unknown from a confirmed gap', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Nie pamiętam' }));
    await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/answers', 'POST', expect.objectContaining({ status: 'unknown' })));
  });

  it('blocks generation when the source changes', async () => {
    session.question = null;
    session.phase = 'ready';
    render(<MemoryRouter><InterviewFlow sessionId="session" sourceChanged /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' })).toBeDisabled();
  });

  it('refreshes the source after saving pending input without restarting the session', async () => {
    const user = userEvent.setup();
    const refreshed = vi.fn();
    const currentSource = { cv_data: { name: 'Anna Nowak', title: 'Senior Developer' }, template_id: 'linden' };
    render(<MemoryRouter><InterviewFlow sessionId="session" sourceChanged currentSource={currentSource} onSourceRefreshed={refreshed} /></MemoryRouter>);
    await user.type(await screen.findByLabelText('Twoja odpowiedź'), 'Mój projekt');
    expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź' }));
    await screen.findByText('Odpowiedź zapisana.');
    await user.click(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce());
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/source', 'POST', expect.objectContaining(currentSource));
  });

  it('does not resurrect confirmed facts from old session snapshots', () => {
    expect(reviewFacts({ facts: [] }, { source_cv_data: { name: 'Deleted' }, proposed_facts: [] })).toEqual([]);
  });

  it('restores focus after removing a fact', () => {
    const change = vi.fn();
    render(<FactEditor facts={[fact]} onChange={change} />);
    fireEvent.click(screen.getByText('Imię i nazwisko: Anna Nowak'));
    fireEvent.click(screen.getByRole('button', { name: 'Usuń informację' }));
    expect(change).toHaveBeenCalledWith([]);
    expect(screen.getByRole('button', { name: 'Dodaj informację' })).toHaveFocus();
  });
});


it('hides legacy provider diagnostics while preserving recovery controls', async () => {
  session = { ...session, phase: 'review', question: null, generation_feedback: ['/experience/0/bullets/6: Evidence technical report'] };
  render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
  await screen.findByText('Twoje odpowiedzi są zapisane');
  expect(screen.queryByText(/Evidence/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' })).toBeEnabled();
});

it('lets the candidate inspect and save a recovered preview without technical paths', async () => {
  session = { ...session, phase: 'preview', question: null, preview: {
    pages: 1, profile_revision: 1, cv_data: { name: 'Anna Nowak' }, changes: [], remaining_gaps: [], recovered_previous_attempt: true,
    review_notes: [{ path: '/experience/0/bullets/6', action: 'kept_original' }, { path: '/custom_sections/0/items/0/bullets/0', action: 'omitted_suggestion' }],
  } };
  render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
  await screen.findByText('CV jest gotowe do sprawdzenia');
  const disclosure = screen.getByText('Co zachowaliśmy lub pominęliśmy (2)');
  // Native Enter activation is covered in Chromium; jsdom only toggles on click.
  await userEvent.setup().click(disclosure);
  expect(disclosure.parentElement).toHaveAttribute('open');
  expect(screen.getByText(/Odzyskanie nie zużyło/)).toBeInTheDocument();
  expect(screen.queryByText(/\/experience\//)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Zapisz jako nowe CV' })).toBeEnabled();
});


it('offers clarification before exposing the filtered preview and supports explicit skipping', async () => {
  session = { ...session, phase: 'clarification', question: null, pending_clarifications: [{ topic: 'project' }], preview: {
    pages: 1, profile_revision: 1, cv_data: { name: 'Anna' }, changes: [], remaining_gaps: [],
  } };
  render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Doprecyzujmy szczegóły' });
  expect(screen.queryByRole('button', { name: 'Zapisz jako nowe CV' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Doprecyzuj — do 5 pytań' }));
  expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/clarify', 'POST', expect.objectContaining({ revision: 2, profile_revision: 1 }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Pomiń doprecyzowanie i pokaż CV' }));
  expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/skip-clarifications', 'POST', expect.any(Object));
});
