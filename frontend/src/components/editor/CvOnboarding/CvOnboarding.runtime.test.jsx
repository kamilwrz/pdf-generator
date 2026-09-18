import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUiLanguage } from '../../../i18n/index.js';
import { createDefaultStarterConfig } from '../../../utils/cvStarter.js';
import { loadOnboarding, saveOnboarding } from '../../../utils/cvOnboarding.js';
import { readCvSource, extractCvPdf } from '../../../services/cvImport';
import { interviewRequest } from '../../../services/interviews';
import CvOnboarding from './CvOnboarding';

vi.mock('../../../services/cvImport', async original => ({ ...await original(), readCvSource: vi.fn(), extractCvPdf: vi.fn() }));
vi.mock('../../../services/interviews', () => ({ interviewRequest: vi.fn() }));
vi.mock('../../../utils/authSession', () => ({ getSessionUsername: () => 'Kamil', getAccessToken: () => 'test-token' }));
const cvData = { name: 'Anna Test', language: 'English', summary: 'Existing content' };
const pro = { ai_assistant: true, extract_cv: true, template_tier: 'all', remaining: { cv_imports: 2 } };
const free = { ai_assistant: false, extract_cv: true, template_tier: 'free', allowed_template_ids: ['meridian', 'linden', 'slate'], remaining: { cv_imports: 1 } };
const click = name => fireEvent.click(screen.getByRole('button', { name, exact: true }));
function mount(props = {}) {
  const actions = { onCreate: vi.fn().mockResolvedValue(true), onImportCreate: vi.fn().mockResolvedValue(true), onClose: vi.fn(), onNavigate: vi.fn().mockResolvedValue(true), refreshEntitlements: vi.fn() };
  const view = render(<StrictMode><CvOnboarding entitlements={pro} {...actions} {...props} /></StrictMode>);
  return { ...view, ...actions };
}
async function existing() {
  click('Mam CV');
  fireEvent.click(screen.getByText('Moje CV i wcześniejsze importy'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'CV Anny' })).toBeEnabled());
  click('CV Anny');
  await screen.findByText('Wybrane CV:');
}
beforeEach(async () => {
  localStorage.clear();
  await setUiLanguage('pl');
  vi.clearAllMocks();
  readCvSource.mockResolvedValue({ cvData, title: 'CV Anny' });
  interviewRequest.mockImplementation(async path => path === '/tailoring/sources' ? { documents: [{ id: 41, title: 'CV Anny' }] } : { items: [], next_cursor: null });
});
afterEach(cleanup);

