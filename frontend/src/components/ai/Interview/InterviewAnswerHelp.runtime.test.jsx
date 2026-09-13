import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterviewAnswerHelp from './InterviewAnswerHelp';

vi.mock('../../../i18n/index.js', async importOriginal => ({
  ...await importOriginal(), t: key => key,
}));
afterEach(cleanup);

const key = suffix => `interview:answerHelp.${suffix}`;
const session = { id: 'interview', revision: 4, question: { id: 'question', answer_help_available: true } };
const draft = { id: 'help', question_id: 'question', mode: 'draft', draft: 'A suggested answer.' };
const choices = { id: 'help', question_id: 'question', mode: 'options', options: [
  { id: 'first', text: 'First genuine activity.' }, { id: 'second', text: 'Second genuine activity.' },
] };
const result = help => ({ ...session, revision: 5, answer_help: help });
const setup = (props = {}) => render(<InterviewAnswerHelp session={session} answer="Existing draft" canAi
  onGenerate={vi.fn().mockResolvedValue(result(draft))} onUse={vi.fn()} {...props} />);

it('hides unsupported questions and never generates on mount or cached read', async () => {
  const onGenerate = vi.fn();
  const view = setup({ session: { ...session, question: { id: 'unsupported' } }, onGenerate });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<InterviewAnswerHelp session={result(draft)} answer="Existing" canAi={false}
    onGenerate={onGenerate} onUse={vi.fn()} />);
  expect(screen.getByText(draft.draft)).toBeVisible();
  expect(screen.getByRole('button', { name: key('useDraft') })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: key('close') }));
  expect(screen.getByRole('button', { name: key('reopen') })).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: key('reopen') }));
  expect(screen.getByText(draft.draft)).toBeVisible();
  expect(screen.getByRole('heading', { name: key('title') })).toHaveFocus();
  expect(onGenerate).not.toHaveBeenCalled();
});

