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
