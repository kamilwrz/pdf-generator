import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FactEditor from './FactEditor';

afterEach(cleanup);
const make = (id, path, text) => ({ id, path, text, kind: 'fact', context: '', source: path ? 'document:30' : 'manual' });
const role = [make('t', '/experience/0/title', 'Analityczka'), make('c', '/experience/0/company', 'Firma Example'), make('b', '/experience/0/bullets/0', 'Analizuję raporty.')];
function Harness({ initial = role, saved, detachNotePaths = false }) {
  const [facts, setFacts] = useState(initial);
  return <FactEditor detachNotePaths={detachNotePaths} facts={facts} onChange={(value) => { setFacts(value); saved?.(value); }} />;
}

it('shows source fields without edit, delete, addition or classification controls by default', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.queryByRole('button', { name: '+ Dodaj informację' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
  expect(screen.getAllByText('Firma Example')[0]).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Edytuj:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Usuń informację:/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Dodaj do tego wpisu')).not.toBeInTheDocument();
});

it('cancels a note draft and undo restores all equivalent evidence IDs', async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  const notes = [make('n1', '', 'Notatka'), make('n2', '', 'Notatka')];
  render(<Harness initial={notes} saved={saved} />);
  await user.click(screen.getByRole('button', { name: /Otwórz wpis:/ }));
  await user.click(screen.getByRole('button', { name: /^Edytuj:/ }));
  await user.type(screen.getByLabelText('Treść'), ' temporary');
  await user.keyboard('{Escape}');
  expect(saved).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('heading', { level: 3 })).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Usuń informację: Notatka' }));
  await user.click(screen.getByRole('button', { name: 'Cofnij usunięcie' }));
  expect(saved.mock.lastCall[0]).toEqual(notes);
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
    render(<Harness detachNotePaths initial={[{ ...make('note', '', 'Original note'), kind }]} saved={saved} />);
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
  render(<Harness detachNotePaths initial={[...role.map((fact) => ({ ...fact, source: 'document:30' })), { ...make('legacy', '/title', 'Manual title'), source: 'manual' }]} />);
  await user.click(screen.getByRole('button', { name: 'Otwórz wpis: Analityczka' }));
  expect(screen.queryByRole('button', { name: /^Edytuj:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Usuń informację:/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Dodaj do tego wpisu')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Szukaj w profilu'), 'Manual title');
  await user.click(screen.getByRole('button', { name: /Otwórz wpis:/ }));
  expect(screen.getByRole('button', { name: /^Edytuj:/ })).toBeInTheDocument();
});

it('retains an interview answer binding and meaning without exposing assignment controls', async () => {
  const user = userEvent.setup();
  const saved = vi.fn();
  const answer = { ...make('answer-q1', '/experience/0/bullets/0', 'Oryginalna odpowiedź'), source: 'interview:session', question: 'Co zrobiłaś?', kind: 'framing' };
  render(<Harness initial={[...role, answer]} saved={saved} />);
  await user.click(screen.getByRole('button', { name: /Z wywiadu i notatki/ }));
  await user.click(screen.getByRole('button', { name: /Otwórz wpis:/ }));
  await user.click(screen.getByRole('button', { name: /^Edytuj:/ }));
  await user.click(screen.getByText('Kontekst i sposób wykorzystania'));
  expect(screen.queryByLabelText('Przeznaczenie')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Rodzaj informacji')).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Twoja odpowiedź'));
  await user.type(screen.getByLabelText('Twoja odpowiedź'), 'Poprawiona odpowiedź');
  await user.click(screen.getByRole('button', { name: 'Zastosuj zmianę' }));
  expect(saved.mock.lastCall[0].at(-1)).toEqual({ ...answer, text: 'Poprawiona odpowiedź' });
  expect(saved.mock.lastCall[0].slice(0, 3)).toEqual(role);
});
