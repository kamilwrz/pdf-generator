import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterviewFlow from './InterviewFlow';
import FactEditor from './FactEditor';
import { reviewFacts, interviewRequest } from '../../../services/interviews';

vi.mock('../../../hooks/useEntitlements', () => ({ useEntitlements: () => ({ entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' }, refresh: vi.fn() }) }));
vi.mock('../../../services/interviews', async (original) => ({ ...await original(), interviewRequest: vi.fn() }));

const fact = { id: 'name', text: 'Anna Nowak', kind: 'fact', context: '', path: '/name', source: 'document:30' };
let session;
afterEach(cleanup);
beforeEach(() => {
  session = { evidence_scope: 'profile', id: 'session', revision: 2, mode: 'create', phase: 'question', language: 'pl', template_id: 'linden', answers: [], question_limit: 8, planned_question_count: 8, requirements: [], proposed_facts: [], confirmed: true,
    question: { id: 'q1', topic: 'project', text: 'Jaki projekt ukończyłaś?', reason: 'Pokażemy Twój wkład.', context: 'Projekt' } };
  interviewRequest.mockImplementation(async (path, method) => {
    if (path === '/career-profile') return { revision: 1, facts: [fact] };
    if (path.endsWith('/answers')) { session = { ...session, revision: 3, phase: 'ready', question: null, answers: [{}] }; return session; }
    if (path.endsWith('/next') && method === 'POST') return session;
    return session;
  });
});

describe('interview workflow', () => {
  it('finishes a bounded round without claiming every record was discussed', async () => {
    session = { ...session, question: null, phase: 'review', discovery_round_complete: true, discovery_complete: false };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Przejdź do przygotowania CV' });
    expect(screen.queryByRole('button', { name: 'Następne pytanie', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pogłęb wywiad/ })).toBeEnabled();
  });

  it('blocks final save during a preview draft and retains it after failed persistence', async () => {
    session = { ...session, question: null, phase: 'preview', profile_revision: 1,
      preview: { pages: 1, profile_revision: 1, cv_data: { name: 'Anna Nowak', summary: 'Testowanie formularzy.' },
        changes: [{ path: '/summary', value: 'Testowanie formularzy.', evidence_refs: ['name'] }], remaining_gaps: [] } };
    interviewRequest.mockImplementation(async (path) => {
      if (path === '/career-profile') return { revision: 1, facts: [fact] };
      if (path.endsWith('/preview-review')) throw new Error('Nie udało się zapisać.');
      return session;
    });
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /^Zmiany/ }));
    await user.click(screen.getByRole('button', { name: 'Popraw tę propozycję' }));
    expect(screen.getByRole('button', { name: 'Zapisz jako nowe CV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zmień szablon lub odśwież' })).toBeDisabled();
    const input = screen.getByLabelText('Pełny poprawiony opis');
    await user.clear(input); await user.type(input, 'Wspieranie zespołu w testowaniu.');
    await user.click(screen.getByRole('button', { name: 'Zatwierdź poprawiony tekst' }));
    await screen.findByText('Nie udało się zapisać.');
    expect(input).toHaveValue('Wspieranie zespołu w testowaniu.');
    expect(screen.getByRole('button', { name: 'Zapisz jako nowe CV' })).toBeDisabled();
    expect(interviewRequest.mock.calls.filter(([path, method]) => path.endsWith('/preview-review') && method === 'POST')).toHaveLength(1);
  });
  it('keeps an empty editor blocked even when the owner has a profile', async () => {
    const onClose = vi.fn();
    render(<MemoryRouter><InterviewFlow initialSource={{ cv_data: { name: ' ' } }} onClose={onClose} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Najpierw dodaj CV z danymi' });
    expect(screen.queryByRole('button', { name: 'Rozpocznij wywiad' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('To moje CV — dołącz mój profil zawodowy')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Wróć do CV i uzupełnij dane' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
  });

  it('retries failed source reads without showing a false empty state', async () => {
    interviewRequest.mockRejectedValueOnce(new Error('Nie udało się wczytać źródeł.'));
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { name: 'Najpierw dodaj CV z danymi' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Wczytaj zapisany stan' }));
    await screen.findByRole('heading', { name: 'Najpierw dodaj CV z danymi' });
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
  });

  it('finishes a covered queue without offering another question or reopening entries', async () => {
    session = { ...session, question: null, phase: 'review', discovery_complete: true, question_limit: 14 };
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const prepare = await screen.findByRole('button', { name: 'Przejdź do przygotowania CV' });
    expect(screen.getByText(/Omówiliśmy dostępne wpisy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Następne pytanie' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pogłęb wywiad/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sprawdź informacje' })).toBeEnabled();
    await user.click(prepare);
    expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji' })).toBeEnabled();
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
  });

  it('explains when the shared answer ceiling closes an unfinished queue', async () => {
    session = { ...session, question: null, phase: 'review', discovery_complete: true, discovery_exhausted: true, planned_question_count: 49, question_limit: 50 };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    expect(await screen.findByText(/Osiągnięto limit 50 zapisanych odpowiedzi/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Następne pytanie' })).not.toBeInTheDocument();
  });

  it('explains informal answers and bounded follow-ups without starting AI on read', async () => {
    session.question.follow_up_to = 'earlier-question';
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const input = await screen.findByLabelText('Twoja odpowiedź');
    expect(input).toHaveAccessibleDescription(/Możesz odpowiadać własnymi słowami/);
    expect(screen.getByText(/Dopytanie do wcześniejszej odpowiedzi/)).toHaveTextContent('możesz je pominąć');
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
  });

  it('shows the global CV-based plan and excludes clarifications from discovery progress', async () => {
    session = {
      ...session,
      mode: 'enrich',
      planned_question_count: 14,
      answers: [
        { question: { clarification: false } },
        { question: { clarification: true } },
      ],
    };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    expect(await screen.findByText(/Pytanie 2 z maksymalnie 14 · Zapisane odpowiedzi: 1/)).toBeVisible();
  });

  it('explains when a tailoring plan is waiting for job-requirement analysis', async () => {
    session = {
      ...session,
      mode: 'tailor',
      phase: 'ready',
      question: null,
      planned_question_count: null,
    };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    expect(await screen.findByText(/Plan pytań ustalimy po analizie wymagań oferty · Zapisane odpowiedzi: 0/)).toBeVisible();
  });

  it('discloses all paid preparation stages while preserving the original answers', async () => {
    session = { ...session, question: null, phase: 'review' };
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Przejdź do przygotowania CV' }));
    expect(screen.getByText(/Każdy z trzech etapów korzysta z kredytów AI/)).toHaveTextContent('Oryginalne odpowiedzi pozostaną bez zmian');
    expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/preview'))).toBe(false);
  });

  it('saves an answer before requesting another question', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await user.type(await screen.findByLabelText('Twoja odpowiedź'), 'Zbudowałam raportowanie.');
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź' }));
    await screen.findByText('Odpowiedź zapisana w profilu zawodowym.');
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/answers', 'POST', expect.objectContaining({ status: 'answered', answer: 'Zbudowałam raportowanie.', question_id: 'q1' }));
    expect(screen.queryByText(/do zapisania/)).not.toBeInTheDocument();
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
    await screen.findByText('Odpowiedź zapisana w profilu zawodowym.');
    await user.click(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalledOnce());
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/source', 'POST', expect.objectContaining(currentSource));
  });

  it('does not resurrect confirmed facts from old session snapshots', () => {
    expect(reviewFacts({ facts: [] }, { source_cv_data: { name: 'Deleted' }, proposed_facts: [] })).toEqual([]);
  });

  it('restores focus after removing a fact', async () => {
    const change = vi.fn();
    render(<FactEditor facts={[{ ...fact, source: 'manual', path: '', context: fact.text }]} onChange={change} />);
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
    expect(screen.getByRole('heading', { name: 'Czy proponowany opis jest w pełni zgodny z Twoim doświadczeniem?' })).toBeVisible();
    expect(screen.getByText('Co wymaga sprawdzenia')).toBeVisible();
    expect(screen.getByText('Pełny opis zaproponowany przez AI · jeszcze niepotwierdzony')).toBeVisible();
    expect(screen.getByLabelText('Pełny poprawiony opis')).toHaveAccessibleDescription(/nie tylko odpowiedź na pytanie/);
  });


describe('candidate evidence separation', () => {
  const owner = { revision: 7, facts: [{ ...fact, text: 'Kamil Owner' }], sources: { documents: [{ id: 30, title: 'CV30.pdf' }, { id: 31, title: 'CV31.pdf' }], imports: [] } };
  const candidate = { ...fact, id: 'candidate', text: 'Anna Candidate' };
  beforeEach(() => {
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
    await user.click(screen.getByRole('button', { name: 'Przejdź do rozmowy' }));
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
  it('requires a CV selection even when the account profile contains a name', async () => {
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    await screen.findByLabelText('Źródło informacji');
    expect(screen.queryByRole('option', { name: 'Mój profil zawodowy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Nowe CV/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rozpocznij wywiad' })).not.toBeInTheDocument();
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
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


describe('clarification corrections', () => {
  it('replaces a fact by ID without mutating the confirmed profile or duplicating the entry', () => {
    const original = { ...fact, id: 'task', text: 'Research SoF.', path: '/experience/0/bullets/0' };
    const correction = { ...original, text: 'Research SoF i SoW.' };
    const profile = { facts: [fact, original] };
    expect(reviewFacts(profile, { evidence_scope: 'profile', proposed_facts: [correction] })).toEqual([fact, correction]);
    expect(profile.facts).toEqual([fact, original]);
    expect(reviewFacts(profile, { evidence_scope: 'profile', proposed_facts: [{ ...correction, id: 'new-task', path: '' }] })).toHaveLength(3);
  });
  it('confirms the visible proposal explicitly without retyping it', async () => {
    session.phase = 'clarification';
    session.question = { ...session.question, clarification: true, suggested_text: 'Research SoF i SoW.', target_fact_ids: ['task'] };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    expect(await screen.findByText(/cały opis jest poprawny/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tak — zatwierdź ten opis' }));
    await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/answers', 'POST', expect.objectContaining({ status: 'answered', answer: 'Research SoF i SoW.' })));
  });

  it('makes a typed correction an explicit full-description replacement', async () => {
    const user = userEvent.setup();
    session.phase = 'clarification';
    session.question = { ...session.question, clarification: true, suggested_text: 'Research SoF i SoW.', target_fact_ids: ['task'] };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const correction = await screen.findByLabelText('Pełny poprawiony opis');
    const confirmation = screen.getByRole('button', { name: 'Tak — zatwierdź ten opis' });
    const save = screen.getByRole('button', { name: 'Zapisz pełny poprawiony opis' });
    expect(confirmation).toBeEnabled();
    expect(save).toBeDisabled();
    await user.type(correction, 'Research SoF w czterech scenariuszach testowych.');
    expect(confirmation).toBeDisabled();
    expect(save).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Zakończ doprecyzowanie bez zapisywania propozycji' })).toBeDisabled();
    expect(screen.getByText(/Usuń wpisany poprawiony opis/)).toBeVisible();
    await user.click(save);
    await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/answers', 'POST', expect.objectContaining({ status: 'answered', answer: 'Research SoF w czterech scenariuszach testowych.' })));
  });
});


describe('save on interview navigation', () => {
  it('leaves unchanged facts without another confirmation request or invalidating the preview', async () => {
    session = { ...session, phase: 'ready', question: null };
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '01 Twoje informacje' }));
    expect(screen.getByText('Wszystkie informacje są zapisane.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Zatwierdź informacje' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Przejdź do rozmowy' }));
    await user.click(screen.getByRole('button', { name: '03 Przygotuj CV' }));
    expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/confirm'))).toBe(false);
  });

  it('persists pending answers once when moving directly to preparation', async () => {
    const pending = { ...fact, id: 'answer', path: '', text: 'Zbudowałam raportowanie.' };
    session = { ...session, phase: 'review', question: null, clarification_round: true, answers: [{}], proposed_facts: [pending] };
    let resolveSave;
    const saved = new Promise((resolve) => { resolveSave = resolve; });
    interviewRequest.mockImplementation(async (path) => {
      if (path === '/career-profile') return { revision: 1, facts: [fact] };
      if (path.endsWith('/confirm')) return saved;
      return session;
    });
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: 'Przejdź do przygotowania CV' });
    fireEvent.click(button); fireEvent.click(button);
    expect(interviewRequest.mock.calls.filter(([path]) => path.endsWith('/confirm'))).toHaveLength(1);
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/confirm', 'POST', expect.objectContaining({ facts: [fact, pending] }));
    resolveSave({ session: { ...session, proposed_facts: [], revision: 3 }, profile: { revision: 2, facts: [fact, pending] } });
    await screen.findByRole('heading', { name: 'Przygotuj swoją wersję CV' });
    expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/preview') || path.endsWith('/next'))).toBe(false);
  });

  it('retains edited facts and the current step on save failure', async () => {
    session = { ...session, phase: 'intake', question: null, confirmed: false, proposed_facts: [fact] };
    interviewRequest.mockImplementation(async (path) => {
      if (path === '/career-profile') return { revision: 0, facts: [] };
      if (path.endsWith('/confirm')) throw new Error('Zapis niedostępny');
      return session;
    });
    render(<MemoryRouter><InterviewFlow sessionId="session" /></MemoryRouter>);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Przejdź do rozmowy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zapis niedostępny');
    expect(screen.getByRole('button', { name: 'Otwórz wpis: Anna Nowak' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Przejdź do rozmowy' })).toBeEnabled();
  });
});

for (const scope of ['profile', 'session']) {
  for (const embedded of [false, true]) {
    it(`locks CV fields and preserves note drafts in ${scope} review (embedded: ${embedded})`, async () => {
      const user = userEvent.setup();
      const cvFacts = [fact, { ...fact, id: 'role', path: '/experience/0/title', text: 'Analityczka' }];
      const note = { ...fact, id: 'intake-note', path: '', text: 'Moja notatka', context: 'Notatki' };
      let profile = { revision: 4, facts: [...cvFacts, note] };
      session = { ...session, evidence_scope: scope, phase: 'ready', question: null, source_document_id: 30,
        evidence_profile: scope === 'session' ? profile : null };
      interviewRequest.mockImplementation(async (path, method, body) => {
        if (path === '/career-profile') return profile;
        if (path.endsWith('/confirm')) {
          profile = { revision: 5, facts: body.facts };
          session = { ...session, revision: 3, evidence_profile: scope === 'session' ? profile : null };
          return { session, profile };
        }
        return session;
      });
      render(<MemoryRouter><InterviewFlow sessionId="session" onClose={embedded ? vi.fn() : undefined} /></MemoryRouter>);
      await user.click(await screen.findByRole('button', { name: '01 Twoje informacje' }));
      expect(screen.queryByRole('button', { name: '+ Dodaj informację' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
      expect(screen.queryByRole('button', { name: /^Edytuj:/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Usuń informację:/ })).not.toBeInTheDocument();
      if (embedded) expect(screen.getByRole('button', { name: 'Wróć do edytora CV' })).toBeEnabled();
      else expect(screen.getByRole('link', { name: 'Edytuj źródłowe CV (nowa karta)' })).toHaveAttribute('href', '/app/documents/30');
      await user.click(screen.getByRole('button', { name: /Z wywiadu i notatki/ }));
      await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Notatki' }));
      await user.click(screen.getByRole('button', { name: /^Edytuj:/ }));
      await user.click(screen.getByText('Kontekst i sposób wykorzystania'));
      expect(screen.queryByLabelText('Przeznaczenie')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Rodzaj informacji')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' })).toBeDisabled();
      await user.clear(screen.getByLabelText('Treść'));
      await user.type(screen.getByLabelText('Treść'), 'Poprawiona notatka');
      await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę' }));
      expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Przejdź do rozmowy' }));
      await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/session/confirm', 'POST', expect.objectContaining({ facts: [...cvFacts, { ...note, text: 'Poprawiona notatka' }] })));
      expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu' })).toBeEnabled();
      expect(interviewRequest.mock.calls.some(([path]) => path.endsWith('/next') || path.endsWith('/preview'))).toBe(false);
    });
  }
}

it('source refresh replaces changed and deleted CV fields while retaining answer identity', () => {
  const source = [fact, { ...fact, id: 'src-title', path: '/title', text: 'Senior Analyst' }];
  const answer = { ...fact, id: 'answer-q1', path: '/experience/0/bullets/0', question: 'What did you do?', source: 'interview:saved', text: 'A confirmed answer' };
  const oldProfile = { facts: [fact, { ...source[1], text: 'Analyst' }, { ...fact, id: 'old-skill', path: '/skills/0', text: 'Obsolete skill' }, answer] };
  const changed = { phase: 'intake', evidence_scope: 'profile', review_source_facts: source,
    proposed_facts: [{ ...source[1], id: 'src-title-refresh-2' }] };
  expect(reviewFacts(oldProfile, changed)).toEqual([...source, answer]);
  expect(oldProfile.facts[1].text).toBe('Analyst');
  // Confirmed correction replaces one source field without duplicating its ID.
  const correction = { ...source[1], question: 'Is this correct?', source: 'interview:saved', text: 'Confirmed correction' };
  expect(reviewFacts({ facts: [correction] }, { ...changed, proposed_facts: [] })).toEqual([fact, correction]);
});

for (const kind of ['document', 'import']) {
  it(`selects a bound ${kind} profile without another opt-in and resets scope on another source`, async () => {
    const user = userEvent.setup();
    const profile = { revision: 4, facts: [fact], source_binding: { kind, id: 30 }, source_available: true,
      sources: { documents: [{ id: 31, title: 'Other CV' }], imports: [] } };
    interviewRequest.mockImplementation(async (path) => path === '/career-profile' ? profile : session);
    render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
    const select = await screen.findByLabelText('Źródło informacji');
    await user.selectOptions(select, 'profile');
    expect(screen.queryByLabelText('To moje CV — dołącz mój profil zawodowy')).not.toBeInTheDocument();
    expect(interviewRequest.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
    await user.selectOptions(select, 'document:31');
    expect(screen.getByLabelText('To moje CV — dołącz mój profil zawodowy')).not.toBeChecked();
    await user.selectOptions(select, 'profile');
    await user.click(screen.getByRole('button', { name: 'Rozpocznij wywiad' }));
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST', expect.objectContaining({ use_profile_source: true, include_profile: true, cv_data: {} }), expect.any(String));
    const body = interviewRequest.mock.calls.find(([path, method]) => path === '/ai/interviews' && method === 'POST')[2];
    expect(body.source_document_id).toBeUndefined();
    expect(body.source_import_id).toBeUndefined();
  });
}

it.each([null, { kind: 'document', id: 30 }])('does not offer an unavailable or unbound career profile (%j)', async (binding) => {
  interviewRequest.mockResolvedValue({ revision: 1, facts: [fact], source_binding: binding, source_available: false,
    sources: { documents: [{ id: 31, title: 'Other CV' }], imports: [] } });
  render(<MemoryRouter><InterviewFlow /></MemoryRouter>);
  await screen.findByLabelText('Źródło informacji');
  expect(screen.queryByRole('option', { name: 'Profil zawodowy', exact: true })).not.toBeInTheDocument();
});
