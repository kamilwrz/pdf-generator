import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AiAssistant from './AiAssistant';
import InterviewFlow from '../Interview/InterviewFlow';
import { interviewRequest } from '../../../services/interviews';
import { setUiLanguage, t } from '../../../i18n/index.js';

const state = vi.hoisted(() => ({
  cv: { name: 'Anna Nowak', summary: 'Przygotowywanie raportów.' },
  entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' },
  bridge: { nonce: 1, action: 'interview' },
  assistantRequest: vi.fn(),
  sessionKey: 'test',
  conversationKey: 'test',
}));

vi.mock('../../../store/canvas-context', () => ({ useCanvasContext: () => ({
  A4_Elements: [], activeCvData: state.cv, activePdfId: 30, activeTemplateId: 'linden',
}) }));
vi.mock('../../../store/session-context', () => ({ useSession: () => ({ entitlements: state.entitlements }) }));
vi.mock('../../../store/ui-surfaces-context', () => ({ useUiSurfaces: () => ({ assistantAction: state.bridge }) }));
vi.mock('../../../store/scoped-ai-context', () => ({ useScopedAi: () => null }));
vi.mock('../../../store/document-lifecycle-context', () => ({ useDocumentLifecycle: () => ({
  sessionKey: state.sessionKey, conversationKey: state.conversationKey,
  revision: 1, captureDocumentScope: () => ({ epoch: state.sessionKey, revision: 1 }),
  isDocumentScopeCurrent: () => true,
}) }));
vi.mock('../../../hooks/useEntitlements', () => ({ useEntitlements: () => ({ entitlements: state.entitlements, refresh: vi.fn() }) }));
vi.mock('../../../services/interviews', async (original) => ({ ...await original(), interviewRequest: vi.fn() }));
vi.mock('../../../services/api', async (original) => ({ ...await original(), wakeBackend: vi.fn(),
  ApiClient: class { httpRequest(...args) { return state.assistantRequest(...args); } },
}));

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  state.bridge = { nonce: 1, action: 'interview' };
  state.sessionKey = 'test';
  state.conversationKey = 'test';
  state.assistantRequest.mockResolvedValue({ cv_language: 'pl', message: 'Audit complete.' });
  interviewRequest.mockImplementation(async (path, method, body) => {
    if (path === '/career-profile') return { revision: 1, facts: [] };
    if (path.endsWith('/credits')) return { credits_charged: 0, requests: [] };
    if (path === '/ai/interviews' && method === 'POST') return {
      id: 'new', revision: 1, mode: 'enrich', phase: 'intake', language: body.language,
      evidence_scope: 'session', evidence_profile: { revision: 1, facts: [] },
      answers: [], proposed_facts: [], requirements: [],
    };
    throw new Error(`Unexpected interview request: ${path}`);
  });
});

it.each([
  { manual: false, change: 'none' },
  { manual: true, change: 'none' },
  { manual: true, change: 'template' },
  { manual: true, change: 'document' },
])('keeps source detection and manual language scoped correctly ($manual, $change)', async ({ manual, change }) => {
  await setUiLanguage('en');
  state.bridge = null;
  const { rerender } = render(<MemoryRouter><AiAssistant /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: t('ai:aiAssistant.openAiAssistant') }));
  await userEvent.click(screen.getByRole('button', { name: t('ai:aiAssistant.checkCv'), exact: true }));
  await screen.findByText('Audit complete.');
  await userEvent.click(screen.getByRole('button', { name: t('ai:task.tools') }));
  await userEvent.click(screen.getByRole('button', { name: t('ai:task.textCorrections'), exact: true }));
  const detectedLanguage = screen.getByRole('combobox', { name: t('ai:aiAssistant.cvLanguage') });
  expect(detectedLanguage).toHaveValue('pl');
  if (manual) await userEvent.selectOptions(detectedLanguage, 'de');
  await userEvent.click(screen.getByRole('button', { name: t('ai:aiAssistant.cancel'), exact: true }));
  // A template replacement invalidates canvas references, while opening a
  // different document also changes the identity that owns this preference.
  if (change !== 'none') {
    state.sessionKey = 'replaced-canvas';
    if (change === 'document') state.conversationKey = 'another-document';
    rerender(<MemoryRouter><AiAssistant /></MemoryRouter>);
  }
  const expectedLanguage = manual && change !== 'document' ? 'de' : 'en';
  await userEvent.click(screen.getByRole('button', { name: t('public:hero.openInterview'), exact: true }));
  await userEvent.click(await screen.findByText(/^(Język CV:|CV language:)/));
  expect(await screen.findByRole('combobox', { name: t('interview:interviewFlow.newCvLanguage') })).toHaveValue(expectedLanguage);
  await userEvent.click(screen.getByRole('button', { name: t('interview:interviewFlow.startInterview') }));
  await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST',
    expect.objectContaining({ language: expectedLanguage, cv_data: state.cv }), expect.any(String)));
});
afterEach(async () => { cleanup(); await setUiLanguage('pl'); });

it.each(['en', 'pl'])('defaults an embedded interview to %s and sends that document language', async (language) => {
  await setUiLanguage(language);
  render(<MemoryRouter><AiAssistant /></MemoryRouter>);
  await userEvent.click(await screen.findByText(/^(Język CV:|CV language:)/));
  expect(await screen.findByRole('combobox', { name: t('interview:interviewFlow.newCvLanguage') })).toHaveValue(language);
  await userEvent.click(screen.getByRole('button', { name: t('interview:interviewFlow.startInterview') }));
  await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST',
    expect.objectContaining({ language, cv_data: state.cv }), expect.any(String)));
});

it('retains an explicit document language and sends a later selection independently of English UI', async () => {
  await setUiLanguage('en');
  render(<MemoryRouter><InterviewFlow initialSource={{ cv_data: state.cv, language: 'de' }} /></MemoryRouter>);
  await userEvent.click(await screen.findByText(/^(Język CV:|CV language:)/));
  const selector = await screen.findByRole('combobox', { name: t('interview:interviewFlow.newCvLanguage') });
  expect(selector).toHaveValue('de');
  await userEvent.selectOptions(selector, 'en');
  await userEvent.click(screen.getByRole('button', { name: t('interview:interviewFlow.startInterview') }));
  await waitFor(() => expect(interviewRequest).toHaveBeenCalledWith('/ai/interviews', 'POST',
    expect.objectContaining({ language: 'en', cv_data: state.cv }), expect.any(String)));
});
