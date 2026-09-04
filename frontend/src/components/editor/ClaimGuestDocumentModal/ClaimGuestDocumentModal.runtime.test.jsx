// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ClaimGuestDocumentModal from "./ClaimGuestDocumentModal";

describe("ClaimGuestDocumentModal ownership decision", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });

  afterEach(cleanup);

  it("names the draft, explains both consequences, and focuses safe recovery", async () => {
    render(
      <ClaimGuestDocumentModal
        open
        title="Moje CV"
        onConfirm={vi.fn()}
        onDecline={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Czy ten szkic należy do Ciebie?" });
    expect(dialog).toHaveTextContent("Moje CV");
    expect(dialog).toHaveTextContent("Na koncie zapiszesz go dopiero po kliknięciu „Zapisz”.");
    expect(dialog).toHaveTextContent("nie będzie można jej odzyskać");
    await waitFor(() => expect(screen.getByRole("button", { name: "Wczytaj mój szkic" })).toHaveFocus());
  });

  it("dismisses safely while reserving deletion for the explicit danger action", () => {
    const onDismiss = vi.fn();
    const onDecline = vi.fn();

    render(
      <ClaimGuestDocumentModal
        open
        title=""
        onConfirm={vi.fn()}
        onDecline={onDecline}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("Szkic CV bez nazwy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zamknij: Czy ten szkic należy do Ciebie?" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onDecline).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Usuń ten szkic" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