describe('CV onboarding', () => {
  it('does not create on mount, skips source and goal for blank CV, and commits once', async () => {
    const ui = mount();
    expect(ui.onCreate).not.toHaveBeenCalled();
    expect(readCvSource).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Przygotujmy Twoje CV' })).toHaveFocus();
    click('Zaczynam od zera');
    expect(screen.getByRole('list', { name: 'Etapy tworzenia CV' }).children).toHaveLength(2);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    const submit = screen.getByRole('button', { name: 'Otwórz CV w edytorze' });
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(ui.onClose).toHaveBeenCalledWith('created'));
    expect(ui.onCreate).toHaveBeenCalledExactlyOnceWith(createDefaultStarterConfig(), { replacementConfirmed: false, isCurrent: expect.any(Function) });
    expect(loadOnboarding('Kamil')).toBeNull();
  });

  it('keeps a paid landing choice locked until template permissions resolve and offers retry', () => {
    const ui = mount({ initialTemplateId: 'vellum', entitlements: {} });
    click('Zaczynam od zera');
    expect(screen.getByRole('radio', { name: /Vellum/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Otwórz CV w edytorze' })).toBeDisabled();
    click('Sprawdź ponownie');
    expect(ui.refreshEntitlements).toHaveBeenCalledOnce();
    expect(ui.onCreate).not.toHaveBeenCalled();
  });

  it('retains landing template, document language, photo, contacts and custom sections on Back and refresh', async () => {
    const ui = mount({ initialTemplateId: 'linden' });
    click('Zaczynam od zera');
    expect(screen.getByRole('radio', { name: /Linden/ })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Język CV'), { target: { value: 'en' } });
    click('Dostosuj zawartość');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zdjęcie' }));
    click('Dodaj linki');
    fireEvent.click(screen.getByRole('checkbox', { name: 'LinkedIn' }));
    fireEvent.click(screen.getByRole('button', { name: /^Sekcje CV/ }));
    fireEvent.change(screen.getByLabelText(/Własna sekcja/), { target: { value: 'Conferences' } });
    click('Dodaj');
    click('Wstecz');
    click('Zaczynam od zera');
    const saved = loadOnboarding('Kamil');
    expect(saved.config).toMatchObject({ templateId: 'linden', language: 'en', includePhoto: true });
    expect(saved.config.contacts.find(item => item.key === 'linkedin').selected).toBe(true);
    expect(saved.config.sections.at(-1).label).toBe('Conferences');
    ui.unmount();
    const resumed = mount();
    click('Otwórz CV w edytorze');
    await waitFor(() => expect(resumed.onCreate).toHaveBeenCalled());
    expect(resumed.onCreate.mock.calls[0][0]).toEqual(saved.config);
  });

  it('asks for one replacement confirmation and retains configuration after fill failure', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Fill unavailable'));
    mount({ hasActiveDocument: true, onCreate });
    click('Zaczynam od zera');
    click('Otwórz CV w edytorze');
    expect(onCreate).not.toHaveBeenCalled();
    click('Wróć do wyboru');
    expect(screen.getByRole('heading', { name: 'Wybierz szablon dla swojego CV' })).toBeVisible();
    click('Otwórz CV w edytorze');
    click('Utwórz nowe CV');
    await screen.findByText('Fill unavailable');
    expect(onCreate).toHaveBeenCalledExactlyOnceWith(createDefaultStarterConfig(), { replacementConfirmed: true, isCurrent: expect.any(Function) });
    expect(loadOnboarding('Kamil').step).toBe('template');
  });

  it('gates guest upload before the file input and preserves auth intent', async () => {
    const ui = mount({ isGuest: true });
    click('Mam CV');
    expect(screen.queryByLabelText('Upuść tutaj CV lub wybierz plik')).not.toBeInTheDocument();
    click('Utwórz darmowe konto');
    await waitFor(() => expect(ui.onNavigate).toHaveBeenCalledWith('/register?start=onboarding', expect.any(Function)));
    expect(loadOnboarding('Kamil').step).toBe('source');
  });

  it('hands the original CV to manual filling without changing its language or calling AI', async () => {
    const ui = mount();
    await existing();
    expect(screen.getByRole('list', { name: 'Etapy tworzenia CV' }).children).toHaveLength(4);
    click('Wybierz szablon');
    expect(screen.queryByRole('button', { name: 'Dostosuj zawartość' })).not.toBeInTheDocument();
    click('Otwórz CV w edytorze');
    await waitFor(() => expect(ui.onImportCreate).toHaveBeenCalledExactlyOnceWith(cvData, 'meridian', { kind: 'document', id: 41 }, { replacementConfirmed: false, isCurrent: expect.any(Function) }));
    expect(extractCvPdf).not.toHaveBeenCalled();
  });

  it('opens improvement with the selected source but never starts paid inference', async () => {
    const ui = mount();
    await existing();
    fireEvent.click(screen.getByRole('radio', { name: /Poprawić treść/ }));
    expect(screen.getByRole('list', { name: 'Etapy tworzenia CV' }).children).toHaveLength(3);
    click('Otwórz Asystenta CV');
    await waitFor(() => expect(ui.onNavigate).toHaveBeenCalledWith('/app/interview?source=document&sourceId=41&language=en', expect.any(Function)));
    expect(interviewRequest.mock.calls.every(call => !call[1] || call[1] === 'GET')).toBe(true);
  });

  it.each([free, null])('allows manual work and never grants unresolved or Free AI entitlement', async entitlements => {
    const ui = mount({ entitlements });
    await existing();
    fireEvent.click(screen.getByRole('radio', { name: /Poprawić treść/ }));
    if (entitlements) {
      click('Poznaj Pro');
      await waitFor(() => expect(ui.onNavigate).toHaveBeenCalledWith('/app/account?purchase=pro', expect.any(Function)));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(ui.onClose).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByRole('button', { name: 'Otwórz Asystenta CV' })).not.toBeInTheDocument();
      click('Sprawdź ponownie');
      expect(ui.refreshEntitlements).toHaveBeenCalled();
    }
    expect(loadOnboarding('Kamil').source).toEqual({ kind: 'document', id: 41 });
  });

  it('retains tailoring operation identity through an uncertain PUT and recovers without a second write', async () => {
    const ui = mount();
    await existing();
    fireEvent.click(screen.getByRole('radio', { name: /Dopasować do ogłoszenia/ }));
    interviewRequest.mockRejectedValueOnce(new Error('Connection lost'));
    click('Przejdź do ogłoszenia');
    await screen.findByText('Connection lost');
    const id = loadOnboarding('Kamil').tailoringId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    interviewRequest.mockResolvedValueOnce({ id });
    click('Przejdź do ogłoszenia');
    await waitFor(() => expect(ui.onNavigate).toHaveBeenCalledWith(`/app/tailor/${id}`, expect.any(Function)));
    expect(interviewRequest.mock.calls.filter(call => call[1] === 'PUT')).toHaveLength(1);
    expect(interviewRequest).toHaveBeenLastCalledWith(`/tailoring/${id}`);
  });

  it('rehydrates owned IDs on refresh, rejects inaccessible sources and never starts AI', async () => {
    saveOnboarding({ version: 1, owner: 'Kamil', mode: 'existing', step: 'goal', goal: 'improve', source: { kind: 'import', id: 4 }, config: createDefaultStarterConfig() });
    readCvSource.mockRejectedValue(new Error('Source removed'));
    mount();
    await screen.findByText('Source removed');
    expect(screen.getByRole('button', { name: 'Otwórz Asystenta CV' })).toBeDisabled();
    expect(interviewRequest).not.toHaveBeenCalled();
    readCvSource.mockResolvedValue({ cvData, title: 'Recovered' });
    click('Odczytaj źródło ponownie');
    await screen.findByText('Recovered');
  });

  it('validates PDF uploads, blocks duplicates and reuses the key after uncertain failure', async () => {
    mount({ initialIntent: 'import' });
    const input = screen.getByLabelText('Upuść tutaj CV lub wybierz plik');
    fireEvent.change(input, { target: { files: [new File(['bad'], 'cv.docx')] } });
    await screen.findByText('Wybierz CV w formacie PDF.');
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })] } });
    extractCvPdf.mockRejectedValueOnce(new Error('Timeout'));
    click('Odczytaj CV z PDF'); click('Odczytaj CV z PDF');
    await screen.findByText('Timeout');
    const key = extractCvPdf.mock.calls[0][1];
    extractCvPdf.mockResolvedValueOnce({ import: { id: 8 }, cv_data: cvData });
    click('Odczytaj CV z PDF');
    await screen.findByText('Wybrane CV:');
    expect(extractCvPdf).toHaveBeenCalledTimes(2);
    expect(extractCvPdf.mock.calls[1][1]).toBe(key);
    const stored = localStorage.getItem('cvstudio.onboarding.v1');
    expect(stored).not.toContain('Anna Test');
    expect(stored).not.toContain('%PDF');
    expect(loadOnboarding('Kamil').config.language).toBe('en');
    expect(stored).not.toContain('Existing content');
  });

  it('ignores a source response after unmount and clears only on deliberate cancellation', async () => {
    let resolve;
    readCvSource.mockImplementation(() => new Promise(done => { resolve = done; }));
    const ui = mount();
    click('Mam CV');
    fireEvent.click(screen.getByText('Moje CV i wcześniejsze importy'));
    await screen.findByRole('button', { name: 'CV Anny' });
    click('CV Anny');
    ui.unmount();
    resolve({ cvData, title: 'Late' });
    await waitFor(() => expect(loadOnboarding('Kamil').source).toBeNull());
    expect(ui.onImportCreate).not.toHaveBeenCalled();
    mount();
    click('Wstecz'); click('Zamknij kreator');
    expect(loadOnboarding('Kamil')).toBeNull();
  });
});
