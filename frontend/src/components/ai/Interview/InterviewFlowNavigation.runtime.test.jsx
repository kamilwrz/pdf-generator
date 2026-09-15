import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterviewFlow from './InterviewFlow';
import { interviewRequest } from '../../../services/interviews';
import { measureInterviewTemplateCandidates } from '../../../utils/interviewTemplateFit.js';
import classes from './Interview.module.css';

vi.mock('../../../hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all', remaining: { ai_credits: 500 } },
    refresh: vi.fn(),
  }),
}));
vi.mock('../../../services/interviews', async (original) => ({ ...await original(), interviewRequest: vi.fn() }));
vi.mock('../../../utils/interviewTemplateFit.js', () => ({ measureInterviewTemplateCandidates: vi.fn() }));

const name = { id: 'name', text: 'Anna Nowak', kind: 'fact', context: '', path: '/name', source: 'document:30' };
const note = { id: 'note', text: 'Przygotowywałam raporty.', kind: 'fact', context: 'Notatki', path: '', source: 'interview:saved' };
const question = { id: 'q1', topic: 'project', text: 'Jaki projekt ukończyłaś?', reason: 'Pokażemy Twój wkład.', context: 'Projekt' };
const alternative = { template_id: 'aurelia', pages: 1, elements: [{ element_id: 'fitted-name', content: name.text }],
  spacing_px: { stack: 2, record: 5, section: 13, after_rule: 4 } };
let session;
let profile;
let failAnswer;
let failConfirm;
let failTemplate;
let failDocument;
let savedTemplates;

afterEach(cleanup);
beforeEach(() => {
  failAnswer = false;
  failConfirm = false;
  failTemplate = false;
  failDocument = false;
  savedTemplates = [];
  measureInterviewTemplateCandidates.mockReset().mockResolvedValue({ candidates: [alternative], failedTemplateIds: [], cancelled: false });
  profile = { revision: 1, facts: [name] };
  session = {
    evidence_scope: 'profile', id: 'navigation', revision: 2, mode: 'create', phase: 'ready',
    language: 'pl', template_id: 'linden', source_document_id: 30, source_cv_data: { name: name.text },
    answers: [], question: null, question_limit: 10, planned_question_count: 10,
    requirements: [], proposed_facts: [], confirmed: true,
  };
  // Model the transaction boundaries explicitly: navigation is read-only,
  // answer persistence is separate from the next paid question request.
  interviewRequest.mockImplementation(async (path, method, body) => {
    if (path === '/career-profile') return profile;
    if (path.endsWith('/credits')) return { credits_charged: 0, requests: [] };
    if (method !== 'POST') return session;
    if (path.endsWith('/next')) session = { ...session, revision: session.revision + 1, phase: 'question', question };
    if (path.endsWith('/answers')) {
      if (failAnswer) throw new Error('Nie udało się zapisać odpowiedzi.');
      session = { ...session, revision: session.revision + 1, phase: 'ready', question: null,
        answers: [...session.answers, { question: session.question, answer: body.answer, status: body.status }] };
    }
    if (path.endsWith('/confirm')) {
      if (failConfirm) throw new Error('Nie udało się zapisać informacji.');
      profile = { revision: profile.revision + 1, facts: body.facts };
      session = { ...session, revision: session.revision + 1, confirmed: true, proposed_facts: [] };
      return { session, profile };
    }
    if (path.endsWith('/preview-templates')) return { revision: session.revision, candidates: [alternative] };
    if (path.endsWith('/preview-template')) {
      if (failTemplate) throw new Error('Nie udało się zastosować szablonu.');
      session = { ...session, revision: session.revision + 1, template_id: body.template_id,
        spacing_px: body.spacing_px, preview: { ...session.preview, pages: 1, elements: body.elements } };
    }
    if (path.endsWith('/document')) {
      if (failDocument) throw new Error('Nie udało się zapisać CV.');
      savedTemplates.push({ template_id: session.template_id, spacing_px: session.spacing_px, elements: session.preview.elements });
      return { document_id: 91 };
    }
    return session;
  });
});

function renderInterview(props = {}) {
  return render(<MemoryRouter><InterviewFlow sessionId="navigation" {...props} /></MemoryRouter>);
}

function writes() {
  return interviewRequest.mock.calls.filter(([, method]) => method === 'POST').map(([path]) => path.split('/').at(-1));
}

/** Start at a resumed result so scanning and final saving remain explicit user actions. */
async function renderTemplateResult() {
  session = { ...session, phase: 'preview', profile_revision: profile.revision, preview: {
    pages: 2, profile_revision: profile.revision, cv_data: { name: name.text },
    elements: [{ element_id: 'original-name', content: name.text }], changes: [], remaining_gaps: [],
  } };
  renderInterview();
  await userEvent.click(await screen.findByRole('button', { name: 'Sprawdź inne szablony' }));
  return screen.findByRole('combobox', { name: 'Pasujący szablon' });
}

