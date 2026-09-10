import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StartChooser from './StartChooser';

afterEach(cleanup);
const actions = { onNew: vi.fn(), onImport: vi.fn(), onDocuments: vi.fn(), onLogout: vi.fn() };
function view(entitlements) {
  return <MemoryRouter><Routes><Route path="/" element={<StartChooser {...actions} entitlements={entitlements} />} /><Route path="/app/interview" element={<h1>Rozmowa</h1>} /><Route path="/app/account" element={<h1>Konto i plan</h1>} /></Routes></MemoryRouter>;
}

describe('interview onboarding entry', () => {
  it('puts the Pro interview after manual creation and import, with keyboard navigation', async () => {
    const user = userEvent.setup();
    render(view({ ai_assistant: true, plan_slug: 'pro' }));
    expect(screen.getByRole('heading', { name: 'Jak chcesz zacząć?' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Utwórz nowe CV/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Zaimportuj istniejące CV/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Wywiad Rozpocznij wywiad' })).toHaveFocus();
    expect(screen.getByText('W Twoim Pro')).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Rozmowa' })).toBeVisible();
  });

  it('explains Free availability and opens the account plan instead of AI', async () => {
    render(view({ ai_assistant: false, plan_slug: 'free' }));
    expect(screen.getByText('W pakiecie Free wywiad jest dostępny po przejściu na Pro.')).toBeVisible();
    expect(screen.queryByRole('link', { name: /Rozpocznij wywiad/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Wywiad Poznaj Pro' }));
    expect(screen.getByRole('heading', { name: 'Konto i plan' })).toBeVisible();
  });

  it('never grants unresolved or revoked access and updates when permissions arrive', () => {
    const { rerender } = render(view(null));
    expect(screen.getByRole('link', { name: 'Wywiad Sprawdź dostęp' })).toHaveAttribute('href', '/app/account');
    expect(screen.queryByText('W Twoim Pro')).toBeNull();
    rerender(view({ ai_assistant: true }));
    expect(screen.getByRole('link', { name: /Rozpocznij wywiad/ })).toHaveAttribute('href', '/app/interview');
    rerender(view({ ai_assistant: false, plan_slug: 'pro' }));
    expect(screen.getByRole('link', { name: /Poznaj Pro/ })).toHaveAttribute('href', '/app/account');
    expect(screen.getByRole('button', { name: /Utwórz nowe CV/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Zaimportuj istniejące CV/ })).toBeEnabled();
  });
});
