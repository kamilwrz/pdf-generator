import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiChangeReview from './AiChangeReview';

afterEach(cleanup);
it('requires explicit disclosure and an explicit decision, retaining complete text', async () => {
  const user = userEvent.setup();
  const accept = vi.fn();
  const reject = vi.fn();
  const { container, rerender } = render(<AiChangeReview title="Opis stanowiska" changes={[{ before: 'Oryginał', after: 'Propozycja' }]} onAccept={accept} onReject={reject} />);
  const summary = container.querySelector('summary');
  await user.hover(summary);
  expect(container.querySelector('details')).not.toHaveAttribute('open');
  await user.click(summary);
  expect(screen.getByText('Oryginał')).toBeVisible();
  expect(screen.getByText('Propozycja')).toBeVisible();
  expect(accept).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Zastosuj', exact: true }));
  expect(accept).toHaveBeenCalledOnce();
  expect(reject).not.toHaveBeenCalled();
  rerender(<AiChangeReview title="Opis stanowiska" changes={[{ before: 'Oryginał', after: 'Propozycja' }]} state="accepted" />);
  expect(screen.getByRole('status')).toHaveTextContent('Zastosowano');
  expect(screen.getByText('Oryginał')).toBeVisible();
});

it('disables both decisions for an unavailable or stale scope', async () => {
  const user = userEvent.setup();
  const accept = vi.fn();
  render(<AiChangeReview title="Zmiana" open disabled changes={[{ before: 'A', after: 'B' }]} onAccept={accept} />);
  const button = screen.getByRole('button', { name: 'Zastosuj', exact: true });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(accept).not.toHaveBeenCalled();
});
