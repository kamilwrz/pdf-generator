import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InterviewSourcePicker from './InterviewSourcePicker';

afterEach(cleanup);
const documents = Array.from({ length: 9 }, (_, index) => ({ id: index + 1, title: `CV ${index + 1}` }));
const imports = [{ id: 1, filename: 'Import.pdf' }];
function mount(props = {}) {
  const onSelect = vi.fn();
  render(<MemoryRouter><InterviewSourcePicker documents={documents} imports={imports} onSelect={onSelect} {...props} /></MemoryRouter>);
  return onSelect;
}

it('lists CVs and imports together, bounds pages, searches across both kinds and distinguishes colliding source IDs', async () => {
  const user = userEvent.setup();
  const onSelect = mount();
  const list = screen.getByRole('list', { name: 'Źródło CV' });
  // One combined collection replaces the former tab navigation entirely.
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  expect(screen.queryByRole('button', { name: 'Import.pdf' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Następna strona' }));
  expect(screen.getByRole('list', { name: 'Źródło CV' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'CV 5', exact: true })).toBeVisible();
  // The search spans saved CVs and imports without a tab switch.
  await user.type(screen.getByRole('searchbox'), 'Import');
  expect(screen.getByRole('status')).toHaveTextContent('1 z 1');
  const importRow = screen.getByRole('button', { name: 'Import.pdf' });
  expect(importRow).toHaveAccessibleDescription('Import');
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(importRow);
  expect(onSelect).toHaveBeenLastCalledWith('import:1');
  await user.clear(screen.getByRole('searchbox'));
  // A document sharing an import's numeric ID keeps its own kind on selection.
  const documentRow = screen.getByRole('button', { name: 'CV 1', exact: true });
  expect(documentRow).toHaveAccessibleDescription('CV');
  await user.click(documentRow);
  expect(onSelect).toHaveBeenLastCalledWith('document:1');
});

it('marks the selected source row for hosts that separate selection from starting', () => {
  mount({ selected: 'document:2' });
  expect(screen.getByRole('button', { name: 'CV 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'CV 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

it('validates the PDF locally, uploads with a stable idempotency key and keeps the file after failure', async () => {
  // applyAccept is disabled so the test can exercise the picker's own guard
  // against a non-PDF file that a browser could still hand over.
  const user = userEvent.setup({ applyAccept: false });
  const onUpload = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);
  mount({ onUpload });
  const input = screen.getByLabelText('CV w PDF (do 10 MB)');
  await user.upload(input, new File(['x'], 'cv.txt', { type: 'text/plain' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wybierz CV w formacie PDF.');
  expect(screen.queryByRole('button', { name: 'Wgraj i odczytaj CV' })).not.toBeInTheDocument();
  const good = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  await user.upload(input, good);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Wgraj i odczytaj CV' }));
  expect(onUpload).toHaveBeenCalledWith(good, expect.any(String));
  // The failed attempt keeps the chosen file; retry reuses the same key so the
  // server can deduplicate a request that actually went through.
  const retry = await screen.findByRole('button', { name: 'Wgraj i odczytaj CV' });
  await user.click(retry);
  expect(onUpload).toHaveBeenCalledTimes(2);
  expect(onUpload.mock.calls[1][1]).toBe(onUpload.mock.calls[0][1]);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Wgraj i odczytaj CV' })).not.toBeInTheDocument());
});

it('keeps an empty account actionable with upload and manual creation', () => {
  render(<MemoryRouter><InterviewSourcePicker documents={[]} imports={[]} onSelect={vi.fn()} onUpload={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Nie masz jeszcze zapisanych CV ani importów.');
  expect(screen.getByRole('link', { name: 'Utwórz CV ręcznie' })).toBeVisible();
  expect(screen.getByLabelText('CV w PDF (do 10 MB)')).toBeVisible();
});
