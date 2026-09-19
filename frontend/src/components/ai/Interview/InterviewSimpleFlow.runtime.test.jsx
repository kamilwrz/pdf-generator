import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InterviewFlow from './InterviewFlow';
import { interviewRequest } from '../../../services/interviews';

vi.mock('../../../hooks/useEntitlements', () => ({ useEntitlements: () => ({
  entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' }, refresh: vi.fn(),
}) }));
vi.mock('../../../services/interviews', async original => ({ ...await original(), interviewRequest: vi.fn() }));

const fact = { id: 'name', text: 'Anna Example', kind: 'fact', path: '/name', source: 'document:7' };
const question = { id: 'first', text: 'Jakie zadania wykonywałaś?', reason: '', topic: 'experience' };
let session;
let failNext;
let failSave;
let clarify;
const writes = () => interviewRequest.mock.calls.filter(([, method]) => method === 'POST');

beforeEach(() => {
  failNext = false; failSave = false; clarify = false;
  session = { id: 'simple', revision: 1, profile_revision: 0, evidence_scope: 'session',
    evidence_profile: { revision: 0, facts: [] }, review_source_facts: [fact],
    phase: 'intake', mode: 'create', language: 'pl', confirmed: false,
    source_document_id: 7, source_cv_data: { name: fact.text }, template_id: 'linden',
    answers: [], question: null, question_limit: 10, requirements: [], proposed_facts: [] };
  interviewRequest.mockImplementation(async (path, method, body) => {
    if (path === '/career-profile') return { revision: 99, facts: [{ ...fact, text: 'Another person' }], sources: { documents: [{ id: 7, title: 'Anna CV' }], imports: [{ id: 8, filename: 'Import.pdf' }] } };
    if (path.endsWith('/credits')) return { credits_charged: 0, requests: [] };
    if (method !== 'POST' || path === '/ai/interviews') return structuredClone(session);
    // Every chained action must use the versions just returned by the server.
    expect(body.revision).toBe(session.revision);
    expect(body.profile_revision).toBe(session.profile_revision);
    session = { ...session, revision: session.revision + 1 };
    if (path.endsWith('/confirm')) {
      session = { ...session, phase: 'ready', confirmed: true, profile_revision: 1, evidence_profile: { revision: 1, facts: body.facts } };
      return { session: structuredClone(session), profile: structuredClone(session.evidence_profile) };
    }
    if (path.endsWith('/next')) {
      if (failNext) { session.revision--; throw new Error('Question failed'); }
      session = { ...session, phase: 'question', question: { ...question, id: 'q' + session.answers.length } };
    }
    if (path.endsWith('/answers')) session = { ...session, question: null, phase: 'review',
      answers: [...session.answers, { question: session.question, answer: body.answer, status: body.status }],
      discovery_round_complete: session.answers.length > 0 };
    if (path.endsWith('/preview')) session = { ...session, phase: clarify ? 'clarification' : 'preview',
      template_id: body.template_id, preview: clarify ? null : { pages: 1, profile_revision: 1, cv_data: { name: fact.text }, changes: [], remaining_gaps: [] } };
    if (path.endsWith('/document')) {
      if (failSave) { session.revision--; throw new Error('Save failed'); }
      return { document_id: 42 };
    }
    return structuredClone(session);
  });
});
afterEach(cleanup);

function mount(props = {}) {
  return render(<MemoryRouter><Routes><Route path="/" element={<InterviewFlow {...props} />} /><Route path="/app/documents/42" element={<h1>Saved CV</h1>} /></Routes></MemoryRouter>);
}
async function start() {
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Anna CV' }));
  await screen.findByRole('textbox', { name: 'Twoja odpowiedź' });
}

/** Hold a real request boundary so intermediate UI cannot pass unnoticed. */
function pauseRequest(action) {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const respond = interviewRequest.getMockImplementation();
  interviewRequest.mockImplementation(async (path, ...args) => {
    if (path.endsWith(`/${action}`)) await pending;
    return respond(path, ...args);
  });
  return () => act(async () => { release(); });
}

