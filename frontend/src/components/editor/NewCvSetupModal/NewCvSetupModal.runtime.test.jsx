import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewCvSetupModal from "./NewCvSetupModal";
import { createDefaultStarterConfig } from "../../../utils/cvStarter.js";

const customize = () => fireEvent.click(screen.getByRole("button", { name: "Dostosuj zawartość" }));
const sectionsView = () => fireEvent.click(screen.getByRole("button", { name: /^Sekcje CV/ }));
const contactView = () => fireEvent.click(screen.getByRole("button", { name: "Nagłówek i kontakt" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Rozpocznij edycję" }));

describe("NewCvSetupModal optional configuration", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });
  afterEach(cleanup);

  it("creates directly from defaults without contact or section decisions", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<NewCvSetupModal open onClose={onClose} onCreate={onCreate} allowUnconfirmedReplacement />);
    expect(screen.getByRole("dialog", { name: "Utwórz CV" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    create();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("created"));
    expect(onCreate).toHaveBeenCalledExactlyOnceWith(createDefaultStarterConfig(), { replacementConfirmed: true });
  });

  it("retains contacts, photo, ordering and custom sections across disclosure changes", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<NewCvSetupModal open onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linden/ }));
    customize();
    fireEvent.click(screen.getByRole("checkbox", { name: "Zdjęcie" }));
    fireEvent.click(screen.getByRole("button", { name: "Dodaj linki" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "LinkedIn" }));
    sectionsView();
    fireEvent.click(screen.getByRole("button", { name: "Przenieś Doświadczenie niżej" }));
    fireEvent.change(screen.getByLabelText(/Własna sekcja/), { target: { value: "Konferencje" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj", exact: true }));
    customize();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    customize();
    contactView();
    expect(screen.getByRole("checkbox", { name: "Zdjęcie" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "LinkedIn" })).toBeChecked();
    customize();
    create();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const config = onCreate.mock.calls[0][0];
    expect(config).toMatchObject({ templateId: "linden", includePhoto: true });
    expect(config.contacts.find((contact) => contact.key === "linkedin").selected).toBe(true);
    expect(config.sections[2].label).toBe("Doświadczenie");
    expect(config.sections.at(-1).label).toBe("Konferencje");
  });

  it("preserves the original opener through replacement confirmation and Escape", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(<NewCvSetupModal open onClose={onClose} onCreate={vi.fn()} hasActiveDocument />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Wróć do obecnego CV" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Utwórz nowe CV" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Meridian/ })).toHaveFocus());
    customize();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("keeps Pro locks, clears incompatible photos and labels duplicate errors", () => {
    render(<NewCvSetupModal open onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Więcej szablonów" }));
    expect(screen.getByRole("radio", { name: /Monument/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Linden/ }));
    customize();
    fireEvent.click(screen.getByRole("checkbox", { name: "Zdjęcie" }));
    fireEvent.click(screen.getByRole("button", { name: "Szablony", exact: true }));
    fireEvent.click(screen.getByRole("radio", { name: /Meridian/ }));
    expect(screen.getByText(/nie obsługuje zdjęcia/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Zdjęcie" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Linden/ }));
    customize();
    expect(screen.getByRole("checkbox", { name: "Zdjęcie" })).not.toBeChecked();
    sectionsView();
    const input = screen.getByLabelText(/Własna sekcja/);
    fireEvent.change(input, { target: { value: "Doświadczenie" } });
    fireEvent.click(screen.getByRole("button", { name: "Dodaj", exact: true }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Wpisz inną nazwę/);
    expect(input).toHaveFocus();
  });

  it("reveals invalid collapsed settings, prevents duplicate submits and supports retry", async () => {
    let rejectCreation;
    const onCreate = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectCreation = reject; })).mockResolvedValue(true);
    const onClose = vi.fn();
    render(<NewCvSetupModal open onClose={onClose} onCreate={onCreate} />);
    customize();
    sectionsView();
    const sections = screen.getByRole("region", { name: "Sekcje CV" });
    within(sections).getAllByRole("checkbox").filter((input) => input.checked).forEach((input) => fireEvent.click(input));
    customize();
    create();
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Wybierz co najmniej jedną sekcję CV.");
    expect(screen.getByRole("heading", { name: "Sekcje CV" })).toHaveFocus();
    fireEvent.click(screen.getByRole("checkbox", { name: "Doświadczenie" }));
    create();
    fireEvent.click(screen.getByRole("button", { name: "Tworzenie CV…" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Doświadczenie" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    rejectCreation(new Error("Połączenie przerwane."));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Połączenie przerwane."));
    expect(screen.getByRole("checkbox", { name: "Doświadczenie" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("created"));
    expect(onCreate.mock.calls[1][0]).toEqual(onCreate.mock.calls[0][0]);
  });

  it("keeps a chosen Pro template available after collapsing the full gallery", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<NewCvSetupModal open entitlements={{ template_tier: "all" }} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Więcej szablonów" }));
    fireEvent.click(screen.getByRole("radio", { name: /Monument/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pokaż mniej szablonów" }));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /Monument/ })).toBeChecked();
    create();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0].templateId).toBe("monument");
  });

  it("keeps creation available when sample images fail", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<NewCvSetupModal open onClose={vi.fn()} onCreate={onCreate} />);
    document.querySelectorAll("img").forEach((img) => fireEvent.error(img));
    expect(screen.getAllByText("Podgląd niedostępny").length).toBeGreaterThan(0);
    create();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  });

  it.each(["sterling", "meridian", "linden"])("creates the preselected %s without another choice", async (id) => {
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<NewCvSetupModal open initialTemplateId={id} onClose={vi.fn()} onCreate={onCreate} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /Wybrany szablon:/ })).toHaveFocus());
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    create();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0].templateId).toBe(id);
  });

  it("lets landing visitors change templates without losing customization", () => {
    render(<NewCvSetupModal open initialTemplateId="linden" onClose={vi.fn()} onCreate={vi.fn()} />);
    customize();
    fireEvent.click(screen.getByRole("checkbox", { name: "Telefon" }));
    fireEvent.click(screen.getByRole("button", { name: "Szablony", exact: true }));
    expect(screen.getByRole("radio", { name: /Linden/ })).toHaveFocus();
    fireEvent.click(screen.getByRole("radio", { name: /Sterling/ }));
    customize();
    expect(screen.getByRole("checkbox", { name: "Telefon" })).not.toBeChecked();
  });

  it.each(["missing", null])("falls back to ordinary setup for %s", (id) => {
    render(<NewCvSetupModal open initialTemplateId={id} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /Meridian/ })).toBeChecked();
  });

  it("requires replacement confirmation even with a preselected template", () => {
    render(<NewCvSetupModal open initialTemplateId="linden" hasActiveDocument onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Utworzyć nowe CV?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Utwórz nowe CV" }));
    expect(screen.getByRole("button", { name: "Rozpocznij edycję" })).toBeInTheDocument();
  });

  it.each([
    [{ isGuest: true }, "W tej przeglądarce masz jeden szkic CV."],
    [{ hasSavedDocument: true }, "Ostatnia zapisana wersja pozostanie w Moich dokumentach."],
    [{}, "Obecne CV nie jest zapisane na koncie."],
  ])("explains replacement for the actual persistence context: %j", (props, copy) => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(<NewCvSetupModal open hasActiveDocument {...props} onCreate={onCreate} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(expect.stringContaining(copy));
    fireEvent.click(screen.getByRole("button", { name: "Wróć do obecnego CV" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

it("starts a first guest selection once under StrictMode and keeps retry after failure", async () => {
  const onCreate = vi.fn().mockRejectedValueOnce(new Error("Brak połączenia")).mockResolvedValue(true);
  const onClose = vi.fn();
  render(<StrictMode><NewCvSetupModal open autoStart initialTemplateId="linden" onCreate={onCreate} onClose={onClose} /></StrictMode>);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia"));
  expect(onCreate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledWith("created"));
  expect(onCreate).toHaveBeenCalledTimes(2);
  cleanup();
});

it("never auto-starts over an existing document", () => {
  const onCreate = vi.fn();
  render(<NewCvSetupModal open autoStart initialTemplateId="linden" hasActiveDocument onCreate={onCreate} onClose={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: "Utworzyć nowe CV?" })).toBeInTheDocument();
  expect(onCreate).not.toHaveBeenCalled();
  cleanup();
});
