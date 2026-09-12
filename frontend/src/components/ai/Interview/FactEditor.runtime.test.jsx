import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FactEditor from './FactEditor';

afterEach(cleanup);
const make = (id, path, text) => ({ id, path, text, kind: 'fact', context: '', source: 'manual' });
const role = [make('t', '/experience/0/title', 'Analityczka'), make('c', '/experience/0/company', 'Firma Example'), make('b', '/experience/0/bullets/0', 'Analizuję raporty.')];
function Harness({ initial = role, saved, sourceProfile = false }) {
  const [facts, setFacts] = useState(initial);
  return <FactEditor sourceProfile={sourceProfile} facts={facts} onChange={(value) => { setFacts(value); saved?.(value); }} />;
}

it('shows a role once and opens only the selected field editor', async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  render(<Harness saved={saved} />);
  expect(screen.getAllByRole('button', { name: 'Otwórz wpis: Analityczka' })).toHaveLength(1);
  expect(screen.queryByLabelText('Treść')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
  await user.click(screen.getByRole('button', { name: 'Edytuj: Firma — Firma Example' }));
  expect(screen.getAllByLabelText('Treść')).toHaveLength(1);
  await user.clear(screen.getByLabelText('Treść'));
  await user.type(screen.getByLabelText('Treść'), 'Nowa firma');
  expect(saved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę' }));
  expect(saved.mock.lastCall[0].find((f) => f.id === 'c').text).toBe('Nowa firma');
  expect(saved.mock.lastCall[0].map((f) => f.id)).toEqual(['t', 'c', 'b']);
});

it('cancels a draft and restores focus, and undo restores the exact deleted IDs', async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  render(<Harness saved={saved} />);
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
  const trigger = screen.getByRole('button', { name: 'Edytuj: Firma — Firma Example' });
  await user.click(trigger);
  await user.type(screen.getByLabelText('Treść'), ' temporary');
  await user.click(screen.getByRole('button', { name: 'Anuluj edycję' }));
  expect(saved).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Analityczka' })).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Usuń informację: Firma Example' }));
  await user.click(screen.getByRole('button', { name: 'Cofnij usunięcie' }));
  expect(saved.mock.lastCall[0]).toEqual(role);
});

it('bounds a large profile and searches hidden records without losing edits', async () => {
  const user = userEvent.setup();
  render(<Harness initial={Array.from({ length: 40 }, (_, i) => make(`r${i}`, `/experience/${i}/title`, `Rola ${i}`))} />);
  expect(screen.getAllByRole('button', { name: /Otwórz wpis:/ })).toHaveLength(6);
  await user.type(screen.getByLabelText('Szukaj w profilu'), 'Rola 39');
  expect(screen.getAllByRole('button', { name: /Otwórz wpis:/ })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Rola 39' }));
  expect(screen.getByRole('heading', { name: 'Rola 39' })).toBeInTheDocument();
});

it('presents an interview prompt with its answer and keeps the prompt while editing', async () => {
  const user = userEvent.setup();
  const answer = { ...make('answer-q1', '', 'Sprawdziłam próbę transakcji i udokumentowałam decyzję.'), question: 'Jak zweryfikowałaś ryzyko tej transakcji?', context: 'Ocena ryzyka AML' };
  const saved = vi.fn();
  render(<Harness initial={[answer]} saved={saved} />);

  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Jak zweryfikowałaś ryzyko tej transakcji?' }));
  expect(screen.getByText('Pytanie z wywiadu')).toBeInTheDocument();
  expect(screen.getByText(answer.question)).toBeInTheDocument();
  expect(screen.getByText('Twoja odpowiedź')).toBeInTheDocument();
  expect(screen.getByText(answer.text)).toBeInTheDocument();
  expect(screen.getByText('Ocena ryzyka AML')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Edytuj: Informacja/ }));
  expect(screen.getByLabelText('Twoja odpowiedź')).toHaveValue(answer.text);
  expect(screen.getByText(answer.question)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę' }));
  expect(saved.mock.lastCall[0][0].question).toBe(answer.question);
});

for (const kind of ['gap', 'framing']) {
  it(`keeps ${kind} semantics without an information-type selector`, async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<Harness sourceProfile initial={[{ ...make('note', '', 'Original note'), kind }]} saved={saved} />);
    await user.click(screen.getByRole('button', { name: /Otwórz wpis:/ }));
    await user.click(screen.getByRole('button', { name: /^Edytuj:/ }));
    expect(screen.queryByLabelText('Rodzaj informacji')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Przeznaczenie')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Treść'));
    await user.type(screen.getByLabelText('Treść'), 'Updated note');
    await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę' }));
    expect(saved.mock.lastCall[0][0]).toMatchObject({ id: 'note', kind, text: 'Updated note', path: '' });
  });
}

it('exposes source fields only for reading and legacy manual fields as notes', async () => {
  const user = userEvent.setup();
  render(<Harness sourceProfile initial={[...role.map((fact) => ({ ...fact, source: 'document:30' })), make('legacy', '/title', 'Manual title')]} />);
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
  expect(screen.queryByRole('button', { name: /^Edytuj:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Usuń informację:/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Dodaj do tego wpisu')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Szukaj w profilu'), 'Manual title');
  await user.click(screen.getByRole('button', { name: /Otwórz wpis:/ }));
  expect(screen.getByRole('button', { name: /^Edytuj:/ })).toBeInTheDocument();
});
