import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";

import { ErrorBoundary } from "./ErrorBoundary/ErrorBoundary";
import DialogShell from "./DialogShell/DialogShell";
import { DialogSuspensionContext } from "./DialogShell/DialogSuspensionContext";
import UnsavedChangesDialog from "./UnsavedChangesDialog/UnsavedChangesDialog";
import { useDirtyGuard } from "../../hooks/useDirtyGuard";

function DirtyGuardHarness({ saveCurrentDocument }) {
  const [signature, setSignature] = useState("saved");
  const [outcome, setOutcome] = useState("idle");
  const guard = useDirtyGuard({ signature, isGuest: false });

  const requestReplacement = async () => {
    setOutcome("pending");
    setOutcome((await guard.confirmDiscard()) ? "continued" : "cancelled");
  };
  const saveAndContinue = () => guard.confirmDialogSave(async () => {
    const saved = await saveCurrentDocument();
    if (saved) guard.markClean(signature);
    return saved;
  });

  return (
    <>
      <button type="button" onClick={() => setSignature("changed")}>Edytuj</button>
      <button type="button" onClick={requestReplacement}>Podmień dokument</button>
      <output aria-label="Wynik podmiany">{outcome}</output>
      <UnsavedChangesDialog
        open={guard.dialogOpen}
        onCancel={guard.cancelDialogDiscard}
        onDiscard={guard.confirmDialogDiscard}
        onSave={saveAndContinue}
        isSaving={guard.dialogSaving}
        error={guard.dialogError}
      />
    </>
  );
}

function renderDirtyGuard(saveCurrentDocument) {
  const router = createMemoryRouter([{
    path: "/",
    element: <DirtyGuardHarness saveCurrentDocument={saveCurrentDocument} />,
  }]);
  return render(<RouterProvider router={router} />);
}

describe("recovery surfaces", () => {
  let consoleError;

  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
  });

  it("focuses the safe action and exposes explicit discard semantics", async () => {
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        onCancel={onCancel}
        onDiscard={onDiscard}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "Niezapisane zmiany" })).toBeInTheDocument();
    const safeAction = screen.getByRole("button", { name: "Wróć do edycji" });
    await waitFor(() => expect(safeAction).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Odrzuć zmiany" }));
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Zapisz i kontynuuj" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("keeps recovery actions disabled and announces a failed save", () => {
    render(
      <UnsavedChangesDialog
        open
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        isSaving
        error="Konflikt zapisu. Odśwież dokument i spróbuj ponownie."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Konflikt zapisu");
    expect(screen.getByRole("button", { name: "Zapisywanie…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Odrzuć zmiany" })).toBeDisabled();
  });

  it("continues only after a confirmed save and keeps a failed save pending", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("Konflikt zapisu. Odśwież dokument."))
      .mockResolvedValueOnce(true);
    renderDirtyGuard(save);

    fireEvent.click(screen.getByRole("button", { name: "Edytuj" }));
    fireEvent.click(screen.getByRole("button", { name: "Podmień dokument" }));
    await screen.findByRole("alertdialog", { name: "Niezapisane zmiany" });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz i kontynuuj" }));
    await screen.findByText("Konflikt zapisu. Odśwież dokument.");
    expect(screen.getByLabelText("Wynik podmiany")).toHaveTextContent("pending");
    expect(screen.getByRole("alertdialog", { name: "Niezapisane zmiany" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zapisz i kontynuuj" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Wynik podmiany")).toHaveTextContent("continued");
    });
    expect(screen.queryByRole("alertdialog", { name: "Niezapisane zmiany" })).not.toBeInTheDocument();
  });

  it("hides exception details and recovers when the document epoch changes", async () => {
    function Child({ fail }) {
      if (fail) throw new Error("private document payload");
      return <p>Edytor odzyskany</p>;
    }

    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary resetKey="0">
          <Child fail />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wyświetlić edytora");
    expect(screen.queryByText("private document payload")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="1">
          <Child fail={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Edytor odzyskany")).toBeInTheDocument());
  });

  it("gives the recovery alert exclusive modality and restores the suspended dialog", async () => {
    const renderSurfaces = (recovering) => (
      <DialogSuspensionContext.Provider value={recovering}>
        <DialogShell
          open
          title="Moje dokumenty"
          onClose={vi.fn()}
          initialFocusSelector="[data-standard-action]"
        >
          <button type="button" data-standard-action>Otwórz dokument</button>
        </DialogShell>
        <UnsavedChangesDialog
          open={recovering}
          onCancel={vi.fn()}
          onDiscard={vi.fn()}
          onSave={vi.fn()}
        />
      </DialogSuspensionContext.Provider>
    );

    const { rerender } = render(renderSurfaces(true));
    expect(screen.queryByRole("dialog", { name: "Moje dokumenty" })).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog", { name: "Niezapisane zmiany" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Wróć do edycji" })).toHaveFocus();
    });
    expect(screen.getByRole("button", { name: "Zamknij: Niezapisane zmiany" }))
      .toHaveStyle({ width: "36px", height: "36px" });

    rerender(renderSurfaces(false));
    expect(screen.queryByRole("alertdialog", { name: "Niezapisane zmiany" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Otwórz dokument" })).toHaveFocus();
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