describe('interview task navigation', () => {
  it('applies the selected alternative before saving with its new revision and measured geometry', async () => {
    const selector = await renderTemplateResult();
    await userEvent.selectOptions(selector, alternative.template_id);
    expect(writes()).toEqual(['preview-templates']);
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    await waitFor(() => expect(savedTemplates).toEqual([{
      template_id: alternative.template_id, spacing_px: alternative.spacing_px, elements: alternative.elements,
    }]));
    expect(writes()).toEqual(['preview-templates', 'preview-template', 'document']);
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/navigation/preview-template', 'POST', {
      revision: 2, profile_revision: 1, evidence_scope: 'profile', template_id: alternative.template_id,
      elements: alternative.elements, spacing_px: alternative.spacing_px,
    });
    expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews/navigation/document', 'POST', {
      revision: 3, profile_revision: 1, evidence_scope: 'profile',
    });
  });

  it('retains a failed template choice for retry and never saves the previous template', async () => {
    failTemplate = true;
    const selector = await renderTemplateResult();
    await userEvent.selectOptions(selector, alternative.template_id);
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zastosować szablonu.');
    expect(screen.getByRole('combobox', { name: 'Pasujący szablon' })).toHaveValue(alternative.template_id);
    expect(writes()).toEqual(['preview-templates', 'preview-template']);
    expect(savedTemplates).toEqual([]);
    failTemplate = false;
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    await waitFor(() => expect(savedTemplates).toHaveLength(1));
    expect(writes()).toEqual(['preview-templates', 'preview-template', 'preview-template', 'document']);
    expect(savedTemplates[0].template_id).toBe(alternative.template_id);
  });

  it('keeps the applied template after document save fails and retries only the document save', async () => {
    failDocument = true;
    const selector = await renderTemplateResult();
    await userEvent.selectOptions(selector, alternative.template_id);
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać CV.');
    expect(writes()).toEqual(['preview-templates', 'preview-template', 'document']);
    expect(screen.queryByRole('combobox', { name: 'Pasujący szablon' })).not.toBeInTheDocument();
    expect(session.template_id).toBe(alternative.template_id);
    failDocument = false;
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    await waitFor(() => expect(savedTemplates).toHaveLength(1));
    expect(writes()).toEqual(['preview-templates', 'preview-template', 'document', 'document']);
    const documentCalls = interviewRequest.mock.calls.filter(([path]) => path.endsWith('/document'));
    expect(documentCalls.map(([, , body]) => body.revision)).toEqual([3, 3]);
    expect(savedTemplates[0].template_id).toBe(alternative.template_id);
  });

  it.each(['untouched', 'restored'])('preserves the current template when the selector is %s', async (choice) => {
    const selector = await renderTemplateResult();
    expect(selector).toHaveValue('');
    if (choice === 'restored') {
      await userEvent.selectOptions(selector, alternative.template_id);
      await userEvent.selectOptions(selector, '');
    }
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV', exact: true }));
    await waitFor(() => expect(savedTemplates).toHaveLength(1));
    expect(writes()).toEqual(['preview-templates', 'document']);
    expect(savedTemplates[0].template_id).toBe('linden');
  });

  it('keeps optional notes open while clearing text and restores each source draft', async () => {
    profile = { ...profile, sources: { documents: [
      { id: 30, title: 'Anna CV' }, { id: 31, title: 'Other CV' },
    ], imports: [] } };
    const user = userEvent.setup();
    renderInterview({ sessionId: undefined });
    const source = await screen.findByLabelText('Źródło informacji');
    await user.selectOptions(source, 'document:30');
    const summary = screen.getByText('Dodaj notatkę (opcjonalnie)', { exact: true });
    const disclosure = summary.closest('details');
    const input = screen.getByLabelText('Historia zawodowa, projekty i edukacja');
    expect(disclosure).not.toHaveAttribute('open');
    await user.click(summary);
    await user.type(input, 'A');
    await user.keyboard('{Backspace}');
    // Emptying an active input must not hide it or remove keyboard focus.
    expect(input).toHaveValue('');
    expect(disclosure).toHaveAttribute('open');
    expect(input).toHaveFocus();
    await user.type(input, 'Notatka do pierwszego CV.');
    await user.selectOptions(source, 'document:31');
    expect(input).toHaveValue('');
    expect(disclosure).not.toHaveAttribute('open');
    await user.click(summary);
    await user.type(input, 'Notatka do drugiego CV.');
    await user.selectOptions(source, 'document:30');
    expect(input).toHaveValue('Notatka do pierwszego CV.');
    expect(disclosure).toHaveAttribute('open');
    await user.selectOptions(source, 'document:31');
    expect(input).toHaveValue('Notatka do drugiego CV.');
    expect(disclosure).toHaveAttribute('open');
    expect(writes()).toEqual([]);
  });

  it('prioritises the next question and keeps early preparation secondary', async () => {
    renderInterview();
    const next = await screen.findByRole('button', { name: 'Następne pytanie', exact: true });
    const prepare = screen.getByRole('button', { name: 'Przejdź do przygotowania CV', exact: true });
    expect(next).toHaveClass(classes.primary);
    expect(prepare).not.toHaveClass(classes.primary);
    expect(screen.getAllByRole('button').filter((button) => button.classList.contains(classes.primary))).toEqual([next]);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['round boundary', { discovery_round_complete: true }],
    ['completed discovery', { discovery_complete: true }],
    ['answer ceiling', { discovery_complete: true, discovery_exhausted: true, question_limit: 50 }],
  ])('prioritises preparation at the %s without requesting another question', async (_, progress) => {
    session = { ...session, ...progress, phase: 'review', answers: [{ question, answer: 'Przygotowałam raport.' }] };
    renderInterview();
    const prepare = await screen.findByRole('button', { name: 'Przejdź do przygotowania CV', exact: true });
    expect(prepare).toHaveClass(classes.primary);
    expect(screen.queryByRole('button', { name: 'Następne pytanie', exact: true })).not.toBeInTheDocument();
    await userEvent.setup().click(prepare);
    expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji', exact: true })).toBeEnabled();
    expect(writes()).toEqual([]);
  });

  it('keeps unchanged stage navigation free and exposes source maintenance only during review', async () => {
    const user = userEvent.setup();
    renderInterview();
    await screen.findByRole('button', { name: 'Następne pytanie', exact: true });
    expect(screen.queryByRole('button', { name: 'Wczytaj aktualne CV do wywiadu', exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '01 Twoje informacje', exact: true }));
    expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu', exact: true })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Przejdź do rozmowy', exact: true }));
    await user.click(screen.getByRole('button', { name: '03 Przygotuj CV', exact: true }));
    expect(screen.getByRole('button', { name: 'Przygotuj CV z potwierdzonych informacji', exact: true })).toBeEnabled();
    expect(writes()).toEqual([]);
  });

  it('saves before the explicit next action and does not spend credits to advance automatically', async () => {
    session = { ...session, phase: 'question', question };
    const user = userEvent.setup();
    renderInterview();
    await user.type(await screen.findByLabelText('Twoja odpowiedź'), 'Zbudowałam raportowanie.');
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź', exact: true }));
    const next = await screen.findByRole('button', { name: 'Następne pytanie', exact: true });
    expect(next).toHaveClass(classes.primary);
    expect(writes()).toEqual(['answers']);
    await user.click(next);
    await screen.findByLabelText('Twoja odpowiedź');
    expect(writes()).toEqual(['answers', 'next']);
  });

  it('blocks preparation while a question is pending in both stage controls', async () => {
    session = { ...session, phase: 'question', question };
    renderInterview();
    await screen.findByLabelText('Twoja odpowiedź');
    expect(screen.getByRole('button', { name: '03 Przygotuj CV', exact: true })).toBeDisabled();
    expect(screen.getByRole('option', { name: /Przygotuj CV/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Przejdź do przygotowania CV', exact: true })).not.toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it('keeps a failed answer draft through read-only recovery', async () => {
    session = { ...session, phase: 'question', question };
    failAnswer = true;
    const user = userEvent.setup();
    renderInterview();
    const answer = await screen.findByLabelText('Twoja odpowiedź');
    await user.type(answer, 'Zautomatyzowałam raport tygodniowy.');
    await user.click(screen.getByRole('button', { name: 'Zapisz odpowiedź', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać odpowiedzi.');
    await user.click(screen.getByRole('button', { name: 'Wczytaj zapisany stan', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zapisz odpowiedź', exact: true })).toBeEnabled());
    expect(screen.getByLabelText('Twoja odpowiedź')).toHaveValue('Zautomatyzowałam raport tygodniowy.');
    expect(writes()).toEqual(['answers']);
  });

  it('protects note drafts from source refresh and retains the review after failed confirmation', async () => {
    profile = { ...profile, facts: [name, note] };
    failConfirm = true;
    const user = userEvent.setup();
    renderInterview();
    await user.click(await screen.findByRole('button', { name: '01 Twoje informacje', exact: true }));
    await user.click(screen.getByRole('button', { name: /Z wywiadu i notatki/ }));
    await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Notatki', exact: true }));
    await user.click(screen.getByRole('button', { name: /^Edytuj:/ }));
    const content = screen.getByLabelText('Treść');
    await user.clear(content);
    await user.type(content, 'Automatyzowałam cotygodniowe raporty.');
    expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Przejdź do rozmowy', exact: true })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę', exact: true }));
    expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu', exact: true })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Przejdź do rozmowy', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać informacji.');
    expect(screen.getByRole('button', { name: '01 Twoje informacje', exact: true })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Automatyzowałam cotygodniowe raporty.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wczytaj aktualne CV do wywiadu', exact: true })).toBeDisabled();
    expect(writes()).toEqual(['confirm']);
  });
});
