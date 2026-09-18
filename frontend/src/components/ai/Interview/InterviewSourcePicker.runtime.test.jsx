import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

it('bounds results, restores each tab view and distinguishes colliding source IDs without starting on navigation', async () => {
  const user = userEvent.setup();
  const onSelect = mount();
  expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(4);
  expect(screen.queryByRole('button', { name: 'Import.pdf' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Następna strona' }));
  expect(screen.getByRole('tabpanel')).toHaveFocus();
  expect(screen.getByRole('button', { name: 'CV 5', exact: true })).toBeVisible();
  const cvTab = screen.getByRole('tab', { name: /Moje CV/ });
  cvTab.focus(); await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: /Importy/ })).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'CV 5', exact: true })).not.toBeInTheDocument();
  await user.keyboard('{Home}');
  expect(screen.getByRole('button', { name: 'CV 5', exact: true })).toBeVisible();
  await user.type(screen.getByRole('searchbox'), 'CV 9');
  expect(screen.getByRole('status')).toHaveTextContent('1 z 1');
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'CV 9', exact: true }));
  expect(onSelect).toHaveBeenLastCalledWith('document:9');
  await user.click(screen.getByRole('tab', { name: /Importy/ }));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Import.pdf' }));
  expect(onSelect).toHaveBeenLastCalledWith('import:1');
});

it('opens imports for import-only accounts, keeps empty tabs actionable, and retains recovery after an unmatched search', async () => {
  const user = userEvent.setup();
  const onSelect = mount({ documents: [], disabled: true });
  expect(screen.getByRole('tab', { name: /Importy/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Import.pdf' })).toBeDisabled();
  await user.type(screen.getByRole('searchbox'), 'missing');
  await user.click(screen.getByRole('button', { name: 'Wyczyść wyszukiwanie' }));
  expect(screen.getByRole('searchbox')).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Import.pdf' })).toBeVisible();
  await user.click(screen.getByRole('tab', { name: /Moje CV/ }));
  expect(screen.getByRole('link', { name: 'Utwórz CV ręcznie' })).toBeVisible();
  expect(onSelect).not.toHaveBeenCalled();
});
