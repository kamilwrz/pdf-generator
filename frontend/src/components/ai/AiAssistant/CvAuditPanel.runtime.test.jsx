import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setUiLanguage } from '../../../i18n';
import CvAuditPanel from './CvAuditPanel';

afterEach(async () => {
  cleanup();
  await act(async () => setUiLanguage('pl'));
});

function finding(overrides = {}) {
  return {
    id: 'grammar-1', severity: 'medium', kind: 'error', title: 'Niepoprawna odmiana',
    description: 'Forma czasownika nie zgadza się z podmiotem.',
    evidence: [{ element_id: 'private-canvas-id', quote: 'Przygotowywać raporty co tydzień.' }],
    recommendation: 'Dopasuj formę czasownika do pozostałych opisów.',
    action: 'grammar', ...overrides,
  };
}

function category(id, findings = [], overrides = {}) {
  return {
    id, label: 'Historical provider label', description: 'Zakres sprawdzenia danej kategorii.',
    status: findings.length ? 'needs_attention' : 'clear',
    summary: findings.length ? 'W opisie jest punkt do dopracowania.' : 'Brak uwag do dostępnej treści.',
    findings, ...overrides,
  };
}

function audit(overrides = {}) {
  return {
    version: 1, summary: 'Przed wysłaniem CV doprecyzuj efekty pracy i sprawdź język.',
    total_findings: 100, // The display must count the actual findings, never a duplicate summary field.
    categories: [
      category('grammar', [finding()]),
      category('achievements', [finding({ id: 'achievement-1', severity: 'high', kind: 'missing',
        title: 'Brakuje rezultatu pracy', action: 'interview', question: 'Co zmieniły Twoje raporty?',
        evidence: [], location: 'Doświadczenie → Analityk',
      })]),
      category('contact'),
      category('job_fit', [], { status: 'not_assessed', recommended_action: 'match_job', summary: 'Potrzebna jest konkretna oferta pracy.' }),
    ],
    strengths: ['Dane kontaktowe są podane wprost.'],
    limitations: ['Nie przeprowadzono analizy konkretnej oferty.'],
    ...overrides,
  };
}

it('presents distinct counts and unassessed categories without claiming a CV quality score', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const { container } = render(<CvAuditPanel audit={audit()} onAction={onAction} />);
  const panel = screen.getByRole('region', { name: 'Audyt CV' });
  const overview = within(panel).getByRole('region', { name: 'Podsumowanie audytu' });
  expect(within(overview).getByText('2 wskazówki do Twojego CV')).toBeVisible();
  expect(within(overview).getByText('Błędy').nextSibling).toHaveTextContent('1');
  expect(within(overview).getByText('Brakujące informacje').nextSibling).toHaveTextContent('1');
  expect(within(overview).getByText('Do ulepszenia').nextSibling).toHaveTextContent('0');
  expect(within(overview).getByText('Do potwierdzenia').nextSibling).toHaveTextContent('0');
  expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  expect(screen.queryByText(/100%|100 wskazówek/)).not.toBeInTheDocument();
  expect(within(panel).getByText(/Audyt nie zmienia CV/)).toBeVisible();

  const contact = container.querySelector('[data-audit-category="contact"]');
  expect(within(contact).getByText('Bez uwag w tym audycie')).toBeVisible();
  const jobFit = container.querySelector('[data-audit-category="job_fit"]');
  expect(within(jobFit).getByText('Nie oceniono')).toBeVisible();
  expect(within(jobFit).queryByText('0 do poprawienia')).not.toBeInTheDocument();
  await user.click(jobFit.querySelector('summary'));
  expect(within(jobFit).getByText('Potrzebna jest konkretna oferta pracy.')).toBeVisible();
  expect(onAction).not.toHaveBeenCalled();
});

it('opens a priority by keyboard, focuses its finding and preserves reading state across language changes', async () => {
  const user = userEvent.setup();
  const result = audit();
  const onAction = vi.fn();
  const { container } = render(<CvAuditPanel audit={result} onAction={onAction} />);
  const priority = within(screen.getByRole('navigation', { name: 'Od czego zacząć' }))
    .getByRole('button', { name: /Brakuje rezultatu pracy/ });
  priority.focus();
  await user.keyboard('{Enter}');
  const details = container.querySelector('[data-audit-category="achievements"]');
  const findingHeading = within(details).getByRole('heading', { name: 'Brakuje rezultatu pracy' });
  expect(details).toHaveAttribute('open');
  expect(findingHeading).toHaveFocus();
  expect(within(details).getByText('Co zmieniły Twoje raporty?')).toBeVisible();
  expect(within(details).getByText('Doświadczenie → Analityk')).toBeVisible();
  expect(onAction).not.toHaveBeenCalled();

  await act(async () => setUiLanguage('en'));
  expect(screen.getByRole('region', { name: 'CV audit' })).toBeVisible();
  expect(within(details).getByText('Achievements and specifics')).toBeVisible();
  expect(within(details).getByRole('button', { name: 'Open interview' })).toBeVisible();
  expect(findingHeading).toHaveFocus();
  expect(details).toHaveAttribute('open');
  expect(findingHeading).toHaveTextContent('Brakuje rezultatu pracy');
});