it.each(['source', 'answer', 'resume'])('shows only progress while the next question is pending after %s', async entry => {
  if (entry === 'answer') await start();
  if (entry === 'resume') {
    session = { ...session, phase: 'ready', confirmed: true,
      evidence_profile: { revision: 0, facts: [fact] } };
    mount({ sessionId: session.id, onClose: vi.fn() });
    await screen.findByRole('button', { name: 'Następne pytanie' });
    expect(writes()).toHaveLength(0);
  }
  const release = pauseRequest('next');
  if (entry === 'source') {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Anna CV' }));
  } else if (entry === 'answer') {
    await userEvent.type(screen.getByRole('textbox', { name: 'Twoja odpowiedź' }), 'Raporty');
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedź' }));
    expect(session.answers).toHaveLength(1);
  } else await userEvent.click(screen.getByRole('button', { name: 'Następne pytanie' }));

  expect(await screen.findByRole('progressbar', { name: 'Dobór pytania przez AI' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Następne pytanie' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Wybierz szablon', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('Odpowiedź zapisana. Idziemy dalej?')).not.toBeInTheDocument();
  expect(screen.getByText('Kredyty')).toBeVisible();
  await release();
  expect(await screen.findByRole('textbox', { name: 'Twoja odpowiedź' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Rozmowa o doświadczeniu' })).toHaveFocus();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('keeps the answer and disabled form visible until persistence completes', async () => {
  await start();
  const release = pauseRequest('answers');
  const field = screen.getByRole('textbox', { name: 'Twoja odpowiedź' });
  await userEvent.type(field, 'Raporty');
  await userEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedź' }));
  expect(await screen.findByRole('heading', { name: 'Zapisujemy odpowiedź' })).toBeVisible();
  expect(field).toBeVisible();
  expect(field).toHaveValue('Raporty');
  expect(field).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Wyślij odpowiedź' })).toBeDisabled();
  expect(session.answers).toHaveLength(0);
  await release();
  expect(session.answers).toHaveLength(1);
});

it('choosing a CV confirms only its source and asks automatically, without review or account facts', async () => {
  await start();
  expect(writes().map(([path]) => path.split('/').at(-1))).toEqual(['interviews', 'confirm', 'next']);
  expect(writes()[0][2]).toMatchObject({ source_document_id: 7, include_profile: false, candidate_notes: '' });
  expect(writes()[1][2].facts).toEqual([fact]);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Sprawdź informacje do CV')).not.toBeInTheDocument();
  expect(screen.queryByText(/Plan: do|profil konta|Dodaj notatkę/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Treść CV', exact: true }));
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Wróć', exact: true }));
  expect(writes()).toHaveLength(3);
});

it('saves each answer before asking again, then goes straight to templates at the round boundary', async () => {
  await start();
  for (const answer of ['Przygotowywałam raporty.', 'Korzystałam z Excela.']) {
    await userEvent.type(screen.getByRole('textbox', { name: 'Twoja odpowiedź' }), answer);
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedź' }));
    await waitFor(() => expect(session.answers.at(-1).answer).toBe(answer));
  }
  await screen.findByRole('button', { name: 'Utwórz CV · Linden' });
  expect(writes().map(([path]) => path.split('/').at(-1))).toEqual(['interviews', 'confirm', 'next', 'answers', 'next', 'answers']);
  await userEvent.click(screen.getByRole('button', { name: 'Utwórz CV · Linden' }));
  await screen.findByRole('heading', { name: 'Saved CV' });
  expect(writes().slice(-2).map(([path]) => path.split('/').at(-1))).toEqual(['preview', 'document']);
});

it('retains a saved answer after the next question fails and retry does not submit it twice', async () => {
  await start(); failNext = true;
  const release = pauseRequest('next');
  await userEvent.type(screen.getByRole('textbox', { name: 'Twoja odpowiedź' }), 'Raporty');
  await userEvent.click(screen.getByRole('button', { name: 'Wyślij odpowiedź' }));
  await screen.findByRole('progressbar', { name: 'Dobór pytania przez AI' });
  expect(screen.queryByRole('button', { name: 'Następne pytanie' })).not.toBeInTheDocument();
  await release();
  expect(await screen.findByRole('alert')).toHaveTextContent('Question failed');
  expect(session.answers).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Następne pytanie' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Wybierz szablon', exact: true })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Rozmowa o doświadczeniu' })).toHaveFocus();
  failNext = false;
  await userEvent.click(screen.getByRole('button', { name: 'Następne pytanie' }));
  await screen.findByRole('textbox', { name: 'Twoja odpowiedź' });
  expect(writes().filter(([path]) => path.endsWith('/answers'))).toHaveLength(1);
});

it('requires an explicit retry after first-question failure; loading the saved state never calls AI', async () => {
  failNext = true; mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Import.pdf' }));
  await screen.findByRole('alert');
  expect(writes()[0][2]).toMatchObject({ source_import_id: 8, include_profile: false });
  await userEvent.click(screen.getByRole('button', { name: 'Wczytaj zapisany stan' }));
  expect(writes().filter(([path]) => path.endsWith('/next'))).toHaveLength(1);
});

it('an onboarding source marks the CV step complete and waits on the conversation step without paid work', async () => {
  mount({ initialSource: { cv_data: { name: 'Anna Example' }, source_document_id: 7, language: 'pl' } });
  const steps = within(await screen.findByRole('list', { name: 'Etapy rozmowy' })).getAllByRole('listitem');
  expect(steps[0]).toHaveTextContent('CV');
  expect(steps[0]).toHaveTextContent('ukończono');
  expect(steps[0]).not.toHaveAttribute('aria-current');
  expect(steps[1]).toHaveAttribute('aria-current', 'step');
  expect(await screen.findByRole('button', { name: 'Rozpocznij rozmowę' })).toBeEnabled();
  expect(writes()).toHaveLength(0);
});

it('the guided tailoring host shows no CV content toggle and no stage rail', async () => {
  session = { ...session, phase: 'ready', confirmed: true, mode: 'tailor',
    evidence_profile: { revision: 0, facts: [fact] },
    answers: [{ question, answer: 'Raporty' }] };
  mount({ sessionId: session.id, guided: true, onDocumentSaved: vi.fn() });
  await screen.findByRole('button', { name: 'Następne pytanie' });
  expect(screen.queryByRole('button', { name: 'Treść CV', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Etapy rozmowy' })).not.toBeInTheDocument();
});

it.each([false, true])('template selection never saves unverified output and preserves verified save retry (clarify: %s)', async needsClarification => {
  clarify = needsClarification; failSave = !needsClarification;
  await start();
  await userEvent.click(screen.getByRole('button', { name: 'Zakończ rozmowę i wybierz szablon' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Utwórz CV · Linden' }));
  if (needsClarification) {
    await screen.findByRole('button', { name: /Doprecyzuj/ });
    expect(writes().some(([path]) => path.endsWith('/document'))).toBe(false);
  } else {
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    failSave = false;
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz jako nowe CV' }));
    await screen.findByRole('heading', { name: 'Saved CV' });
    expect(writes().filter(([path]) => path.endsWith('/preview'))).toHaveLength(1);
  }
});