it('generates from the unsaved draft and requires explicit use before notifying the parent', async () => {
  const onGenerate = vi.fn().mockResolvedValue(result(draft));
  const onUse = vi.fn();
  const onBusyChange = vi.fn();
  setup({ onGenerate, onUse, onBusyChange });
  await userEvent.click(screen.getByRole('button', { name: key('generate') }));
  await screen.findByText(draft.draft);
  expect(onGenerate).toHaveBeenCalledExactlyOnceWith('Existing draft');
  expect(screen.getByRole('heading', { name: key('title') })).toHaveFocus();
  expect(onUse).not.toHaveBeenCalled();
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  await userEvent.click(screen.getByRole('button', { name: key('useDraft') }));
  expect(onUse).toHaveBeenCalledExactlyOnceWith(draft.draft, draft.id);
  expect(screen.getByRole('button', { name: key('useDraft') })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(key('used'));
});

it('renders unchecked choices and applies only selected text in its authored order', async () => {
  const user = userEvent.setup();
  const onUse = vi.fn();
  setup({ session: result(choices), onUse });
  const boxes = screen.getAllByRole('checkbox');
  boxes.forEach(box => expect(box).not.toBeChecked());
  const useButton = screen.getByRole('button', { name: key('useSelected') });
  expect(useButton).toBeDisabled();
  boxes[1].focus();
  await user.keyboard(' ');
  await user.click(useButton);
  expect(onUse).toHaveBeenCalledExactlyOnceWith(choices.options[1].text, choices.id);
  expect(onUse).not.toHaveBeenCalledWith(expect.stringContaining('Existing draft'), expect.anything());
});

it('joins multiple checked suggestions without including unchecked options', async () => {
  const onUse = vi.fn();
  setup({ session: result({ ...choices, options: [...choices.options, { id: 'third', text: 'Unchecked activity.' }] }), onUse });
  await userEvent.click(screen.getByRole('checkbox', { name: choices.options[1].text }));
  await userEvent.click(screen.getByRole('checkbox', { name: choices.options[0].text }));
  await userEvent.click(screen.getByRole('button', { name: key('useSelected') }));
  expect(onUse).toHaveBeenCalledExactlyOnceWith(choices.options.map(option => option.text).join('\n'), choices.id);
});

it('renders guidance without an answer insertion action', () => {
  setup({ session: result({ ...draft, mode: 'guidance', guidance: 'Recall one real example.', draft: '' }) });
  expect(screen.getByText('Recall one real example.')).toBeVisible();
  expect(screen.queryByRole('button', { name: key('useDraft') })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('keeps generation single-flight and ignores cancelled late data until explicit cached reopen', async () => {
  let resolve;
  const onGenerate = vi.fn().mockImplementation(() => new Promise(done => { resolve = done; }));
  const onUse = vi.fn();
  const onBusyChange = vi.fn();
  const view = setup({ onGenerate, onUse, onBusyChange });
  const generate = screen.getByRole('button', { name: key('generate') });
  fireEvent.click(generate); fireEvent.click(generate);
  expect(onGenerate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(key('loading'));
  await userEvent.click(screen.getByRole('button', { name: key('cancel') }));
  expect(screen.getByRole('button', { name: key('generate') })).toBeDisabled();
  expect(onBusyChange.mock.calls).toEqual([[true]]);
  view.rerender(<InterviewAnswerHelp session={result(draft)} answer="Existing draft" canAi
    onGenerate={onGenerate} onUse={onUse} onBusyChange={onBusyChange} />);
  await act(async () => resolve(result(draft)));
  expect(screen.queryByText(draft.draft)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: key('reopen') })).toHaveFocus();
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  await userEvent.click(screen.getByRole('button', { name: key('reopen') }));
  expect(screen.getByText(draft.draft)).toBeVisible();
  expect(onGenerate).toHaveBeenCalledTimes(1);
  expect(onUse).not.toHaveBeenCalled();
});

it('retains retry after failure without adding or accepting any answer text', async () => {
  const onGenerate = vi.fn().mockRejectedValueOnce(new Error('Transport failed')).mockResolvedValueOnce(result(draft));
  const onUse = vi.fn();
  setup({ onGenerate, onUse });
  await userEvent.click(screen.getByRole('button', { name: key('generate') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(key('error'));
  await userEvent.click(screen.getByRole('button', { name: key('retry') }));
  await screen.findByText(draft.draft);
  expect(onGenerate).toHaveBeenCalledTimes(2);
  expect(onUse).not.toHaveBeenCalled();
});

it('rejects returned help for another question and does not leak cached foreign suggestions', async () => {
  setup({ session: result({ ...draft, question_id: 'other' }),
    onGenerate: vi.fn().mockResolvedValue(result({ ...draft, question_id: 'other' })) });
  expect(screen.queryByText(draft.draft)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: key('generate') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(key('error'));
  expect(screen.queryByRole('button', { name: key('useDraft') })).not.toBeInTheDocument();
});

it('ignores late responses after question change and resets unchecked choices', async () => {
  let resolve;
  const onGenerate = vi.fn().mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = setup({ onGenerate });
  await userEvent.click(screen.getByRole('button', { name: key('generate') }));
  const next = { ...session, question: { id: 'next', answer_help_available: true },
    answer_help: { ...choices, id: 'next-help', question_id: 'next' } };
  view.rerender(<InterviewAnswerHelp session={next} answer="" canAi onGenerate={onGenerate} onUse={vi.fn()} />);
  await act(async () => resolve(result(draft)));
  expect(screen.queryByText(draft.draft)).not.toBeInTheDocument();
  screen.getAllByRole('checkbox').forEach(box => expect(box).not.toBeChecked());
});

it('does not carry checks into a replacement suggestion for the same question', async () => {
  const view = setup({ session: result(choices) });
  await userEvent.click(screen.getByRole('checkbox', { name: choices.options[0].text }));
  view.rerender(<InterviewAnswerHelp session={result({ ...choices, id: 'replacement' })} answer="" canAi
    onGenerate={vi.fn()} onUse={vi.fn()} />);
  screen.getAllByRole('checkbox').forEach(box => expect(box).not.toBeChecked());
});

it('retains selected text when append is rejected by the parent length guard', async () => {
  const onUse = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  setup({ session: result(choices), onUse });
  await userEvent.click(screen.getByRole('checkbox', { name: choices.options[0].text }));
  await userEvent.click(screen.getByRole('button', { name: key('useSelected') }));
  expect(await screen.findByRole('alert')).toHaveTextContent(key('useError'));
  expect(screen.getByRole('checkbox', { name: choices.options[0].text })).toBeChecked();
  expect(screen.getByRole('button', { name: key('useSelected') })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: key('useSelected') }));
  await waitFor(() => expect(screen.getByRole('button', { name: key('useSelected') })).toBeDisabled());
});

it('keeps parent-owned applied status on remount and allows cached reuse after an explicit answer clear', () => {
  const props = { session: result(draft), answer: draft.draft, canAi: true,
    onGenerate: vi.fn(), onUse: vi.fn(), usedSuggestionId: draft.id };
  const view = setup(props);
  expect(screen.getByRole('button', { name: key('useDraft') })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(key('used'));
  view.rerender(<InterviewAnswerHelp {...props} answer="" usedSuggestionId={null} />);
  expect(screen.getByRole('button', { name: key('useDraft') })).toBeEnabled();
  expect(props.onGenerate).not.toHaveBeenCalled();
});

it('respects disabled generation and application without running effects under StrictMode', () => {
  const onGenerate = vi.fn();
  const onUse = vi.fn();
  const view = render(<StrictMode><InterviewAnswerHelp session={session} answer="" canAi={false}
    onGenerate={onGenerate} onUse={onUse} /></StrictMode>);
  expect(screen.getByRole('button', { name: key('generate') })).toBeDisabled();
  view.rerender(<InterviewAnswerHelp session={result(draft)} answer="" disabled canAi
    onGenerate={onGenerate} onUse={onUse} />);
  expect(screen.getByRole('button', { name: key('useDraft') })).toBeDisabled();
  expect(onGenerate).not.toHaveBeenCalled();
  expect(onUse).not.toHaveBeenCalled();
});
