import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setUiLanguage, t } from '../../../i18n';
import InterviewPreview from './InterviewPreview';

afterEach(async () => { cleanup(); await setUiLanguage('pl'); });
const preview = { pages: 1, cv_data: { summary: 'Przygotowywanie raportów.' }, remaining_gaps: [],
  changes: [{ path: '/summary', value: 'Przygotowywanie raportów.', evidence_refs: ['answer-q'] }] };
const facts = [{ id: 'answer-q', text: 'Zbierałam uwagi; nie przygotowywałam stanowiska.', kind: 'fact' }];

for (const language of ['pl', 'en']) {
  it(`reviews complete text, retains failure drafts and restores Escape focus (${language})`, async () => {
    await setUiLanguage(language);
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onEditingChange = vi.fn();
    const props = { preview, facts, source: {}, onReview, onEditingChange };
    const view = render(<InterviewPreview {...props} />);
    await user.click(screen.getByRole('button', { name: t('interview:interviewPreview.changes', { value0: 1 }) }));
    const edit = screen.getByRole('button', { name: t('interview:interviewPreview.editChange') });
    await user.click(edit);
    const input = screen.getByLabelText(t('interview:interviewFlow.fullCorrectedDescription'));
    expect(input).toHaveFocus();
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText(t('interview:interviewPreview.cvEntry'))).toBeDisabled();
    await user.clear(input);
    expect(screen.getByRole('button', { name: t('interview:interviewPreview.confirmReplacement') })).toBeDisabled();
    await user.type(input, 'Zbieranie uwag bez przygotowywania stanowiska.');
    await user.click(screen.getByRole('button', { name: t('interview:interviewPreview.confirmReplacement') }));
    expect(onReview).toHaveBeenCalledWith('/summary', 'Zbieranie uwag bez przygotowywania stanowiska.');
    // Pending/failure responses do not replace the mounted form or its draft.
    view.rerender(<InterviewPreview {...props} disabled />);
    expect(input).toBeDisabled();
    view.rerender(<InterviewPreview {...props} />);
    expect(input).toHaveValue('Zbieranie uwag bez przygotowywania stanowiska.');
    await user.click(input);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: t('interview:interviewPreview.editChange') })).toHaveFocus());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: t('interview:interviewPreview.rejectChange') }));
    expect(onReview).toHaveBeenLastCalledWith('/summary', null);
  });
}
