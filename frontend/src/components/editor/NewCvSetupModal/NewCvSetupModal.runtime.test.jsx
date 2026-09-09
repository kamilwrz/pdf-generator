import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewCvSetupModal from "./NewCvSetupModal";

function goToSections() {
  fireEvent.click(screen.getByRole("button", { name: "Dalej: kontakt" }));
  fireEvent.click(screen.getByRole("button", { name: "Dalej: sekcje" }));
}

describe("NewCvSetupModal fullscreen flow", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });
  afterEach(cleanup);

  it("opens demo setup directly, retains choices between steps and creates only at the last step", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<NewCvSetupModal open onClose={onClose} onCreate={onCreate} allowUnconfirmedReplacement />);
    expect(screen.getByRole("dialog", { name: "Skonfiguruj nowe CV" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Utwórz A4" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Linden/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dalej: kontakt" }));
    expect(screen.getByRole("heading", { name: "Zacznij od najważniejszych danych." })).toHaveFocus();
    fireEvent.click(screen.getByRole("checkbox", { name: /Zdjęcie/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "LinkedIn" }));
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(screen.getByRole("radio", { name: /Linden/ })).toBeChecked();
    goToSections();
    fireEvent.click(screen.getByRole("button", { name: "Przenieś Doświadczenie niżej" }));
    fireEvent.change(screen.getByLabelText(/Własna sekcja/), { target: { value: "Konferencje" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toEqual({ replacementConfirmed: true });
    expect(onCreate.mock.calls[0][0]).toMatchObject({ templateId: "linden", includePhoto: true });
    expect(onCreate.mock.calls[0][0].contacts.find((contact) => contact.key === "linkedin").selected).toBe(true);
    expect(onCreate.mock.calls[0][0].sections[2].label).toBe("Doświadczenie");
    expect(onCreate.mock.calls[0][0].sections.at(-1).label).toBe("Konferencje");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("created");
  });

  it("preserves the original opener through replacement confirmation and Escape", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(<NewCvSetupModal open onClose={onClose} onCreate={vi.fn()} hasActiveDocument />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Skonfiguruj nowe CV" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Skonfiguruj nowe CV" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Meridian/ })).toHaveFocus());
    goToSections();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("explains unavailable photos and associates duplicate errors with the custom field", () => {
    render(<NewCvSetupModal open onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Monument/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Linden/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dalej: kontakt" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Zdjęcie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    fireEvent.click(screen.getByRole("radio", { name: /Meridian/ }));
    expect(screen.getByText(/nie obsługuje zdjęcia/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dalej: kontakt" }));
    expect(screen.getByRole("checkbox", { name: /Zdjęcie/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Zdjęcie/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Dalej: sekcje" }));
    const input = screen.getByLabelText(/Własna sekcja/);
    fireEvent.change(input, { target: { value: "Doświadczenie" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj", exact: true }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Wpisz inną nazwę/);
    expect(input).toHaveFocus();
  });

  it("validates an empty selection, freezes pending configuration and preserves it after failure", async () => {
    let rejectCreation;
    const onCreate = vi.fn(() => new Promise((_, reject) => { rejectCreation = reject; }));
    const onClose = vi.fn();
    render(<NewCvSetupModal open onClose={onClose} onCreate={onCreate} />);
    goToSections();
    screen.getAllByRole("checkbox").filter((input) => input.checked).forEach((input) => fireEvent.click(input));
    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz co najmniej jedną sekcję CV.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Doświadczenie" }));
    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));
    expect(screen.getByRole("checkbox", { name: "Doświadczenie" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wstecz" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    rejectCreation(new Error("Spróbuj ponownie."));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Spróbuj ponownie."));
    expect(screen.getByRole("checkbox", { name: "Doświadczenie" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Utwórz A4" })).toBeEnabled();
  });
});


describe("landing Free template handoff", () => {
  afterEach(cleanup);
  it.each(["sterling", "meridian", "linden"])("starts %s at contact and creates that exact template", async (id) => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<NewCvSetupModal open initialTemplateId={id} onClose={vi.fn()} onCreate={onCreate} />);
    expect(screen.getByRole("heading", { name: "Zacznij od najważniejszych danych." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(screen.getByRole("radio", { name: new RegExp(id, "i") })).toBeChecked();
    goToSections();
    fireEvent.click(screen.getByRole("button", { name: "Utwórz A4" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0].templateId).toBe(id);
  });
  it.each(["atrium", "missing", null])("falls back to ordinary setup for %s", (id) => {
    render(<NewCvSetupModal open initialTemplateId={id} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Meridian/ })).toBeChecked();
  });
  it("retains replacement confirmation before a preselected setup", () => {
    render(<NewCvSetupModal open initialTemplateId="linden" hasActiveDocument onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Utworzyć nowe CV?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skonfiguruj nowe CV" }));
    expect(screen.getByRole("heading", { name: "Zacznij od najważniejszych danych." })).toBeInTheDocument();
  });
});