it.each([
  ['grammar', 'Popraw gramatykę'], ['language', 'Popraw styl języka'],
  ['improve', 'Wzmocnij treść'], ['shorten', 'Skróć CV'],
  ['translate', 'Wybierz język tłumaczenia'], ['interview', 'Otwórz wywiad'],
  ['ats_score', 'Sprawdź czytelność ATS'], ['match_job', 'Dodaj ofertę pracy'],
])('routes %s only after its explicitly named tool button is activated', async (action, label) => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const source = audit({ categories: [category('grammar', [finding({ action })])] });
  const { container, rerender } = render(<CvAuditPanel audit={source} onAction={onAction} />);
  await user.click(container.querySelector('summary'));
  const button = screen.getByRole('button', { name: label });
  const stableId = button.id;
  expect(stableId).toMatch(/^cv-audit-action-/);
  expect(onAction).not.toHaveBeenCalled();
  rerender(<CvAuditPanel audit={source} onAction={onAction} />);
  expect(screen.getByRole('button', { name: label })).toHaveAttribute('id', stableId);
  button.focus();
  await user.keyboard(' ');
  expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
});

it('keeps stale findings readable while disabling tools and offering an explicit new audit', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const onRerun = vi.fn();
  const { container, rerender } = render(<CvAuditPanel audit={audit()} stale onAction={onAction} onRerun={onRerun} />);
  expect(screen.getByRole('status')).toHaveTextContent('CV zmieniło się od tego audytu.');
  const details = container.querySelector('[data-audit-category="grammar"]');
  await user.click(details.querySelector('summary'));
  expect(within(details).getByText('Przygotowywać raporty co tydzień.')).toBeVisible();
  const tool = within(details).getByRole('button', { name: 'Popraw gramatykę' });
  expect(tool).toBeDisabled();
  await user.click(tool);
  expect(onAction).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Uruchom audyt ponownie' }));
  expect(onRerun).toHaveBeenCalledOnce();
  rerender(<CvAuditPanel audit={audit()} stale disabled onAction={onAction} onRerun={onRerun} />);
  expect(screen.getByRole('button', { name: 'Uruchom audyt ponownie' })).toBeDisabled();
  expect(tool).toBeDisabled();
  expect(details).toHaveAttribute('open');
});

it('retains explicit action identities when an interview replaces and remounts the audit', async () => {
  const user = userEvent.setup();
  const source = audit();
  const props = { audit: source, auditId: 'saved-audit-message', onAction: vi.fn() };
  const first = render(<CvAuditPanel {...props} />);
  await user.click(first.container.querySelector('[data-audit-category="achievements"] summary'));
  const previousId = screen.getByRole('button', { name: 'Otwórz wywiad' }).id;
  first.unmount();
  render(<CvAuditPanel {...props} />);
  const restored = document.getElementById(previousId);
  expect(restored).not.toBeNull();
  // The assistant owns restoration because it knows which subflow just closed.
  restored.closest('details').open = true;
  restored.focus();
  expect(screen.getByRole('button', { name: 'Otwórz wywiad' })).toHaveFocus();
});

it('gives every specialised action an English label and the same explicit routing contract', async () => {
  const user = userEvent.setup();
  await act(async () => setUiLanguage('en'));
  const actions = [
    ['grammar', 'Fix grammar'], ['language', 'Improve writing style'],
    ['improve', 'Strengthen content'], ['shorten', 'Shorten CV'],
    ['translate', 'Choose translation language'], ['interview', 'Open interview'],
    ['ats_score', 'Check ATS readability'], ['match_job', 'Add a job advert'],
  ];
  const onAction = vi.fn();
  const source = audit({ categories: [category('grammar', actions.map(([action]) => finding({ id: action, action })))] });
  const { container } = render(<CvAuditPanel audit={source} onAction={onAction} />);
  await user.click(container.querySelector('summary'));
  expect(onAction).not.toHaveBeenCalled();
  for (const [action, label] of actions) {
    await user.click(screen.getByRole('button', { name: label }));
    expect(onAction).toHaveBeenLastCalledWith(action);
  }
  expect(onAction).toHaveBeenCalledTimes(actions.length);
});

it('disables tools while busy without blocking category disclosure or running side effects', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const { container } = render(<CvAuditPanel audit={audit()} disabled onAction={onAction} />);
  const details = container.querySelector('[data-audit-category="grammar"]');
  const summary = details.querySelector('summary');
  await user.click(summary);
  expect(details).toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'Popraw gramatykę' })).toBeDisabled();
  await user.click(summary);
  expect(details).not.toHaveAttribute('open');
  expect(onAction).not.toHaveBeenCalled();
});

it('keeps raw evidence identifiers and provider-supplied navigation out of the user flow', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  const { container } = render(<CvAuditPanel audit={audit({ categories: [category('grammar', [
    finding({ action: 'https://provider.example/untrusted', title: '<img src=x onerror=alert(1)>' }),
  ])] })} onAction={onAction} />);
  await user.click(container.querySelector('summary'));
  expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('private-canvas-id')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText(/Popraw ten punkt ręcznie w CV/)).toBeVisible();
  expect(onAction).not.toHaveBeenCalled();
});

it('explains a zero-finding result without treating unassessed areas as successful checks', async () => {
  await act(async () => setUiLanguage('en'));
  const { container } = render(<CvAuditPanel audit={audit({ categories: [
    category('grammar'), category('ats', [], { status: 'not_assessed', recommended_action: 'ats_score' }),
  ] })} />);
  expect(screen.getByText('0 findings for your CV')).toBeVisible();
  expect(screen.getByText(/No findings in the assessed categories/)).toBeVisible();
  expect(screen.getByText(/Categories assessed: 1 of 2/)).toBeVisible();
  expect(screen.queryByRole('navigation', { name: 'Where to start' })).not.toBeInTheDocument();
  expect(within(container.querySelector('[data-audit-category="ats"]')).getByText('Not assessed')).toBeVisible();
});
