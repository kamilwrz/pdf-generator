import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NewCvSetupModal from "./NewCvSetupModal";

describe("NewCvSetupModal replacement flow", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });

  afterEach(cleanup);

  it("opens setup directly and authorizes replacing product-owned demo content", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);

    render(
      <NewCvSetupModal
        open
        onClose={vi.fn()}
        onCreate={onCreate}
        hasActiveDocument={false}
        allowUnconfirmedReplacement
      />,
    );

    expect(screen.getByRole("dialog", { name: "Skonfiguruj nowe CV" })).toBeInTheDocument();
    expect(screen.queryByText("Utworzyć nowe CV?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toEqual({ replacementConfirmed: true });
  });

  it("keeps replacement confirmation for a user-authored active document", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);

    render(
      <NewCvSetupModal
        open
        onClose={vi.fn()}
        onCreate={onCreate}
        hasActiveDocument
      />,
    );

    expect(screen.getByRole("dialog", { name: "Utworzyć nowe CV?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skonfiguruj nowe CV" }));
    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toEqual({ replacementConfirmed: true });
  });
});
