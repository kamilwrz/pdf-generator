import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterviewFlow from './InterviewFlow';
import FactEditor from './FactEditor';
import { listOwnedDocuments } from '../../../services/documents';
import { reviewFacts, interviewRequest } from '../../../services/interviews';

vi.mock('../../../hooks/useEntitlements', () => ({ useEntitlements: () => ({ entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' }, refresh: vi.fn() }) }));
vi.mock('../../../services/documents', () => ({ listOwnedDocuments: vi.fn(async () => []) }));
vi.mock('../../../services/interviews', async (original) => ({ ...await original(), interviewRequest: vi.fn() }));

const fact = { id: 'name', text: 'Anna Nowak', kind: 'fact', context: '', path: '/name', source: 'manual' };
let session;
afterEach(cleanup);
beforeEach(() => {
  session = { evidence_scope: 'profile', id: 'session', revision: 2, mode: 'create', phase: 'question', language: 'pl', template_id: 'linden', answers: [], question_limit: 8, requirements: [], proposed_facts: [], confirmed: true,
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
    await userEvent.setup().click(await screen.findByRole('button', { name: '03 Przygotuj CV' }));
    expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' })).toBeDisabled();
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

  it('restores focus after removing a fact', async () => {
    const change = vi.fn();
    render(<FactEditor facts={[fact]} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz wpis: Anna Nowak' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usuń informację: Anna Nowak' }));
    expect(change).toHaveBeenCalledWith([]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anna Nowak' })).toHaveFocus());
  });
});


it('hides legacy provider diagnostics while preserving recovery controls', async () => {
  session = { ...session, phase: 'review', question: null, generation_feedback: ['/experience/0/bullets/6: Evidence technical report'] };
  render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
  await screen.findByText('Twoje odpowiedzi są zapisane');
  expect(screen.queryByText(/Evidence/)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '03 Przygotuj CV' }));
  expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' })).toBeEnabled();
});

it('lets the candidate inspect and save a recovered preview without technical paths', async () => {
  session = { ...session, phase: 'preview', question: null, preview: {
    pages: 1, profile_revision: 1, cv_data: { name: 'Anna Nowak' }, changes: [], remaining_gaps: [], recovered_previous_attempt: true,
    review_notes: [{ path: '/experience/0/bullets/6', action: 'kept_original' }, { path: '/custom_sections/0/items/0/bullets/0', action: 'omitted_suggestion' }],
  } };
  render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Sprawdź uwagi do CV' }));
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

  it('shows the disputed proposal immediately and counts clarifications separately', async () => {
    session.phase = 'clarification';
    session.answers = Array.from({ length: 8 }, () => ({ question: { clarification: false } }));
    session.question = { id: 'clarification', topic: 'project', text: 'W którym projekcie używałaś Pythona?',
      reason: 'Sprawdź przypisanie technologii.', context: 'Projekt', record_label: 'Portal CV',
      suggested_text: 'Budowa portalu CV w Pythonie.', clarification: true };
    session.pending_clarifications = [{ id: 'another' }];
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const proposal = await screen.findByText('Budowa portalu CV w Pythonie.');
    expect(proposal).toBeVisible();
    expect(proposal.closest('details')).toBeNull();
    expect(screen.getByText(/Doprecyzowanie 1 z 2/)).toBeVisible();
    expect(screen.queryByText(/Odpowiedzi: 8/)).not.toBeInTheDocument();
    expect(screen.getByText('Propozycja AI · wymaga Twojego potwierdzenia')).toBeVisible();
  });


describe('candidate evidence separation', () => {
  const owner = { revision: 7, facts: [{ ...fact, text: 'Kamil Owner' }] };
  const candidate = { ...fact, id: 'candidate', text: 'Anna Candidate' };
  beforeEach(() => {
    listOwnedDocuments.mockResolvedValue([{ id: 30, title: 'CV30.pdf' }, { id: 31, title: 'CV31.pdf' }]);
    session = { ...session, evidence_scope: 'session', evidence_profile: { revision: 0, facts: [] },
      phase: 'intake', question: null, proposed_facts: [candidate] };
    interviewRequest.mockClear();
    interviewRequest.mockImplementation(async (path, method, body) => {
      if (path === '/career-profile') return owner;
      if (path === '/ai/imports') return { items: [] };
      if (path.endsWith('/confirm')) {
        session = { ...session, phase: 'ready', proposed_facts: [], evidence_profile: { revision: 1, facts: body.facts } };
        return { session, profile: session.evidence_profile };
      }
      return session;
    });
  });
  it('defaults selected documents to isolated data and confirms without the owner profile', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Źródło informacji'), 'document:30');
    expect(screen.getByLabelText('To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Rozpocznij wywiad' }));
    await screen.findByRole('button', { name: 'Otwórz wpis: Anna Candidate' });
    expect(screen.queryByText('Kamil Owner')).toBeNull();
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST', expect.objectContaining({ source_document_id: 30, include_profile: false, cv_data: {} }), expect.any(String));
    await user.click(screen.getByRole('button', { name: 'Zatwierdź informacje' }));
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/confirm', 'POST', expect.objectContaining({ evidence_scope: 'session', profile_revision: 0, facts: [candidate] }));
    await screen.findByText('Informacje zapisane tylko w tym wywiadzie. Profil konta pozostaje bez zmian.');
  });
  it('requires a fresh same-person opt-in when switching documents', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    const select = await screen.findByLabelText('Źródło informacji');
    await user.selectOptions(select, 'document:30');
    await user.click(screen.getByLabelText('To moje CV — dołącz mój profil zawodowy'));
    await user.selectOptions(select, 'document:31');
    expect(screen.getByLabelText('To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
    await user.click(screen.getByLabelText('To moje CV — dołącz mój profil zawodowy'));
    await user.click(screen.getByRole('button', { name: 'Rozpocznij wywiad' }));
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST', expect.objectContaining({ source_document_id: 31, include_profile: true }), expect.any(String));
  });
  it('starts an empty candidate without carrying the owner name', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    await user.selectOptions(await screen.findByLabelText('Źródło informacji'), 'new');
    expect(screen.getByLabelText('Imię i nazwisko')).toHaveValue('');
    await user.type(screen.getByLabelText('Imię i nazwisko'), 'Anna Candidate');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij wywiad' }));
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST', expect.objectContaining({ include_profile: false, cv_data: { name: 'Anna Candidate', title: '' } }), expect.any(String));
  });
  it('resumes isolated evidence without fetching the account profile', async () => {
    session.evidence_profile = { revision: 3, facts: [candidate] };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Otwórz wpis: Anna Candidate' });
    expect(interviewRequest.mock.calls.some(([path]) => path === '/career-profile')).toBe(false);
    expect(reviewFacts(owner, session)).toEqual([candidate]);
  });
  it('preserves legacy answers but hides confirmation and generation', async () => {
    delete session.evidence_scope;
    session.answers = [{ question: { text: 'Poprzednie pytanie' }, answer: 'Zapisana odpowiedź' }];
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Wybierz źródło w nowym wywiadzie' });
    expect(screen.getByRole('link', { name: 'Rozpocznij nowy wywiad' })).toHaveAttribute('href', '/app/interview');
    expect(screen.queryByRole('button', { name: 'Zatwierdź informacje' })).toBeNull();
    await userEvent.setup().click(screen.getByText('Zapisane odpowiedzi (1)'));
    expect(screen.getByText('Zapisana odpowiedź')).toBeVisible();
  });
});
