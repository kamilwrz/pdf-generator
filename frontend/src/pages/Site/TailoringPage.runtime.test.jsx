import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import TailoringPage from './TailoringPage';
import { interviewRequest } from '../../services/interviews';

vi.mock('../../hooks/useEntitlements', () => ({ useEntitlements: () => ({
  entitlements: { ai_assistant: true, plan_slug: 'pro', template_tier: 'all' }, refresh: vi.fn(),
}) }));
vi.mock('../../services/interviews', async original => ({ ...await original(), interviewRequest: vi.fn() }));
vi.mock('../../utils/authSession', async original => ({ ...await original(), getAccessToken: () => 'token' }));

// jsdom does not implement scrolling; the layout resets reading position on mount.
window.scrollTo = () => {};

let flow;
beforeEach(() => {
  flow = { id: 'abc', revision: 1, locked: false, session_id: null, document_id: null,
    source_kind: 'document', source_id: 7, source_cv_data: { name: 'Anna Example' },
    offer_kind: 'text', job_description: '', job_offer_url: '', language: 'pl', step: 'source' };
  interviewRequest.mockImplementation(async (path, method, body) => {
    if (path === '/tailoring/sources') return { documents: [{ id: 7, title: 'Anna CV' }], imports: [{ id: 3, filename: 'Import.pdf' }] };
    if (method === 'PUT') { flow = { ...flow, ...body, revision: flow.revision + 1 }; return structuredClone(flow); }
    if (path === '/tailoring/abc') return structuredClone(flow);
    throw new Error(`unexpected request ${path}`);
  });
});
afterEach(cleanup);

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/app/tailor/:flowId', element: <TailoringPage /> }],
    { initialEntries: ['/app/tailor/abc'] });
  render(<RouterProvider router={router} />);
}

it('keeps the CV step to selection only: shared list, no automatic content and no legacy source links', async () => {
  renderPage();
  const selectedRow = await screen.findByRole('button', { name: 'Anna CV' });
  expect(selectedRow).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Import.pdf' })).toHaveAttribute('aria-pressed', 'false');
  // The chosen CV's content must not render automatically on selection.
  expect(screen.queryByText('Anna Example')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sprawdź zapisane importy' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Nie mam jeszcze CV/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText('CV w PDF (do 10 MB)')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Przejdź do oferty' })).toBeEnabled();
});

it('entering at the advert step shows the CV step as completed', async () => {
  flow.step = 'offer';
  renderPage();
  const rail = await screen.findByRole('list', { name: 'Etapy dopasowania CV' });
  const steps = within(rail).getAllByRole('listitem');
  expect(steps[0]).toHaveTextContent('CV');
  expect(steps[0]).toHaveTextContent('ukończono');
  expect(steps[0]).not.toHaveAttribute('aria-current');
  expect(steps[1]).toHaveAttribute('aria-current', 'step');
  expect(steps[2]).not.toHaveTextContent('ukończono');
});
